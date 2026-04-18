import { Wrench } from 'lucide-react';

export default function MaintenanceOverlay() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-50">
      <div className="text-center px-6 max-w-md">
        <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-6">
          <Wrench className="h-8 w-8 text-amber-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Under Maintenance</h1>
        <p className="text-gray-600 leading-relaxed mb-6">
          PayDrift is currently undergoing scheduled maintenance. We'll be back shortly. Thank you for your patience.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
