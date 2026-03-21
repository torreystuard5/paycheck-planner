import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function Disclaimer() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-500 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to Paycheck Planner
        </Link>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Disclaimer</h1>
          <p className="text-sm text-gray-500 mb-8">Effective Date: March 2026</p>

          <div className="space-y-8 text-gray-700 leading-relaxed">
            <p>
              The following disclaimer applies to your use of Paycheck Planner, operated by SP Software Solutions LLC
              (&ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). Please read this
              disclaimer carefully before using the Service.
            </p>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Not Financial Advice</h2>
              <p>
                Paycheck Planner is a budgeting, planning, and organizational tool designed to help you manage your personal
                finances. The Service is NOT a financial advisor, investment advisor, tax advisor, or credit counselor.
                Nothing in the Service — including paycheck allocation plans, debt payoff projections, credit efficiency
                scores, savings calculations, or any other output — should be construed as financial, investment, tax, or
                legal advice. The information and tools provided are for general informational and organizational purposes
                only. Always consult with a qualified financial professional, certified financial planner, accountant, or
                attorney before making financial decisions. SP Software Solutions LLC is not a registered financial advisor
                and does not hold any financial services licenses.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Accuracy of Calculations</h2>
              <p>
                All calculations, projections, and estimates provided by the Service — including but not limited to debt
                payoff timelines, credit efficiency scores, paycheck allocation plans, bill scheduling, and savings goal
                projections — are based solely on the data you enter and the mathematical formulas applied by the software.
                These are estimates only and actual results may vary due to factors such as changes in interest rates,
                additional fees, missed payments, changes in income, tax implications, and other variables not accounted for
                by the Service. SP Software Solutions LLC makes no guarantees about the accuracy, completeness, or reliability
                of any calculations or projections. You should independently verify all calculations before relying on them
                for financial decisions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Early Access</h2>
              <p>
                Paycheck Planner is currently in an early access phase. This means the Service is under active development
                and has not yet reached its final production-ready state. During this period, you may encounter software bugs,
                incomplete features, user interface changes, data processing errors, or temporary service interruptions.
                While we take reasonable steps to ensure reliability, we cannot guarantee uninterrupted or error-free
                operation of the Service during early access. Features may be added, modified, or removed without prior notice.
                We strongly recommend maintaining your own records and not relying solely on Paycheck Planner as your only
                source of financial tracking during this period.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">4. No Guarantee of Results</h2>
              <p>
                Using Paycheck Planner does not guarantee any particular financial outcomes. The Service provides tools to
                help you organize and plan your finances, but the results you achieve depend entirely on your own financial
                decisions, discipline, circumstances, and factors outside our control. Past financial performance or projected
                outcomes shown within the Service are not indicative of future results. SP Software Solutions LLC makes no
                representations or warranties regarding the financial outcomes you may achieve through the use of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">5. User Responsibility</h2>
              <p>
                You are solely responsible for your own financial decisions. By using the Service, you acknowledge that all
                financial choices you make — whether informed by the Service&apos;s tools, projections, or data — are your own.
                You agree to verify all calculations, due dates, payment amounts, and other financial information
                independently before taking action. SP Software Solutions LLC is not responsible for any financial losses,
                missed payments, late fees, credit score changes, or other consequences arising from your use of or reliance
                on the Service. It is your responsibility to ensure the accuracy of the data you enter into the Service and
                to keep your financial records up to date.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">6. External Links</h2>
              <p>
                The Service may contain links to third-party websites or services, including Ko-fi for donations and other
                external resources. These links are provided for your convenience only. SP Software Solutions LLC does not
                endorse, control, or assume responsibility for the content, privacy policies, or practices of any third-party
                websites or services. Accessing third-party links is at your own risk, and you should review the terms and
                privacy policies of any third-party site you visit. We are not liable for any damage or loss caused by or in
                connection with your use of any third-party content, goods, or services.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Contact</h2>
              <p>
                If you have any questions about this Disclaimer, please contact us at:{' '}
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
