import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function CookiePolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-500 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to PayDrift
        </Link>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Cookie Policy</h1>
          <p className="text-sm text-gray-500 mb-8">Effective Date: March 2026</p>

          <div className="space-y-8 text-gray-700 leading-relaxed">
            <p>
              This Cookie Policy explains how SP Software Solutions LLC (&ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo;
              or &ldquo;our&rdquo;) uses cookies and similar technologies when you use PayDrift (the &ldquo;Service&rdquo;).
              This policy should be read together with our <Link to="/privacy" className="text-blue-600 hover:text-blue-500">Privacy Policy</Link>.
            </p>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">1. What Are Cookies</h2>
              <p>
                Cookies are small text files that are stored on your device (computer, tablet, or mobile phone) when you visit
                a website or use a web application. Cookies are widely used to make websites work more efficiently, provide a
                better user experience, and give site owners useful information about how their sites are being used. In
                addition to traditional cookies, we also use browser local storage, which functions similarly to cookies by
                storing small amounts of data on your device to remember settings and preferences.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Essential Cookies</h2>
              <p className="mb-3">
                These cookies and storage mechanisms are strictly necessary for the Service to function. Without them, you
                would not be able to log in or use core features. We use the following essential storage:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded-lg">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-4 py-2 border-b border-gray-200 font-medium text-gray-900">Name</th>
                      <th className="text-left px-4 py-2 border-b border-gray-200 font-medium text-gray-900">Purpose</th>
                      <th className="text-left px-4 py-2 border-b border-gray-200 font-medium text-gray-900">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-4 py-2 border-b border-gray-100 font-mono text-xs">access_token</td>
                      <td className="px-4 py-2 border-b border-gray-100">JWT authentication token used to verify your identity and keep you logged in</td>
                      <td className="px-4 py-2 border-b border-gray-100">Session</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 border-b border-gray-100 font-mono text-xs">refresh_token</td>
                      <td className="px-4 py-2 border-b border-gray-100">Token used to obtain a new access token when your current session expires, enabling seamless login persistence</td>
                      <td className="px-4 py-2 border-b border-gray-100">Persistent</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3">
                These tokens are stored in your browser&apos;s local storage and are required for the application to authenticate
                your requests. Removing or blocking these will prevent you from logging in or using the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Preference Cookies</h2>
              <p className="mb-3">
                These cookies and local storage items remember choices you make to give you a better, more personalized
                experience. They include:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Date format preference</strong> — Remembers your preferred date display format (e.g., MM/DD/YYYY, DD/MM/YYYY, or YYYY-MM-DD) so dates appear in your chosen format throughout the application.</li>
                <li><strong>Early access banner dismissal</strong> — Remembers if you have dismissed the early access notification banner so it does not reappear on subsequent visits.</li>
                <li><strong>Theme and display settings</strong> — Stores any display preferences you have configured to ensure a consistent visual experience across sessions.</li>
              </ul>
              <p className="mt-3">
                These preference items are stored in local storage and are tied to your browser. Clearing your browser data
                will reset these preferences to their defaults.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Analytics Cookies</h2>
              <p>
                At the current time, PayDrift does not use any analytics cookies or third-party tracking scripts. We
                do not use services such as Google Analytics, Mixpanel, or similar tools. If we introduce analytics cookies in
                the future, we will update this Cookie Policy and notify you in advance. Any future analytics implementation
                will be designed to respect your privacy and will offer an opt-out mechanism where required by law.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Third-Party Cookies</h2>
              <p>
                If you visit Ko-fi through a link in the Service to make a donation or support PayDrift, Ko-fi may
                set its own cookies on your device. These third-party cookies are governed by Ko-fi&apos;s own cookie and privacy
                policies, and we have no control over them. We encourage you to review Ko-fi&apos;s policies before making a
                donation. Other than Ko-fi links, the Service does not embed third-party content or widgets that would set
                additional cookies.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Managing Cookies</h2>
              <p className="mb-3">
                You can manage or delete cookies and local storage through your browser settings. Most browsers allow you to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>View and delete individual cookies and local storage items</li>
                <li>Block cookies from specific or all websites</li>
                <li>Set your browser to notify you when a cookie is being set</li>
                <li>Clear all cookies and local storage when you close your browser</li>
              </ul>
              <p className="mt-3">
                Please note that if you block or delete essential cookies (access_token and refresh_token), you will be unable
                to log in to the Service or use its features. Blocking preference cookies will not prevent you from using the
                Service, but your settings and preferences will not be remembered between sessions.
              </p>
              <p className="mt-3">
                For instructions on managing cookies in popular browsers, visit your browser&apos;s help documentation or settings page.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Contact</h2>
              <p>
                If you have any questions about our use of cookies or this Cookie Policy, please contact us at:{' '}
                <a href="mailto:spsoftwaresolutionsllc@gmail.com" className="text-blue-600 hover:text-blue-500">
                  spsoftwaresolutionsllc@gmail.com
                </a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
