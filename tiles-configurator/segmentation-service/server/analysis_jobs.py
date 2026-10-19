"""Bounded, in-memory upload jobs. No weights or user images are persisted here.

Cancelling a job invalidates its result immediately. A running PyTorch call is
allowed to finish under the shared lock; we never pretend to preempt a GPU kernel
or release the lock while its thread is still working.
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field

import numpy as np
from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool

from .geometry import fit_camera_auto, GeometryError
from .model import ModelUnavailable
from .segmentation import SegmentationModelUnavailable, encode_binary_rle, encode_uint8_rle

log = logging.getLogger('uvicorn.error')
TERMINAL = {'completed', 'failed', 'cancelled'}


def segment_payload(prediction, image_id, width, height):
    """Keep the existing step-2 response contract and original semantic classes."""
    if prediction.labels.shape != (height, width) or prediction.uncertain.shape != (height, width):
        raise ValueError('Segmentation returned mismatched dimensions')
    hint = np.isin(prediction.labels, [4, 6, 10])
    return {
        'schema_version': 1, 'image_id': image_id, 'image': {'width': width, 'height': height},
        'labels': encode_uint8_rle(prediction.labels),
        'uncertainty': {'encoding': 'binary_rle_zero_first_row_major',
                        'counts': encode_binary_rle(prediction.uncertain),
                        'uncertain_pct': float(prediction.uncertain_pct),
                        'meaning': prediction.model.get('uncertainty_definition', 'low_panoptic_segment_score_or_void')},
        'ground_hint': {'encoding': 'binary_rle_zero_first_row_major',
                        'counts': encode_binary_rle(hint),
                        'meaning': 'camera_only_broad_ground_hint_not_paving_selection'},
        'model': prediction.model, 'timing_s': prediction.timing_s,
    }, hint


@dataclass
class Job:
    id: str
    client_id: str
    generation: int
    image_id: str
    width: int
    height: int
    created: float
    updated: float
    state: str = 'queued'
    stage: str = 'queued'
    cancelled: bool = False
    result: dict | None = None
    errors: dict = field(default_factory=dict)
    timings: dict = field(default_factory=dict)
    task: asyncio.Task | None = None

    def public(self):
        return {'job_id': self.id, 'image_id': self.image_id, 'generation': self.generation,
                'image': {'width': self.width, 'height': self.height},
                'state': self.state, 'stage': self.stage, 'errors': dict(self.errors),
                'timing_s': dict(self.timings)}


class AnalysisJobs:
    def __init__(self, camera, segmenter, lock, *, max_pending=4, max_results=8,
                 ttl_s=900, max_clients=128, clock=time.monotonic):
        self.camera, self.segmenter, self.lock = camera, segmenter, lock
        self.max_pending, self.max_results, self.ttl_s = max_pending, max_results, ttl_s
        self.max_clients, self.clock = max_clients, clock
        self.jobs: dict[str, Job] = {}
        self.latest: dict[str, tuple[int, str, float]] = {}
        self.closed = False

    def prune(self):
        now = self.clock()
        finished = sorted((j for j in self.jobs.values() if j.state in TERMINAL
                           and (not j.task or j.task.done())), key=lambda j: j.updated)
        excess = max(0, len(finished) - self.max_results)
        for i, j in enumerate(finished):
            if now - j.updated > self.ttl_s or i < excess:
                self.jobs.pop(j.id, None)
        for client, (_, job_id, stamp) in list(self.latest.items()):
            if job_id not in self.jobs and now - stamp > self.ttl_s:
                self.latest.pop(client, None)

    def submit(self, rgb, image_id, client_id, generation):
        self.prune()
        if self.closed:
            raise HTTPException(503, 'The analysis service is stopping.')
        old = self.latest.get(client_id)
        # Ordered at request start by the browser, not at completion of multipart
        # parsing. A slowly uploaded older request cannot supersede a newer one.
        if old and generation <= old[0]:
            raise HTTPException(409, 'This analysis request has already been superseded.')
        if not old and len(self.latest) >= self.max_clients:
            raise HTTPException(429, 'Too many analysis sessions. Try again later.')
        pending = [j for j in self.jobs.values() if j.task and not j.task.done()]
        # Cancelled tasks still count until they actually release their buffers/lock.
        if len(pending) >= self.max_pending:
            raise HTTPException(429, 'The analysis queue is full. Try again after the current job finishes.')
        if old and old[1] in self.jobs:
            self.cancel(old[1], client_id)
        now = self.clock()
        j = Job(uuid.uuid4().hex, client_id, generation, image_id,
                int(rgb.shape[1]), int(rgb.shape[0]), now, now)
        self.jobs[j.id] = j
        self.latest[client_id] = (generation, j.id, now)
        j.task = asyncio.create_task(self._run(j, rgb), name=f'paving-{j.id}')
        return j.public()

    def get(self, job_id, client_id):
        self.prune()
        j = self.jobs.get(job_id)
        if not j or j.client_id != client_id:
            raise HTTPException(404, 'Analysis job not found or expired.')
        return j

    async def analyze(self, rgb, image_id, client_id, generation):
        """Hold the caller's HTTP request until all inference has finished.

        Shield the worker: cancelling a response must not release its model lock
        while a non-interruptible PyTorch call still owns the thread/buffers.
        The generation cancellation route can invalidate results in the meantime.
        """
        submitted = self.submit(rgb, image_id, client_id, generation)
        job = self.get(submitted['job_id'], client_id)
        try:
            await asyncio.shield(job.task)
        except asyncio.CancelledError:
            self.cancel(job.id, client_id)
            await asyncio.shield(job.task)
            raise
        if job.state == 'cancelled':
            raise HTTPException(410, 'This analysis was cancelled or superseded.')
        if job.state != 'completed' or job.result is None:
            raise HTTPException(500, 'Analysis failed. Check the service log or continue manually.')
        return {**job.result, 'job_id': job.id, 'generation': job.generation}

    def cancel(self, job_id, client_id):
        j = self.get(job_id, client_id)
        if j.state not in TERMINAL:
            j.cancelled = True
            j.state, j.stage, j.updated = 'cancelled', 'cancelled', self.clock()
            j.result = None
        return j.public()

    def cancel_generation(self, client_id, generation):
        self.prune()
        old = self.latest.get(client_id)
        if old and old[0] > generation:
            return {'cancelled': False, 'generation': generation}
        if not old and len(self.latest) >= self.max_clients:
            raise HTTPException(429, 'Too many analysis sessions.')
        if old and old[1] in self.jobs:
            self.cancel(old[1], client_id)
        self.latest[client_id] = (generation, '', self.clock())
        return {'cancelled': True, 'generation': generation}

    def _current(self, j):
        entry = self.latest.get(j.client_id)
        return not j.cancelled and entry is not None and entry[1] == j.id and not self.closed

    def _stage(self, j, name):
        j.state, j.stage, j.updated = 'running', name, self.clock()
        log.info('Paving job %s: %s', j.id[:12], name)

    async def _run(self, j, rgb):
        started = self.clock()
        result = {'image_id': j.image_id, 'image': {'width': j.width, 'height': j.height},
                  'segmentation': None, 'geometry': None}
        try:
            async with self.lock:
                if not self._current(j):
                    return
                j.timings['queue'] = self.clock() - started
                self._stage(j, 'segmentation')
                stage_start = self.clock()
                hint = np.zeros(rgb.shape[:2], dtype=bool)
                try:
                    def segment():
                        return segment_payload(self.segmenter.predict(rgb), j.image_id, j.width, j.height)
                    result['segmentation'], hint = await run_in_threadpool(segment)
                except Exception as error:
                    log.exception('Paving job %s segmentation failed', j.id[:12])
                    j.errors['segmentation'] = {
                        'code': 'model_unavailable' if isinstance(error, SegmentationModelUnavailable) else 'segmentation_failed',
                        'message': 'Surface detection failed. Camera estimation will still be attempted; check the server log.'}
                j.timings['segmentation'] = self.clock() - stage_start
                if not self._current(j):
                    return
                self._stage(j, 'camera')
                stage_start = self.clock()
                try:
                    def geometry():
                        prediction = self.camera.predict(rgb)
                        plane_start = time.perf_counter()
                        fitted = fit_camera_auto(prediction.points, prediction.valid, prediction.intrinsics, hint)
                        return {'schema_version': 1, 'image_id': j.image_id,
                                'image': {'width': j.width, 'height': j.height}, 'model': prediction.model,
                                **fitted, 'timing_s': {'model': 0 if prediction.cached else prediction.inference_s,
                                                       'plane': time.perf_counter() - plane_start},
                                'prediction_cached': prediction.cached}
                    result['geometry'] = await run_in_threadpool(geometry)
                except Exception as error:
                    log.exception('Paving job %s camera failed', j.id[:12])
                    j.errors['camera'] = {
                        'code': 'model_unavailable' if isinstance(error, ModelUnavailable) else
                                'invalid_geometry' if isinstance(error, GeometryError) else 'camera_failed',
                        'message': 'Automatic ground/camera estimation failed. Use the 1 m reference square; no guessed camera was substituted.'}
                j.timings['camera'] = self.clock() - stage_start
                if not self._current(j):
                    return
                j.timings['total'] = self.clock() - started
                result['errors'], result['timing_s'] = dict(j.errors), dict(j.timings)
                j.result = result
                j.state, j.stage = 'completed', 'complete'
        except Exception:
            log.exception('Paving job %s failed', j.id[:12])
            j.errors['service'] = {'code': 'analysis_failed', 'message': 'Analysis failed. Check the server log or continue manually.'}
            j.state, j.stage = 'failed', 'failed'
        finally:
            if not self._current(j):
                j.state, j.stage, j.result = 'cancelled', 'cancelled', None
            j.updated = self.clock()
            # Release job input. CameraModel may retain ONE last prediction in its
            # existing in-memory cache; there is no image file/disk write here.
            rgb = None
            self.prune()

    async def close(self):
        self.closed = True
        for j in self.jobs.values():
            j.cancelled = True
        tasks = [j.task for j in self.jobs.values() if j.task and not j.task.done()]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self.jobs.clear()
        self.latest.clear()
