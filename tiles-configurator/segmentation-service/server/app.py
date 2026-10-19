"""API-only tiles analysis service. No repository-root static mount or uploads on disk."""
from __future__ import annotations

import asyncio
import io
import logging
import os
from contextlib import asynccontextmanager, suppress
from urllib.parse import urlsplit
import re
import time
import warnings
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from PIL import Image, ImageOps, UnidentifiedImageError

from .analysis_jobs import AnalysisJobs
from .deployment import configured_job_options, configured_hosts, legacy_api_enabled, background_jobs_enabled
from .geometry import GeometryError, fit_camera_auto
from .model import CameraModel, ModelUnavailable
from .segmentation import (SurfaceSegmentationModel, SegmentationModelUnavailable,
                           encode_binary_rle, encode_uint8_rle)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ORIGINS = tuple(f'http://{host}:{port}' for host in ('localhost', '127.0.0.1', '[::1]')
                        for port in (3000, 5173, 5500, 8000, 8080))

def configured_origins(value=None):
    raw = value if value is not None else os.getenv('PAVING_ALLOWED_ORIGINS')
    origins = list(DEFAULT_ORIGINS) if raw is None else ([v.strip() for v in raw.split(',') if v.strip()] if isinstance(raw, str) else list(raw))
    for origin in origins:
        u = urlsplit(origin)
        if u.scheme not in ('http', 'https') or not u.netloc or u.path or u.query or u.fragment or u.username or u.password or '*' in origin:
            raise ValueError('PAVING_ALLOWED_ORIGINS must contain exact http(s) origins without paths or wildcards.')
    return origins

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_MASK_BYTES = 4 * 1024 * 1024
MAX_BODY_BYTES = MAX_IMAGE_BYTES + MAX_MASK_BYTES + 1024 * 1024
MAX_PIXELS = 1100 * 1100
# Reuse Uvicorn's configured logger so diagnostics are visible in the same
# terminal as the access log without requiring a separate logging config.
log = logging.getLogger('uvicorn.error')


class BodyTooLarge(Exception):
    pass


class BodyLimit:
    """Limit streamed multipart bodies as well as Content-Length."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope['method'] != 'POST':
            return await self.app(scope, receive, send)
        headers = dict(scope.get('headers', []))
        length = headers.get(b'content-length', b'0')
        try:
            if int(length) > MAX_BODY_BYTES:
                return await JSONResponse({'detail': 'Fotografia este prea mare.'}, status_code=413)(scope, receive, send)
        except ValueError:
            return await JSONResponse({'detail': 'Content-Length invalid.'}, status_code=400)(scope, receive, send)
        total = 0; started = False

        async def limited_receive():
            nonlocal total
            message = await receive()
            total += len(message.get('body', b''))
            if total > MAX_BODY_BYTES:
                raise BodyTooLarge()
            return message

        async def tracked_send(message):
            nonlocal started
            if message['type'] == 'http.response.start':
                started = True
            await send(message)
        try:
            return await self.app(scope, limited_receive, tracked_send)
        except BodyTooLarge:
            if not started:
                return await JSONResponse({'detail': 'Fotografia este prea mare.'}, status_code=413)(scope, receive, send)
            raise


def decode_image(data: bytes, *, mask: bool = False) -> np.ndarray:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                if image.width < 32 or image.height < 32 or image.width * image.height > MAX_PIXELS or max(image.size) > 1100:
                    raise GeometryError('Dimensiunile imaginii de lucru trebuie să fie între 32 și 1100 pixeli.')
                # Frontend uploads already oriented canvas pixels; transpose is harmless
                # there and makes direct API calls explicit. Dimensions must match mask.
                image = ImageOps.exif_transpose(image)
                return np.array(image.convert('L' if mask else 'RGB'))
    except GeometryError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise GeometryError('Fișierul nu este o imagine raster validă.') from error


def create_app(predictor=None, segmentation_predictor=None, root: Path = ROOT, *,
               allowed_origins=None, job_options=None, background_jobs=None) -> FastAPI:
    # root remains an accepted compatibility argument; no source tree is served.
    origins = configured_origins(allowed_origins)
    hosts = configured_hosts()
    enable_legacy = legacy_api_enabled()
    enable_background_jobs = background_jobs_enabled() if background_jobs is None else background_jobs
    @asynccontextmanager
    async def lifespan(app):
        async def expire_results():
            while True:
                await asyncio.sleep(30)
                jobs.prune()
        cleanup = asyncio.create_task(expire_results())
        try:
            yield
        finally:
            cleanup.cancel()
            with suppress(asyncio.CancelledError):
                await cleanup
            await jobs.close()
    app = FastAPI(title='Tiles paving analysis — EoMT + MoGe', docs_url=None,
                  redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.add_middleware(BodyLimit)
    engine = predictor if predictor is not None else CameraModel()
    segmenter = segmentation_predictor if segmentation_predictor is not None else SurfaceSegmentationModel()
    lock = asyncio.Lock()
    jobs = AnalysisJobs(engine, segmenter, lock, **{**configured_job_options(), **(job_options or {})})
    app.state.analysis_jobs = jobs
    latest_by_client: dict[str, int] = {}
    queued: set[int] = set()
    sequence = 0
    active: dict | None = None

    def issue_ticket(client_id: str) -> int:
        nonlocal sequence
        sequence += 1
        ticket = sequence
        latest_by_client[client_id] = ticket
        queued.add(ticket)
        return ticket

    def is_stale(client_id: str, ticket: int) -> bool:
        return latest_by_client.get(client_id) != ticket

    @app.middleware('http')
    async def same_origin(request: Request, call_next):
        if hosts is not None:
            try:
                host = (request.url.hostname or '').lower()
            except ValueError:
                host = ''
            if host not in hosts:
                return JSONResponse({'detail': 'Host is not allowed.'}, status_code=400)
        if not enable_legacy and request.url.path in ('/api/segment', '/api/camera'):
            return JSONResponse({'detail': 'Legacy synchronous API is disabled.'}, status_code=404)
        if not enable_background_jobs and request.method == 'POST' and request.url.path == '/api/paving/jobs':
            return JSONResponse({'detail': 'Background jobs are disabled. Update the configurator to use /api/paving/analyze.'}, status_code=410)
        # No wildcard CORS. A cross-site page must not consume the local GPU service.
        origin = request.headers.get('origin')
        if request.url.path.startswith('/api/') and origin and origin not in origins and origin != f'{request.url.scheme}://{request.url.netloc}':
            return JSONResponse({'detail': 'Originea cererii nu este permisă.'}, status_code=403)
        response = await call_next(request)
        if request.url.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    @app.get('/api/health')
    async def health():
        return {'service': 'paving-analysis', 'api_version': 2, 'mode': 'image_only',
                'model_loaded': bool(getattr(engine, '_model', None)),
                'models_loaded': {
                    'camera': bool(getattr(engine, '_model', None)),
                    'segmentation': bool(getattr(segmenter, '_loaded', False)),
                }, 'busy': lock.locked(), 'active': dict(active) if active else None,
                'queued_requests': len(queued)}

    @app.post('/api/segment')
    async def segment(image_id: str = Form(...), image: UploadFile = File(...), client_id: str = Form('legacy')):
        nonlocal active
        if not re.fullmatch(r'[A-Za-z0-9_.:-]{1,160}', image_id):
            raise HTTPException(422, 'Identificator de imagine invalid.')
        if not re.fullmatch(r'[A-Za-z0-9_.:-]{1,160}', client_id):
            raise HTTPException(422, 'Identificator de client invalid.')
        ticket = issue_ticket(client_id)
        try:
            async with lock:
                queued.discard(ticket)
                if is_stale(client_id, ticket):
                    raise HTTPException(409, 'Cererea de segmentare a fost înlocuită de o fotografie mai nouă.')
                active = {'kind': 'segment', 'image_id': image_id, 'client_id': client_id, 'ticket': ticket}
                try:
                    image_data = await image.read(MAX_IMAGE_BYTES + 1)
                    if len(image_data) > MAX_IMAGE_BYTES:
                        raise HTTPException(413, 'Imaginea depășește limita de încărcare.')

                    def execute():
                        rgb = decode_image(image_data)
                        prediction = segmenter.predict(rgb)
                        model_meta = prediction.model if isinstance(prediction.model, dict) else {}
                        log.info(
                            'Segmentation %s: pipeline=%s counts=%s unknown=%s',
                            image_id,
                            model_meta.get('pipeline'),
                            model_meta.get('semantic_pixel_counts'),
                            model_meta.get('unknown_pixel_count'),
                        )
                        return {
                            'schema_version': 1, 'image_id': image_id,
                            'image': {'width': rgb.shape[1], 'height': rgb.shape[0]},
                            'labels': encode_uint8_rle(prediction.labels),
                            'uncertainty': {
                                'encoding': 'binary_rle_zero_first_row_major',
                                'counts': encode_binary_rle(prediction.uncertain),
                                'uncertain_pct': prediction.uncertain_pct,
                                'meaning': prediction.model.get('uncertainty_definition', 'low_panoptic_segment_score_or_void'),
                            },
                            'ground_hint': {
                                'encoding': 'binary_rle_zero_first_row_major',
                                'counts': encode_binary_rle(prediction.ground_hint if prediction.ground_hint is not None else np.isin(prediction.labels, [4, 6, 10])),
                                'meaning': 'camera_only_broad_ground_hint_not_paving_selection',
                            },
                            'model': prediction.model, 'timing_s': prediction.timing_s,
                        }

                    result = await run_in_threadpool(execute)
                    if is_stale(client_id, ticket):
                        raise HTTPException(409, 'Rezultatul segmentării a devenit depășit.')
                    return result
                except GeometryError as error:
                    raise HTTPException(422, str(error)) from error
                except SegmentationModelUnavailable as error:
                    log.exception('Segmentation models unavailable')
                    raise HTTPException(503, str(error)) from error
                except HTTPException:
                    raise
                except Exception as error:
                    log.exception('Segmentation analysis failed')
                    raise HTTPException(500, 'Segmentarea semantică EoMT a eșuat. Verifică logul serverului.') from error
                finally:
                    active = None
        finally:
            queued.discard(ticket)
            await image.close()

    @app.post('/api/camera')
    async def camera(image_id: str = Form(...), image: UploadFile = File(...), ground_mask: UploadFile = File(...), client_id: str = Form('legacy')):
        nonlocal active
        if not re.fullmatch(r'[A-Za-z0-9_.:-]{1,160}', image_id):
            raise HTTPException(422, 'Identificator de imagine invalid.')
        if not re.fullmatch(r'[A-Za-z0-9_.:-]{1,160}', client_id):
            raise HTTPException(422, 'Identificator de client invalid.')
        ticket = issue_ticket(client_id)
        try:
            async with lock:
                queued.discard(ticket)
                if is_stale(client_id, ticket):
                    raise HTTPException(409, 'Cererea de cameră a fost înlocuită de o fotografie mai nouă.')
                active = {'kind': 'camera', 'image_id': image_id, 'client_id': client_id, 'ticket': ticket}
                try:
                    image_data = await image.read(MAX_IMAGE_BYTES + 1)
                    mask_data = await ground_mask.read(MAX_MASK_BYTES + 1)
                    if len(image_data) > MAX_IMAGE_BYTES or len(mask_data) > MAX_MASK_BYTES:
                        raise HTTPException(413, 'Imaginea sau masca depășește limita de încărcare.')

                    def execute():
                        rgb = decode_image(image_data)
                        selected = decode_image(mask_data, mask=True) > 127
                        if selected.shape != rgb.shape[:2]:
                            raise GeometryError('Fotografia și masca au dimensiuni diferite.')
                        # Semantic segmentation is only a hint. Dirt, concrete, existing paving
                        # and grass are all valid ground candidates; MoGe geometry can detect
                        # the plane even when the semantic mask is empty or wrong.
                        prediction = engine.predict(rgb)
                        started = time.perf_counter()
                        result = fit_camera_auto(prediction.points, prediction.valid, prediction.intrinsics, selected)
                        return {'schema_version': 1, 'image_id': image_id,
                                'image': {'width': rgb.shape[1], 'height': rgb.shape[0]},
                                'model': prediction.model, **result,
                                'timing_s': {'model': 0 if prediction.cached else prediction.inference_s,
                                             'plane': time.perf_counter() - started},
                                'prediction_cached': prediction.cached}

                    result = await run_in_threadpool(execute)
                    if is_stale(client_id, ticket):
                        raise HTTPException(409, 'Rezultatul camerei a devenit depășit.')
                    return result
                except GeometryError as error:
                    raise HTTPException(422, str(error)) from error
                except ModelUnavailable as error:
                    log.exception('Metric camera model unavailable')
                    raise HTTPException(503, str(error)) from error
                except HTTPException:
                    raise
                except Exception as error:
                    log.exception('Camera analysis failed')
                    raise HTTPException(500, 'Estimarea camerei a eșuat. Verifică logul serverului; nu se folosesc valori implicite.') from error
                finally:
                    active = None
        finally:
            queued.discard(ticket)
            await image.close(); await ground_mask.close()

    def valid_id(value):
        if not re.fullmatch(r'[A-Za-z0-9_.:-]{1,160}', value):
            raise HTTPException(422, 'Invalid image/client identifier.')
        return value

    @app.get('/api/paving/health')
    async def pipeline_health():
        jobs.prune()
        return {'service': 'paving-analysis', 'api_version': 4, 'job_api_version': 1,
                'analysis_api_version': 1,
                'busy': lock.locked(), 'models_loaded': {
                    'camera': bool(getattr(engine, '_model', None)),
                    'segmentation': bool(getattr(segmenter, '_loaded', False))},
                'limits': {'max_image_bytes': MAX_IMAGE_BYTES, 'max_side': 1100,
                           'min_side': 32, 'result_ttl_s': jobs.ttl_s, 'max_pending': jobs.max_pending,
                           'max_results': jobs.max_results, 'max_clients': jobs.max_clients},
                'deployment': {'workers': 1, 'legacy_api': enable_legacy,
                               'background_jobs': enable_background_jobs, 'request_bound_analysis': True,
                               'host_allowlist': hosts is not None, 'durable_photo_storage': False}}

    async def read_analysis_image(image_id, client_id, generation, image):
        try:
            valid_id(image_id); valid_id(client_id)
            if not 1 <= generation <= 9007199254740991:
                raise HTTPException(422, 'Invalid analysis generation.')
            data = await image.read(MAX_IMAGE_BYTES + 1)
            if len(data) > MAX_IMAGE_BYTES:
                raise HTTPException(413, 'The working image exceeds 8 MB.')
            try:
                rgb = await run_in_threadpool(decode_image, data)
            except GeometryError as error:
                raise HTTPException(422, str(error)) from error
            return rgb
        finally:
            await image.close()

    @app.post('/api/paving/analyze')
    async def analyze(image_id: str = Form(...), client_id: str = Form(...),
                      generation: int = Form(...), image: UploadFile = File(...)):
        rgb = await read_analysis_image(image_id, client_id, generation, image)
        # Do not return 202 or move this work into FastAPI BackgroundTasks.
        # A live request keeps CPU allocated with Cloud Run request-based billing.
        return await jobs.analyze(rgb, image_id, client_id, generation)

    @app.post('/api/paving/jobs', status_code=202)
    async def submit_job(image_id: str = Form(...), client_id: str = Form(...),
                         generation: int = Form(...), image: UploadFile = File(...)):
        rgb = await read_analysis_image(image_id, client_id, generation, image)
        return jobs.submit(rgb, image_id, client_id, generation)

    @app.get('/api/paving/jobs/{job_id}')
    async def job_status(job_id: str, client_id: str = Header(..., alias='X-Paving-Client')):
        return jobs.get(job_id, valid_id(client_id)).public()

    @app.get('/api/paving/jobs/{job_id}/result')
    async def job_result(job_id: str, client_id: str = Header(..., alias='X-Paving-Client')):
        job = jobs.get(job_id, valid_id(client_id))
        if job.state == 'cancelled':
            raise HTTPException(410, 'This result was cancelled or superseded.')
        if job.state != 'completed' or job.result is None:
            raise HTTPException(409, 'The analysis result is not ready.')
        return job.result

    @app.delete('/api/paving/jobs/{job_id}')
    async def cancel_job(job_id: str, client_id: str = Header(..., alias='X-Paving-Client')):
        return jobs.cancel(job_id, valid_id(client_id))

    @app.delete('/api/paving/requests/{generation}')
    async def cancel_generation(generation: int, client_id: str = Header(..., alias='X-Paving-Client')):
        if not 1 <= generation <= 9007199254740991:
            raise HTTPException(422, 'Invalid analysis generation.')
        return jobs.cancel_generation(valid_id(client_id), generation)

    @app.get('/')
    async def index():
        return {'service': 'paving-analysis', 'frontend': 'Run the existing configurator website separately.',
                'health': '/api/paving/health'}

    # CORS is the outer layer so allowed callers can read errors too. The origin
    # guard still rejects disallowed simple POSTs (CORS alone is not CSRF protection).
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False,
                       allow_methods=['GET', 'POST', 'DELETE'],
                       allow_headers=['Content-Type', 'X-Paving-Client'], max_age=600)
    return app


app = create_app()
