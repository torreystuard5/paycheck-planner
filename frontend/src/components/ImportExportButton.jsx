import { useState, useRef, useEffect } from 'react';
import { ArrowDownUp, ChevronDown, Download, Upload } from 'lucide-react';

export default function ImportExportButton({ onExport, onImport }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <ArrowDownUp className="h-4 w-4" />
        Import / Export
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <button
            onClick={() => { setOpen(false); onExport?.(); }}
            className="w-full flex items-center gap-2 text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            onClick={() => { setOpen(false); onImport?.(); }}
            className="w-full flex items-center gap-2 text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </button>
        </div>
      )}
    </div>
  );
}
