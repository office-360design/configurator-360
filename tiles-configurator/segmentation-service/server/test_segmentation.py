"""Segmentation contract tests that do not download EoMT or MoGe weights."""
from __future__ import annotations

import io
import unittest
from types import SimpleNamespace

import numpy as np
from PIL import Image
from fastapi.testclient import TestClient

from .app import create_app
from .segmentation import (
    CATEGORY_SPECS,
    LABEL_BUILDING,
    LABEL_DIRT,
    LABEL_GRASS,
    LABEL_OBSTACLE,
    LABEL_PAVEMENT,
    LABEL_SKY,
    LABEL_UNKNOWN,
    LABEL_VEGETATION,
    SegmentationPrediction,
    SurfaceSegmentationModel,
    _build_class_lookup,
    _fill_panoptic_void,
    _map_model_ids,
    _panoptic_to_model_ids,
    _semantic_ids_from_outputs,
    encode_binary_rle,
    encode_uint8_rle,
)
from .test_camera import FakeModel


def png(array):
    buffer = io.BytesIO()
    Image.fromarray(array).save(buffer, format='PNG')
    return buffer.getvalue()


def decode_uint8(payload, size):
    out = np.empty(size, np.uint8); pos = 0
    for value, count in zip(payload['values'], payload['counts']):
        out[pos:pos + count] = value; pos += count
    assert pos == size
    return out


def decode_binary(counts, size):
    out = np.zeros(size, np.uint8); pos = 0; value = 0
    for count in counts:
        if value:
            out[pos:pos + count] = 1
        pos += count; value = 1 - value
    assert pos == size
    return out


COCO_FIXTURE = {
    0: 'person',
    2: 'car',
    58: 'potted plant',
    90: 'gravel',
    91: 'house',
    100: 'road',
    101: 'roof',
    109: 'wall-brick',
    116: 'tree-merged',
    117: 'fence-merged',
    119: 'sky-other-merged',
    122: 'floor-other-merged',
    123: 'pavement-merged',
    125: 'grass-merged',
    126: 'dirt-merged',
    129: 'building-other-merged',
}


class SemanticMappingTests(unittest.TestCase):
    def test_coco_scene_classes_map_to_application_contract(self):
        lookup, mapped = _build_class_lookup(COCO_FIXTURE)
        self.assertEqual(lookup[125], LABEL_GRASS)
        self.assertEqual(lookup[123], LABEL_PAVEMENT)
        self.assertEqual(lookup[122], LABEL_PAVEMENT)
        self.assertEqual(lookup[100], LABEL_PAVEMENT)
        self.assertEqual(lookup[126], LABEL_DIRT)
        self.assertEqual(lookup[90], LABEL_DIRT)
        self.assertEqual(lookup[91], LABEL_BUILDING)
        self.assertEqual(lookup[117], LABEL_BUILDING)
        self.assertEqual(lookup[116], LABEL_VEGETATION)
        self.assertEqual(lookup[119], LABEL_SKY)
        self.assertEqual(lookup[0], LABEL_OBSTACLE)
        self.assertEqual(lookup[2], LABEL_OBSTACLE)
        self.assertIn(125, mapped['grass'])
        self.assertIn(0, mapped['obstacle'])

    def test_panoptic_segment_ids_become_class_ids_and_scores(self):
        seg = np.array([[0, 0, 1], [0, 2, 2]], np.int32)
        info = [
            {'id': 0, 'label_id': 119, 'score': .95},
            {'id': 1, 'label_id': 91, 'score': .81},
            {'id': 2, 'label_id': 123, 'score': .72},
        ]
        raw, scores = _panoptic_to_model_ids(seg, info, seg.shape)
        np.testing.assert_array_equal(raw, np.array([[119, 119, 91], [119, 123, 123]], np.int32))
        self.assertAlmostEqual(float(scores[0, 0]), .95, places=5)
        self.assertAlmostEqual(float(scores[0, 2]), .81, places=5)
        self.assertAlmostEqual(float(scores[1, 1]), .72, places=5)

    def test_semantic_decoder_handles_no_patch_offsets(self):
        import torch
        import torch.nn.functional as F

        class FakeProcessor:
            size = {'shortest_edge': 4, 'longest_edge': 4}

            @staticmethod
            def unpad_image(logits, target_sizes, size):
                return [F.interpolate(logits[0:1], size=target_sizes[0], mode='bilinear', align_corners=False)[0]]

        # Two queries, three real classes + null. Query 0 strongly votes class 1
        # on the left; query 1 strongly votes class 2 on the right.
        masks = torch.tensor([[[[5., 5.], [-5., -5.]], [[-5., -5.], [5., 5.]]]])
        classes = torch.tensor([[[0., 6., 0., -5.], [0., 0., 6., -5.]]])
        outputs = SimpleNamespace(
            masks_queries_logits=masks,
            class_queries_logits=classes,
            patch_offsets=None,
        )
        decoded = _semantic_ids_from_outputs(FakeProcessor(), outputs, (4, 4))
        self.assertEqual(decoded.shape, (4, 4))
        self.assertEqual(int(decoded[0, 0]), 1)
        self.assertEqual(int(decoded[-1, -1]), 2)

    def test_semantic_fallback_fills_only_panoptic_void(self):
        panoptic = np.array([[123, -1], [91, -1]], np.int32)
        semantic = np.array([[126, 122], [125, 125]], np.int32)
        filled, count = _fill_panoptic_void(panoptic, semantic)
        np.testing.assert_array_equal(filled, np.array([[123, 122], [91, 125]], np.int32))
        self.assertEqual(count, 2)

    def test_invalid_model_ids_remain_unknown(self):
        lookup, _ = _build_class_lookup(COCO_FIXTURE)
        raw = np.array([[125, 123, 999], [-1, 119, 91]], np.int32)
        labels = _map_model_ids(raw, lookup)
        self.assertEqual(labels[0, 0], LABEL_GRASS)
        self.assertEqual(labels[0, 1], LABEL_PAVEMENT)
        self.assertEqual(labels[0, 2], LABEL_UNKNOWN)
        self.assertEqual(labels[1, 0], LABEL_UNKNOWN)
        self.assertEqual(labels[1, 1], LABEL_SKY)
        self.assertEqual(labels[1, 2], LABEL_BUILDING)

    def test_predict_maps_panoptic_semantics_and_ground_hint(self):
        model = SurfaceSegmentationModel()
        lookup, mapped = _build_class_lookup(COCO_FIXTURE)
        model._loaded = True
        model.device = SimpleNamespace(type='cpu')
        model._lookup = lookup
        model._mapped_model_ids = mapped
        model._model = SimpleNamespace(config=SimpleNamespace(id2label=COCO_FIXTURE))
        model._load = lambda: None
        raw = np.array([
            [119, 119, 91, 91],
            [116, 125, 123, 126],
            [0, 125, 100, 90],
        ], np.int32)
        scores = np.ones(raw.shape, np.float32) * .9
        scores[2, 0] = .5
        info = [{'id': 0, 'label_id': 119, 'score': .9}]
        model._run_panoptic = lambda rgb: (raw, scores, info, .25, .02, (640, 640), 0)
        result = model.predict(np.zeros((3, 4, 3), np.uint8))
        self.assertEqual(result.model['pipeline'], 'eomt_coco_panoptic_supervised')
        self.assertEqual(result.labels[0, 0], LABEL_SKY)
        self.assertEqual(result.labels[0, 2], LABEL_BUILDING)
        self.assertEqual(result.labels[1, 0], LABEL_VEGETATION)
        self.assertEqual(result.labels[1, 1], LABEL_GRASS)
        self.assertEqual(result.labels[1, 2], LABEL_PAVEMENT)
        self.assertEqual(result.labels[1, 3], LABEL_DIRT)
        self.assertEqual(result.labels[2, 0], LABEL_OBSTACLE)
        self.assertEqual(int(result.ground_hint.sum()), 6)
        self.assertEqual(int(result.uncertain.sum()), 1)
        self.assertIn('eomt', result.timing_s)
        self.assertEqual(result.model['semantic_status'], 'ok')

    def test_rle_roundtrip(self):
        labels = np.array([[0, 0, 10, 10], [4, 4, 4, 0]], np.uint8)
        encoded = encode_uint8_rle(labels)
        np.testing.assert_array_equal(decode_uint8(encoded, labels.size).reshape(labels.shape), labels)
        mask = labels == 4
        np.testing.assert_array_equal(decode_binary(encode_binary_rle(mask), mask.size).reshape(mask.shape), mask)


class FakeSegmenter:
    _loaded = True

    def predict(self, rgb):
        h, w = rgb.shape[:2]
        labels = np.zeros((h, w), np.uint8); labels[h // 2:] = LABEL_GRASS; labels[h // 2:, w // 2:] = LABEL_PAVEMENT
        uncertain = np.zeros((h, w), np.uint8); uncertain[h // 2, w // 2] = 1
        ground_hint = np.zeros((h, w), np.uint8); ground_hint[h // 3:] = 1
        return SegmentationPrediction(
            labels, uncertain, 100 / labels.size,
            {'pipeline': 'synthetic-eomt-test', 'canonical_labels': {name: label for name, label, _ in CATEGORY_SPECS},
             'semantic_pixel_counts': {'grass': int((labels == LABEL_GRASS).sum()), 'pavement': int((labels == LABEL_PAVEMENT).sum())}},
            {'eomt': .01, 'postprocess': .001, 'total': .011}, ground_hint,
        )


class APITests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(create_app(FakeModel(), FakeSegmenter()))
        self.rgb = png(np.zeros((80, 100, 3), np.uint8))

    def tearDown(self):
        self.client.close()

    def test_segment_contract(self):
        r = self.client.post('/api/segment', data={'image_id': 'test-image'}, files={'image': ('image.png', self.rgb, 'image/png')})
        self.assertEqual(r.status_code, 200, r.text); d = r.json()
        self.assertEqual(d['image'], {'width': 100, 'height': 80})
        labels = decode_uint8(d['labels'], 8000).reshape(80, 100)
        self.assertEqual(labels[60, 10], LABEL_GRASS); self.assertEqual(labels[60, 70], LABEL_PAVEMENT)
        unc = decode_binary(d['uncertainty']['counts'], 8000).reshape(80, 100)
        self.assertEqual(int(unc.sum()), 1)
        self.assertEqual(d['model']['pipeline'], 'synthetic-eomt-test')
        hint = decode_binary(d['ground_hint']['counts'], 8000).reshape(80, 100)
        self.assertGreater(int(hint.sum()), int((labels == LABEL_GRASS).sum()))

    def test_bad_id_and_cross_origin(self):
        files = {'image': ('image.png', self.rgb, 'image/png')}
        self.assertEqual(self.client.post('/api/segment', data={'image_id': 'bad id'}, files=files).status_code, 422)
        self.assertEqual(self.client.post('/api/segment', data={'image_id': 'ok'}, files=files, headers={'origin': 'https://bad.invalid'}).status_code, 403)

    def test_health_lists_both_models(self):
        d = self.client.get('/api/health').json()
        self.assertEqual(d['service'], 'paving-analysis'); self.assertTrue(d['models_loaded']['segmentation'])


if __name__ == '__main__':
    unittest.main()
