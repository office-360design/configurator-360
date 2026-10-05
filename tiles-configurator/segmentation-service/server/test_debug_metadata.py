"""Diagnostic metadata regressions; no model weights or inference required."""
import unittest
from types import SimpleNamespace
import numpy as np
from .analysis_jobs import segment_payload


class DebugMetadataTests(unittest.TestCase):
    def prediction(self, metadata):
        return SimpleNamespace(labels=np.full((32, 32), 10, dtype=np.uint8),
                               uncertain=np.zeros((32, 32), dtype=np.uint8), uncertain_pct=0.0,
                               model=metadata, timing_s={'eomt': 0.1})

    def test_actual_uncertainty_definition_is_propagated_without_relabeling(self):
        p = self.prediction({'uncertainty_definition': 'eomt_panoptic_segment_score_below_threshold_or_void'})
        payload, hint = segment_payload(p, 'debug-test', 32, 32)
        self.assertEqual(payload['uncertainty']['meaning'], p.model['uncertainty_definition'])
        self.assertTrue(hint.all())
        self.assertTrue((p.labels == 10).all())
        self.assertEqual(payload['timing_s']['eomt'], 0.1)

    def test_fallback_definition_does_not_claim_old_text_model_margin(self):
        payload, _ = segment_payload(self.prediction({}), 'debug-test', 32, 32)
        self.assertEqual(payload['uncertainty']['meaning'], 'low_panoptic_segment_score_or_void')
        self.assertNotIn('text', payload['uncertainty']['meaning'])
