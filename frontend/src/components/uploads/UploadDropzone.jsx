import { useState, useRef, useCallback } from 'react';
import { Upload, Camera, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { uploadDocument, UPLOAD_MAX_BYTES, ALLOWED_CONTENT_TYPES } from '../../lib/uploads';

const PHASES = {
  idle: 'idle',
  validating: 'validating',
  presigning: 'presigning',
  uploading: 'uploading',
  finalizing: 'finalizing',
  done: 'done',
};

const PHASE_LABELS = {
  validating: 'Validating...',
  presigning: 'Preparing upload...',
  uploading: 'Uploading...',
  finalizing: 'Finalizing...',
  done: 'Upload complete!',
};

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadDropzone({
  documentType,
  onUploaded,
  disabled,
  compact,
  scope = 'personal',
}) {
  const [phase, setPhase] = useState(PHASES.idle);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const busy = phase !== PHASES.idle && phase !== PHASES.done;

  const validateFile = useCallback((file) => {
    if (!file) return 'No file selected.';
    if (file.size > UPLOAD_MAX_BYTES) {
      return `File too large (${formatFileSize(file.size)}). Maximum is ${formatFileSize(UPLOAD_MAX_BYTES)}.`;
    }
    // Some browsers report HEIC as '' or 'image/heif'
    const type = file.type || '';
    if (type && !ALLOWED_CONTENT_TYPES.includes(type) && type !== 'image/heif') {
      return 'File type not supported. Use JPEG, PNG, WebP, HEIC, or PDF.';
    }
    return null;
  }, []);

  const handleUpload = useCallback(async (file) => {
    setError(null);
    setPhase(PHASES.validating);

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      setPhase(PHASES.idle);
      return;
    }

    try {
      const doc = await uploadDocument({
        file,
        documentType,
        scope,
        onPhase: (p) => {
          if (p === 'presigning') setPhase(PHASES.presigning);
          if (p === 'uploading') setPhase(PHASES.uploading);
          if (p === 'finalizing') setPhase(PHASES.finalizing);
        },
      });

      setPhase(PHASES.done);

      if (onUploaded) onUploaded(doc);

      // Reset to idle after a short delay
      setTimeout(() => setPhase(PHASES.idle), 1500);
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
      setPhase(PHASES.idle);
    }
  }, [documentType, scope, onUploaded, validateFile]);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [handleUpload]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!busy && !disabled) setDragOver(true);
  }, [busy, disabled]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (busy || disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  }, [busy, disabled, handleUpload]);

  const accept = ALLOWED_CONTENT_TYPES.join(',');

  return (
    <div className="space-y-2">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl transition-colors ${
          compact ? 'p-4' : 'p-6'
        } ${
          dragOver
            ? 'border-blue-400 bg-blue-50'
            : error
              ? 'border-red-300 bg-red-50/50'
              : phase === PHASES.done
                ? 'border-green-300 bg-green-50/50'
                : 'border-gray-300 bg-white hover:border-gray-400'
        } ${disabled || busy ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <div className={`flex flex-col items-center gap-3 ${compact ? 'text-center' : 'text-center'}`}>
          {/* Status icon */}
          {phase === PHASES.done ? (
            <CheckCircle className="h-8 w-8 text-green-500" />
          ) : busy ? (
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
          ) : (
            <Upload className="h-8 w-8 text-gray-400" />
          )}

          {/* Status text */}
          {busy || phase === PHASES.done ? (
            <p className={`text-sm font-medium ${phase === PHASES.done ? 'text-green-700' : 'text-blue-700'}`}>
              {PHASE_LABELS[phase]}
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Drag and drop a file here, or use the buttons below
              </p>
              <p className="text-xs text-gray-400">
                JPEG, PNG, WebP, HEIC, or PDF up to 15 MB
              </p>
            </>
          )}

          {/* Action buttons — hidden when busy */}
          {!busy && phase !== PHASES.done && (
            <div className="flex flex-wrap items-center justify-center gap-3 mt-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors min-h-[44px]"
              >
                <Upload className="h-4 w-4" />
                Pick a file
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={disabled}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors min-h-[44px]"
              >
                <Camera className="h-4 w-4" />
                Take photo
              </button>
            </div>
          )}
        </div>

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="hidden"
          aria-label="Pick a file to upload"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          aria-label="Take a photo to upload"
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
