import { useState } from 'react';
import { CheckCircle, Loader2, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import api from '../../../services/api';
import { Button, cn } from '../../ui';
import { EmptyWidgetMessage, WidgetViewAllLink } from './DashboardMiniWidgets';

const RECENTLY_COMPLETED_LIMIT = 3;
const ACTIVE_VISIBLE_LIMIT = 6;

function sortByUpdatedDesc(items) {
  return [...items].sort((a, b) => {
    const ta = new Date(a.updated_at || a.created_at || 0).getTime();
    const tb = new Date(b.updated_at || b.created_at || 0).getTime();
    return tb - ta;
  });
}

function ShoppingItemRow({
  item,
  busy,
  completed = false,
  onToggle,
  onDelete,
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-lg border px-2 py-1.5',
        completed
          ? 'border-border/50 bg-surface-subtle/30'
          : 'border-border/60 bg-surface-subtle/40',
        busy && 'opacity-60',
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(item)}
        disabled={busy}
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 transition-colors focus-visible:outline-none focus-visible:ring-2',
          completed
            ? 'border-brand-400 bg-brand-50 focus-visible:ring-brand-500/40'
            : 'border-border hover:border-brand-500 focus-visible:ring-brand-500/40',
        )}
        aria-label={
          completed
            ? `Mark ${item.item_name} as not purchased`
            : `Mark ${item.item_name} as purchased`
        }
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" aria-hidden />
        ) : completed ? (
          <CheckCircle className="h-3.5 w-3.5 text-brand-600" aria-hidden />
        ) : null}
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-sm font-medium',
            completed ? 'text-muted line-through' : 'text-foreground',
          )}
        >
          {item.item_name}
        </p>
        {(item.quantity || item.category) && (
          <p className="text-caption truncate">
            {[item.quantity, item.category].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      {!completed && (
        <button
          type="button"
          onClick={() => onDelete(item)}
          disabled={busy}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-50 hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500/30"
          aria-label={`Remove ${item.item_name}`}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </li>
  );
}

export default function ShoppingListWidget({ items, household, href, onRefresh }) {
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [error, setError] = useState(null);

  if (!household) {
    return <EmptyWidgetMessage>Create or join a household to use the shopping list.</EmptyWidgetMessage>;
  }

  const allItems = Array.isArray(items) ? items : [];
  const pending = allItems.filter((i) => !i.is_completed);
  const visibleActive = pending.slice(0, ACTIVE_VISIBLE_LIMIT);
  const recentlyCompleted = sortByUpdatedDesc(allItems.filter((i) => i.is_completed)).slice(
    0,
    RECENTLY_COMPLETED_LIMIT,
  );

  const setBusy = (id, busy) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const refresh = async () => {
    if (onRefresh) await onRefresh();
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || adding) return;
    setError(null);
    setAdding(true);
    try {
      await api.post('/api/v1/households/shopping-list', { item_name: name });
      setNewName('');
      await refresh();
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not add item.');
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (item) => {
    if (busyIds.has(item.id)) return;
    setError(null);
    setBusy(item.id, true);
    try {
      await api.patch(`/api/v1/households/shopping-list/${item.id}`, {
        is_completed: !item.is_completed,
      });
      await refresh();
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not update item.');
    } finally {
      setBusy(item.id, false);
    }
  };

  const handleDelete = async (item) => {
    if (busyIds.has(item.id)) return;
    setError(null);
    setBusy(item.id, true);
    try {
      await api.delete(`/api/v1/households/shopping-list/${item.id}`);
      await refresh();
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not remove item.');
    } finally {
      setBusy(item.id, false);
    }
  };

  return (
    <>
      <form onSubmit={handleAdd} className="mb-3 flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add item…"
          className="form-input min-h-9 flex-1 py-1.5 text-sm"
          disabled={adding}
          aria-label="New shopping list item"
        />
        <Button
          type="submit"
          size="sm"
          variant="primary"
          className="min-w-9 shrink-0 px-2.5"
          disabled={adding || !newName.trim()}
          aria-label="Add item"
        >
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
        </Button>
      </form>

      {error && (
        <p className="text-caption mb-2 text-danger-600" role="alert">
          {error}
        </p>
      )}

      {visibleActive.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface-subtle/50 px-4 py-6 text-center">
          <ShoppingCart className="h-7 w-7 text-muted" aria-hidden />
          <p className="mt-2 text-sm font-medium text-foreground">
            {recentlyCompleted.length > 0 ? 'All caught up' : 'No items yet'}
          </p>
          <p className="text-caption mt-1 max-w-[14rem]">
            {recentlyCompleted.length > 0
              ? 'Add something above to restock the list.'
              : 'Type an item above and tap + to add.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visibleActive.map((item) => (
            <ShoppingItemRow
              key={item.id}
              item={item}
              busy={busyIds.has(item.id)}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}

      {pending.length > visibleActive.length && (
        <p className="text-caption mt-2 text-muted">
          +{pending.length - visibleActive.length} more on the full list
        </p>
      )}

      {recentlyCompleted.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-caption mb-2 font-medium uppercase tracking-wide text-muted">
            Recently completed
          </p>
          <ul className="space-y-2">
            {recentlyCompleted.map((item) => (
              <ShoppingItemRow
                key={item.id}
                item={item}
                busy={busyIds.has(item.id)}
                completed
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        </div>
      )}

      <WidgetViewAllLink href={href} label="Open full shopping list" />
    </>
  );
}
