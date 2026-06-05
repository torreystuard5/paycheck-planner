import { useCallback, useEffect, useState } from 'react';
import { businessData } from '../services/businessApi';

/**
 * Business workspace profile (name, tagline, fiscal year, mileage) from owner settings.
 */
export function useBusinessProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await businessData.getSettings();
      setProfile(data);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    profile,
    loading,
    refresh,
    businessName: profile?.business_name || null,
    businessTagline: profile?.business_tagline || null,
  };
}
