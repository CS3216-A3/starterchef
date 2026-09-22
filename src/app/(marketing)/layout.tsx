import Link from "next/link";
import { Logo } from "@/components/logo";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2 text-sm font-bold">
          <a
            href="#features"
            className="hidden rounded-full px-4 py-2 text-espresso-light hover:text-espresso sm:inline"
          >
            Features
          </a>
          <a
            href="#pricing"
            className="hidden rounded-full px-4 py-2 text-espresso-light hover:text-espresso sm:inline"
          >
            Pricing
          </a>
          <Link
            href="/today"
            className="rounded-full bg-flame px-5 py-2.5 text-white transition-colors hover:bg-flame-dark"
          >
            Get started
          </Link>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-oat">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm font-semibold text-espresso-light sm:flex-row sm:px-6">
          <Logo showWordmark={false} />
          <p>StarterChef · Your kitchen, your next meal.</p>
          <p>CS3216 Assignment 3</p>
        </div>
      </footer>
    </div>
  );
}
