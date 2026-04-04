import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lock,
  Unlock,
  StickyNote,
  KeyRound,
  Plus,
  Search,
  Eye,
  EyeOff,
  Copy,
  Trash2,
  Edit3,
  Save,
  X,
  Settings as SettingsIcon,
  RefreshCw,
  Loader2,
  ArrowLeft,
  Timer,
  Check,
} from 'lucide-react';
import SortDropdown from '../components/SortDropdown';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatFriendlyDate } from '../utils/formatDate';

// Vault API helper that adds X-Notes-Session header
function vaultApi(sessionToken) {
  return {
    get: (url, config = {}) =>
      api.get(url, {
        ...config,
        headers: { ...config.headers, 'X-Notes-Session': sessionToken },
      }),
    post: (url, data, config = {}) =>
      api.post(url, data, {
        ...config,
        headers: { ...config.headers, 'X-Notes-Session': sessionToken },
      }),
    put: (url, data, config = {}) =>
      api.put(url, data, {
        ...config,
        headers: { ...config.headers, 'X-Notes-Session': sessionToken },
      }),
    patch: (url, data, config = {}) =>
      api.patch(url, data, {
        ...config,
        headers: { ...config.headers, 'X-Notes-Session': sessionToken },
      }),
    delete: (url, config = {}) =>
      api.delete(url, {
        ...config,
        headers: { ...config.headers, 'X-Notes-Session': sessionToken },
      }),
  };
}

function generatePassword(length = 16) {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const all = upper + lower + digits + symbols;
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  // Ensure at least one of each type
  let password = [
    upper[arr[0] % upper.length],
    lower[arr[1] % lower.length],
    digits[arr[2] % digits.length],
    symbols[arr[3] % symbols.length],
  ];
  for (let i = 4; i < length; i++) {
    password.push(all[arr[i] % all.length]);
  }
  // Shuffle
  for (let i = password.length - 1; i > 0; i--) {
    const j = arr[i] % (i + 1);
    [password[i], password[j]] = [password[j], password[i]];
  }
  return password.join('');
}

// ─── PIN Setup Screen ─────────────────────────────────────────────────
function PinSetup({ onSuccess }) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const pinInputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,6}$/.test(pin)) {
      setError('PIN must be 4-6 digits.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/v1/notes/pin/setup', { pin });
      const { data } = await api.post('/api/v1/notes/pin/verify', { pin });
      onSuccess(data.notes_session_token, data.expires_in);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to set up PIN.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <Lock className="h-10 w-10 text-blue-600 mb-3" />
          <h2 className="text-xl font-bold text-gray-900">Create Vault PIN</h2>
          <p className="text-sm text-gray-500 mt-1">Set a 4-6 digit PIN to protect your vault</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Enter PIN</label>
            <input
              ref={pinInputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-center text-2xl tracking-[0.5em]"
              placeholder="····"
              data-keep-focus="true"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm PIN</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-center text-2xl tracking-[0.5em]"
              placeholder="····"
              data-keep-focus="true"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create PIN
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── PIN Verify Screen ────────────────────────────────────────────────
function PinVerify({ onSuccess }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const pinInputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,6}$/.test(pin)) {
      setError('PIN must be 4-6 digits.');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/api/v1/notes/pin/verify', { pin });
      onSuccess(data.notes_session_token, data.expires_in);
    } catch (err) {
      if (err.response?.status === 429) {
        setError('Too many attempts. Try again in 1 minute.');
      } else if (err.response?.status === 401) {
        setError('Incorrect PIN.');
      } else {
        setError(err.response?.data?.detail || 'Verification failed.');
      }
      setPin('');
      requestAnimationFrame(() => pinInputRef.current?.focus());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <Lock className="h-10 w-10 text-blue-600 mb-3" />
          <h2 className="text-xl font-bold text-gray-900">Unlock Vault</h2>
          <p className="text-sm text-gray-500 mt-1">Enter your PIN to access the vault</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              ref={pinInputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-center text-2xl tracking-[0.5em]"
              placeholder="····"
              data-keep-focus="true"
            />
          </div>
          {error && <p className="text-sm text-red-600" data-testid="pin-error">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Notes Tab ────────────────────────────────────────────────────────
function NotesTab({ vApi, resetTimer }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const fetchNotes = useCallback(async () => {
    try {
      const { data } = await vApi.get(`/api/v1/notes?sort_by=${sortBy}&sort_order=${sortOrder}`);
      setNotes(Array.isArray(data) ? data : data.notes || []);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [vApi, sortBy, sortOrder]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const filtered = notes.filter((n) =>
    (n.title || 'Untitled').toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    setEditing(null);
    setFormTitle('');
    setFormContent('');
    setShowForm(true);
    setError(null);
  };

  const openEdit = async (note) => {
    resetTimer();
    setError(null);
    try {
      const { data } = await vApi.get(`/api/v1/notes/${note.id}`);
      setEditing(data);
      setFormTitle(data.title || '');
      setFormContent(data.content || '');
      setShowForm(true);
    } catch {
      setError('Failed to load note.');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await vApi.put(`/api/v1/notes/${editing.id}`, { title: formTitle, content: formContent });
      } else {
        await vApi.post('/api/v1/notes', { title: formTitle, content: formContent });
      }
      setShowForm(false);
      setEditing(null);
      await fetchNotes();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save note.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await vApi.delete(`/api/v1/notes/${deleteTarget.id}`);
      setDeleteTarget(null);
      setShowForm(false);
      setEditing(null);
      await fetchNotes();
    } catch {
      setError('Failed to delete note.');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
          />
        </div>
        <SortDropdown
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(sb, so) => { setSortBy(sb); setSortOrder(so); }}
          options={[
            { value: 'title', label: 'Title' },
            { value: 'created_at', label: 'Date Created' },
            { value: 'updated_at', label: 'Last Modified' },
          ]}
        />
        <button
          onClick={openNew}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors flex items-center gap-1.5 shrink-0"
        >
          <Plus className="h-4 w-4" />
          New Note
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}

      {filtered.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="No Notes Yet"
          message="Create your first secure note."
          actionLabel="New Note"
          onAction={openNew}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((note) => (
            <div
              key={note.id}
              onClick={() => openEdit(note)}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900 text-sm">{note.title || 'Untitled'}</h3>
                <span className="text-xs text-gray-400">
                  {formatFriendlyDate(note.updated_at || note.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Note form modal */}
      <Modal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        title={editing ? 'Edit Note' : 'New Note'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
              placeholder="Note title (optional)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
            <textarea
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm resize-y"
              placeholder="Write your note..."
            />
          </div>
          <div className="flex justify-between">
            <div>
              {editing && (
                <button
                  onClick={() => setDeleteTarget(editing)}
                  className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 flex items-center gap-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowForm(false); setEditing(null); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                <Save className="h-4 w-4" />
                Save
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Note"
        message="Are you sure you want to delete this note? This action cannot be undone."
        confirmText="Delete"
        danger
      />
    </div>
  );
}

// ─── Passwords Tab ────────────────────────────────────────────────────
function PasswordsTab({ vApi, resetTimer }) {
  const [passwords, setPasswords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [form, setForm] = useState({ site_name: '', url: '', username: '', password: '', notes: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showViewPassword, setShowViewPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [copied, setCopied] = useState(null); // 'password' | 'username' | null
  const clipboardTimerRef = useRef(null);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const fetchPasswords = useCallback(async () => {
    try {
      const { data } = await vApi.get(`/api/v1/passwords?sort_by=${sortBy}&sort_order=${sortOrder}`);
      setPasswords(Array.isArray(data) ? data : data.passwords || []);
    } catch {
      setPasswords([]);
    } finally {
      setLoading(false);
    }
  }, [vApi, sortBy, sortOrder]);

  useEffect(() => {
    fetchPasswords();
  }, [fetchPasswords]);

  useEffect(() => {
    return () => {
      if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current);
    };
  }, []);

  const filtered = passwords.filter((p) => {
    const q = search.toLowerCase();
    return (p.site_name || '').toLowerCase().includes(q) || (p.username || '').toLowerCase().includes(q);
  });

  const resetForm = () => {
    setForm({ site_name: '', url: '', username: '', password: '', notes: '' });
    setShowPassword(false);
  };

  const openNew = () => {
    setEditing(null);
    setViewing(null);
    resetForm();
    setShowForm(true);
    setError(null);
  };

  const openView = async (pw) => {
    resetTimer();
    setError(null);
    setShowViewPassword(false);
    try {
      const { data } = await vApi.get(`/api/v1/passwords/${pw.id}`);
      setViewing(data);
    } catch {
      setError('Failed to load password entry.');
    }
  };

  const openEdit = () => {
    if (!viewing) return;
    setEditing(viewing);
    setForm({
      site_name: viewing.site_name || '',
      url: viewing.url || '',
      username: viewing.username || '',
      password: viewing.password || '',
      notes: viewing.notes || '',
    });
    setShowPassword(false);
    setViewing(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await vApi.put(`/api/v1/passwords/${editing.id}`, form);
      } else {
        await vApi.post('/api/v1/passwords', form);
      }
      setShowForm(false);
      setEditing(null);
      resetForm();
      await fetchPasswords();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save password.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await vApi.delete(`/api/v1/passwords/${deleteTarget.id}`);
      setDeleteTarget(null);
      setViewing(null);
      setShowForm(false);
      setEditing(null);
      await fetchPasswords();
    } catch {
      setError('Failed to delete password.');
    }
  };

  const copyToClipboard = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current);
      clipboardTimerRef.current = setTimeout(async () => {
        try {
          await navigator.clipboard.writeText('');
        } catch {}
        setCopied(null);
      }, 30000);
      // Clear "Copied!" indicator after 2s
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search passwords..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
          />
        </div>
        <SortDropdown
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(sb, so) => { setSortBy(sb); setSortOrder(so); }}
          options={[
            { value: 'site_name', label: 'Site Name' },
            { value: 'username', label: 'Username' },
            { value: 'created_at', label: 'Date Added' },
          ]}
        />
        <button
          onClick={openNew}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors flex items-center gap-1.5 shrink-0"
        >
          <Plus className="h-4 w-4" />
          New Password
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}

      {filtered.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No Passwords Yet"
          message="Store your first password securely."
          actionLabel="New Password"
          onAction={openNew}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((pw) => (
            <div
              key={pw.id}
              onClick={() => openView(pw)}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 text-sm">{pw.site_name || 'Untitled'}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{pw.username || '—'}</p>
                </div>
                {pw.url && (
                  <span className="text-xs text-gray-400 truncate max-w-[120px]">{pw.url}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Password detail view modal */}
      <Modal
        isOpen={!!viewing}
        onClose={() => { setViewing(null); setShowViewPassword(false); }}
        title="Password Details"
      >
        {viewing && (
          <div className="space-y-4">
            <div className="space-y-3">
              {viewing.site_name && (
                <div>
                  <span className="text-xs font-medium text-gray-500">Site Name</span>
                  <p className="text-sm text-gray-900">{viewing.site_name}</p>
                </div>
              )}
              {viewing.url && (
                <div>
                  <span className="text-xs font-medium text-gray-500">URL</span>
                  <p className="text-sm text-blue-600 break-all">{viewing.url}</p>
                </div>
              )}
              {viewing.username && (
                <div>
                  <span className="text-xs font-medium text-gray-500">Username</span>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-900">{viewing.username}</p>
                    <button
                      onClick={() => copyToClipboard(viewing.username, 'username')}
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Copy Username"
                    >
                      {copied === 'username' ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              )}
              {viewing.password && (
                <div>
                  <span className="text-xs font-medium text-gray-500">Password</span>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-900 font-mono">
                      {showViewPassword ? viewing.password : '••••••••••••'}
                    </p>
                    <button
                      onClick={() => setShowViewPassword(!showViewPassword)}
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      title={showViewPassword ? 'Hide' : 'Show'}
                    >
                      {showViewPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => copyToClipboard(viewing.password, 'password')}
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Copy Password"
                    >
                      {copied === 'password' ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              )}
              {viewing.notes && (
                <div>
                  <span className="text-xs font-medium text-gray-500">Notes</span>
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{viewing.notes}</p>
                </div>
              )}
            </div>
            {copied && (
              <div className="p-2 bg-green-50 text-green-700 text-xs rounded-lg text-center">
                Copied! Clipboard will be cleared in 30 seconds.
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-gray-100">
              <button
                onClick={() => setDeleteTarget(viewing)}
                className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 flex items-center gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
              <button
                onClick={openEdit}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors flex items-center gap-1.5"
              >
                <Edit3 className="h-4 w-4" />
                Edit
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Password form modal */}
      <Modal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditing(null); resetForm(); }}
        title={editing ? 'Edit Password' : 'New Password'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Site Name</label>
            <input
              type="text"
              value={form.site_name}
              onChange={(e) => setForm({ ...form, site_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
              placeholder="e.g. Google"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
            <input
              type="text"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
              placeholder="https://example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  const pw = generatePassword();
                  setForm({ ...form, password: pw });
                  setShowPassword(true);
                }}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors flex items-center gap-1.5 shrink-0"
                title="Generate Password"
              >
                <RefreshCw className="h-4 w-4" />
                Generate
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm resize-y"
              placeholder="Security questions, recovery codes, etc."
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setShowForm(false); setEditing(null); resetForm(); }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <Save className="h-4 w-4" />
              Save
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Password"
        message="Are you sure you want to delete this password entry? This action cannot be undone."
        confirmText="Delete"
        danger
      />
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────
function VaultSettings({ vApi, lockTimeout, setLockTimeout, onClose }) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [savingTimeout, setSavingTimeout] = useState(false);

  const handleChangePin = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!/^\d{4,6}$/.test(newPin)) {
      setError('New PIN must be 4-6 digits.');
      return;
    }
    if (newPin !== confirmNewPin) {
      setError('New PINs do not match.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/v1/notes/pin/setup', { current_pin: currentPin, new_pin: newPin });
      setSuccess('PIN changed successfully.');
      setCurrentPin('');
      setNewPin('');
      setConfirmNewPin('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to change PIN.');
    } finally {
      setSaving(false);
    }
  };

  const handleTimeout = async (val) => {
    const n = parseInt(val, 10);
    if (n < 1 || n > 10) return;
    setSavingTimeout(true);
    try {
      await vApi.patch('/api/v1/notes/settings', { lock_timeout: n });
      setLockTimeout(n);
    } catch {}
    setSavingTimeout(false);
  };

  return (
    <div className="space-y-6">
      {/* Lock Timeout */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <Timer className="h-4 w-4" />
          Lock Timeout
        </h3>
        <div className="flex items-center gap-3">
          <select
            value={lockTimeout}
            onChange={(e) => handleTimeout(e.target.value)}
            disabled={savingTimeout}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
            data-testid="lock-timeout-select"
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} minute{n !== 1 ? 's' : ''}
              </option>
            ))}
          </select>
          {savingTimeout && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
        </div>
      </div>

      {/* Change PIN */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <Lock className="h-4 w-4" />
          Change PIN
        </h3>
        <form onSubmit={handleChangePin} className="space-y-3">
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
            placeholder="Current PIN"
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
            placeholder="New PIN"
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={confirmNewPin}
            onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
            placeholder="Confirm New PIN"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Change PIN
          </button>
        </form>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Main Vault Component ─────────────────────────────────────────────
export default function Vault() {
  const navigate = useNavigate();
  const [screen, setScreen] = useState('loading'); // loading | setup | verify | vault
  const [sessionToken, setSessionToken] = useState(null);
  const [activeTab, setActiveTab] = useState('notes');
  const [showSettings, setShowSettings] = useState(false);
  const [lockTimeout, setLockTimeout] = useState(5);
  const [timeLeft, setTimeLeft] = useState(null); // seconds
  const timerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const sessionTokenRef = useRef(null);

  // Determine initial screen
  useEffect(() => {
    const detectPinStatus = async () => {
      try {
        // Try verify with empty pin to detect if PIN is set
        await api.post('/api/v1/notes/pin/verify', { pin: '000000' });
        // If it succeeds (unlikely), go to vault
        setScreen('verify');
      } catch (err) {
        if (err.response?.status === 401) {
          // PIN exists, wrong PIN
          setScreen('verify');
        } else if (err.response?.status === 400 || err.response?.data?.detail?.includes('no pin')) {
          // No PIN set
          setScreen('setup');
        } else if (err.response?.status === 429) {
          // Rate limited — PIN exists
          setScreen('verify');
        } else {
          // Fallback: assume setup needed
          setScreen('setup');
        }
      }
    };
    detectPinStatus();
  }, []);

  // Clear session on navigate away
  useEffect(() => {
    return () => {
      sessionTokenRef.current = null;
    };
  }, []);

  // Lock timer
  useEffect(() => {
    if (screen !== 'vault' || !sessionToken) return;

    const totalSeconds = lockTimeout * 60;
    lastActivityRef.current = Date.now();
    setTimeLeft(totalSeconds);

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      const remaining = totalSeconds - elapsed;
      if (remaining <= 0) {
        clearInterval(interval);
        setSessionToken(null);
        sessionTokenRef.current = null;
        setScreen('verify');
        setTimeLeft(null);
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);

    timerRef.current = interval;
    return () => clearInterval(interval);
  }, [screen, sessionToken, lockTimeout]);

  // Reset timer on user interaction
  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (screen !== 'vault') return;
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    return () => events.forEach((e) => window.removeEventListener(e, resetTimer));
  }, [screen, resetTimer]);

  const handlePinSuccess = (token, expiresIn) => {
    setSessionToken(token);
    sessionTokenRef.current = token;
    setScreen('vault');
  };

  const vApi = sessionToken ? vaultApi(sessionToken) : null;

  // Wrap vApi to detect 403 session_required
  const wrappedVApi = vApi
    ? {
        get: async (...args) => {
          try {
            return await vApi.get(...args);
          } catch (err) {
            if (err.response?.status === 403 && err.response?.data?.detail === 'notes_session_required') {
              setSessionToken(null);
              sessionTokenRef.current = null;
              setScreen('verify');
            }
            throw err;
          }
        },
        post: async (...args) => {
          try {
            return await vApi.post(...args);
          } catch (err) {
            if (err.response?.status === 403 && err.response?.data?.detail === 'notes_session_required') {
              setSessionToken(null);
              sessionTokenRef.current = null;
              setScreen('verify');
            }
            throw err;
          }
        },
        put: async (...args) => {
          try {
            return await vApi.put(...args);
          } catch (err) {
            if (err.response?.status === 403 && err.response?.data?.detail === 'notes_session_required') {
              setSessionToken(null);
              sessionTokenRef.current = null;
              setScreen('verify');
            }
            throw err;
          }
        },
        patch: async (...args) => {
          try {
            return await vApi.patch(...args);
          } catch (err) {
            if (err.response?.status === 403 && err.response?.data?.detail === 'notes_session_required') {
              setSessionToken(null);
              sessionTokenRef.current = null;
              setScreen('verify');
            }
            throw err;
          }
        },
        delete: async (...args) => {
          try {
            return await vApi.delete(...args);
          } catch (err) {
            if (err.response?.status === 403 && err.response?.data?.detail === 'notes_session_required') {
              setSessionToken(null);
              sessionTokenRef.current = null;
              setScreen('verify');
            }
            throw err;
          }
        },
      }
    : null;

  const formatTime = (seconds) => {
    if (seconds == null) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (screen === 'loading') return <LoadingSpinner />;
  if (screen === 'setup') return <PinSetup onSuccess={handlePinSuccess} />;
  if (screen === 'verify') return <PinVerify onSuccess={handlePinSuccess} />;

  // Vault content
  return (
    <div className="min-h-screen bg-gray-50 p-6" onClick={resetTimer}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Unlock className="h-7 w-7 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Secure Vault</h1>
        </div>
        <div className="flex items-center gap-3">
          {timeLeft != null && (
            <span className="text-xs text-gray-500 flex items-center gap-1" data-testid="lock-timer">
              <Timer className="h-3.5 w-3.5" />
              Locks in {formatTime(timeLeft)}
            </span>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            title="Vault Settings"
          >
            <SettingsIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => {
              setSessionToken(null);
              sessionTokenRef.current = null;
              setScreen('verify');
            }}
            className="p-2 text-gray-400 hover:text-red-600 transition-colors"
            title="Lock Vault"
          >
            <Lock className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('notes')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'notes'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <StickyNote className="h-4 w-4" />
            Notes
          </span>
        </button>
        <button
          onClick={() => setActiveTab('passwords')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'passwords'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <KeyRound className="h-4 w-4" />
            Passwords
          </span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'notes' ? (
        <NotesTab vApi={wrappedVApi} resetTimer={resetTimer} />
      ) : (
        <PasswordsTab vApi={wrappedVApi} resetTimer={resetTimer} />
      )}

      {/* Settings Modal */}
      <Modal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title="Vault Settings"
      >
        <VaultSettings
          vApi={wrappedVApi}
          lockTimeout={lockTimeout}
          setLockTimeout={setLockTimeout}
          onClose={() => setShowSettings(false)}
        />
      </Modal>
    </div>
  );
}
