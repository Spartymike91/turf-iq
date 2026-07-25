"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [canReset, setCanReset] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  useEffect(() => {
    async function check() {
      // Legacy path: if the Supabase email template still points at Supabase's
      // own /verify redirect (not yet switched to the token_hash link below),
      // a session may already be established via the URL hash by the time
      // this page loads.
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setCanReset(!!session || (!!tokenHash && type === "recovery"));
      setChecking(false);
    }
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // The recovery token is only ever verified here, at the moment the user
    // submits a new password — never automatically on page load. That's
    // what keeps this link safe from email-security link scanners: they
    // prefetch the URL (which would silently burn a single-use token if we
    // verified on mount) but never submit a form.
    if (tokenHash && type === "recovery") {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "recovery",
      });
      if (verifyError) {
        setError(verifyError.message);
        setLoading(false);
        return;
      }
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (checking) {
    return (
      <div className="bg-white rounded-xl shadow-2xl overflow-hidden p-10 text-center text-mist">
        Loading...
      </div>
    );
  }

  if (!canReset) {
    return (
      <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="bg-green-dark p-6 text-center">
          <h1 className="font-serif text-2xl text-white">
            Turf<span className="text-green-bright">IQ</span>
          </h1>
        </div>
        <div className="p-6 text-center flex flex-col gap-3">
          <div className="text-sm text-mist">
            This reset link is invalid or has expired.
          </div>
          <Link href="/forgot-password" className="text-green-mid font-semibold text-sm hover:underline">
            Request a new one
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
        <p className="text-white/50 text-sm mt-1">Set a new password</p>
      </div>
      <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
        {error && (
          <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-red text-sm">{error}</div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink">New Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="px-3 py-2.5 border-[1.5px] border-rule rounded-lg text-sm text-ink outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
            placeholder="••••••••"
          />
          <span className="text-xs text-mist">Minimum 6 characters</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            className="px-3 py-2.5 border-[1.5px] border-rule rounded-lg text-sm text-ink outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="mt-2 px-4 py-3 bg-green-mid text-white font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Saving..." : "Set New Password"}
        </button>
      </form>
    </div>
  );
}
