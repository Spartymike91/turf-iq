"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tier = searchParams.get("tier") ?? "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(tier ? `/course?tier=${tier}` : "/course");
    router.refresh();
  }

  return (
    <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
      <div className="bg-green-dark p-6 text-center">
        <h1 className="font-serif text-2xl text-white">
          Turf<span className="text-green-bright">IQ</span>
        </h1>
        <p className="text-white/50 text-sm mt-1">
          Create your account
        </p>
      </div>
      <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
        {error && (
          <div className="bg-red/10 border border-red/30 rounded-lg p-3 text-red text-sm">
            {error}
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink">
            Full Name
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="px-3 py-2.5 border-[1.5px] border-rule rounded-lg text-sm text-ink outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
            placeholder="Mike Conley"
          />
        </div>
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
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink">
            Password
          </label>
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
        <button
          type="submit"
          disabled={loading}
          className="mt-2 px-4 py-3 bg-green-mid text-white font-semibold rounded-lg hover:bg-green-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>
        <p className="text-center text-sm text-mist">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-green-mid font-semibold hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
