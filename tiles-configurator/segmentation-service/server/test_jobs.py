"""Step-3 job API tests: synthetic predictors only, no ML weights/downloads."""
import asyncio
import io
import threading
import time
import unittest
from unittest.mock import patch

import numpy as np
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image

from .app import create_app, configured_origins
from .analysis_jobs import AnalysisJobs
from .model import ModelUnavailable, Prediction
from .segmentation import SegmentationModelUnavailable, SegmentationPrediction
from .test_camera import FakeModel


class FakeSegments:
    def predict(self, rgb):
        height, width = rgb.shape[:2]
        labels = np.zeros((height, width), np.uint8)
        labels[height//2:, :] = 10
        labels[height*2//3:height*3//4, width//3:width//2] = 5  # Protected flower bed.
        return SegmentationPrediction(labels, np.zeros_like(labels, bool), 0.,
                                      {'id': 'synthetic-test-only'}, {'model': .001})


def image_bytes(width=200, height=160):
    buf = io.BytesIO()
    Image.fromarray(np.full((height, width, 3), 127, np.uint8)).save(buf, format='PNG')
    return buf.getvalue()


def wait_for_result(c, submitted, client='test-client'):
    for _ in range(1000):
        r = c.get(f"/api/paving/jobs/{submitted['job_id']}", headers={'X-Paving-Client': client})
        if r.status_code != 200:
            raise AssertionError(r.text)
        if r.json()['state'] in ('completed', 'failed', 'cancelled'):
            return r.json()
        time.sleep(.005)
    raise AssertionError('Synthetic job did not complete')


class JobAPITests(unittest.TestCase):
    def setUp(self):
        self.ctx = TestClient(create_app(FakeModel(), FakeSegments(), background_jobs=True))
        self.c = self.ctx.__enter__()
    def tearDown(self):
        self.ctx.__exit__(None, None, None)
    def submit(self, **overrides):
        data = {'image_id': 'photo-1', 'client_id': 'test-client', 'generation': '1', **overrides}
        return self.c.post('/api/paving/jobs', data=data,
                           files={'image': ('photo.png', image_bytes(), 'image/png')})
    def test_real_job_camera_and_semantic_contract(self):
        r = self.submit(); self.assertEqual(r.status_code, 202, r.text)
        done = wait_for_result(self.c, r.json()); self.assertEqual(done['state'], 'completed')
        payload = self.c.get(f"/api/paving/jobs/{done['job_id']}/result", headers={'X-Paving-Client': 'test-client'}).json()
        self.assertEqual(payload['errors'], {})
        self.assertEqual(payload['segmentation']['image_id'], 'photo-1')
        self.assertEqual(payload['geometry']['image_id'], 'photo-1')
        self.assertAlmostEqual(payload['geometry']['camera']['height_m'], 2.7)
        self.assertEqual(payload['segmentation']['labels']['encoding'], 'uint8_rle_row_major')
        self.assertIn(5, payload['segmentation']['labels']['values'])
        self.assertIn('segmentation', payload['timing_s'])
        self.assertIn('camera', payload['timing_s'])
    def test_tombstone_rejects_slow_upload_after_cancel(self):
        cancel = self.c.delete('/api/paving/requests/2', headers={'X-Paving-Client': 'test-client'})
        self.assertEqual(cancel.status_code, 200)
        self.assertEqual(self.submit(generation='1').status_code, 409)
        self.assertEqual(self.submit(generation='2').status_code, 409)
        self.assertEqual(self.submit(generation='3').status_code, 202)
    def test_out_of_order_generation_is_rejected(self):
        self.assertEqual(self.submit(generation='5').status_code, 202)
        self.assertEqual(self.submit(generation='4').status_code, 409)
        self.assertEqual(self.c.delete('/api/paving/requests/4', headers={'X-Paving-Client': 'test-client'}).json()['cancelled'], False)
    def test_other_client_cannot_read_or_cancel_job(self):
        r = self.submit(); jid = r.json()['job_id']
        for suffix in ('', '/result'):
            self.assertEqual(self.c.get('/api/paving/jobs/'+jid+suffix, headers={'X-Paving-Client':'other'}).status_code, 404)
        self.assertEqual(self.c.delete('/api/paving/jobs/'+jid, headers={'X-Paving-Client':'other'}).status_code, 404)
    def test_health_does_not_load_models_or_expose_client_ids(self):
        r = self.c.get('/api/paving/health'); self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['job_api_version'], 1)
        self.assertNotIn('active', r.json())
        self.assertEqual(r.headers['cache-control'], 'no-store')
    def test_api_only_no_repository_files(self):
        for path in ('/server/model.py', '/.env', '/sample.jpg', '/index.html', '/../../.env', '/openapi.json'):
            self.assertEqual(self.c.get(path).status_code, 404)
    def test_origin_guard_and_preflight(self):
        headers={'Origin':'http://localhost:5500', 'Access-Control-Request-Method':'POST',
                 'Access-Control-Request-Headers':'x-paving-client'}
        r=self.c.options('/api/paving/jobs', headers=headers)
        self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(r.headers['access-control-allow-origin'],'http://localhost:5500')
        r=self.c.post('/api/paving/jobs',headers={'Origin':'https://evil.invalid'})
        self.assertEqual(r.status_code,403)
        self.assertNotIn('access-control-allow-origin',r.headers)
    def test_exact_configured_origin_only(self):
        with TestClient(create_app(FakeModel(), FakeSegments(),allowed_origins=['https://paving.example'])) as c:
            self.assertEqual(c.get('/api/paving/health',headers={'Origin':'https://paving.example'}).status_code,200)
            self.assertEqual(c.get('/api/paving/health',headers={'Origin':'http://localhost:5500'}).status_code,403)
    def test_invalid_configuration(self):
        for value in ('*', 'null', 'https://example.com/path', 'https://u:p@example.com', 'https://example.com/'):
            with self.subTest(value=value):
                self.assertRaises(ValueError, configured_origins, value)
    def test_bad_image_and_fields(self):
        for field in ({'image_id':'../foo'}, {'client_id':'x/y'}, {'generation':'0'}):
            self.assertEqual(self.submit(**field).status_code,422)
        r=self.c.post('/api/paving/jobs',data={'image_id':'p','client_id':'c','generation':'1'},files={'image':('bad.png',b'bad')})
        self.assertEqual(r.status_code,422)


class FakeGeometry:
    def predict(self, rgb):
        h,w=rgb.shape[:2]
        return Prediction(np.zeros((h,w,3)),np.ones((h,w),bool),np.eye(3),{'id':'synthetic'},.001)


def geometry_result(*_):
    return {'camera': {'source': 'synthetic-test-only'}, 'ground_support': {'counts': [0, 1024]}}


class ManagerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.rgb=np.zeros((32,32,3),np.uint8)
        self.fit_patch=patch('server.analysis_jobs.fit_camera_auto',geometry_result);self.fit_patch.start()
        self.jobs=AnalysisJobs(FakeGeometry(),FakeSegments(),asyncio.Lock())
    async def asyncTearDown(self):
        await self.jobs.close(); self.fit_patch.stop()
    async def finish(self, job):
        await self.jobs.jobs[job['job_id']].task
        return self.jobs.jobs[job['job_id']]
    async def test_segmentation_failure_still_runs_camera(self):
        class BadSegments:
            def predict(self,_):raise SegmentationModelUnavailable('test')
        self.jobs.segmenter=BadSegments()
        j=await self.finish(self.jobs.submit(self.rgb,'p','c',1))
        self.assertIsNone(j.result['segmentation']);self.assertIsNotNone(j.result['geometry'])
        self.assertIn('segmentation',j.errors)
    async def test_geometry_receives_empty_hint_when_semantics_fail(self):
        class BadSegments:
            def predict(self,_):raise RuntimeError('test')
        self.jobs.segmenter=BadSegments()
        def check(p,v,k,hint):
            self.assertFalse(hint.any());return geometry_result()
        with patch('server.analysis_jobs.fit_camera_auto',check):
            await self.finish(self.jobs.submit(self.rgb,'p','c',1))
    async def test_camera_failure_preserves_semantics_but_invents_no_camera(self):
        class BadCamera:
            def predict(self,_):raise ModelUnavailable('test')
        self.jobs.camera=BadCamera()
        j=await self.finish(self.jobs.submit(self.rgb,'p','c',1))
        self.assertIsNotNone(j.result['segmentation']);self.assertIsNone(j.result['geometry'])
        self.assertEqual(j.errors['camera']['code'],'model_unavailable')
    async def test_both_models_can_fail_without_a_fake_success(self):
        class Bad:
            def predict(self,_):raise RuntimeError('test')
        self.jobs.camera=self.jobs.segmenter=Bad()
        j=await self.finish(self.jobs.submit(self.rgb,'p','c',1))
        self.assertIsNone(j.result['segmentation']);self.assertIsNone(j.result['geometry'])
        self.assertEqual(set(j.errors),{'segmentation','camera'})
    async def test_cancel_during_segmentation_skips_camera_and_keeps_lock(self):
        entered=threading.Event();release=threading.Event();camera_calls=[]
        class Slow:
            def predict(inner,rgb):
                entered.set();release.wait(3);return FakeSegments().predict(rgb)
        class Camera(FakeGeometry):
            def predict(inner,rgb):camera_calls.append(1);return super().predict(rgb)
        self.jobs.segmenter=Slow();self.jobs.camera=Camera()
        first=self.jobs.submit(self.rgb,'p1','c',1)
        for _ in range(500):
            if entered.is_set():break
            await asyncio.sleep(.001)
        self.assertTrue(entered.is_set());self.assertTrue(self.jobs.lock.locked())
        self.jobs.cancel(first['job_id'],'c')
        self.assertTrue(self.jobs.lock.locked())
        release.set();j=await self.finish(first)
        self.assertEqual(j.state,'cancelled');self.assertIsNone(j.result);self.assertEqual(camera_calls,[])
    async def test_superseded_queued_job_never_runs(self):
        await self.jobs.lock.acquire()
        a=self.jobs.submit(self.rgb,'a','c',1);b=self.jobs.submit(self.rgb,'b','c',2)
        self.jobs.lock.release()
        aj=await self.finish(a);bj=await self.finish(b)
        self.assertEqual(aj.state,'cancelled');self.assertEqual(bj.state,'completed')
    async def test_queue_is_bounded(self):
        self.jobs.max_pending=1
        await self.jobs.lock.acquire()
        a=self.jobs.submit(self.rgb,'a','c',1)
        with self.assertRaises(HTTPException) as cm:self.jobs.submit(self.rgb,'b','d',1)
        self.assertEqual(cm.exception.status_code,429)
        self.jobs.lock.release();await self.finish(a)
    async def test_serialization_including_different_clients(self):
        active=0;max_active=0;events=[]
        class Observed:
            def __init__(inner,model,name):inner.model=model;inner.name=name
            def predict(inner,rgb):
                nonlocal active,max_active
                active+=1;max_active=max(max_active,active);events.append(inner.name)
                time.sleep(.01);out=inner.model.predict(rgb);active-=1;return out
        self.jobs.segmenter=Observed(FakeSegments(),'segment');self.jobs.camera=Observed(FakeGeometry(),'camera')
        a=self.jobs.submit(self.rgb,'a','c',1);b=self.jobs.submit(self.rgb,'b','d',1)
        await self.finish(a);await self.finish(b)
        self.assertEqual(max_active,1);self.assertEqual(events,['segment','camera','segment','camera'])
    async def test_results_and_client_tombstones_expire(self):
        clock=[10.];self.jobs.clock=lambda:clock[0];self.jobs.ttl_s=5
        a=self.jobs.submit(self.rgb,'a','c',1);await self.finish(a)
        clock[0]=20.;self.jobs.prune()
        self.assertEqual(self.jobs.jobs,{});self.assertEqual(self.jobs.latest,{})
    async def test_max_retained_results(self):
        self.jobs.max_results=1
        for i in range(3):await self.finish(self.jobs.submit(self.rgb,str(i),'c',i+1))
        self.jobs.prune();self.assertEqual(len(self.jobs.jobs),1)


if __name__=='__main__':unittest.main()
