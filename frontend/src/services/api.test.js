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
