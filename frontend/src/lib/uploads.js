import {
  requestUploadPresign,
  finalizeUpload,
  deleteDocument,
  requestBusinessUploadPresign,
  finalizeBusinessUpload,
  deleteBusinessDocument,
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

/**
 * Upload a file directly to R2 using the presigned URL.
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
 * Full upload: presign -> PUT to R2 -> finalize.
 * @param {'personal'|'business'} scope
 */
export async function uploadDocument({ file, documentType, budgetId, scope = 'personal' }) {
  const isBusiness = scope === 'business';
  const presignFn = isBusiness ? requestBusinessUploadPresign : requestUploadPresign;
  const finalizeFn = isBusiness ? finalizeBusinessUpload : finalizeUpload;
  const deleteFn = isBusiness ? deleteBusinessDocument : deleteDocument;

  let presignData;
  try {
    const params = {
      filename: file.name,
      content_type: file.type || 'application/octet-stream',
      file_size: file.size,
      document_type: documentType,
    };
    const { data } = await presignFn(params);
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

  try {
    await uploadFileToR2(file, presignData);
  } catch (err) {
    if (presignData?.document_id) {
      try {
        await deleteFn(presignData.document_id);
      } catch {
        /* ignore */
      }
    }
    const wrapped = new Error('Upload failed. If this persists, contact support.');
    wrapped.phase = 'r2_upload';
    console.error('R2 upload error:', err);
    throw wrapped;
  }

  try {
    const { data } = await finalizeFn({
      document_id: presignData.document_id,
      file_size: file.size,
    });
    return data;
  } catch (err) {
    if (presignData?.document_id) {
      try {
        await deleteFn(presignData.document_id);
      } catch {
        /* ignore */
      }
    }
    const wrapped = new Error('Upload completed but confirmation failed. Please try again.');
    wrapped.phase = 'finalize';
    throw wrapped;
  }
}
