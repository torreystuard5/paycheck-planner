import { afterEach, describe, expect, it, vi } from 'vitest';
import api from './api';

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

describe('authentication failures', () => {
  it('does not leave later requests queued when a refresh token is missing', async () => {
    vi.stubGlobal('window', { location: { href: '', protocol: 'http:' } });
    const adapter = vi.fn(async (config) => {
      throw { config, response: { status: 401 } };
    });
    await expect(api.get('/test', { adapter })).rejects.toMatchObject({ response: { status: 401 } });
    await expect(api.get('/test', { adapter })).rejects.toMatchObject({ response: { status: 401 } });
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(window.location.href).toBe('/login');
  });
});

it('never restores an old refresh response after logout or account switching', async () => {
  const axios = (await import('axios')).default;
  vi.stubGlobal('window', { location: { href: '', protocol: 'http:' } });
  localStorage.setItem('access_token','old-access');
  localStorage.setItem('refresh_token','old-refresh');
  let finishRefresh;
  const started = new Promise((resolve) => {
    vi.spyOn(axios,'post').mockImplementation(() => {
      resolve();
      return new Promise((finish) => { finishRefresh=finish; });
    });
  });
  const adapter = vi.fn(async (config) => { throw { config,response:{status:401} }; });
  const result = api.get('/private',{adapter});
  const rejected = expect(result).rejects.toMatchObject({response:{status:401}});
  await started;
  localStorage.setItem('access_token','new-account-access');
  localStorage.setItem('refresh_token','new-account-refresh');
  finishRefresh({data:{access_token:'stale-access',refresh_token:'stale-refresh'}});
  await rejected;
  expect(localStorage.getItem('access_token')).toBe('new-account-access');
  expect(localStorage.getItem('refresh_token')).toBe('new-account-refresh');
  expect(window.location.href).toBe('');
  expect(adapter).toHaveBeenCalledOnce();
  vi.restoreAllMocks();
});
