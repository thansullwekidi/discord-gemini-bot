FROM ollama/ollama:latest

# Install Node.js v20 and curl
RUN apt-get update && apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV OLLAMA_MODELS=/app/models
ENV OLLAMA_HOST=127.0.0.1:11434

# Allow full permissions for non-root HF Spaces user
RUN chmod -R 777 /app

# Pre-pull model at build time
RUN ollama serve & \
    sleep 5 && \
    ollama pull qwen2.5:3b && \
    pkill ollama || true

# Copy app files
COPY package.json ./
COPY start.sh ./
COPY index.js ./

# Install npm dependencies
RUN npm install

RUN chmod +x /app/start.sh && chmod -R 777 /app

EXPOSE 7860

ENTRYPOINT ["/app/start.sh"]
