FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080

CMD ["bash", "-lc", "\
  if [ -f /secrets/config.json ]; then \
    export MONGO_URL=\"$(python -c \"import json;print(json.load(open('/secrets/config.json'))['MONGO_URL'])\")\"; \
    export DB_NAME=\"$(python -c \"import json;print(json.load(open('/secrets/config.json'))['DB_NAME'])\")\"; \
  fi; \
  uvicorn ${APP_MODULE:-server:app} --host 0.0.0.0 --port ${PORT} \
"]
