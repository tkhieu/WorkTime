import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { useApiHealth } from '@/api';

export function SettingsForm() {
  const { data: health, isLoading } = useApiHealth();
  const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787';

  return (
    <div className="space-y-6">
      {/* API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>API Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                API Endpoint
              </label>
              <div className="bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-300 font-mono text-sm">
                {apiUrl}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">Status:</span>
              {isLoading ? (
                <span className="text-sm text-slate-500">Checking...</span>
              ) : health?.status === 'ok' ? (
                <span className="flex items-center gap-1 text-sm text-emerald-400">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                  Connected
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-red-400">
                  <span className="w-2 h-2 bg-red-400 rounded-full" />
                  Disconnected
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Version</span>
              <span className="text-slate-200">0.1.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Environment</span>
              <span className="text-slate-200">
                {import.meta.env.MODE}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Build Date</span>
              <span className="text-slate-200">
                {new Date().toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Authentication (Placeholder) */}
      <Card>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-400 text-sm mb-4">
            Login with GitHub to sync your tracking data across devices.
          </p>
          <button
            disabled
            className="px-4 py-2 bg-slate-700 text-slate-500 rounded-md cursor-not-allowed"
          >
            Login with GitHub (Coming Soon)
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
