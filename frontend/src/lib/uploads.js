import {
  uploadDocumentFile,
  uploadBusinessDocumentFile,
} from '../services/api';

export const UPLOAD_MAX_BYTES = 15 * 1024 * 1024; // 15 MB

export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
];

function normalizeContentType(file) {
  const t = (file.type || '').trim().toLowerCase();
  if (!t || t === 'image/heif') {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.pdf')) return 'application/pdf';
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.webp')) return 'image/webp';
    if (name.endsWith('.heic') || name.endsWith('.heif')) return 'image/heic';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
    return 'application/octet-stream';
  }
  return t;
}

function messageForUploadError(err) {
  const status = err?.response?.status;
  const detail = err?.response?.data?.detail;

  if (status === 503) {
    return 'Uploads are temporarily unavailable. Please try again later.';
  }
  if (status === 403) {
    return 'This feature requires Home Pro (receipt OCR or Tax Prep).';
  }
  if (status === 400) {
    if (typeof detail === 'string' && detail.toLowerCase().includes('large')) {
      return 'File is too large. Use a file under 15 MB.';
    }
    return typeof detail === 'string' ? detail : 'Invalid file or document type.';
  }
  if (status === 502) {
    return 'Storage upload failed on the server. Please try again.';
  }
  if (status) {
    return `Upload failed (HTTP ${status}). If this persists, contact support.`;
  }
  return 'Upload failed. If this persists, contact support.';
}

/**
 * Full upload: multipart POST to API (server writes to R2 and runs OCR).
 * @param {'personal'|'business'} scope
 * @param {(phase: string) => void} [onPhase]
 */
export async function uploadDocument({
  file,
  documentType,
  scope = 'personal',
  onPhase,
}) {
  const isBusiness = scope === 'business';
  const uploadFn = isBusiness ? uploadBusinessDocumentFile : uploadDocumentFile;

  if (file.size > UPLOAD_MAX_BYTES) {
    const wrapped = new Error('File is too large. Use a file under 15 MB.');
    wrapped.phase = 'validate';
    throw wrapped;
  }

  const contentType = normalizeContentType(file);
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    const wrapped = new Error('File type not supported. Use JPEG, PNG, WebP, HEIC, or PDF.');
    wrapped.phase = 'validate';
    throw wrapped;
  }

  try {
    onPhase?.('uploading');
    onPhase?.('finalizing');
    const { data } = await uploadFn(file, documentType);
    return data;
  } catch (err) {
    const wrapped = new Error(messageForUploadError(err));
    wrapped.phase = err.response ? 'api_upload' : 'network';
    wrapped.status = err.response?.status;
    console.error('Document upload error:', err);
    throw wrapped;
  }
}
