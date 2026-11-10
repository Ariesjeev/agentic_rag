import { Link } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { Button, Card } from '../components/ui';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 overflow-y-auto p-3 sm:p-6">
      <header>
        <h1 className="font-display text-3xl sm:text-4xl">Settings</h1>
        <p className="mt-2 text-sm text-muted">
          Manage the appearance and sign-in options for your account.
        </p>
      </header>

      <Card className="space-y-4">
        <div>
          <h2 className="font-medium">Appearance</h2>
          <p className="mt-1 text-sm text-muted">
            Choose the theme used on this device.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={theme === 'light' ? 'primary' : 'subtle'}
            aria-pressed={theme === 'light'}
            onClick={() => setTheme('light')}
            className="inline-flex items-center gap-2"
          >
            <Sun size={16} /> Light
          </Button>
          <Button
            type="button"
            variant={theme === 'dark' ? 'primary' : 'subtle'}
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme('dark')}
            className="inline-flex items-center gap-2"
          >
            <Moon size={16} /> Dark
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="font-medium">Password</h2>
        <p className="mt-1 text-sm text-muted">
          Request a secure password-reset link for your account email.
        </p>
        <Link
          to="/forgot-password"
          className="mt-4 inline-flex rounded-full border border-border px-4 py-2 text-sm text-ink transition hover:bg-surface-2"
        >
          Reset password
        </Link>
      </Card>
    </div>
  );
}
