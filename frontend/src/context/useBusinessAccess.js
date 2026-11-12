import { useContext } from 'react';
import { BusinessAccessContext } from './BusinessAccessContextValue';

export function useBusinessAccess() {
  const ctx = useContext(BusinessAccessContext);
  if (!ctx) {
    throw new Error('useBusinessAccess must be used within a BusinessAccessProvider');
  }
  return ctx;
}
