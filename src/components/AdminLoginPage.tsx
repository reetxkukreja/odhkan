import React, { useState } from 'react';
import { Lock, ArrowRight, ShieldCheck, AlertCircle, ArrowLeft } from 'lucide-react';

interface AdminLoginPageProps {
  onLoginSuccess: (token: string, username: string) => void;
  onNavigateHome: () => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({
  onLoginSuccess,
  onNavigateHome,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Invalid organizer credentials.');
        setLoading(false);
        return;
      }

      localStorage.setItem('odhkan_admin_token', data.token);
      localStorage.setItem('odhkan_admin_user', data.user.username);
      onLoginSuccess(data.token, data.user.username);
    } catch {
      setError('Connection error. Please check your network and retry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 sm:p-6 bg-[#FAF9F5] text-neutral-900">
      <div className="w-full max-w-sm">
        {/* Back Link */}
        <button
          onClick={onNavigateHome}
          className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Odhkan</span>
        </button>

        <div className="bg-white rounded-2xl border border-[#ECEAE4] shadow-xl p-6 sm:p-8">
          <div className="mb-6">
            <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center mb-3">
              <Lock className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-neutral-950 font-sans tracking-tight">
              Odhkan Admin
            </h1>
            <p className="text-xs text-neutral-500 mt-1">
              Organizer management console for matching and final lists.
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                Username
              </label>
              <input
                type="text"
                required
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Organizer username"
                className="w-full px-3.5 py-2.5 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-900 focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-900 focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 bg-neutral-950 text-white rounded-lg text-sm font-semibold hover:bg-neutral-800 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>Sign in to Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-neutral-100 flex items-center justify-center gap-1.5 text-[11px] text-neutral-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Restricted organizer access</span>
          </div>
        </div>
      </div>
    </div>
  );
};
