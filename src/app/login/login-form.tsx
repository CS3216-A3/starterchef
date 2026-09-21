"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/button";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/today";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(undefined);
    setSuccess(undefined);

    const supabase = createClient();
    const { error: authError } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (mode === "signin") {
      router.push(next);
      router.refresh();
    } else {
      setSuccess(
        "Account created. Check your email for a confirmation link, then sign in.",
      );
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-4 rounded-3xl bg-card p-6 shadow-sm ring-1 ring-oat"
    >
      <h1 className="text-2xl font-extrabold">
        {mode === "signin" ? "Welcome back" : "Create your account"}
      </h1>

      <div className="grid grid-cols-2 gap-2 rounded-full bg-oat p-1">
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setError(undefined);
            setSuccess(undefined);
          }}
          className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
            mode === "signin"
              ? "bg-card text-espresso shadow-sm"
              : "text-espresso-light hover:text-espresso"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setError(undefined);
            setSuccess(undefined);
          }}
          className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
            mode === "signup"
              ? "bg-card text-espresso shadow-sm"
              : "text-espresso-light hover:text-espresso"
          }`}
        >
          Sign up
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-extrabold">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded-full border border-oat-dark bg-cream px-4 py-2 text-sm font-semibold text-espresso focus:border-flame focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-extrabold">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="rounded-full border border-oat-dark bg-cream px-4 py-2 text-sm font-semibold text-espresso focus:border-flame focus:outline-none"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700 ring-1 ring-red-100">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-2xl bg-green-50 p-3 text-sm font-semibold text-green-700 ring-1 ring-green-100">
          {success}
        </div>
      )}

      <Button type="submit" disabled={loading}>
        {loading
          ? "Please wait…"
          : mode === "signin"
            ? "Sign in"
            : "Create account"}
      </Button>

      <p className="text-center text-sm font-semibold text-espresso-light">
        {mode === "signin" ? (
          <>
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(undefined);
                setSuccess(undefined);
              }}
              className="font-extrabold text-flame hover:text-flame-dark"
            >
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(undefined);
                setSuccess(undefined);
              }}
              className="font-extrabold text-flame hover:text-flame-dark"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </form>
  );
}
