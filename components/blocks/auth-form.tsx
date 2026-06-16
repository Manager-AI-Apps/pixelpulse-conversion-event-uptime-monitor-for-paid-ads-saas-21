"use client";

// AuthForm — the shared email + password form for sign-in and sign-up, wired to
// Better Auth (lib/auth-client). Pre-built so every app gets a consistent,
// accessible auth experience. If a spec needs Google sign-in, add a
// "Continue with Google" button that calls
// authClient.signIn.social({ provider: "google", callbackURL: redirectTo }).

import * as React from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({
  mode,
  redirectTo = "/dashboard",
}: {
  mode: "sign-in" | "sign-up";
  redirectTo?: string;
}) {
  const router = useRouter();
  const isSignUp = mode === "sign-up";
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "");
    try {
      const res = isSignUp
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });
      if (res.error) {
        setError(res.error.message ?? "Something went wrong. Please try again.");
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {isSignUp ? (
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" required />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          required
          minLength={8}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={loading}>
        {/* Labels double as conformance text markers: the deploy gate checks
            /sign-up for "Sign up" and /sign-in for "Sign in". Keep them. */}
        {loading ? "Please wait…" : isSignUp ? "Sign up" : "Sign in"}
      </Button>
    </form>
  );
}
