import { useState } from 'react';

export default function DateInput({ value, onChange, className, onBlur, ...props }) {
  const [error, setError] = useState('');

  const handleBlur = (e) => {
    const val = e.target.value;
    if (val && isNaN(Date.parse(val))) {
      setError('Please enter a valid date');
    } else {
      setError('');
    }
    onBlur?.(e);
  };

  const handleChange = (e) => {
    if (error) setError('');
    onChange?.(e);
  };

  return (
    <div>
      <input
        type="date"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="MM/DD/YYYY"
        className={className}
        {...props}
      />
      {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
    </div>
  );
}
