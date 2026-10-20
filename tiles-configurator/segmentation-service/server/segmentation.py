"""Supervised scene segmentation for paving with EoMT-S COCO panoptic.

The previous TIPS + SAM experiment was zero-shot and produced visible semantic
islands on yard photographs. SAM automatic-mask generation also made CPU runs
very slow. This module uses one compact supervised segmentation model instead:
EoMT-S (DINOv2-Small, COCO panoptic, 640 px).

EoMT predicts coherent thing/stuff regions. COCO scene classes are mapped into
this prototype's stable semantic byte labels. Anything not recognised as a
valid ground material, sky, building/wall/fence or vegetation is protected as
an obstacle by default.

MoGe geometry remains independent. Semantic ground labels are only a hint to
camera fitting; MoGe ground support is never copied into semantic materials.
"""
from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass

import numpy as np
from PIL import Image

log = logging.getLogger('uvicorn.error')

EOMT_DEFAULT_ID = 'tue-mps/coco_panoptic_eomt_small_640_2x'
EOMT_DEFAULT_REVISION = 'main'

# Stable application labels consumed by index.html. These are NOT COCO IDs.
LABEL_UNKNOWN = 0
LABEL_BUILDING = 1
LABEL_SKY = 3
LABEL_PAVEMENT = 4
LABEL_VEGETATION = 5
LABEL_DIRT = 6
LABEL_GRASS = 10
LABEL_OBSTACLE = 250
GROUND_LABELS = (LABEL_GRASS, LABEL_PAVEMENT, LABEL_DIRT)

CATEGORY_SPECS = (
    ('grass', LABEL_GRASS, 'grass / lawn'),
    ('pavement', LABEL_PAVEMENT, 'pavement / concrete / driveway / road'),
    ('dirt', LABEL_DIRT, 'dirt / soil / sand / gravel'),
    ('building', LABEL_BUILDING, 'house / building / wall / fence'),
    ('vegetation', LABEL_VEGETATION, 'tree / plant / vegetation'),
    ('sky', LABEL_SKY, 'sky'),
    ('obstacle', LABEL_OBSTACLE, 'all other non-ground scene classes'),
)

# COCO panoptic names exposed by the selected EoMT checkpoint.
# Any valid model class not listed here is intentionally OBSTACLE/protected.
COCO_TO_APP_NAMES = {
    LABEL_GRASS: {
        'grass-merged', 'playingfield',
    },
    LABEL_PAVEMENT: {
        'pavement-merged', 'road', 'platform', 'floor-other-merged',
    },
    LABEL_DIRT: {
        'dirt-merged', 'sand', 'gravel',
    },
    LABEL_BUILDING: {
        'building-other-merged', 'house', 'roof', 'fence-merged',
        'wall-brick', 'wall-stone', 'wall-tile', 'wall-wood', 'wall-other-merged',
        'door-stuff', 'window-blind', 'window-other',
    },
    LABEL_VEGETATION: {
        'tree-merged', 'flower', 'potted plant',
    },
    LABEL_SKY: {
        'sky-other-merged',
    },
}


@dataclass(frozen=True)
class SegmentationPrediction:
    labels: np.ndarray
    uncertain: np.ndarray
    uncertain_pct: float
    model: dict
    timing_s: dict
    ground_hint: np.ndarray | None = None


class SegmentationModelUnavailable(RuntimeError):
    pass


def encode_binary_rle(mask: np.ndarray) -> list[int]:
    values = np.asarray(mask, dtype=np.uint8).reshape(-1)
    counts: list[int] = []
    current = 0
    run = 0
    for value in values:
        bit = 1 if value else 0
        if bit == current:
            run += 1
        else:
            counts.append(run)
            run = 1
            current = bit
    counts.append(run)
    return counts


def encode_uint8_rle(labels: np.ndarray) -> dict:
    values = np.asarray(labels, dtype=np.uint8).reshape(-1)
    if not len(values):
        return {'encoding': 'uint8_rle_row_major', 'values': [], 'counts': []}
    out_values = [int(values[0])]
    counts = [1]
    for value in values[1:]:
        value = int(value)
        if value == out_values[-1]:
            counts[-1] += 1
        else:
            out_values.append(value)
            counts.append(1)
    return {'encoding': 'uint8_rle_row_major', 'values': out_values, 'counts': counts}


def _normalise_id2label(id2label) -> dict[int, str]:
    if not isinstance(id2label, dict):
        raise SegmentationModelUnavailable('Checkpoint-ul EoMT nu conține id2label.')
    result: dict[int, str] = {}
    for key, value in id2label.items():
        try:
            index = int(key)
        except (TypeError, ValueError):
            continue
        result[index] = str(value).strip().lower()
    if not result:
        raise SegmentationModelUnavailable('Spațiul de clase EoMT este gol sau invalid.')
    return result


def _build_class_lookup(id2label: dict[int, str]) -> tuple[np.ndarray, dict[str, list[int]]]:
    """Map all COCO classes to the paving application's semantic contract."""
    labels = _normalise_id2label(id2label)
    lookup = np.full(max(labels) + 1, LABEL_OBSTACLE, dtype=np.uint8)
    mapped: dict[str, list[int]] = {name: [] for name, _label, _desc in CATEGORY_SPECS}
    app_name_by_label = {label: name for name, label, _desc in CATEGORY_SPECS}
    name_to_app = {
        model_name: app_label
        for app_label, model_names in COCO_TO_APP_NAMES.items()
        for model_name in model_names
    }
    for model_id, model_name in labels.items():
        app_label = name_to_app.get(model_name, LABEL_OBSTACLE)
        lookup[model_id] = app_label
        mapped[app_name_by_label[app_label]].append(model_id)
    return lookup, mapped


def _panoptic_to_model_ids(segmentation, segments_info, shape: tuple[int, int]) -> tuple[np.ndarray, np.ndarray]:
    """Convert EoMT panoptic segment IDs into per-pixel COCO class IDs + scores."""
    if hasattr(segmentation, 'detach'):
        segment_map = segmentation.detach().cpu().numpy()
    else:
        segment_map = np.asarray(segmentation)
    if segment_map.shape != shape:
        raise SegmentationModelUnavailable('Masca panoptică EoMT are dimensiuni incompatibile.')
    raw_ids = np.full(shape, -1, dtype=np.int32)
    confidence = np.zeros(shape, dtype=np.float32)
    for item in segments_info or []:
        try:
            segment_id = int(item['id'])
            label_id = int(item['label_id'])
            score = float(item.get('score', 1.0))
        except (KeyError, TypeError, ValueError):
            continue
        pixels = segment_map == segment_id
        if np.any(pixels):
            raw_ids[pixels] = label_id
            confidence[pixels] = score
    return raw_ids, confidence


def _map_model_ids(raw_ids: np.ndarray, lookup: np.ndarray) -> np.ndarray:
    raw = np.asarray(raw_ids)
    result = np.full(raw.shape, LABEL_UNKNOWN, dtype=np.uint8)
    valid = np.isfinite(raw) & (raw >= 0) & (raw < len(lookup))
    if np.any(valid):
        result[valid] = lookup[raw[valid].astype(np.int64, copy=False)]
    return result


def _fill_panoptic_void(raw_ids: np.ndarray, semantic_ids: np.ndarray) -> tuple[np.ndarray, int]:
    """Fill only panoptic void pixels from EoMT's semantic output."""
    raw = np.asarray(raw_ids, dtype=np.int32)
    semantic = np.asarray(semantic_ids, dtype=np.int32)
    if raw.shape != semantic.shape:
        raise SegmentationModelUnavailable('Măștile EoMT panoptică și semantică au dimensiuni incompatibile.')
    void = raw < 0
    count = int(void.sum())
    if not count:
        return raw.copy(), 0
    filled = raw.copy()
    filled[void] = semantic[void]
    return filled, count


def _semantic_ids_from_outputs(processor, outputs, target_size: tuple[int, int]) -> np.ndarray:
    """Decode semantic IDs from the same EoMT forward pass without HF's buggy fast helper.

    Transformers 4.57.x EoMT fast processing unconditionally calls
    merge_image_patches() even when outputs.patch_offsets is None, which crashes
    normal single-image inference. Reconstruct semantic logits directly from the
    query class probabilities and unpadded query masks instead.
    """
    import torch
    import torch.nn.functional as F

    height, width = (int(target_size[0]), int(target_size[1]))
    masks_logits = outputs.masks_queries_logits
    class_logits = outputs.class_queries_logits
    if masks_logits.ndim != 4 or class_logits.ndim != 3 or masks_logits.shape[0] != 1 or class_logits.shape[0] != 1:
        raise SegmentationModelUnavailable('Ieșirea EoMT semantică are dimensiuni neașteptate.')

    size = getattr(processor, 'size', None) or {'shortest_edge': 640, 'longest_edge': 640}
    shortest = int(size.get('shortest_edge', 640))
    longest = int(size.get('longest_edge') or shortest)
    masks_logits = F.interpolate(masks_logits, size=(shortest, longest), mode='bilinear', align_corners=False)

    if hasattr(processor, 'unpad_image'):
        unpadded = processor.unpad_image(masks_logits, [(height, width)], size)[0]
    else:
        # Compatibility fallback for processor variants without unpad_image.
        unpadded = F.interpolate(masks_logits, size=(height, width), mode='bilinear', align_corners=False)[0]

    class_probs = class_logits.softmax(dim=-1)[0, :, :-1]
    mask_probs = unpadded.sigmoid()
    if class_probs.shape[0] != mask_probs.shape[0]:
        raise SegmentationModelUnavailable('Numărul de query-uri EoMT nu corespunde între clase și măști.')
    semantic_logits = torch.einsum('qc,qhw->chw', class_probs, mask_probs)
    semantic_ids = semantic_logits.argmax(dim=0).detach().cpu().numpy().astype(np.int32, copy=False)
    if semantic_ids.shape != (height, width):
        raise SegmentationModelUnavailable('Masca semantică EoMT are dimensiuni incompatibile.')
    return semantic_ids


class SurfaceSegmentationModel:
    """Lazy-loaded compact EoMT-S COCO panoptic scene segmenter."""

    def __init__(self):
        self.model_id = os.getenv('EOMT_MODEL_ID', EOMT_DEFAULT_ID)
        self.model_revision = os.getenv('EOMT_MODEL_REVISION', EOMT_DEFAULT_REVISION)
        self.device_name = os.getenv('SEGMENTATION_DEVICE')
        self.panoptic_threshold = max(0.05, min(0.95, float(os.getenv('EOMT_PANOPTIC_THRESHOLD', '0.45'))))
        self.uncertain_score = max(self.panoptic_threshold, min(1.0, float(os.getenv('EOMT_UNCERTAIN_SCORE', '0.65'))))
        self.mask_threshold = max(0.05, min(0.95, float(os.getenv('EOMT_MASK_THRESHOLD', '0.50'))))
        self.overlap_threshold = max(0.05, min(0.99, float(os.getenv('EOMT_OVERLAP_THRESHOLD', '0.80'))))
        self.debug = os.getenv('SEGMENTATION_DEBUG', '').strip().lower() in ('1', 'true', 'yes', 'on')
        self._loaded = False
        self._model = None
        self._processor = None
        self._lookup = None
        self._mapped_model_ids = None
        self._stuff_ids = None
        self.device = None

    def _load(self):
        if self._loaded:
            return
        try:
            import torch
            from transformers import AutoImageProcessor, EomtForUniversalSegmentation

            token = os.getenv('HF_TOKEN') or None
            device_name = self.device_name or ('cuda' if torch.cuda.is_available() else 'cpu')
            self.device = torch.device(device_name)
            kwargs = {'revision': self.model_revision, 'token': token}
            if self.device.type == 'cuda':
                kwargs['torch_dtype'] = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16

            self._processor = AutoImageProcessor.from_pretrained(
                self.model_id, revision=self.model_revision, token=token
            )
            self._model = EomtForUniversalSegmentation.from_pretrained(
                self.model_id, **kwargs
            ).to(self.device).eval()
            self._lookup, self._mapped_model_ids = _build_class_lookup(self._model.config.id2label)
            # COCO panoptic uses contiguous thing IDs 0..79 and stuff IDs 80..132.
            self._stuff_ids = [idx for idx in range(80, len(self._lookup))]
            self._loaded = True
            log.info(
                '[seg][EoMT] loaded model=%s revision=%s device=%s classes=%d',
                self.model_id, self.model_revision, self.device.type, len(self._lookup),
            )
        except SegmentationModelUnavailable:
            raise
        except Exception as error:
            raise SegmentationModelUnavailable(
                'Modelul semantic EoMT nu a putut fi încărcat. Rulează instalarea din '
                'server/requirements.txt și verifică accesul la Hugging Face.'
            ) from error

    @staticmethod
    def _to_device(inputs: dict, device):
        return {key: (value.to(device) if hasattr(value, 'to') else value) for key, value in inputs.items()}

    def _run_panoptic(self, rgb: np.ndarray):
        import torch

        height, width = rgb.shape[:2]
        image = Image.fromarray(np.ascontiguousarray(rgb), 'RGB')
        inputs = self._processor(images=image, return_tensors='pt')
        inputs = self._to_device(inputs, self.device)
        started = time.perf_counter()
        with torch.inference_mode():
            outputs = self._model(**inputs)
        inference_s = time.perf_counter() - started

        post_started = time.perf_counter()
        result = self._processor.post_process_panoptic_segmentation(
            outputs,
            target_sizes=[(height, width)],
            threshold=self.panoptic_threshold,
            mask_threshold=self.mask_threshold,
            overlap_mask_area_threshold=self.overlap_threshold,
            stuff_classes=self._stuff_ids,
        )[0]
        raw_ids, confidence = _panoptic_to_model_ids(
            result['segmentation'], result.get('segments_info', []), (height, width)
        )
        # Panoptic post-processing intentionally leaves pixels void when no query
        # clears the segment threshold.  For paving photos that can hide small but
        # important stuff regions such as a concrete walkway.  Reuse the SAME EoMT
        # forward pass as a semantic fallback for those void pixels only; this adds
        # no second model inference and does not override confident panoptic regions.
        semantic_ids = _semantic_ids_from_outputs(self._processor, outputs, (height, width))
        raw_ids, fallback_pixels = _fill_panoptic_void(raw_ids, semantic_ids)
        postprocess_s = time.perf_counter() - post_started
        model_input = tuple(int(v) for v in inputs['pixel_values'].shape[-2:]) if 'pixel_values' in inputs else None
        return raw_ids, confidence, result.get('segments_info', []), inference_s, postprocess_s, model_input, fallback_pixels

    def predict(self, rgb: np.ndarray) -> SegmentationPrediction:
        self._load()
        if rgb.ndim != 3 or rgb.shape[2] != 3 or rgb.shape[0] < 1 or rgb.shape[1] < 1:
            raise SegmentationModelUnavailable('Imagine RGB invalidă pentru segmentare.')

        total_started = time.perf_counter()
        raw_ids, confidence, segments_info, inference_s, postprocess_s, model_input, fallback_pixels = self._run_panoptic(rgb)
        labels = _map_model_ids(raw_ids, self._lookup)
        uncertain = ((raw_ids < 0) | (confidence < self.uncertain_score)).astype(np.uint8)
        ground_hint = np.isin(labels, GROUND_LABELS).astype(np.uint8)
        uncertain_pct = 100.0 * float(uncertain.sum()) / max(1, uncertain.size)

        semantic_counts = {name: int((labels == label).sum()) for name, label, _desc in CATEGORY_SPECS}
        unknown_count = int((labels == LABEL_UNKNOWN).sum())
        id2label = _normalise_id2label(self._model.config.id2label)
        segment_summary = sorted(
            (
                {
                    'id': int(item.get('id', -1)),
                    'label_id': int(item.get('label_id', -1)),
                    'name': id2label.get(int(item.get('label_id', -1)), 'unknown'),
                    'score': float(item.get('score', 0.0)),
                }
                for item in segments_info
            ),
            key=lambda item: item['score'],
            reverse=True,
        )[:20]

        log.info(
            '[seg][EoMT] counts=%s unknown=%d segments=%d semantic_fallback=%d input=%s inference=%.3fs post=%.3fs',
            semantic_counts, unknown_count, len(segments_info), fallback_pixels, model_input, inference_s, postprocess_s,
        )
        if self.debug:
            log.warning('[seg][EoMT] top segments=%s', segment_summary)

        total_s = time.perf_counter() - total_started
        metadata = {
            'pipeline': 'eomt_coco_panoptic_supervised',
            'eomt': {
                'id': self.model_id,
                'requested_revision': self.model_revision,
                'license_declared': 'MIT on Hugging Face model card',
                'task': 'panoptic',
                'backbone': 'DINOv2-Small',
                'nominal_input': '640px',
            },
            'device': self.device.type,
            'input_size': ({'height': model_input[0], 'width': model_input[1]} if model_input else None),
            'semantic_status': 'ok' if len(segments_info) else 'empty_eomt_result',
            'semantic_pixel_counts': semantic_counts,
            'unknown_pixel_count': unknown_count,
            'segment_count': len(segments_info),
            'semantic_fallback_pixel_count': fallback_pixels,
            'semantic_fallback_meaning': 'same_eomt_forward_pass_used_only_for_panoptic_void_pixels',
            'panoptic_threshold': self.panoptic_threshold,
            'uncertain_score_threshold': self.uncertain_score,
            'mask_threshold': self.mask_threshold,
            'overlap_threshold': self.overlap_threshold,
            'uncertainty_definition': 'eomt_panoptic_segment_score_below_threshold_or_void',
            'canonical_labels': {name: label for name, label, _desc in CATEGORY_SPECS},
            'mapped_model_ids': self._mapped_model_ids,
            'top_segments': segment_summary,
        }
        return SegmentationPrediction(
            labels=labels,
            uncertain=uncertain,
            uncertain_pct=uncertain_pct,
            model=metadata,
            timing_s={'eomt': inference_s, 'postprocess': postprocess_s, 'total': total_s},
            ground_hint=ground_hint,
        )
