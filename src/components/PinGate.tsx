"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = "checking" | "needs-setup" | "locked" | "unlocked";

export default function PinGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    async function checkStatus() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setStatus("locked");
        return;
      }

      const [{ data: profile }, { data: session }] = await Promise.all([
        supabase.from("profiles").select("sensitive_pin_hash").eq("id", user.id).single(),
        supabase.from("sensitive_data_sessions").select("expires_at").eq("user_id", user.id).maybeSingle(),
      ]);

      const elevated = !!session && new Date(session.expires_at) > new Date();
      if (elevated) {
        setExpiresAt(session!.expires_at);
        setStatus("unlocked");
      } else if (!profile?.sensitive_pin_hash) {
        setStatus("needs-setup");
      } else {
        setStatus("locked");
      }
    }
    checkStatus();
  }, []);

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4}$/.test(pin)) {
      setError("PIN must be exactly 4 digits.");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs don't match.");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("set_sensitive_pin", { input_pin: pin });
    if (rpcError) {
      setError(rpcError.message);
      setSubmitting(false);
      return;
    }
    await unlock(pin);
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    await unlock(pin);
  }

  async function unlock(inputPin: string) {
    try {
      const res = await fetch("/api/account/sensitive-pin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: inputPin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not unlock.");
        setSubmitting(false);
        return;
      }
      setExpiresAt(data.expiresAt);
      setStatus("unlocked");
      setPin("");
      setConfirmPin("");
    } catch {
      setError("Could not unlock.");
    }
    setSubmitting(false);
  }

  async function handleLock() {
    await fetch("/api/account/sensitive-pin/verify", { method: "DELETE" });
    setStatus("locked");
    setExpiresAt(null);
  }

  if (status === "checking") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-mist">Loading...</div>
      </div>
    );
  }

  if (status === "needs-setup" || status === "locked") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="max-w-sm w-full bg-white border-[1.5px] border-rule rounded-[10px] p-8 text-center">
          <div className="text-4xl mb-3">🔒</div>
          {status === "needs-setup" ? (
            <>
              <div className="font-serif text-xl text-green-dark mb-2">Set up your PIN</div>
              <div className="text-sm text-mist mb-5">
                This page shows sensitive budget/pay data. Choose a 4-digit PIN — you&apos;ll enter it
                to unlock this page each time, on this or any device.
              </div>
              <form onSubmit={handleSetup} className="flex flex-col gap-3">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="New 4-digit PIN"
                  className="px-3 py-2.5 border-[1.5px] border-rule rounded-lg text-sm text-center tracking-[0.5em] outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
                  autoFocus
                />
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Confirm PIN"
                  className="px-3 py-2.5 border-[1.5px] border-rule rounded-lg text-sm text-center tracking-[0.5em] outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
                />
                {error && <div className="text-xs text-red">{error}</div>}
                <button
                  type="submit"
                  disabled={submitting || pin.length !== 4 || confirmPin.length !== 4}
                  className="px-4 py-2.5 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Set PIN & Unlock"}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="font-serif text-xl text-green-dark mb-2">Enter your PIN</div>
              <div className="text-sm text-mist mb-5">This page is protected. Enter your 4-digit PIN to continue.</div>
              <form onSubmit={handleUnlock} className="flex flex-col gap-3">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="4-digit PIN"
                  className="px-3 py-2.5 border-[1.5px] border-rule rounded-lg text-sm text-center tracking-[0.5em] outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
                  autoFocus
                />
                {error && <div className="text-xs text-red">{error}</div>}
                <button
                  type="submit"
                  disabled={submitting || pin.length !== 4}
                  className="px-4 py-2.5 bg-green-mid text-white text-sm font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50"
                >
                  {submitting ? "Checking..." : "Unlock"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between bg-green-pale border-[1.5px] border-green-mid/25 rounded-lg px-4 py-2 text-xs text-green-dark">
        <span>
          🔓 Unlocked{" "}
          {expiresAt &&
            `until ${new Date(expiresAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
        </span>
        <button onClick={handleLock} className="font-semibold hover:underline">
          Lock now
        </button>
      </div>
      {children}
    </>
  );
}
