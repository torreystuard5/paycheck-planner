import { Link } from 'react-router-dom';
import { Clock, ArrowLeft } from 'lucide-react';

export default function BusinessComingSoon({ title, description }) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
            <Clock className="w-3 h-3" />
            Coming Soon
          </span>
        </div>
        <p className="text-gray-600 mt-2">{description}</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <div className="bg-purple-50 w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Clock className="w-8 h-8 text-purple-500" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          {title} is coming soon
        </h2>
        <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
          We're working hard to bring {title.toLowerCase()} features to PayDrift Business.
          Stay tuned for updates!
        </p>
        <Link
          to="/settings"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Switch to Personal Mode
        </Link>
      </div>
    </div>
  );
}
