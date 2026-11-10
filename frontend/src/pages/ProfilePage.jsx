import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Mail, Shield, UserRound } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui';

export default function ProfilePage() {
  const { me } = useApp();

  const details = [
    { label: 'Username', value: me?.username || 'Not available', Icon: UserRound },
    { label: 'Email', value: me?.email || 'Not available', Icon: Mail },
    { label: 'Organisation', value: me?.org?.name || 'No organisation', Icon: Building2 },
    { label: 'Role', value: me?.role || 'Member', Icon: Shield },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 overflow-y-auto p-3 sm:p-6">
      <header>
        <h1 className="font-display text-3xl sm:text-4xl">Your profile</h1>
        <p className="mt-2 text-sm text-muted">
          Account details associated with your Nexmind sign-in.
        </p>
      </header>

      <Card>
        <dl className="divide-y divide-border">
          {details.map(({ label, value, Icon }) => (
            <div key={label} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
              <Icon size={18} className="mt-0.5 shrink-0 text-muted" />
              <div className="min-w-0">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </Card>

      <Link
        to="/settings"
        className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-ink transition hover:bg-surface-2"
      >
        Account settings <ArrowRight size={15} />
      </Link>
    </div>
  );
}
