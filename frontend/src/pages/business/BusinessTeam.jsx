import { useEffect, useState } from 'react';
import api from '../../services/api';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useBusinessWrite } from '../../hooks/useBusinessWrite';

export default function BusinessTeam() {
  const write = useBusinessWrite('manage_team');
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('employee');
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get('/api/v1/business/edition/team').then(({ data }) => setMembers(data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const invite = async (e) => {
    e.preventDefault();
    await api.post('/api/v1/business/edition/team/invite', { email, role });
    setEmail('');
    load();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Team & permissions</h1>
      <p className="text-sm text-gray-600">Owner can invite managers and employees. Changes are audit-logged.</p>

      {!write.allowed && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Only the business owner can invite or manage team members.
        </p>
      )}
      <form onSubmit={invite} className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={write.disabled}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] disabled:opacity-50"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} disabled={write.disabled} className="border rounded-lg px-3 py-2 min-h-[44px] disabled:opacity-50">
          <option value="manager">Manager</option>
          <option value="employee">Employee</option>
        </select>
        <button type="submit" {...write.props({ className: 'px-4 py-2 bg-purple-600 text-white rounded-lg min-h-[44px]' })}>
          Invite
        </button>
      </form>

      <ul className="divide-y border border-gray-200 rounded-lg bg-white">
        {members.length === 0 && (
          <li className="p-4 text-sm text-gray-500">No team members yet.</li>
        )}
        {members.map((m) => (
          <li key={m.id} className="p-4 flex justify-between gap-2 text-sm">
            <span>{m.invited_email || m.member_user_id}</span>
            <span className="text-gray-500 capitalize">{m.role} · {m.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
