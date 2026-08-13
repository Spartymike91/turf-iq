import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Turf IQ",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-chalk">
      <header className="bg-green-dark px-6 py-4">
        <Link href="/" className="font-serif text-xl text-white">
          Turf<span className="text-green-bright">IQ</span>
        </Link>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-serif text-3xl text-green-dark mb-1">Privacy Policy</h1>
        <p className="text-xs text-mist font-mono mb-8">Last updated: July 29, 2026</p>

        <div className="flex flex-col gap-6 text-[14px] leading-relaxed text-ink">
          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">1. What We Collect</h2>
            <p className="mb-2">Turf IQ collects:</p>
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li><strong>Account data</strong> — name and email address for you and any team members you invite.</li>
              <li><strong>Course data</strong> — course profile, location, grass type, budgets, expenses, equipment, and maintenance records you enter.</li>
              <li><strong>Employee/labor data</strong> — if entered by your course — names, roles, and time records used for scheduling and payroll features.</li>
              <li><strong>Weather &amp; agronomic data</strong> — pulled from third-party weather providers based on your course&apos;s location, used to compute disease risk and irrigation guidance.</li>
              <li><strong>Billing data</strong> — handled directly by Stripe, our payment processor; we store your subscription status and plan, not your card details.</li>
              <li><strong>Usage &amp; error data</strong> — basic technical logs (page errors, request failures) used to keep the Service reliable.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">2. How We Use It</h2>
            <p>
              We use your data to operate the Service: rendering your dashboards, computing
              agronomic recommendations, processing billing, sending account-related emails
              (invites, password resets), and diagnosing errors. We do not sell your data.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">3. AI Features</h2>
            <p>
              Features like the daily briefing and &quot;Ask the Agronomist&quot; chat send
              relevant course data (e.g. current weather, budget figures, task status) to
              Anthropic&apos;s Claude API to generate recommendations. This data is used to
              generate your response and is not used to train Anthropic&apos;s models.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">4. Who Can See Your Data</h2>
            <p>
              Your course&apos;s data is visible only to members of your course, scoped by
              their role. Turf IQ platform staff can view course data only for support
              purposes, and any edits made by staff on your behalf require a separate, logged
              authorization step. We never share your course&apos;s data with other customers.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">5. Data Retention &amp; Deletion</h2>
            <p>
              We retain your data for as long as your account is active. If you cancel your
              subscription, your data remains accessible for a reasonable period in case you
              resubscribe. You can request full account and data deletion at any time by
              contacting us — we&apos;ll delete your course&apos;s records, subject to what
              we&apos;re legally required to retain (e.g. billing records).
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">6. Exporting Your Data</h2>
            <p>
              You can download a complete export of your course&apos;s data — course profile,
              employees, tasks, expenses, equipment, applications, and reports — at any time
              from Course Settings. This is your data; you&apos;re never locked in.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">7. Third-Party Services</h2>
            <p>
              We rely on a small number of subprocessors to run the Service: Supabase (database
              and authentication), Stripe (billing), Anthropic (AI features), Vercel (hosting),
              and weather-data providers. Each only receives the data needed to perform its
              function.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">8. Security</h2>
            <p>
              Data is stored with row-level access controls scoped to your course, and access
              to another course&apos;s data requires an explicit, logged support authorization.
              No system is perfectly secure, but we take reasonable technical measures to
              protect your data.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">9. Changes to This Policy</h2>
            <p>
              We may update this policy from time to time. Material changes will be communicated
              to active account owners.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">10. Contact</h2>
            <p>
              Questions about this policy, or a data export/deletion request? Reach out at{" "}
              <a href="mailto:mikeconley7@gmail.com" className="text-green-mid font-semibold hover:underline">
                mikeconley7@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
