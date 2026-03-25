import { useState, useRef, useEffect } from 'react';
import { ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';

export default function SortDropdown({ sortBy, sortOrder, onSortChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLabel = options.find((o) => o.value === sortBy)?.label || 'Sort';
  const OrderIcon = sortOrder === 'asc' ? ChevronUp : ChevronDown;

  const handleSelect = (value) => {
    if (value === sortBy) {
      onSortChange(value, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(value, 'desc');
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition-colors"
      >
        <ArrowUpDown className="h-3.5 w-3.5 text-gray-500" />
        <span>{currentLabel}</span>
        <OrderIcon className="h-3.5 w-3.5 text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 right-auto mt-1 min-w-[160px] max-w-[calc(100vw-32px)] bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between ${
                sortBy === opt.value
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>{opt.label}</span>
              {sortBy === opt.value && (
                <OrderIcon className="h-3.5 w-3.5" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
