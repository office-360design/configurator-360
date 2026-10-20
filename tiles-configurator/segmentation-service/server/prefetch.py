"""Download and validate the configured camera and segmentation checkpoints."""
from .model import CameraModel
from .segmentation import SurfaceSegmentationModel

if __name__ == '__main__':
    camera = CameraModel()
    camera._load()
    print('MoGe-2 loaded:', camera.model_id)
    print('MoGe weights SHA-256:', camera._weights_sha256)

    segmentation = SurfaceSegmentationModel()
    segmentation._load()
    print('EoMT loaded:', segmentation.model_id, segmentation.model_revision)
