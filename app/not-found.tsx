import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Rendered automatically by Next.js for unmatched routes and whenever code
 * calls notFound(). Server Component — no "use client" needed. Ships in the
 * scaffold; keep it.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12 text-center text-foreground">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Page not found
      </h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        That page does not exist or may have moved.
      </p>
      <div className="mt-8">
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </main>
  );
}
