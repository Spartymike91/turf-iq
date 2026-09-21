import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Turf IQ — Golf Course Management Platform",
  description:
    "The operating system for golf course superintendents. Weather intelligence, disease prediction, irrigation, fertility, pest control, equipment, budget, and labor — unified in one platform.",
  // Without these, "Add to Home Screen" on iOS just creates a bookmark
  // that still opens in regular Safari — it can never actually launch in
  // standalone mode, so navigator.standalone (and PushManager, which push
  // notifications depend on) never becomes available no matter what the
  // user does. Confirmed missing when a crew member's phone still showed
  // the "add to Home Screen" push prompt after he'd already done exactly
  // that (2026-09-21).
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Turf IQ",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a3a2a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        {/* Next.js's appleWebApp metadata above only emits the modern
            "mobile-web-app-capable" tag (Apple's Safari-17.4+ replacement) —
            older iOS versions only recognize the original
            "apple-"-prefixed name, so it's added by hand here too. Without
            it, standalone/Home-Screen launch mode silently never activates
            on those devices. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-chalk text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
