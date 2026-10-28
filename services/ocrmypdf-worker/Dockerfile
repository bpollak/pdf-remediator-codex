FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# OCRmyPDF itself comes from requirements.txt; these are the external tools it runs.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ghostscript \
    qpdf \
    tesseract-ocr \
    tesseract-ocr-eng \
    pngquant \
    unpaper \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt \
    && ocrmypdf --version

COPY app /app/app

# Run without root; OCR jobs only need the system temp directory.
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin ocr
USER 10001

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
