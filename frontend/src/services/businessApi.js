import api from './api';

/** Edition access, activation, and team management */
export const businessEdition = {
  getAccess: () => api.get('/api/v1/business/edition/access'),
  activate: (acceptTrial = false) =>
    api.post('/api/v1/business/edition/activate', { accept_trial: acceptTrial }),
  enterPersonal: () => api.post('/api/v1/business/edition/enter-personal'),
  listTeam: () => api.get('/api/v1/business/edition/team'),
  inviteTeam: (body) => api.post('/api/v1/business/edition/team/invite', body),
  updateTeamMember: (memberId, body) =>
    api.patch(`/api/v1/business/edition/team/${memberId}`, body),
  revokeTeamMember: (memberId) =>
    api.patch(`/api/v1/business/edition/team/${memberId}`, { status: 'removed' }),
  getPermissionsMatrix: () => api.get('/api/v1/business/edition/team/permissions-matrix'),
  getTeamAuditLog: (limit = 50) =>
    api.get('/api/v1/business/edition/team/audit-log', { params: { limit } }),
};

export const activateBusinessEdition = (acceptTrial) => businessEdition.activate(acceptTrial);
export const enterPersonalEdition = () => businessEdition.enterPersonal();

/** Core business data endpoints */
export const businessData = {
  getDashboard: () => api.get('/api/v1/business/dashboard'),
  getReportsOverview: (params) => api.get('/api/v1/business/reports/overview', { params }),
  getReportsAnalytics: (months = 12) =>
    api.get('/api/v1/business/reports/analytics', { params: { months } }),
  getSettings: () => api.get('/api/v1/business/settings'),
  patchSettings: (body) => api.patch('/api/v1/business/settings', body),
  getTaxSummary: (year) => api.get('/api/v1/business/tax-prep/summary', { params: { year } }),
};

/** Authenticated file download (fixes window.open without JWT). */
export async function downloadAuthenticatedExport(path, filename) {
  const response = await api.get(path, { responseType: 'blob' });
  const blob = new Blob([response.data]);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function downloadBusinessTaxCsv(year) {
  return downloadAuthenticatedExport(
    `/api/v1/business/tax-prep/export.csv?year=${year}`,
    `business-tax-${year}.csv`,
  );
}
