import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-500 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to Paycheck Planner
        </Link>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
          <p className="text-sm text-gray-500 mb-8">Effective Date: March 2026</p>

          <div className="space-y-8 text-gray-700 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h2>
              <p>
                By accessing or using Paycheck Planner (the &ldquo;Service&rdquo;), you agree to be bound by these Terms of Service
                (&ldquo;Terms&rdquo;). If you do not agree to all of these Terms, you may not access or use the Service. These Terms
                constitute a legally binding agreement between you and SP Software Solutions LLC (&ldquo;Company,&rdquo; &ldquo;we,&rdquo;
                &ldquo;us,&rdquo; or &ldquo;our&rdquo;). We reserve the right to update or modify these Terms at any time, and your
                continued use of the Service following any changes constitutes your acceptance of those changes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Description of Service</h2>
              <p>
                Paycheck Planner is a budgeting and financial planning tool operated by SP Software Solutions LLC. The Service
                allows users to track income, bills, debts, and savings goals, generate paycheck allocation plans, record
                payments, and view financial reports. The Service is designed to help you organize your personal finances and
                is provided as a planning and organizational tool only. Paycheck Planner does not provide financial advice,
                investment recommendations, or tax guidance.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">3. User Accounts</h2>
              <p>
                To use the Service, you must create an account by providing accurate and complete information, including your
                name, email address, and pay schedule details. You are responsible for maintaining the confidentiality of your
                login credentials and for all activities that occur under your account. You agree to notify us immediately of
                any unauthorized use of your account or any other breach of security. SP Software Solutions LLC will not be
                liable for any loss or damage arising from your failure to protect your account credentials. You must be at
                least 18 years of age to create an account and use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Acceptable Use</h2>
              <p className="mb-3">
                You agree to use the Service only for its intended purpose of personal financial planning and budgeting. You
                agree not to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Use the Service for any unlawful purpose or in violation of any applicable local, state, national, or international law</li>
                <li>Attempt to gain unauthorized access to the Service, other user accounts, or any computer systems or networks connected to the Service</li>
                <li>Interfere with or disrupt the integrity or performance of the Service or the data contained therein</li>
                <li>Upload, transmit, or distribute any viruses, malware, or other harmful computer code</li>
                <li>Use the Service to store or transmit content that is infringing, defamatory, or otherwise objectionable</li>
                <li>Attempt to reverse engineer, decompile, or disassemble any portion of the Service</li>
                <li>Use automated scripts, bots, or scrapers to access or collect data from the Service</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Intellectual Property</h2>
              <p>
                All content, features, and functionality of the Service — including but not limited to text, graphics, logos,
                icons, images, audio clips, software, and the compilation thereof — are the exclusive property of SP Software
                Solutions LLC or its licensors and are protected by United States and international copyright, trademark,
                patent, trade secret, and other intellectual property or proprietary rights laws. You may not copy, modify,
                distribute, sell, or lease any part of the Service or its content, nor may you reverse engineer or attempt to
                extract the source code of the software, unless applicable laws prohibit these restrictions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">6. User Data</h2>
              <p>
                You retain full ownership of the financial data, personal information, and any other content you enter into
                the Service (&ldquo;User Data&rdquo;). SP Software Solutions LLC claims no ownership rights over your User Data.
                By using the Service, you grant us a limited license to use, process, and store your User Data solely for the
                purpose of providing and improving the Service. You may export your data at any time using the built-in
                Excel/CSV export feature, and you may request deletion of your data by deleting your account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Early Access Disclaimer</h2>
              <p>
                Paycheck Planner is currently in early access. This means the Service is still under active development.
                Features may be added, modified, or removed at any time without prior notice. While we strive to maintain
                reliability, you may experience bugs, incomplete features, or service interruptions during this period. Early
                access features, including any promotional offers or supporter benefits, are subject to change. We appreciate
                your participation during this phase and welcome your feedback to help improve the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Disclaimer of Warranties</h2>
              <p>
                THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR
                IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
                TITLE, AND NON-INFRINGEMENT. SP SOFTWARE SOLUTIONS LLC DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED,
                ERROR-FREE, SECURE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS. WE DO NOT WARRANT THE ACCURACY, RELIABILITY,
                OR COMPLETENESS OF ANY INFORMATION PROVIDED THROUGH THE SERVICE, INCLUDING FINANCIAL CALCULATIONS, PROJECTIONS,
                OR RECOMMENDATIONS. YOUR USE OF THE SERVICE IS AT YOUR OWN RISK.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Limitation of Liability</h2>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL SP SOFTWARE SOLUTIONS LLC, ITS DIRECTORS,
                EMPLOYEES, PARTNERS, AGENTS, SUPPLIERS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
                CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION LOSS OF PROFITS, DATA, USE, GOODWILL, OR
                OTHER INTANGIBLE LOSSES, RESULTING FROM (A) YOUR ACCESS TO OR USE OF OR INABILITY TO ACCESS OR USE THE SERVICE;
                (B) ANY CONDUCT OR CONTENT OF ANY THIRD PARTY ON THE SERVICE; (C) ANY CONTENT OBTAINED FROM THE SERVICE; OR
                (D) UNAUTHORIZED ACCESS, USE, OR ALTERATION OF YOUR TRANSMISSIONS OR CONTENT. IN NO EVENT SHALL OUR TOTAL
                LIABILITY TO YOU FOR ALL CLAIMS EXCEED THE AMOUNT YOU HAVE PAID TO SP SOFTWARE SOLUTIONS LLC IN THE TWELVE (12)
                MONTHS PRECEDING THE EVENT GIVING RISE TO THE LIABILITY, OR FIFTY DOLLARS ($50.00), WHICHEVER IS GREATER.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Termination</h2>
              <p>
                We may terminate or suspend your account and access to the Service immediately, without prior notice or
                liability, for any reason, including without limitation if you breach these Terms. Upon termination, your
                right to use the Service will immediately cease. You may delete your account at any time through the Service
                or by contacting us. All provisions of these Terms which by their nature should survive termination shall
                survive, including ownership provisions, warranty disclaimers, indemnity, and limitations of liability.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">11. Changes to Terms</h2>
              <p>
                We reserve the right to modify or replace these Terms at any time at our sole discretion. If a revision is
                material, we will provide at least 30 days&apos; notice prior to any new terms taking effect, either by posting a
                notice within the Service or by sending an email to the address associated with your account. What constitutes
                a material change will be determined at our sole discretion. By continuing to access or use the Service after
                any revisions become effective, you agree to be bound by the revised Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">12. Governing Law</h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of the State of Tennessee, United
                States of America, without regard to its conflict of law provisions. Any legal action or proceeding arising
                out of or relating to these Terms or the Service shall be brought exclusively in the state or federal courts
                located in the State of Tennessee, and you consent to the personal jurisdiction of such courts.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">13. Contact</h2>
              <p>
                If you have any questions about these Terms of Service, please contact us at:{' '}
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
