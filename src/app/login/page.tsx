import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { LoginForm } from "@/app/login/login-form";

export const metadata = {
  title: "Sign in · StarterChef",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-12">
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
