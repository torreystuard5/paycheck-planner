import { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  Power,
  ToggleLeft,
  ToggleRight,
  Zap,
} from 'lucide-react';
import api from '../../../services/api';
import LoadingSpinner from '../../LoadingSpinner';
import ConfirmDialog from '../../ConfirmDialog';
import CommandCenterPanel, { CommandCenterSectionHeader } from './CommandCenterPanel';

export default function GlobalControlsPanel({ onError }) {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [togglingMaintenance, setTogglingMaintenance] = useState(false);
  const [confirmMaintenance, setConfirmMaintenance] = useState(false);

  const [globalFeatures, setGlobalFeatures] = useState([]);
  const [featuresLoading, setFeaturesLoading] = useState(true);
  const [togglingFeature, setTogglingFeature] = useState(null);

  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const { data } = await api.get('/api/v1/admin/settings');
      const settings = Array.isArray(data) ? data : [];
      const mm = settings.find((s) => s.key === 'maintenance_mode');
      setMaintenanceMode(mm ? mm.value === 'true' : false);
    } catch {
      onError?.('Failed to load system settings.');
    } finally {
      setSettingsLoading(false);
    }
  }, [onError]);

  const fetchGlobalFeatures = useCallback(async () => {
    setFeaturesLoading(true);
    try {
      const { data } = await api.get('/api/v1/admin/global-features');
      setGlobalFeatures(data || []);
    } catch {
      onError?.('Failed to load global feature flags.');
    } finally {
      setFeaturesLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    fetchSettings();
    fetchGlobalFeatures();
  }, [fetchSettings, fetchGlobalFeatures]);

  const doToggleMaintenance = async () => {
    setTogglingMaintenance(true);
    setConfirmMaintenance(false);
    try {
      await api.put('/api/v1/admin/settings/maintenance_mode', {
        value: String(!maintenanceMode),
      });
      setMaintenanceMode(!maintenanceMode);
    } catch {
      onError?.('Failed to update maintenance mode.');
    } finally {
      setTogglingMaintenance(false);
    }
  };

  const handleToggleMaintenance = () => {
    if (!maintenanceMode) {
      setConfirmMaintenance(true);
    } else {
      doToggleMaintenance();
    }
  };

  const toggleGlobalFeature = async (featureKey, currentValue) => {
    setTogglingFeature(featureKey);
    try {
      await api.put(`/api/v1/admin/global-features/${featureKey}`, {
        is_free_for_all: !currentValue,
      });
      await fetchGlobalFeatures();
    } catch {
      onError?.('Failed to toggle feature flag.');
    } finally {
      setTogglingFeature(null);
    }
  };

  const freeForAll = globalFeatures.filter((f) => f.is_free_for_all);
  const tierGated = globalFeatures.filter((f) => !f.is_free_for_all);

  return (
    <>
      <CommandCenterPanel>
        <CommandCenterSectionHeader
          title="Global Controls"
          description="Site-wide overrides that affect all users immediately."
          icon={Power}
        />

        <div className="space-y-6">
          {/* Maintenance */}
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Power className="h-4 w-4 text-gray-600" />
              <span className="text-sm font-semibold text-gray-900">Maintenance Mode</span>
            </div>
            {settingsLoading ? (
              <LoadingSpinner />
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-3 w-3 rounded-full ${maintenanceMode ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}
                  />
                  <span className="text-sm text-gray-700">
                    {maintenanceMode
                      ? 'Non-admin users are blocked from the app.'
                      : 'App is live for all users.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleMaintenance}
                  disabled={togglingMaintenance}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                    maintenanceMode
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  {togglingMaintenance ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : maintenanceMode ? (
                    <ToggleLeft className="h-4 w-4" />
                  ) : (
                    <ToggleRight className="h-4 w-4" />
                  )}
                  {maintenanceMode ? 'Disable maintenance' : 'Enable maintenance'}
                </button>
              </div>
            )}
          </div>

          {/* Feature flags */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-gray-900">Feature Flags</span>
              <span className="text-xs text-gray-500">
                ({freeForAll.length} free for all · {tierGated.length} tier-gated)
              </span>
            </div>
            {featuresLoading ? (
              <LoadingSpinner />
            ) : globalFeatures.length === 0 ? (
              <p className="text-sm text-gray-500">No global feature overrides configured.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {globalFeatures.map((f) => (
                  <div
                    key={f.feature_key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {f.feature_label || f.feature_key}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">{f.tier} tier</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleGlobalFeature(f.feature_key, f.is_free_for_all)}
                      disabled={togglingFeature === f.feature_key}
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                        f.is_free_for_all
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {togglingFeature === f.feature_key ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : f.is_free_for_all ? (
                        'Free for all'
                      ) : (
                        'Tier only'
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CommandCenterPanel>

      <ConfirmDialog
        isOpen={confirmMaintenance}
        onClose={() => setConfirmMaintenance(false)}
        onConfirm={doToggleMaintenance}
        title="Enable Maintenance Mode"
        message="This will prevent all non-admin users from accessing the app. Are you sure?"
        confirmText="Enable"
        danger
      />
    </>
  );
}
