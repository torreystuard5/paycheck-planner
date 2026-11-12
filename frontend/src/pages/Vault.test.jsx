import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Vault from './Vault';
import api from '../services/api';

vi.mock('../services/api', () => ({default: {get:vi.fn(),post:vi.fn()}}));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

it('reads PIN status without a failed unlock and does not refetch notes on countdown ticks', async () => {
  vi.useFakeTimers();
  api.get.mockImplementation((url) => Promise.resolve({data:url.endsWith('/pin/status') ? {pin_configured:true,lock_timeout:5} : []}));
  api.post.mockResolvedValue({data:{notes_session_token:'synthetic',expires_in:300}});
  await act(async () => { render(<Vault />); });
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.change(document.querySelector('input[type=password]'), {target:{value:'123456'}});
  await act(async () => { fireEvent.click(screen.getByRole('button', {name:/unlock/i})); });
  const requests = api.get.mock.calls.filter(([url])=>url.startsWith('/api/v1/notes?')).length;
  expect(requests).toBe(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
  expect(api.get.mock.calls.filter(([url])=>url.startsWith('/api/v1/notes?'))).toHaveLength(requests);
});
