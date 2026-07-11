import Link from "next/link";

const modules = [
  { icon: "🌤", name: "Weather Intelligence", desc: "Real-time conditions, 7-day forecast, ET calculations, GDD accumulation, and agronomic context.", tags: ["NWS", "ET", "GDD", "Leaf Wetness"], tier: 1 },
  { icon: "🦠", name: "Disease Risk Prediction", desc: "Smith-Kerns Dollar Spot model, Brown Patch, Pythium — running against live weather data with product recommendations.", tags: ["Smith-Kerns", "Fungicide Recs", "Spray Log"], tier: 1 },
  { icon: "🌱", name: "Fertility Management", desc: "Soil test tracking, nutrient deficiency alerts, annual N/P/K programs per zone, and application history.", tags: ["Soil Tests", "N Budget", "Zone Programs"], tier: 1 },
  { icon: "🧪", name: "Pest & Weed Control", desc: "GDD-driven pest timing tracker, pressure cards for weeds and insects, and full compliance spray log.", tags: ["GDD Timing", "REI Tracking", "Compliance"], tier: 1 },
  { icon: "💧", name: "Irrigation Management", desc: "ET-based nightly scheduling, soil moisture sensor integration, live VWC maps, and dry spot alerts.", tags: ["ET Scheduling", "VWC Sensors", "Moisture Map"], tier: 2 },
  { icon: "🔧", name: "Equipment Management", desc: "Fleet inventory, service interval tracking, repair cost history, fuel usage, and 5-year replacement planning.", tags: ["Service Alerts", "Hour Tracking", "Replacement Planning"], tier: 2 },
  { icon: "📊", name: "Budget & Reporting", desc: "Budget vs. actual by category, monthly trends, cost per acre, cost per round, and full-year forecast.", tags: ["Budget vs Actual", "Cost/Acre", "Forecasting"], tier: 2 },
  { icon: "👷", name: "Labor & Staffing", desc: "Weekly crew scheduling, hour logging, overtime tracking, certification management, and seasonal headcount projections.", tags: ["Schedule Grid", "OT Alerts", "Certifications"], tier: 3 },
  { icon: "📋", name: "Task Management", desc: "Crew task scheduling, live status boards, kiosk time clock, and automatic weekly payroll calculations.", tags: ["Scheduler", "Time Clock", "Payroll"], tier: 3 },
  { icon: "👥", name: "Team & Roles", desc: "Invite your crew with role-based permissions — owner, superintendent, assistant, crew lead, and crew.", tags: ["Invites", "Roles", "Permissions"], tier: 3 },
  { icon: "🌿", name: "AI Agronomist", desc: "Ask anything about your course — always available from any screen. Powered by Claude with live course context.", tags: ["Claude AI", "Context-Aware", "Always On"], highlight: true, tier: "all" },
];

const tiers = [
  {
    name: "Agronomist",
    slug: "agronomist",
    price: 399,
    tagline: "Science-backed decisions for solo superintendents.",
    features: [
      "Weather Intelligence",
      "Disease Risk Prediction",
      "Fertility Management",
      "Pest & Weed Control",
      "AI Agronomist",
      "1 team member",
    ],
  },
  {
    name: "Superintendent",
    slug: "superintendent",
    price: 499,
    tagline: "Full agronomy, plus the operations to back it up.",
    features: [
      "Weather Intelligence",
      "Disease Risk Prediction",
      "Fertility Management",
      "Pest & Weed Control",
      "Irrigation Management",
      "Equipment Management",
      "Budget & Reporting",
      "AI Agronomist",
      "Up to 3 team members",
    ],
    popular: true,
  },
  {
    name: "Complete",
    slug: "complete",
    price: 599,
    tagline: "Run the whole maintenance operation, crew included.",
    features: [
      "Weather Intelligence",
      "Disease Risk Prediction",
      "Fertility Management",
      "Pest & Weed Control",
      "Irrigation Management",
      "Equipment Management",
      "Budget & Reporting",
      "Labor & Staffing",
      "Task Management & Payroll",
      "Team & Roles",
      "AI Agronomist",
      "Unlimited team members",
    ],
  },
];

const TIER_LABEL: Record<string, string> = { "1": "Agronomist", "2": "Superintendent", "3": "Complete", all: "All Plans" };

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <section className="bg-green-dark min-h-screen flex flex-col relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_60%_40%,rgba(82,183,136,0.12)_0%,transparent_70%)]" />

        <nav className="px-12 py-6 flex items-center justify-between relative z-10">
          <div className="font-serif text-[22px] text-white tracking-wide">
            Turf<span className="text-green-bright">IQ</span>
          </div>
          <div className="flex gap-3">
            <Link
              href="/login"
              className="px-5 py-2.5 text-white/75 font-semibold text-sm rounded-lg border border-white/12 bg-white/[0.06] hover:bg-white/10 hover:text-white transition-all"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="px-5 py-2.5 bg-green-bright text-green-dark font-bold text-sm rounded-lg hover:bg-[#3da876] transition-all shadow-[0_4px_20px_rgba(82,183,136,0.3)]"
            >
              Get Started →
            </Link>
          </div>
        </nav>

        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 pb-20 relative z-10">
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-green-bright mb-5 flex items-center gap-2">
            <span className="w-8 h-px bg-green-bright/40" />
            Golf Course Management Platform
            <span className="w-8 h-px bg-green-bright/40" />
          </div>
          <h1 className="font-serif text-[clamp(42px,7vw,80px)] text-white leading-[1.08] mb-5 max-w-[800px]">
            The operating system for{" "}
            <em className="text-green-bright not-italic">
              golf course superintendents
            </em>
          </h1>
          <p className="text-[clamp(15px,2vw,18px)] text-white/60 max-w-[560px] leading-relaxed mb-10">
            Weather intelligence, disease prediction, irrigation, fertility,
            pest control, equipment, budget, labor, and task management —
            unified in one platform with an AI agronomist always one click away.
          </p>
          <div className="flex gap-3.5 flex-wrap justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2.5 px-8 py-4 bg-green-bright text-green-dark font-bold text-[15px] rounded-[10px] hover:bg-[#3da876] hover:-translate-y-0.5 transition-all shadow-[0_4px_20px_rgba(82,183,136,0.3)] hover:shadow-[0_8px_32px_rgba(82,183,136,0.4)]"
            >
              Start Free Trial <span className="text-lg">→</span>
            </Link>
            <a
              href="#pricing"
              className="inline-flex items-center gap-2 px-7 py-4 bg-white/[0.06] text-white/75 font-semibold text-[15px] rounded-[10px] border border-white/12 hover:bg-white/10 hover:text-white hover:border-white/25 transition-all"
            >
              See pricing
            </a>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="bg-white/[0.04] border-t border-white/[0.08] px-12 py-6 flex justify-center gap-16 flex-wrap relative z-10">
          {[
            { val: "10", label: "Integrated Modules" },
            { val: "~16,000", label: "Target US Courses" },
            { val: "From $399", label: "Per Course / Month" },
            { val: "AI", label: "Agronomist Built In" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-serif text-[28px] text-white mb-1">
                {s.val}
              </div>
              <div className="text-[11px] text-white/40 uppercase tracking-wider font-mono">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section className="py-20 px-12 max-w-[1100px] mx-auto" id="modules">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-green-forest mb-2.5">
          Platform Modules
        </div>
        <div className="font-serif text-[clamp(28px,4vw,40px)] text-green-dark mb-3">
          Everything a superintendent needs
        </div>
        <div className="text-[15px] text-mist leading-relaxed max-w-[600px] mb-10">
          Built from the ground up for golf course operations — not adapted from
          generic farm management software.
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {modules.map((m) => (
            <div
              key={m.name}
              className={`bg-white border-[1.5px] rounded-[10px] p-5 transition-all cursor-pointer hover:border-green-mid hover:-translate-y-[3px] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] ${
                m.highlight
                  ? "border-green-bright bg-gradient-to-br from-[#f0faf4] to-white"
                  : "border-rule"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="text-[28px]">{m.icon}</div>
                <span className="text-[9px] font-mono font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-dark/[0.06] text-green-forest whitespace-nowrap">
                  {TIER_LABEL[String(m.tier)]}
                </span>
              </div>
              <div className="text-[15px] font-bold text-ink mb-1.5">
                {m.name}
              </div>
              <div className="text-[13px] text-mist leading-relaxed">
                {m.desc}
              </div>
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {m.tags.map((t) => (
                  <span
                    key={t}
                    className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${
                      m.highlight
                        ? "bg-green-bright/15 text-green-mid"
                        : "bg-green-pale text-green-mid"
                    }`}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-12 max-w-[1100px] mx-auto bg-chalk" id="pricing">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-green-forest mb-2.5">
          Pricing
        </div>
        <div className="font-serif text-[clamp(28px,4vw,40px)] text-green-dark mb-3">
          Pay for what your course actually needs
        </div>
        <div className="text-[15px] text-mist leading-relaxed max-w-[600px] mb-10">
          Three plans, built around how golf course maintenance teams actually
          scale — from a solo superintendent to a full crew with payroll.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`relative bg-white rounded-[10px] p-7 flex flex-col ${
                t.popular
                  ? "border-2 border-green-bright shadow-[0_8px_32px_rgba(82,183,136,0.15)] md:-translate-y-2"
                  : "border-[1.5px] border-rule"
              }`}
            >
              {t.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-bright text-green-dark text-[10px] font-mono font-bold uppercase tracking-wide px-3 py-1 rounded-full">
                  Most Popular
                </div>
              )}
              <div className="font-serif text-xl text-green-dark mb-1">{t.name}</div>
              <div className="text-[13px] text-mist mb-5 leading-relaxed">{t.tagline}</div>
              <div className="mb-5">
                <span className="font-serif text-[38px] text-green-dark">${t.price}</span>
                <span className="text-sm text-mist"> / course / month</span>
              </div>
              <ul className="flex flex-col gap-2.5 mb-7 flex-1">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13px] text-ink">
                    <span className="text-green-mid font-bold mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={`/signup?tier=${t.slug}`}
                className={`text-center px-4 py-3 font-semibold text-sm rounded-lg transition-all ${
                  t.popular
                    ? "bg-green-mid text-white hover:bg-green-dark"
                    : "bg-green-pale text-green-dark hover:bg-green-mid hover:text-white"
                }`}
              >
                Start with {t.name} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-green-dark py-20 px-12 text-center relative overflow-hidden">
        <div className="absolute text-[240px] opacity-[0.04] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          ⛳
        </div>
        <h2 className="font-serif text-[clamp(32px,5vw,52px)] text-white mb-4 relative">
          Ready to get started?
        </h2>
        <p className="text-base text-white/55 max-w-[500px] mx-auto leading-relaxed mb-9 relative">
          Create your account and set up your course in minutes. Pick the
          plan that fits your crew — upgrade anytime.
        </p>
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 px-10 py-4.5 bg-green-bright text-green-dark font-bold text-base rounded-[10px] hover:bg-[#3da876] hover:-translate-y-0.5 transition-all shadow-[0_4px_20px_rgba(82,183,136,0.3)]"
        >
          Create Your Account <span className="text-xl ml-2">→</span>
        </Link>
        <p className="text-xs text-white/30 mt-5 font-mono relative">
          Plans from $399/month per course · Cancel anytime
        </p>
      </section>

      {/* Footer */}
      <footer className="bg-green-dark border-t border-white/[0.07] px-12 py-6 flex justify-between items-center flex-wrap gap-3">
        <div className="font-serif text-base text-white/50">
          Turf<span className="text-green-bright">IQ</span>
        </div>
        <div className="text-[11px] text-white/25 font-mono">
          © 2026 Turf IQ · Golf course management platform
        </div>
      </footer>
    </div>
  );
}
