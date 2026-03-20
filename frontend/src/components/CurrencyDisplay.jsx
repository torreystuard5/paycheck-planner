export default function CurrencyDisplay({ amount, className = '' }) {
  const value = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  const formatted = `$${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

  return <span className={className}>{formatted}</span>;
}
