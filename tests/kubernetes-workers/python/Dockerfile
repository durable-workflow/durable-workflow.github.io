FROM python:3.12-slim-bookworm
WORKDIR /app
ARG SDK_VERSION
RUN python -m pip install --no-cache-dir --only-binary=:all: --report=/app/install-report.json durable-workflow==${SDK_VERSION}
COPY worker.py verify.py .
ENTRYPOINT ["python", "/app/worker.py"]
