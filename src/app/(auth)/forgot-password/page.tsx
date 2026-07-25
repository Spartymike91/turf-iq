"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/reset-password`,
    });

    // Don't reveal whether the email exists either way — show the same
    // confirmation regardless, unless Supabase itself errored (rate limit, etc).
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="bg-green-dark p-6 text-center">
          <h1 className="font-serif text-2xl text-white">
            Turf<span className="text-green-bright">IQ</span>
          </h1>
        </div>
        <div className="p-6 text-center flex flex-col gap-3">
          <div className="text-sm text-ink">
            If an account exists for <strong>{email}</strong>, a password reset link is on its way.
          </div>
          <div className="text-xs text-mist">Check your inbox (and spam folder) for an email from Turf IQ.</div>
          <Link
            href="/login"
            className="text-green-mid font-semibold text-sm hover:underline mt-2"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
      <div className="bg-green-dark p-6 text-center">
        <h1 className="font-serif text-2xl text-white">
          Turf<span className="text-green-bright">IQ</span>
        </h1>
        <p className="text-white/50 text-sm mt-1">Reset your password</p>
      </div>
      <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
        {error && (
          <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-red text-sm">
            {error}
          </div>
        )}
        <p className="text-sm text-mist">
          Enter the email on your account and we&apos;ll send you a link to set a new password.
        </p>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="px-3 py-2.5 border-[1.5px] border-rule rounded-lg text-sm text-ink outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
            placeholder="you@example.com"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="mt-2 px-4 py-3 bg-green-mid text-white font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Sending..." : "Send Reset Link"}
        </button>
        <p className="text-center text-sm text-mist">
          <Link href="/login" className="text-green-mid font-semibold hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
