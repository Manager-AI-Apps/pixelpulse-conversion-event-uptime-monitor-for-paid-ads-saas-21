"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Route-segment error boundary. Next.js renders this automatically when a
 * Server or Client Component in this segment throws at runtime, instead of
 * crashing to a blank screen. Must be a Client Component ("use client").
 * Ships in the scaffold — extend per-route with segment-level error.tsx where
 * a screen needs bespoke recovery copy; don't delete this top-level one.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the console (and any wired error tracker) so production
    // failures are diagnosable from logs.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-md rounded-xl border border-destructive/40 bg-destructive/5 p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="size-6 text-destructive" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An unexpected error occurred. Try again, and if it keeps happening,
          come back in a little while.
        </p>
        <div className="mt-6 flex justify-center">
          <Button onClick={() => reset()}>Try again</Button>
        </div>
      </div>
    </main>
  );
}
