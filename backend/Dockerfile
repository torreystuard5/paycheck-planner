FROM python:3.11-slim

# boto3 1.36+ default checksums are incompatible with Cloudflare R2 PutObject
ENV AWS_REQUEST_CHECKSUM_CALCULATION=when_required
ENV AWS_RESPONSE_CHECKSUM_VALIDATION=when_required

WORKDIR /app

# Tesseract for receipt/paystub OCR (pytesseract)
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x start.sh migrate.sh

CMD ["bash", "start.sh"]
