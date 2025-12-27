# Match this tag to your npm package version, e.g. @cloudflare/sandbox@0.4.0 => :0.4.0
FROM docker.io/cloudflare/sandbox:0.4.0

# Install uv for fast Python package management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Install dependencies using uv (system-wide)
# Added pytest, nbconvert (for notebook execution), and specified dependencies
RUN uv pip install --system --no-cache \
    pytest \
    nbconvert \
    ipykernel \
    pyarrow==17.0.0 \
    httpx==0.27.2 \
    pandas==2.2.3 \
    pydantic==2.9.2

WORKDIR /workspace
COPY ./scripts /workspace/scripts
COPY ./notebooks /workspace/notebooks

COPY ./run_tests.py /workspace/run_tests.py
COPY ./tests /workspace/tests

# Pre-compile python bytecode for faster startup
RUN python -m compileall /workspace

ENV PYTHONPATH=/workspace

# Default CMD in the base image already starts the SDK control plane.
# If you override CMD, your script MUST end with:
#   exec bun /container-server/dist/index.js