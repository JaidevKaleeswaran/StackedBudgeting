import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../ui/Card';
import toast from 'react-hot-toast';
import { MailCheck, RefreshCw, LogOut, CheckCircle2 } from 'lucide-react';

export default function VerifyEmailPage() {
  const { user, resendVerificationEmail, refreshUserStatus, logout } = useAuth();
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);

  const handleRefresh = async () => {
    setChecking(true);
    try {
      const isVerified = await refreshUserStatus();
      if (isVerified) {
        toast.success('Email verified successfully! Welcome to ARCA.');
      } else {
        toast.error('Email not verified yet. Please check your inbox and click the link.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Could not check status. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerificationEmail();
      toast.success('Activation email resent! Please check your spam folder if not found.');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to resend verification email');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary flex flex-col items-center justify-center px-4 py-8 selection:bg-accent selection:text-primary">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-6 text-amber-400 animate-pulse">
          <MailCheck size={40} />
        </div>

        <h1 className="text-3xl font-bold text-text tracking-tight mb-2">
          Verify Your Email
        </h1>
        <p className="text-zinc-400 text-sm mb-6 max-w-sm mx-auto">
          We sent an account activation link to <br />
          <span className="text-accent font-semibold">{user?.email}</span>
        </p>

        <Card className="backdrop-blur-xl bg-card/90 border-border shadow-2xl p-6 text-left space-y-4">
          <div className="bg-primary border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              <CheckCircle2 size={16} className="text-accent" />
              <span>Next steps to activate your account:</span>
            </div>
            <ol className="list-decimal list-inside text-xs text-zinc-400 space-y-1.5 pl-1">
              <li>Open your email inbox for <strong className="text-zinc-200">{user?.email}</strong></li>
              <li>Click the activation link inside the email from <strong>ARCA / Firebase</strong></li>
              <li>Return here and click <strong>"I've Activated My Account"</strong></li>
            </ol>
          </div>

          {/* Spam Prevention & Inbox Tips Box */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3.5 space-y-2 text-xs text-amber-300">
            <p className="font-semibold flex items-center gap-1 text-amber-400">
              📬 Email in Spam / Junk folder?
            </p>
            <p className="text-amber-200/90 leading-relaxed text-[11px]">
              Verification emails from <code className="bg-black/40 px-1 py-0.5 rounded text-amber-300">ARCA-support@arca-budgeting.com</code> (or <code className="bg-black/40 px-1 py-0.5 rounded text-amber-300">noreply@arca-budgeting.firebaseapp.com</code>) are sometimes flagged by Spam filters (Gmail, Outlook, Yahoo).
            </p>
            <ul className="list-disc list-inside text-[11px] text-amber-200/80 space-y-1 pl-1">
              <li>Check your <strong>Spam / Junk / Promotions</strong> folder</li>
              <li>Click <strong>"Not Spam"</strong> in Gmail to move it to your Primary inbox</li>
              <li>Add <code className="bg-black/40 px-1 py-0.5 rounded text-amber-300">ARCA-support@arca-budgeting.com</code> to your contacts</li>
            </ul>
          </div>

          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={checking}
              className="w-full bg-accent hover:bg-accent-hover text-primary font-semibold py-3 rounded-lg transition-colors flex items-center justify-center space-x-2 text-sm shadow-md disabled:opacity-50"
            >
              <RefreshCw size={18} className={checking ? 'animate-spin' : ''} />
              <span>{checking ? 'Checking Status...' : "I've Activated My Account"}</span>
            </button>

            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="w-full bg-[#09090b] hover:bg-zinc-900 border border-zinc-800 text-zinc-300 font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center space-x-2 text-xs"
            >
              <span>{resending ? 'Sending...' : 'Resend Activation Email'}</span>
            </button>

            <button
              type="button"
              onClick={logout}
              className="w-full text-xs text-zinc-500 hover:text-red-400 transition-colors text-center py-2 flex items-center justify-center space-x-1"
            >
              <LogOut size={14} />
              <span>Sign out / Back to Login</span>
            </button>
          </div>
        </Card>

      </div>
    </div>
  );
}
