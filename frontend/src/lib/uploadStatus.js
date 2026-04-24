export const UPLOAD_STATUS_CONFIG = {
  pending_upload: { label: 'Pending', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  uploaded:       { label: 'Uploaded', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  processing:     { label: 'Processing', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  completed:      { label: 'Completed', color: 'bg-green-100 text-green-700 border-green-200' },
  failed:         { label: 'Failed', color: 'bg-red-100 text-red-700 border-red-200' },
  cancelled:      { label: 'Cancelled', color: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export function getStatusPill(status) {
  return UPLOAD_STATUS_CONFIG[status] || UPLOAD_STATUS_CONFIG.pending_upload;
}
