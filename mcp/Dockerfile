# Family Dashboard MCP server, packaged with mcpo (the MCP→OpenAPI proxy that
# Open WebUI talks to). The container exposes an OpenAPI HTTP endpoint on $PORT;
# mcpo launches the Node MCP server over stdio behind it.
FROM node:20-slim

# mcpo is a Python tool — install it into an isolated venv.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir mcpo
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Install Node deps first for layer caching.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV PORT=8000
EXPOSE 8000

# Shell form so $PORT / $MCPO_API_KEY expand. mcpo serves OpenAPI; everything
# after `--` is the MCP server command it proxies over stdio.
CMD mcpo --host 0.0.0.0 --port "$PORT" ${MCPO_API_KEY:+--api-key "$MCPO_API_KEY"} -- node src/index.js
