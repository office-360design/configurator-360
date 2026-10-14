"""Deployment checks use synthetic predictors; they never load model weights."""
import os
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from .deployment import configured_job_options, configured_hosts, legacy_api_enabled, LIMITS
from .app import create_app
from .test_camera import FakeModel
from .test_jobs import FakeSegments

class DeploymentTests(unittest.TestCase):
    def test_defaults_are_bounded(self):
        self.assertEqual(configured_job_options({}), {'max_pending':4,'max_results':8,'ttl_s':900,'max_clients':128})
    def test_every_invalid_limit_fails_startup(self):
        for name, (_, default, low, high) in LIMITS.items():
            for value in ['', '-1', 'abc', '1.5', str(low-1), str(high+1)]:
                with self.subTest(name=name,value=value):
                    with self.assertRaises(ValueError): configured_job_options({name:value})
    def test_explicit_limits(self):
        self.assertEqual(configured_job_options({'PAVING_MAX_PENDING':'2','PAVING_MAX_RESULTS':'3','PAVING_RESULT_TTL_SECONDS':'60','PAVING_MAX_CLIENTS':'10'}),
                         {'max_pending':2,'max_results':3,'ttl_s':60,'max_clients':10})
    def test_hosts_and_ipv6(self):
        self.assertEqual(configured_hosts('localhost,127.0.0.1,[::1],example.com'),{'localhost','127.0.0.1','::1','example.com'})
    def test_invalid_hosts(self):
        for value in ['*','https://example.com','example.com:8000','user@example.com','localhost/','',',localhost']:
            with self.subTest(value=value):
                with self.assertRaises(ValueError): configured_hosts(value)
    def test_optional_legacy_switch(self):
        self.assertTrue(legacy_api_enabled('1'));self.assertFalse(legacy_api_enabled('0'))
        with self.assertRaises(ValueError):legacy_api_enabled('false')
    def test_host_guard_rejects_foreign_host(self):
        with patch.dict(os.environ,{'PAVING_ALLOWED_HOSTS':'localhost,127.0.0.1'}):
            with TestClient(create_app(FakeModel(),FakeSegments()),base_url='http://localhost') as c:
                self.assertEqual(c.get('/api/paving/health').status_code,200)
                self.assertEqual(c.get('/api/paving/health',headers={'Host':'untrusted.example'}).status_code,400)
                self.assertEqual(c.get('/api/paving/health',headers={'Origin':'https://untrusted.example'}).status_code,403)
    def test_legacy_routes_disabled_without_affecting_job_health(self):
        with patch.dict(os.environ,{'PAVING_ENABLE_LEGACY_API':'0','PAVING_RESULT_TTL_SECONDS':'60'}):
            with TestClient(create_app(FakeModel(),FakeSegments())) as c:
                for route in ['/api/camera','/api/segment']:
                    self.assertEqual(c.post(route).status_code,404)
                r=c.get('/api/paving/health');self.assertEqual(r.status_code,200)
                self.assertEqual(r.json()['limits']['result_ttl_s'],60)
                self.assertFalse(r.json()['deployment']['legacy_api'])
                self.assertFalse(r.json()['deployment']['durable_photo_storage'])
                self.assertEqual(r.json()['deployment']['workers'],1)
                self.assertEqual(r.headers['cache-control'],'no-store')
    def test_no_source_or_photo_file_routes(self):
        with TestClient(create_app(FakeModel(),FakeSegments())) as c:
            for route in ['/server/app.py','/.env','/photos','/uploads','/requirements.txt','/docs','/openapi.json']:
                self.assertEqual(c.get(route).status_code,404)
    def test_compose_loopback_and_cache_only(self):
        root=Path(__file__).resolve().parents[1]
        compose=(root/'compose.yaml').read_text();docker=(root/'Dockerfile').read_text()
        self.assertIn('127.0.0.1:',compose);self.assertIn('read_only: true',compose)
        self.assertIn('no-new-privileges:true',compose);self.assertNotIn('privileged: true',compose)
        self.assertIn('USER paving',docker);self.assertNotIn('COPY . ',docker)
        self.assertIn('model-cache:/home/paving/.cache/huggingface',compose)
        proxy=(root/'deploy/nginx-server.conf.example').read_text()
        self.assertIn('proxy_pass http://127.0.0.1:8000;',proxy)
        self.assertIn('proxy_cache off;',proxy);self.assertIn('client_max_body_size 13m;',proxy)
