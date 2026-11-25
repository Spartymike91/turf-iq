"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { recordAcceptance } from "@/lib/recordAcceptance";
import AgreeCheckbox from "@/components/legal/AgreeCheckbox";

export default function AcceptTermsPage() {
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    if (!(await recordAcceptance("prompt"))) {
      setError("Couldn't save your agreement. Please try again.");
      setLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function handleSignOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
      <div className="bg-green-dark p-6 text-center">
        <h1 className="font-serif text-2xl text-white">
          Turf<span className="text-green-bright">IQ</span>
        </h1>
        <p className="text-white/50 text-sm mt-1">Our terms have been updated</p>
      </div>
      <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
        {error && <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-red text-sm">{error}</div>}
        <p className="text-sm text-ink">Please review and agree to continue.</p>
        <AgreeCheckbox checked={agreed} onChange={setAgreed} />
        <button
          type="submit"
          disabled={loading || !agreed}
          className="px-4 py-3 bg-green-mid text-white font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Saving..." : "Agree & Continue"}
        </button>
        <button type="button" onClick={handleSignOut} className="text-sm text-mist hover:underline">
          Sign out
        </button>
      </form>
    </div>
  );
}
