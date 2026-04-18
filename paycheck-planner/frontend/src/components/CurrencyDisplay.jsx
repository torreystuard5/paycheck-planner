export default function CurrencyDisplay({ amount, className = '' }) {
  const parsed = Number(amount);
  const value = isNaN(parsed) ? 0 : parsed;
  const formatted = `$${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

  return <span className={className}>{formatted}</span>;
}
