"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { appNavLinks } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-oat bg-cream/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/today" aria-label="StarterChef home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {appNavLinks.map(({ href, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-bold transition-colors",
                  active
                    ? "bg-oat text-espresso"
                    : "text-espresso-light hover:text-espresso",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div
          className="flex h-9 w-9 items-center justify-center rounded-full bg-oat text-sm font-extrabold text-espresso"
          aria-label="Your profile"
        >
          You
        </div>
      </div>
    </header>
  );
}
