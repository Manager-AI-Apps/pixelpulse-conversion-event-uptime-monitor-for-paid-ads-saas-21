import * as React from "react";

// Auth layout — centers the sign-in / sign-up card on the app's canvas. The
// (auth) route group keeps these pages out of the app shell.

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
