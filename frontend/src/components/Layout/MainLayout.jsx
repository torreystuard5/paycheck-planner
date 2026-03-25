import { useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import EarlyAccessBanner from '../EarlyAccessBanner';
import AnnouncementBanner from '../AnnouncementBanner';
import Footer from '../Footer';
import logo from '../../assets/PayDrift-Logo.jpg';

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <EarlyAccessBanner />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Mobile header */}
        <div className="sticky top-0 z-30 flex items-center h-14 bg-white border-b border-gray-200 px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-gray-500 hover:text-gray-700"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="ml-3 flex items-center gap-2">
            <img src={logo} alt="PayDrift logo" className="h-8 w-auto" />
            <span className="text-sm font-semibold text-gray-900">PayDrift</span>
          </Link>
        </div>

        <main className="p-4 md:p-6 overflow-x-hidden max-w-full">
          <AnnouncementBanner />
          <Outlet />
        </main>
        <div className="px-4 md:px-6">
          <Footer />
        </div>
      </div>
    </div>
  );
}
