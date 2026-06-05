import Badge from './ui/Badge';

/** @deprecated Prefer `Badge` from `./ui` — kept for backward compatibility. */
export default function StatusBadge({ status }) {
  return <Badge status={status} />;
}
