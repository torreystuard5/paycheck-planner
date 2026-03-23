import { DollarSign, Users, Target, Lock, Smartphone } from 'lucide-react';

const features = [
  {
    icon: DollarSign,
    title: 'Track Income & Bills',
    desc: 'See where your money goes each paycheck',
  },
  {
    icon: Users,
    title: 'Household Budgeting',
    desc: 'Split bills, track who paid, and plan together',
  },
  {
    icon: Target,
    title: 'Savings & Debt Goals',
    desc: 'Set targets and watch your progress',
  },
  {
    icon: Lock,
    title: 'Secure Vault',
    desc: 'Store private notes and passwords behind a PIN',
  },
  {
    icon: Smartphone,
    title: 'Works on Any Device',
    desc: 'Phone, tablet, or computer',
  },
];

export default function AuthInfoPanel() {
  return (
    <div className="flex flex-col flex-1">
      <h2 className="text-xl font-semibold text-gray-900 mb-3">
        Take Control of Your Finances
      </h2>

      <p className="text-gray-600 mb-6 text-sm">
        A free personal finance app that helps you and your household manage
        money — together or on your own.
      </p>

      <ul className="space-y-4 flex-1">
        {features.map((f) => (
          <li key={f.title} className="flex items-start gap-3">
            <f.icon
              aria-hidden="true"
              className="w-5 h-5 text-blue-600 shrink-0 mt-0.5"
            />
            <div>
              <span className="font-semibold text-gray-900 text-sm">{f.title}</span>
              <p className="text-sm text-gray-600">{f.desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
