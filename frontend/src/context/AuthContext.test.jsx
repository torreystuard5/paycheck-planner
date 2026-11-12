import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthContext';
import { useAuth } from './useAuth';
import api from '../services/api';
vi.mock('../services/api', () => ({ default:{get:vi.fn(),post:vi.fn()},onTosRequired:vi.fn(),setMaintenanceModeForced:vi.fn(),MAINTENANCE_MODE_DETAIL:'maintenance' }));
function Session() { const {user,logout}=useAuth(); return <button onClick={logout}>{user ? 'Logout' : 'Logged out'}</button>; }
beforeEach(() => {localStorage.clear();sessionStorage.clear();vi.clearAllMocks();});
it('captures the bearer token before clearing storage so logout can revoke the server session',async()=>{
  localStorage.setItem('access_token','original-access');localStorage.setItem('refresh_token','original-refresh');localStorage.setItem('app_version','0.9.0');
  api.get.mockImplementation((url)=>Promise.resolve({data:url.endsWith('/version')?{version:'0.9.0'}:url.endsWith('/me')?{id:'alice',tos_version:'1.0'}:{}}));
  api.post.mockResolvedValue({data:{}});
  render(<AuthProvider><Session /></AuthProvider>);
  fireEvent.click(await screen.findByText('Logout'));
  expect(api.post).toHaveBeenCalledWith('/api/v1/auth/logout',null,{headers:{Authorization:'Bearer original-access'}});
  expect(localStorage.getItem('access_token')).toBeNull();
  expect(localStorage.getItem('refresh_token')).toBeNull();
});
