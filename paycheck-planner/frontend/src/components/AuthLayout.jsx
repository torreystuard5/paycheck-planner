import logo from '../assets/PayDrift-Logo.jpg';
import AuthInfoPanel from './AuthInfoPanel';

export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Banner */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-center gap-3">
          <img src={logo} alt="PayDrift logo" className="h-10 w-auto" />
          <h1 className="text-2xl font-bold text-gray-900">PayDrift</h1>
        </div>
      </div>

      {/* Two-column content */}
      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* Left card — What is PayDrift? */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex flex-col">
            <AuthInfoPanel />
          </div>

          {/* Right card — Form */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex flex-col">
            {children}
          </div>
        </div>
      </div>

      {/* Bottom trust line */}
      <div className="py-4 text-center">
        <p className="text-sm text-gray-500">Free to use. No credit card required.</p>
      </div>
    </div>
  );
}
