import { DollarSign, Users, Target, Lock, Smartphone } from 'lucide-react';
import logo from '../assets/PayDrift-Logo.jpg';

const features = [
  {
    icon: DollarSign,
    title: 'Track Income & Bills',
    desc: 'See where your money goes each paycheck',
  },
  {
    icon: Users,
    title: 'Household Budgeting',
    desc: 'Split bills, track who paid, and stay on the same page',
  },
  {
    icon: Target,
    title: 'Savings & Debt Goals',
    desc: 'Set targets and watch your progress',
  },
  {
    icon: Lock,
    title: 'Secure Vault',
    desc: 'Keep private notes and passwords behind a PIN',
  },
  {
    icon: Smartphone,
    title: 'Works on Any Device',
    desc: 'Use PayDrift on your phone, tablet, or computer',
  },
];

export default function AuthInfoPanel() {
  return (
    <div className="flex flex-col items-center lg:items-start text-center lg:text-left px-6 py-10 lg:px-12 lg:py-0">
      <img src={logo} alt="PayDrift logo" className="h-16 w-auto mb-6" />

      <h1 className="text-3xl font-bold text-gray-900 mb-3">
        Take Control of Your Finances
      </h1>

      <p className="text-gray-600 mb-8 max-w-md">
        PayDrift is a free personal finance app that helps you and your household
        manage money by tracking income, bills, savings, and shared expenses in
        one place.
      </p>

      <ul className="space-y-4 mb-8 w-full max-w-md">
        {features.map((f) => (
          <li key={f.title} className="flex items-start gap-3">
            <f.icon
              aria-hidden="true"
              className="w-5 h-5 text-blue-600 shrink-0 mt-0.5"
            />
            <div>
              <span className="font-semibold text-gray-900">{f.title}</span>
              <p className="text-sm text-gray-600">{f.desc}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-sm text-gray-500">
        Free to use. No credit card required.
      </p>
    </div>
  );
}
