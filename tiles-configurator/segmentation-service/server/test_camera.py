"""Deterministic geometry and real FastAPI request tests; no model weights.

Run: python -m unittest server.test_camera -v
Learned-model accuracy is NOT tested by these synthetic plane fixtures.
"""
from __future__ import annotations
import io
import unittest
from pathlib import Path
import numpy as np
from PIL import Image
from fastapi.testclient import TestClient
from .geometry import fit_camera, fit_camera_auto, detect_ground_plane_mask, GeometryError
from .model import Prediction, ModelUnavailable
from .app import create_app, MAX_BODY_BYTES


def fixture(width=200, height=160, camera_height=2.7, pitch=27.0, roll=8.0, hfov=77.0, noise=0.0):
    p, r = np.radians([pitch, roll])
    normal = np.array([np.sin(r)*np.cos(p), np.cos(r)*np.cos(p), np.sin(p)])
    f = width / (2*np.tan(np.radians(hfov/2)))
    K = np.array([[f,0,width/2],[0,f,height/2],[0,0,1]])
    y,x = np.mgrid[:height,:width]
    rays = np.stack(((x+.5-width/2)/f, (y+.5-height/2)/f, np.ones_like(x)), axis=-1)
    denom = rays @ normal
    valid = denom > .08
    scale = camera_height / np.maximum(denom, 1e-4)
    if noise:
        scale *= 1 + np.random.default_rng(30).normal(0, noise, size=scale.shape)
    points = rays * scale[...,None]
    points[~valid] = np.inf
    Kn = np.diag([1/width,1/height,1]) @ K
    return points, valid, Kn, valid.copy()


def png(array):
    buffer = io.BytesIO(); Image.fromarray(array).save(buffer,format='PNG');return buffer.getvalue()


class GeometryTests(unittest.TestCase):
    def test_different_heights_angles_fov_aspect_ratios_without_priors(self):
        cases = [(0.65,12,-7,45,200,160),(1.9,30,0,82,200,160),
                 (4.4,57,23,103,160,200),(12,73,-20,66,240,150),
                 (2.1,-5,4,85,200,160)]
        for h,p,r,f,w,hh in cases:
            with self.subTest(h=h,pitch=p,roll=r,fov=f):
                result = fit_camera(*fixture(w,hh,h,p,r,f))
                c=result['camera']
                self.assertAlmostEqual(c['height_m'],h,places=7)
                self.assertAlmostEqual(c['pitch_deg'],p,places=7)
                self.assertAlmostEqual(c['roll_deg'],r,places=7)
                self.assertAlmostEqual(c['hfov_deg'],f,places=7)
                self.assertFalse(c['accuracy_verified'])

    def test_straight_down_is_valid_but_roll_is_undefined(self):
        result=fit_camera(*fixture(pitch=90,roll=0))
        self.assertAlmostEqual(result['camera']['height_m'],2.7,places=7)
        self.assertAlmostEqual(result['camera']['pitch_deg'],90,places=6)
        self.assertIsNone(result['camera']['roll_deg'])

    def test_no_sky_mask_is_required(self):
        result=fit_camera(*fixture(pitch=65))
        self.assertGreater(result['diagnostics']['inlier_ratio'],.99)
        self.assertNotIn('sky_visible',result['diagnostics'])

    def test_metric_scale_and_homography(self):
        p,v,K,m=fixture()
        a=fit_camera(p,v,K,m); b=fit_camera(p*2,v,K,m)
        self.assertAlmostEqual(b['camera']['height_m'],2*a['camera']['height_m'],places=6)
        H=np.array(a['homography_ground_m_to_image_px']); inv=np.array(a['homography_image_px_to_ground_m'])
        np.testing.assert_allclose(H@inv,np.eye(3),atol=1e-10)
        n=np.array(a['ground_plane']['normal_camera'])
        origin=np.array(a['ground_plane']['origin_camera_m'])
        self.assertAlmostEqual(n@origin,a['camera']['height_m'],places=9)

    def test_outliers_and_small_noise(self):
        points,valid,K,mask=fixture(noise=.002)
        rng=np.random.default_rng(123)
        outliers=(rng.random(valid.shape)<.08)&valid
        points[outliers] *= 1.25
        result=fit_camera(points,valid,K,mask)
        self.assertAlmostEqual(result['camera']['height_m'],2.7,delta=.04)
        self.assertLess(result['diagnostics']['selected_support_fraction'],1)

    def test_multiple_planes_are_rejected(self):
        points,valid,K,mask=fixture()
        points[:,100:] *= 1.5
        with self.assertRaises(GeometryError):fit_camera(points,valid,K,mask)

    def test_disconnected_incompatible_plane_is_not_silently_covered(self):
        points,valid,K,mask=fixture()
        mask[:,90:110]=False; points[:,110:] *= 2
        with self.assertRaises(GeometryError):fit_camera(points,valid,K,mask)

    def test_invalid_shapes_intrinsics_and_insufficient_mask(self):
        p,v,K,m=fixture()
        for args in [(p[:,:,:2],v,K,m),(p,v[:4],K,m),(p,v,K*float('nan'),m),
                     (p,v,K,np.zeros_like(m)),(np.full_like(p,np.inf),v,K,m)]:
            with self.subTest():
                with self.assertRaises(GeometryError):fit_camera(*args)

    def test_wrong_pixel_intrinsics_are_rejected(self):
        p,v,K,m=fixture();K[0,0]*=2
        with self.assertRaises(GeometryError):fit_camera(p,v,K,m)

    def test_thin_degenerate_mask_is_rejected(self):
        p,v,K,m=fixture();m[:]=False;m[130:132,:]=True
        with self.assertRaises(GeometryError):fit_camera(p,v,K,m)


    def test_auto_ground_does_not_require_semantic_grass(self):
        p,v,K,_=fixture()
        result=fit_camera_auto(p,v,K,np.zeros(v.shape,bool))
        self.assertAlmostEqual(result['camera']['height_m'],2.7,places=6)
        self.assertEqual(result['diagnostics']['ground_selection_source'],'moge_geometric_plane')

    def test_auto_ground_prefers_lower_ground_over_front_wall(self):
        p,v,K,_=fixture()
        H,W=v.shape
        Kpx=np.diag([W,H,1.0])@K
        y,x=np.mgrid[:H,:W]
        rays=np.stack(((x+.5-Kpx[0,2])/Kpx[0,0],(y+.5-Kpx[1,2])/Kpx[1,1],np.ones_like(x)),axis=-1)
        wall=(y<int(.55*H))&(x>int(.15*W))&(x<int(.85*W))
        p[wall]=rays[wall]*5.0;v[wall]=True
        mask,meta=detect_ground_plane_mask(p,v,K)
        self.assertLess(float((mask&wall).sum())/max(1,int(mask.sum())),.05)
        result=fit_camera_auto(p,v,K,np.zeros(v.shape,bool))
        self.assertAlmostEqual(result['camera']['height_m'],2.7,delta=.05)

    def test_support_mask_is_binary_rle_and_matches_image(self):
        p,v,K,m=fixture();result=fit_camera(p,v,K,m)
        rle=result['ground_support']['counts']
        decoded=np.concatenate([np.full(n,i%2,dtype=np.uint8) for i,n in enumerate(rle)])
        self.assertEqual(len(decoded),m.size)
        self.assertTrue((decoded.reshape(m.shape)[~v]==0).all())


class FakeModel:
    def predict(self,rgb):
        H,W=rgb.shape[:2]
        p,v,K,_=fixture(W,H)
        return Prediction(p,v,K,{'id':'synthetic-test-only','metric_scale_head':True,'fov_input':None},.001)


class APITests(unittest.TestCase):
    def setUp(self):
        self.client=TestClient(create_app(FakeModel()))
        self.rgb=png(np.zeros((160,200,3),np.uint8))
        self.mask=png(fixture()[3].astype(np.uint8)*255)
    def tearDown(self):self.client.close()
    def send(self,**kwargs):
        return self.client.post('/api/camera',data={'image_id':'test-image'},files={
            'image':('image.png',self.rgb,'image/png'),'ground_mask':('mask.png',self.mask,'image/png')},**kwargs)
    def test_real_request_schema_has_no_camera_inputs(self):
        r=self.send();self.assertEqual(r.status_code,200,r.text)
        d=r.json();self.assertEqual(d['image_id'],'test-image')
        self.assertAlmostEqual(d['camera']['height_m'],2.7,places=6)
        self.assertEqual(d['model']['id'],'synthetic-test-only')
        self.assertEqual(r.headers['cache-control'],'no-store')
    def test_bad_image(self):
        self.rgb=b'not an image';self.assertEqual(self.send().status_code,422)
    def test_different_mask_resolution(self):
        self.mask=png(np.zeros((80,100),np.uint8));self.assertEqual(self.send().status_code,422)
    def test_empty_selection_falls_back_to_moge_geometry(self):
        self.mask=png(np.zeros((160,200),np.uint8));r=self.send();self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(r.json()['diagnostics']['ground_selection_source'],'moge_geometric_plane')
    def test_body_limit(self):
        r=self.client.post('/api/camera',content=b'fake',headers={'content-length':str(MAX_BODY_BYTES+1)})
        self.assertEqual(r.status_code,413,r.text)
    def test_cross_origin_rejected(self):self.assertEqual(self.send(headers={'origin':'https://untrusted.invalid'}).status_code,403)
    def test_same_origin_accepted(self):self.assertEqual(self.send(headers={'origin':'http://testserver'}).status_code,200)
    def test_no_source_or_credentials_exposed(self):
        for url in ['/server/model.py','/.env','/AGENTS.md','/models/../server/model.py']:
            self.assertEqual(self.client.get(url).status_code,404,url)
    def test_model_failure_no_height_fallback(self):
        class FailedModel:
            def predict(self,_):raise ModelUnavailable('Model not available (test).')
        with TestClient(create_app(FailedModel())) as c:
            r=c.post('/api/camera',data={'image_id':'test'},files={'image':('i.png',self.rgb),'ground_mask':('m.png',self.mask)})
            self.assertEqual(r.status_code,503)
            self.assertNotIn('camera',r.json())
    def test_static_frontend_and_health(self):
        self.assertEqual(self.client.get('/').status_code,200)
        self.assertEqual(self.client.get('/api/health').json()['mode'],'image_only')


if __name__=='__main__':unittest.main()
