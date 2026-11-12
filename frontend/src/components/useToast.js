import { useContext } from 'react';
import { ToastContext } from '../context/ToastContextValue';
const noop = () => {};
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return noop;
  }
  return ctx;
}
