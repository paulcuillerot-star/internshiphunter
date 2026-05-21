import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-line bg-white/95">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-base font-bold tracking-tight text-ink">Internship Hunter</Link>
        <nav className="flex items-center gap-4 text-sm text-ink/70">
          <Link href="/apply" className="hover:text-ink">Apply</Link>
          <Link href="/admin" className="hover:text-ink">Admin</Link>
        </nav>
      </div>
    </header>
  );
}
