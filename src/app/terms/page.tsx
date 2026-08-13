import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Turf IQ",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-chalk">
      <header className="bg-green-dark px-6 py-4">
        <Link href="/" className="font-serif text-xl text-white">
          Turf<span className="text-green-bright">IQ</span>
        </Link>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-serif text-3xl text-green-dark mb-1">Terms of Service</h1>
        <p className="text-xs text-mist font-mono mb-8">Last updated: July 29, 2026</p>

        <div className="flex flex-col gap-6 text-[14px] leading-relaxed text-ink">
          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">1. Agreement to Terms</h2>
            <p>
              These Terms of Service (&quot;Terms&quot;) govern access to and use of Turf IQ
              (the &quot;Service&quot;), a golf course management platform. By creating an
              account, you agree to these Terms on behalf of yourself and, if applicable, the
              golf course or organization you represent (&quot;you&quot; or &quot;your
              course&quot;).
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">2. The Service</h2>
            <p>
              Turf IQ provides weather intelligence, disease-risk prediction, irrigation,
              fertility, pest and weed management, equipment, budget, labor, and task-management
              tools for golf course maintenance operations. Features available to your account
              depend on your subscription tier.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">3. Accounts &amp; Roles</h2>
            <p>
              You&apos;re responsible for the accuracy of information you provide and for
              activity under your account. Course owners may invite team members and assign
              roles (owner, superintendent, or staff); each role determines what that member can
              view and edit. You&apos;re responsible for managing who has access to your
              course&apos;s account.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">4. Subscriptions &amp; Billing</h2>
            <p>
              Paid plans are billed monthly in advance through Stripe, our payment processor.
              You can cancel anytime from your course&apos;s billing settings; cancellation
              takes effect at the end of the current billing period, and no partial-period
              refunds are issued. We may change subscription pricing with advance notice to
              active customers.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">5. Your Data</h2>
            <p>
              You retain ownership of the data you enter into Turf IQ — course details, budgets,
              labor and employee records, task logs, and everything else tied to your course. We
              use it only to operate and improve the Service for you. You can export a full copy
              of your course&apos;s data at any time from Course Settings, and you can request
              account and data deletion by contacting us. See our{" "}
              <Link href="/privacy" className="text-green-mid font-semibold hover:underline">
                Privacy Policy
              </Link>{" "}
              for details on what we collect and how it&apos;s handled.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">6. Employee &amp; Staff Data</h2>
            <p>
              If you enter information about your employees (names, roles, time records, pay
              rates) into Turf IQ, you confirm you have the right to do so under applicable
              employment and privacy law, and that you&apos;ll handle that data responsibly on
              your end as well.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">7. Acceptable Use</h2>
            <p>
              Don&apos;t use the Service to violate any law, infringe anyone&apos;s rights,
              attempt to access another course&apos;s data without authorization, or interfere
              with the Service&apos;s normal operation.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">8. Disclaimers</h2>
            <p>
              Turf IQ provides agronomic guidance — including disease-risk predictions and AI-
              generated recommendations — as decision support, not a guarantee of outcomes.
              Weather data is sourced from third-party providers and may be incomplete or
              delayed. You remain responsible for agronomic and business decisions made using
              the Service.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">9. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, Turf IQ is not liable for indirect,
              incidental, or consequential damages arising from use of the Service. Our total
              liability for any claim is limited to the amount you paid us in the twelve months
              preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">10. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. Continued use of the Service after an
              update constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-green-dark mb-2">11. Contact</h2>
            <p>
              Questions about these Terms? Reach out at{" "}
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
