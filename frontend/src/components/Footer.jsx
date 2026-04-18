import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="py-4 border-t border-gray-200 mt-8">
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mb-2">
        <Link to="/terms" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
          Terms of Service
        </Link>
        <Link to="/privacy" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
          Privacy Policy
        </Link>
        <Link to="/cookies" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
          Cookie Policy
        </Link>
        <Link to="/disclaimer" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
          Disclaimer
        </Link>
      </div>
      <p className="text-xs text-gray-400 text-center">
        &copy; 2026 SP Software Solutions LLC. All rights reserved.
      </p>
    </footer>
  );
}
