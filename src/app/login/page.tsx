import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { LoginForm } from "@/app/login/login-form";

export const metadata = {
  title: "Sign in · StarterChef",
};

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-12">
      <Link
        href="/"
        className="absolute top-5 left-5 inline-flex items-center gap-1.5 text-sm font-bold text-espresso-light transition-colors hover:text-espresso"
      >
        <ArrowLeft className="h-4 w-4" /> Back to home
      </Link>
      <Logo />
      <Suspense>
        <LoginForm />
      </Suspense>
      <p className="max-w-xs text-center text-sm font-semibold text-espresso-light">
        Your start to great cooking.
      </p>
    </main>
  );
}
