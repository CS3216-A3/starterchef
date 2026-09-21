"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/button";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/today";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(undefined);

    const supabase = createClient();
    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (mode === "signin") {
      router.push(next);
      router.refresh();
    } else {
      setMessage(
        "Check your email for a confirmation link, then sign in here.",
      );
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-4 rounded-3xl bg-card p-6 shadow-sm ring-1 ring-oat"
    >
      <h1 className="text-2xl font-extrabold">
        {mode === "signin" ? "Sign in" : "Create account"}
      </h1>

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

      <Button type="submit" disabled={loading}>
        {loading
          ? "Please wait…"
          : mode === "signin"
            ? "Sign in"
            : "Create account"}
      </Button>

      <button
        type="button"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        className="text-sm font-semibold text-espresso-light hover:text-espresso"
      >
        {mode === "signin"
          ? "Don't have an account? Sign up"
          : "Already have an account? Sign in"}
      </button>

      {message && (
        <p className="text-center text-sm font-semibold text-flame-dark">
          {message}
        </p>
      )}
    </form>
  );
}
