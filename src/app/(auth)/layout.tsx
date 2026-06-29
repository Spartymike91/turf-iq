export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-green-dark flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_60%_40%,rgba(82,183,136,0.12)_0%,transparent_70%)]" />
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
}
