#!/bin/sh
set -e

echo '[start.sh] Starting Ollama server...'
ollama serve &

echo '[start.sh] Waiting for Ollama to be ready...'
i=1
while [ $i -le 30 ]; do
  if curl -s http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
    echo '[start.sh] Ollama is ready!'
    break
  fi
  echo "[start.sh] Attempt $i/30 - waiting 2s..."
  sleep 2
  i=$((i + 1))
done

echo '[start.sh] Starting Discord bot...'
exec node /app/index.js