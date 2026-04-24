import { requestUploadPresign, finalizeUpload, deleteDocument } from '../services/api';

export const UPLOAD_MAX_BYTES = 15 * 1024 * 1024; // 15 MB

export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
];

/**
 * Upload a file directly to R2 using the presigned URL.
 * Returns a promise that resolves on 2xx, rejects otherwise.
 */
export async function uploadFileToR2(file, presignedResponse) {
  const { upload_url, required_headers } = presignedResponse;

  const res = await fetch(upload_url, {
    method: 'PUT',
    headers: required_headers || {},
    body: file,
  });

  if (!res.ok) {
    const err = new Error(`R2 upload failed: ${res.status} ${res.statusText}`);
    err.status = res.status;
    err.phase = 'r2_upload';
    throw err;
  }

  return res;
}

/**
 * Full upload orchestration: presign -> PUT to R2 -> finalize.
 * Errors are categorized by phase: 'presign', 'r2_upload', 'finalize'.
 */
export async function uploadDocument({ file, documentType, budgetId, onProgress }) {
  // 1. Presign
  let presignData;
  try {
    const params = {
      filename: file.name,
      content_type: file.type || 'application/octet-stream',
      file_size: file.size,
      document_type: documentType,
    };
    const { data } = await requestUploadPresign(params);
    presignData = data;
  } catch (err) {
    const wrapped = new Error(
      err.response?.status === 503
        ? 'Uploads are temporarily unavailable. Please try again later.'
        : 'Failed to prepare upload. Please try again.'
    );
    wrapped.phase = 'presign';
    wrapped.status = err.response?.status;
    throw wrapped;
  }

  // 2. Upload to R2
  try {
    await uploadFileToR2(file, presignData);
  } catch (err) {
    // Best-effort cleanup of orphaned pending row
    if (presignData?.document_id) {
      try { await deleteDocument(presignData.document_id); } catch { /* ignore */ }
    }
    const wrapped = new Error('Upload failed. If this persists, contact support.');
    wrapped.phase = 'r2_upload';
    console.error('R2 upload error:', err);
    throw wrapped;
  }

  // 3. Finalize
  try {
    const { data } = await finalizeUpload({
      document_id: presignData.document_id,
      file_size: file.size,
    });
    return data;
  } catch (err) {
    // Best-effort cleanup of orphaned pending row
    if (presignData?.document_id) {
      try { await deleteDocument(presignData.document_id); } catch { /* ignore */ }
    }
    const wrapped = new Error('Upload completed but confirmation failed. Please try again.');
    wrapped.phase = 'finalize';
    throw wrapped;
  }
}
