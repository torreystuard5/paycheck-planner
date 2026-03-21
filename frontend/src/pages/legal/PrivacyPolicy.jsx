import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-500 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to Paycheck Planner
        </Link>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-8">Effective Date: March 2026</p>

          <div className="space-y-8 text-gray-700 leading-relaxed">
            <p>
              SP Software Solutions LLC (&ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates
              Paycheck Planner (the &ldquo;Service&rdquo;). This Privacy Policy explains how we collect, use, disclose, and
              safeguard your information when you use our Service. Please read this policy carefully. By using the Service,
              you consent to the data practices described in this policy.
            </p>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Information We Collect</h2>
              <p className="mb-3">We collect information that you provide directly to us and information collected automatically when you use the Service:</p>

              <h3 className="text-lg font-medium text-gray-900 mb-2">Account Information</h3>
              <p className="mb-3">
                When you create an account, we collect your first and last name, email address, and password. This information is
                required to create and manage your account and to authenticate your identity when you log in.
              </p>

              <h3 className="text-lg font-medium text-gray-900 mb-2">Financial Data You Enter</h3>
              <p className="mb-3">
                To provide the Service, we store the financial information you voluntarily enter, including but not limited to:
                income sources and amounts, bill names and amounts, debt balances and interest rates, savings goals and
                contributions, payment records, pay schedule information, and currency preferences. This data is entered by you
                and used solely to generate your paycheck plans and financial reports.
              </p>

              <h3 className="text-lg font-medium text-gray-900 mb-2">Usage Data</h3>
              <p className="mb-3">
                We may collect information about how you access and use the Service, including the pages you visit, features you
                use, actions you take, and the time and date of your visits. This information helps us understand how users
                interact with the Service and improve its functionality.
              </p>

              <h3 className="text-lg font-medium text-gray-900 mb-2">Device Information</h3>
              <p>
                We may collect information about the device you use to access the Service, including the type of device, operating
                system, browser type and version, and device identifiers. This information helps us optimize the Service for
                different devices and troubleshoot technical issues.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">2. How We Use Information</h2>
              <p className="mb-3">We use the information we collect for the following purposes:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>To provide, maintain, and operate the Service, including generating paycheck allocation plans, tracking bills and debts, and producing financial reports</li>
                <li>To create and manage your user account and authenticate your identity</li>
                <li>To send bill due date reminders and payment notifications (if you have opted in to receive them)</li>
                <li>To respond to your support requests, comments, and questions</li>
                <li>To analyze usage trends and improve the features, functionality, and user experience of the Service</li>
                <li>To communicate with you about updates, security alerts, and changes to our policies</li>
                <li>To detect, prevent, and address technical issues, fraud, or security concerns</li>
                <li>To comply with applicable legal obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Data Storage &amp; Security</h2>
              <p>
                Your data is stored securely using industry-standard encryption methods both in transit (TLS/SSL) and at rest.
                Our Service is hosted on secure cloud infrastructure with access restricted to authorized personnel only. We
                implement appropriate technical and organizational measures to protect your personal information against
                unauthorized access, alteration, disclosure, or destruction. These measures include encrypted password storage
                using bcrypt hashing, secure JWT-based authentication tokens, and regular security reviews. However, no method
                of electronic storage or transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Ko-fi Donations</h2>
              <p>
                If you choose to support Paycheck Planner through Ko-fi, your donation is processed entirely by Ko-fi. We
                receive your email address and donation amount from Ko-fi to credit your account with any applicable supporter
                benefits (such as early access features or promo codes). We do not receive or store your payment card details.
                Ko-fi&apos;s processing of your payment is governed by Ko-fi&apos;s own Privacy Policy and Terms of Service, which we
                encourage you to review.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Third-Party Services</h2>
              <p className="mb-3">We use the following third-party services in connection with the Service:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Ko-fi</strong> — Processes voluntary donations from supporters. Ko-fi may collect payment and account information subject to its own privacy policy.</li>
                <li><strong>Email Service Provider</strong> — We use a third-party email service to send transactional emails such as bill reminders, payment confirmations, and support responses.</li>
                <li><strong>Cloud Hosting Provider</strong> — The Service is hosted on cloud infrastructure that stores and processes your data on our behalf, subject to strict data processing agreements.</li>
              </ul>
              <p className="mt-3">
                We do not sell, rent, or trade your personal information to any third party for marketing or advertising purposes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Cookies</h2>
              <p>
                We use essential cookies and local storage to maintain your authentication session and remember your preferences
                (such as date format settings and banner dismissal states). These are required for the Service to function
                properly. For more details about the specific cookies and storage mechanisms we use, please see
                our <Link to="/cookies" className="text-blue-600 hover:text-blue-500">Cookie Policy</Link>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Your Rights</h2>
              <p className="mb-3">You have the following rights regarding your personal information:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Access:</strong> You can access your personal and financial data at any time through the Service&apos;s dashboard and settings pages.</li>
                <li><strong>Correction:</strong> You can update or correct your information through your account settings at any time.</li>
                <li><strong>Deletion:</strong> You may request deletion of your account and all associated data by contacting us. Upon deletion, your data will be permanently removed within 30 days.</li>
                <li><strong>Export:</strong> You can export your financial data at any time using the built-in Excel and CSV export features available in the Service.</li>
                <li><strong>Opt-Out:</strong> You may opt out of non-essential communications (such as bill reminders and payment notifications) through your notification settings.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Data Retention</h2>
              <p>
                We retain your personal information and financial data for as long as your account remains active and as
                necessary to provide you with the Service. If you choose to delete your account, we will permanently delete
                your data from our active systems within 30 days of your request. Some information may be retained in
                encrypted backups for up to 90 days after deletion for disaster recovery purposes, after which it will be
                permanently purged. We may also retain certain information as required by law or for legitimate business
                purposes, such as resolving disputes or enforcing our agreements.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Children&apos;s Privacy</h2>
              <p>
                The Service is not intended for children under the age of 13. We do not knowingly collect personal information
                from children under 13. If we become aware that we have collected personal information from a child under 13
                without parental consent, we will take steps to delete that information promptly. If you believe that a child
                under 13 has provided us with personal information, please contact us at{' '}
                <a href="mailto:spsoftwaresolutionsllc@gmail.com" className="text-blue-600 hover:text-blue-500">
                  spsoftwaresolutionsllc@gmail.com
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time to reflect changes in our practices, technology, or legal
                requirements. If we make material changes, we will notify you by posting a prominent notice within the Service
                or by sending an email to the address associated with your account at least 30 days before the changes take
                effect. We encourage you to review this policy periodically. Your continued use of the Service after any
                changes to this Privacy Policy constitutes your acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">11. Contact</h2>
              <p>
                If you have any questions or concerns about this Privacy Policy or our data practices, please contact us at:{' '}
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
