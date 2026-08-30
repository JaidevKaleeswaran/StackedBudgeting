import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../ui/Card';
import toast from 'react-hot-toast';
import { Lock, Mail, User, ArrowRight, ShieldCheck } from 'lucide-react';

import Logo from '../ui/Logo';

export default function LoginPage() {
  const { loginWithEmail, signupWithEmail, loginWithGoogle, loginAsGuest } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.password) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (isSignUp && !formData.name) {
      toast.error('Please enter your name');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const res = await signupWithEmail(formData.email, formData.password, formData.name);
        if (res?.requiresActivation) {
          toast.success('Account created! An activation link was sent to your email. Please check your inbox and click the link to activate your account.', { duration: 7000 });
          setIsSignUp(false);
        } else {
          toast.success('Account created successfully!');
        }
      } else {
        await loginWithEmail(formData.email, formData.password);
        toast.success('Welcome back to ARCA!');
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Authentication failed', { duration: 6000 });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const res = await loginWithGoogle();
      if (res?.redirecting) {
        toast.loading('Redirecting to Google for sign-in...', { duration: 4000 });
      } else {
        toast.success('Logged in with Google!');
      }
    } catch (err) {
      console.error('Google Auth Error:', err);
      toast.error(err.message || 'Google Sign-in failed', { duration: 7000 });
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = () => {
    loginAsGuest();
    toast.success('Entered as Guest!');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 selection:bg-accent selection:text-primary">

      {/* ── Login card ── */}
      <div className="w-full max-w-md relative" style={{ zIndex: 2 }}>
        <div className="text-center mb-8 flex flex-col items-center">
          <Logo size="lg" className="mb-3" />
          <p className="text-zinc-400 mt-1 text-sm">
            {isSignUp ? 'Create your budget account' : 'Sign in to access your financial dashboard'}
          </p>
        </div>

        <Card className="backdrop-blur-xl bg-[#18181b]/80 border-zinc-700/60 shadow-2xl ring-1 ring-white/5">
          {/* Tab Switcher */}
          <div className="flex bg-[#09090b] p-1 rounded-lg mb-6 border border-zinc-800">
            <button
              type="button"
              onClick={() => setIsSignUp(false)}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                !isSignUp ? 'bg-accent text-primary font-semibold shadow' : 'text-text-muted hover:text-text'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setIsSignUp(true)}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                isSignUp ? 'bg-accent text-primary font-semibold shadow' : 'text-text-muted hover:text-text'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 text-zinc-500" size={18} />
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="John Doe"
                    className="w-full bg-[#09090b] border border-zinc-800 rounded-lg pl-10 pr-4 py-2.5 text-text focus:outline-none focus:border-accent transition-colors text-sm"
                    required={isSignUp}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 text-zinc-500" size={18} />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="name@example.com"
                  className="w-full bg-[#09090b] border border-zinc-800 rounded-lg pl-10 pr-4 py-2.5 text-text focus:outline-none focus:border-accent transition-colors text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-zinc-500" size={18} />
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full bg-[#09090b] border border-zinc-800 rounded-lg pl-10 pr-4 py-2.5 text-text focus:outline-none focus:border-accent transition-colors text-sm"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-accent hover:bg-accent-hover text-primary font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center space-x-2 text-sm shadow-md disabled:opacity-60"
            >
              <span>{isSignUp ? 'Create Account' : 'Sign In'}</span>
              <ArrowRight size={16} />
            </button>
          </form>

          <div className="my-6 flex items-center">
            <div className="flex-1 border-t border-zinc-800"></div>
            <span className="px-3 text-xs text-text-muted uppercase tracking-wider">Or continue with</span>
            <div className="flex-1 border-t border-zinc-800"></div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full bg-[#09090b] hover:bg-zinc-900 border border-zinc-800 text-text font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center space-x-2 text-sm disabled:opacity-60"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            <button
              type="button"
              onClick={handleGuestLogin}
              className="w-full text-xs text-text-muted hover:text-accent transition-colors text-center py-2"
            >
              Skip login & test as Guest →
            </button>
          </div>
        </Card>

        {/* Footer */}
        <p className="text-center text-[11px] text-zinc-600 mt-6">
          Encrypted · Private · Synced across devices
        </p>
      </div>
    </div>
  );
}
