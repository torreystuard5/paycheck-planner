import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Archive, ArchiveRestore, Star, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import api from '../services/api';
import { useBudget } from '../context/BudgetContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';

const PRESET_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#84CC16',
];

const defaultForm = { name: '', description: '', color: '#3B82F6' };

export default function Budgets() {
  const { activeBudget, refreshBudgets, setActiveBudget } = useBudget();

  const [budgets, setBudgets] = useState([]);
  const [archivedBudgets, setArchivedBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Create/Rename modal
  const [showModal, setShowModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  // Archive section
  const [showArchived, setShowArchived] = useState(false);

  // Action loading states
  const [actionLoading, setActionLoading] = useState({});

  const fetchBudgets = useCallback(async () => {
    setError(null);
    try {
      const [activeRes, archivedRes] = await Promise.all([
        api.get('/api/v1/budgets'),
        api.get('/api/v1/budgets?include_archived=true'),
      ]);
      const active = Array.isArray(activeRes.data) ? activeRes.data : [];
      const all = Array.isArray(archivedRes.data) ? archivedRes.data : [];
      setBudgets(active);
      setArchivedBudgets(all.filter((b) => b.is_archived));
    } catch {
      setError('Failed to load budgets.');
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchBudgets();
      setLoading(false);
    };
    init();
  }, [fetchBudgets]);

  const openCreate = () => {
    setEditingBudget(null);
    setForm(defaultForm);
    setModalError(null);
    setShowModal(true);
  };

  const openEdit = (budget) => {
    setEditingBudget(budget);
    setForm({ name: budget.name, description: budget.description || '', color: budget.color || '#3B82F6' });
    setModalError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setModalError('Name is required.');
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      if (editingBudget) {
        await api.patch(`/api/v1/budgets/${editingBudget.id}`, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          color: form.color || null,
        });
      } else {
        await api.post('/api/v1/budgets', {
          name: form.name.trim(),
          description: form.description.trim() || null,
          color: form.color || null,
        });
      }
      setShowModal(false);
      await fetchBudgets();
      await refreshBudgets();
    } catch (err) {
      setModalError(err.response?.data?.detail || 'Failed to save budget.');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (id) => {
    setActionLoading((s) => ({ ...s, [id]: 'default' }));
    try {
      await api.post(`/api/v1/budgets/${id}/set-default`);
      await fetchBudgets();
      await refreshBudgets();
    } catch { /* ignore */ }
    setActionLoading((s) => ({ ...s, [id]: null }));
  };

  const handleSetActive = async (id) => {
    setActionLoading((s) => ({ ...s, [id]: 'active' }));
    try {
      await setActiveBudget(id);
      await fetchBudgets();
    } catch { /* ignore */ }
    setActionLoading((s) => ({ ...s, [id]: null }));
  };

  const handleArchive = async (id) => {
    setActionLoading((s) => ({ ...s, [id]: 'archive' }));
    try {
      await api.patch(`/api/v1/budgets/${id}`, { is_archived: true });
      // If we archived the active budget, refresh to pick up new active
      await fetchBudgets();
      await refreshBudgets();
    } catch { /* ignore */ }
    setActionLoading((s) => ({ ...s, [id]: null }));
  };

  const handleRestore = async (id) => {
    setActionLoading((s) => ({ ...s, [id]: 'restore' }));
    try {
      await api.patch(`/api/v1/budgets/${id}`, { is_archived: false });
      await fetchBudgets();
      await refreshBudgets();
    } catch { /* ignore */ }
    setActionLoading((s) => ({ ...s, [id]: null }));
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    setActionLoading((s) => ({ ...s, [deleteTarget.id]: 'delete' }));
    try {
      await api.delete(`/api/v1/budgets/${deleteTarget.id}`);
      setDeleteTarget(null);
      await fetchBudgets();
      await refreshBudgets();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 409) {
        // Parse entity counts from the 409 response
        const msg = typeof detail === 'string' ? detail : 'This budget has items. Archive it instead, or move items to another budget first.';
        setDeleteError(msg);
      } else {
        setDeleteError(typeof detail === 'string' ? detail : 'Failed to delete budget.');
      }
    }
    setActionLoading((s) => ({ ...s, [deleteTarget?.id]: null }));
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budgets</h1>
          <p className="text-gray-600 mt-1">Create and manage your budget workspaces</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          Create budget
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      )}

      {/* Active budgets list */}
      <div className="space-y-3">
        {budgets.map((b) => {
          const isDefault = b.is_default;
          const isActive = b.id === activeBudget?.id;
          const busy = !!actionLoading[b.id];

          return (
            <div key={b.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                {/* Color swatch */}
                <span
                  className="w-4 h-4 rounded-full shrink-0 mt-1"
                  style={{ backgroundColor: b.color || '#9CA3AF' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-gray-900">{b.name}</h3>
                    {isDefault && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                        Default
                      </span>
                    )}
                    {isActive && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                        Active
                      </span>
                    )}
                  </div>
                  {b.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{b.description}</p>
                  )}
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                  <button
                    onClick={() => openEdit(b)}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title="Rename"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {!isActive && (
                    <button
                      onClick={() => handleSetActive(b.id)}
                      disabled={busy}
                      className="px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors min-h-[44px] flex items-center gap-1"
                      title="Set as active"
                    >
                      {actionLoading[b.id] === 'active' && <Loader2 className="w-3 h-3 animate-spin" />}
                      Set active
                    </button>
                  )}
                  {!isDefault && (
                    <button
                      onClick={() => handleSetDefault(b.id)}
                      disabled={busy}
                      className="p-2 text-gray-400 hover:text-amber-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="Set as default"
                    >
                      {actionLoading[b.id] === 'default' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
                    </button>
                  )}
                  {isDefault ? (
                    <span
                      className="p-2 text-gray-300 cursor-not-allowed min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="Default budget cannot be archived"
                    >
                      <Archive className="w-4 h-4" />
                    </span>
                  ) : (
                    <button
                      onClick={() => handleArchive(b.id)}
                      disabled={busy}
                      className="p-2 text-gray-400 hover:text-orange-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="Archive"
                    >
                      {actionLoading[b.id] === 'archive' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                    </button>
                  )}
                  {isDefault ? (
                    <span
                      className="p-2 text-gray-300 cursor-not-allowed min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="Default budget cannot be deleted"
                    >
                      <Trash2 className="w-4 h-4" />
                    </span>
                  ) : (
                    <button
                      onClick={() => { setDeleteError(null); setDeleteTarget(b); }}
                      disabled={busy}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {budgets.length === 0 && !loading && (
          <p className="text-gray-500 text-sm text-center py-8">No budgets yet. Create your first budget to get started.</p>
        )}
      </div>

      {/* Archived budgets */}
      {archivedBudgets.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            {showArchived ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Archived budgets ({archivedBudgets.length})
          </button>
          {showArchived && (
            <div className="mt-3 space-y-3">
              {archivedBudgets.map((b) => {
                const busy = !!actionLoading[b.id];
                return (
                  <div key={b.id} className="bg-gray-50 rounded-lg border border-gray-200 p-4 sm:p-5 opacity-75">
                    <div className="flex items-start gap-3">
                      <span
                        className="w-4 h-4 rounded-full shrink-0 mt-1"
                        style={{ backgroundColor: b.color || '#9CA3AF' }}
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-700">{b.name}</h3>
                        {b.description && (
                          <p className="text-xs text-gray-400 mt-0.5">{b.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleRestore(b.id)}
                          disabled={busy}
                          className="px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors min-h-[44px] flex items-center gap-1"
                        >
                          {actionLoading[b.id] === 'restore' ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArchiveRestore className="w-3 h-3" />}
                          Restore
                        </button>
                        <button
                          onClick={() => { setDeleteError(null); setDeleteTarget(b); }}
                          disabled={busy}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="Delete permanently"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingBudget ? 'Edit Budget' : 'Create Budget'}>
        <div className="space-y-4">
          {modalError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{modalError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
              placeholder="e.g. Main Budget, Side Hustle"
              maxLength={100}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
              placeholder="Optional description"
              maxLength={255}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${form.color === c ? 'border-gray-900 scale-110' : 'border-transparent hover:border-gray-300'}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowModal(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingBudget ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      {deleteTarget && (
        <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Budget">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete <span className="font-semibold">{deleteTarget.name}</span>? This action cannot be undone.
            </p>
            {deleteError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!!actionLoading[deleteTarget.id]}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading[deleteTarget.id] === 'delete' && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
