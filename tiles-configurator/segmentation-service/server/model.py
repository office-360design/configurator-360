"""Full MoGe-2 inference, lazy-loaded once. Hugging Face is used for weights only."""
from __future__ import annotations

import hashlib
import os
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np

MOGE_CODE_REVISION = '925b8ed835a7a9cdb7578ba15c658a0afc969030'
DEFAULT_MODEL_ID = 'Ruicheng/moge-2-vits-normal'
DEFAULT_MODEL_REVISION = '26b477f41595707c5db6770294c0d1721e8ed4ed'


@dataclass(frozen=True)
class Prediction:
    points: np.ndarray
    valid: np.ndarray
    intrinsics: np.ndarray
    model: dict
    inference_s: float
    cached: bool = False


class ModelUnavailable(RuntimeError):
    pass


class CameraModel:
    """Calls must be serialized by the service; only the last prediction is cached."""
    def __init__(self):
        self.model_id = os.getenv('MOGE_MODEL_ID', DEFAULT_MODEL_ID)
        self.revision = os.getenv('MOGE_MODEL_REVISION', DEFAULT_MODEL_REVISION if self.model_id == DEFAULT_MODEL_ID else 'main')
        self.local_checkpoint = os.getenv('MOGE_CHECKPOINT')
        self._model = None
        self._cache_key = None
        self._cache = None
        self._weights_sha256 = None

    def _load(self):
        if self._model is not None:
            return
        try:
            import torch
            from huggingface_hub import hf_hub_download
            from moge.model.v2 import MoGeModel
            device_name = os.getenv('MOGE_DEVICE', 'cuda' if torch.cuda.is_available() else 'cpu')
            self.device = torch.device(device_name)
            checkpoint = (Path(self.local_checkpoint).expanduser() if self.local_checkpoint else Path(hf_hub_download(
                self.model_id, 'model.pt', revision=self.revision, token=os.getenv('HF_TOKEN') or None)))
            digest = hashlib.sha256()
            with checkpoint.open('rb') as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(block)
            self._weights_sha256 = digest.hexdigest()
            # Only our explicitly configured, trusted checkpoint is deserialized.
            # Reject omitted heads/weights rather than silently using random parameters.
            payload = torch.load(checkpoint, map_location='cpu', weights_only=True)
            model = MoGeModel(**payload['model_config'])
            model.load_state_dict(payload['model'], strict=True)
            if not all(hasattr(model, name) for name in ('scale_head', 'points_head', 'mask_head')):
                raise ModelUnavailable('Checkpoint-ul nu conține toate head-urile metrice MoGe-2.')
            model.to(self.device).eval()
            self._model = model
        except ModelUnavailable:
            raise
        except Exception as error:
            raise ModelUnavailable('Modelul MoGe-2 nu a putut fi încărcat. Verifică instalarea serverului și accesul la Hugging Face; detaliile sunt în logul serverului.') from error

    def predict(self, rgb: np.ndarray) -> Prediction:
        self._load()
        import torch
        from dataclasses import replace
        key = hashlib.sha256(str(rgb.shape).encode() + rgb.tobytes()).hexdigest()
        ttl = max(0, int(os.getenv('MOGE_CACHE_TTL_SECONDS', '0')))
        if self._cache_key == key and self._cache is not None and time.monotonic() - self._cache_time < ttl:
            return replace(self._cache, cached=True)
        self._cache = None; self._cache_key = None
        level = int(os.getenv('MOGE_RESOLUTION_LEVEL', '6'))
        if not 0 <= level <= 9:
            raise ModelUnavailable('MOGE_RESOLUTION_LEVEL trebuie să fie între 0 și 9.')
        image = torch.from_numpy(np.ascontiguousarray(rgb)).to(device=self.device, dtype=torch.float32).permute(2, 0, 1) / 255.0
        started = time.perf_counter()
        with torch.inference_mode():
            # No supplied FOV, focal length, camera height, tilt, or reference rectangle.
            # infer(), NOT forward(): includes focal/shift recovery, metric scaling and reprojection.
            output = self._model.infer(image, fov_x=None, resolution_level=level,
                                       force_projection=True, apply_mask=True,
                                       use_fp16=self.device.type == 'cuda')
        values = {}
        for name in ('points', 'mask', 'intrinsics'):
            if name not in output:
                raise ModelUnavailable(f'Ieșirea MoGe-2 nu conține {name}.')
            values[name] = output[name].detach().cpu().numpy()
        result = Prediction(values['points'], values['mask'], values['intrinsics'], {
            'id': self.model_id if not self.local_checkpoint else 'local-moge-2-checkpoint',
            'requested_revision': self.revision if not self.local_checkpoint else None,
            'weights_sha256': self._weights_sha256, 'implementation_revision': MOGE_CODE_REVISION,
            'adapter': 'moge.model.v2.MoGeModel.infer', 'metric_scale_head': True,
            'fov_input': None, 'resolution_level': level, 'device': self.device.type,
        }, time.perf_counter() - started)
        if ttl:
            self._cache_key = key; self._cache = result; self._cache_time = time.monotonic()
        return result

    def clear_cache(self):
        self._cache_key = None; self._cache = None
