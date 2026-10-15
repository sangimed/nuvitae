FROM python:3.12.12-slim-bookworm@sha256:593bd06efe90efa80dc4eee3948be7c0fde4134606dd40d8dd8dbcade98e669c

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --require-hashes -r /tmp/requirements.txt

COPY check-repository-links.py /usr/local/bin/check-repository-links.py

USER 10001:10001
WORKDIR /workspace
ENTRYPOINT ["mkdocs"]
CMD ["build", "--strict", "--site-dir", "/tmp/site"]
