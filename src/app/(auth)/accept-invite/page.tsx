"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordAcceptance } from "@/lib/recordAcceptance";
import AgreeCheckbox from "@/components/legal/AgreeCheckbox";

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteForm />
    </Suspense>
  );
}

function AcceptInviteForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [canAccept, setCanAccept] = useState(false);
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
      setCanAccept(!!session || (!!tokenHash && type === "invite"));
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

    // The invite token is only ever verified here, at the moment the user
    // submits their chosen password — never automatically on page load.
    // That's what keeps this link safe from email-security link scanners:
    // they prefetch the URL (which would silently burn a single-use token
    // if we verified on mount) but never submit a form.
    if (tokenHash && type === "invite") {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "invite",
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

    await recordAcceptance("invite");
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

  if (!canAccept) {
    return (
      <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="bg-green-dark p-6 text-center">
          <h1 className="font-serif text-2xl text-white">
            Turf<span className="text-green-bright">IQ</span>
          </h1>
        </div>
        <div className="p-6 text-center text-sm text-mist">
          This invite link is invalid or has expired. Ask whoever invited you to send a new one.
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
        <p className="text-white/50 text-sm mt-1">Set a password to finish joining the team</p>
      </div>
      <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
        {error && (
          <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-red text-sm">{error}</div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink">Password</label>
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
          <label className="text-xs font-semibold uppercase tracking-wide text-ink">Confirm Password</label>
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
        <AgreeCheckbox checked={agreed} onChange={setAgreed} />
        <button
          type="submit"
          disabled={loading || !agreed}
          className="mt-2 px-4 py-3 bg-green-mid text-white font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Setting password..." : "Set Password & Continue"}
        </button>
      </form>
    </div>
  );
}
