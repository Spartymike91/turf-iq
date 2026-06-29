import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Turf IQ — Golf Course Management Platform",
  description:
    "The operating system for golf course superintendents. Weather intelligence, disease prediction, irrigation, fertility, pest control, equipment, budget, and labor — unified in one platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
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
