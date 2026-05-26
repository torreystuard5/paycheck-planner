FROM python:3.11-slim

WORKDIR /app

# Tesseract for receipt/paystub OCR (pytesseract)
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Install R2-compatible boto3 first (Cloudflare R2 rejects 1.36.x PutObject signatures)
RUN pip install --no-cache-dir "boto3==1.35.99" "botocore==1.35.99" \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x start.sh migrate.sh

CMD ["bash", "start.sh"]
