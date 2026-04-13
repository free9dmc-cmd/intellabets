export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: "var(--bg-primary)",
        backgroundImage:
          "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(124,58,237,0.2) 0%, transparent 60%)",
      }}
    >
      {children}
    </div>
  )
}
