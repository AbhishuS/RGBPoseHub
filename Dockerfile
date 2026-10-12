FROM python:3.10-slim

WORKDIR /app

# Install system dependencies for OpenCV and HEIF
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY backend/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code, models, and sample demo images
COPY backend /app/backend
COPY models /app/models
COPY uploads/samples /app/uploads/samples

WORKDIR /app/backend

ENV FLASK_ENV=production
ENV PORT=7860
ENV PYTHONUNBUFFERED=1
ENV MALLOC_ARENA_MAX=2
ENV OMP_NUM_THREADS=2
ENV MKL_NUM_THREADS=2

EXPOSE 7860

CMD ["gunicorn", "--bind", "0.0.0.0:7860", "--workers", "1", "--threads", "4", "--max-requests", "100", "--max-requests-jitter", "10", "--timeout", "120", "app:create_app()"]
