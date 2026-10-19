# Build from tiles-configurator/segmentation-service only (not the repository root).
FROM python:3.11-slim-bookworm
ARG TORCH_INDEX=https://download.pytorch.org/whl/cpu
ARG TORCH_VERSION=2.10.0
ARG TORCHVISION_VERSION=0.25.0
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    HF_HOME=/home/paving/.cache/huggingface TORCH_HOME=/home/paving/.cache/huggingface/torch \
    XDG_CACHE_HOME=/home/paving/.cache/huggingface/runtime PAVING_HOST=0.0.0.0 PAVING_PORT=8000 \
    PAVING_ENABLE_LEGACY_API=0
RUN apt-get update && apt-get install -y --no-install-recommends git libglib2.0-0 libgl1 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 paving \
    && mkdir -p /home/paving/.cache/huggingface && chown -R paving:paving /home/paving
WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN python -m pip install --index-url "$TORCH_INDEX" "torch==$TORCH_VERSION" "torchvision==$TORCHVISION_VERSION" \
    && printf 'torch==%s\ntorchvision==%s\n' "$TORCH_VERSION" "$TORCHVISION_VERSION" > /tmp/torch-constraints.txt \
    && python -m pip install -c /tmp/torch-constraints.txt -r requirements.txt
COPY --chown=paving:paving server ./server
USER paving
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/paving/health', timeout=3).read()"
# One process owns the model lock, generation tokens, jobs and result cache.
CMD ["python", "-m", "server"]
