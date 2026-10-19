"""Request-bound inference contract. Synthetic models; no weights or cloud calls."""
import asyncio
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import numpy as np
from fastapi import HTTPException
from fastapi.testclient import TestClient

from .app import create_app
from .analysis_jobs import AnalysisJobs
from .test_camera import FakeModel
from .test_jobs import FakeSegments, FakeGeometry, geometry_result, image_bytes


class AnalyzeAPITests(unittest.TestCase):
    def post(self, client, generation='1', image=None):
        return client.post('/api/paving/analyze',
                           data={'image_id': 'photo', 'client_id': 'client', 'generation': generation},
                           files={'image': ('yard.png', image if image is not None else image_bytes(), 'image/png')})

    def test_upload_returns_complete_result_without_a_second_request(self):
        with TestClient(create_app(FakeModel(), FakeSegments())) as client:
            health = client.get('/api/paving/health').json()
            self.assertEqual(health['analysis_api_version'], 1)
            self.assertFalse(health['deployment']['background_jobs'])
            response = self.post(client)
            self.assertEqual(response.status_code, 200, response.text)
            result = response.json()
            self.assertEqual(result['image_id'], 'photo')
            self.assertEqual(result['generation'], 1)
            self.assertEqual(result['errors'], {})
            self.assertEqual(len(result['job_id']), 32)
            self.assertEqual(result['segmentation']['image_id'], 'photo')
            self.assertEqual(result['geometry']['image_id'], 'photo')
            self.assertIn('total', result['timing_s'])
            self.assertTrue(all(j.task.done() for j in client.app.state.analysis_jobs.jobs.values()))

    def test_old_background_upload_is_disabled_before_it_can_start_inference(self):
        model, segments = FakeModel(), FakeSegments()
        with patch.object(segments, 'predict', wraps=segments.predict) as predict:
            with TestClient(create_app(model, segments)) as client:
                response = client.post('/api/paving/jobs',
                                       data={'image_id': 'p', 'client_id': 'c', 'generation': '1'},
                                       files={'image': ('yard.png', image_bytes(), 'image/png')})
                self.assertEqual(response.status_code, 410)
                self.assertIn('/api/paving/analyze', response.json()['detail'])
                self.assertEqual(client.app.state.analysis_jobs.jobs, {})
                predict.assert_not_called()

    def test_response_cannot_finish_while_either_model_is_still_running(self):
        entered = threading.Event()
        release = threading.Event()
        class SlowSegments(FakeSegments):
            def predict(self, rgb):
                entered.set()
                if not release.wait(5):
                    raise RuntimeError('Test failed to release model')
                return super().predict(rgb)
        with TestClient(create_app(FakeModel(), SlowSegments())) as client:
            with ThreadPoolExecutor() as pool:
                response = pool.submit(self.post, client)
                try:
                    self.assertTrue(entered.wait(3))
                    self.assertFalse(response.done())
                finally:
                    release.set()
                self.assertEqual(response.result(5).status_code, 200)

    def test_validation_generation_and_cors_still_apply(self):
        with TestClient(create_app(FakeModel(), FakeSegments(), allowed_origins=['https://www.360configurator.com'])) as client:
            self.assertEqual(self.post(client, image=b'bad').status_code, 422)
            self.assertEqual(self.post(client, generation='0').status_code, 422)
            self.assertEqual(self.post(client).status_code, 200)
            self.assertEqual(self.post(client).status_code, 409)
            response = client.options('/api/paving/analyze', headers={
                'Origin': 'https://www.360configurator.com', 'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'x-paving-client'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers['access-control-allow-origin'], 'https://www.360configurator.com')

    def test_cancellation_before_upload_never_starts_a_model(self):
        segments = FakeSegments()
        with patch.object(segments, 'predict') as predict:
            with TestClient(create_app(FakeModel(), segments)) as client:
                client.delete('/api/paving/requests/1', headers={'X-Paving-Client': 'client'})
                self.assertEqual(self.post(client).status_code, 409)
                predict.assert_not_called()


class RequestLifetimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancelled_request_drains_running_call_before_releasing_model_lock(self):
        entered, release = threading.Event(), threading.Event()
        camera_calls = []
        class SlowSegments(FakeSegments):
            def predict(self, rgb):
                entered.set()
                release.wait(5)
                return super().predict(rgb)
        class Camera(FakeGeometry):
            def predict(self, rgb):
                camera_calls.append(True)
                return super().predict(rgb)
        jobs = AnalysisJobs(Camera(), SlowSegments(), asyncio.Lock())
        with patch('server.analysis_jobs.fit_camera_auto', geometry_result):
            request = asyncio.create_task(jobs.analyze(np.zeros((32, 32, 3), np.uint8), 'p', 'c', 1))
            try:
                for _ in range(1000):
                    if entered.is_set(): break
                    await asyncio.sleep(.001)
                self.assertTrue(entered.is_set())
                request.cancel()
                for _ in range(100):
                    if jobs.jobs and next(iter(jobs.jobs.values())).cancelled: break
                    await asyncio.sleep(.001)
                self.assertFalse(request.done())
                self.assertTrue(jobs.lock.locked())
            finally:
                release.set()
            with self.assertRaises(asyncio.CancelledError):
                await request
            self.assertFalse(jobs.lock.locked())
            self.assertEqual(camera_calls, [])
            self.assertTrue(all(j.task.done() for j in jobs.jobs.values()))
            await jobs.close()

    async def test_generation_cancel_keeps_request_open_until_the_running_call_finishes(self):
        entered, release = threading.Event(), threading.Event()
        class SlowSegments(FakeSegments):
            def predict(self, rgb):
                entered.set()
                release.wait(5)
                return super().predict(rgb)
        jobs = AnalysisJobs(FakeGeometry(), SlowSegments(), asyncio.Lock())
        with patch('server.analysis_jobs.fit_camera_auto', geometry_result):
            request = asyncio.create_task(jobs.analyze(np.zeros((32, 32, 3), np.uint8), 'p', 'c', 1))
            try:
                for _ in range(1000):
                    if entered.is_set(): break
                    await asyncio.sleep(.001)
                self.assertTrue(entered.is_set())
                jobs.cancel_generation('c', 1)
                self.assertFalse(request.done())
                self.assertTrue(jobs.lock.locked())
            finally:
                release.set()
            with self.assertRaises(HTTPException) as failure:
                await request
            self.assertEqual(failure.exception.status_code, 410)
            self.assertFalse(jobs.lock.locked())
            await jobs.close()
