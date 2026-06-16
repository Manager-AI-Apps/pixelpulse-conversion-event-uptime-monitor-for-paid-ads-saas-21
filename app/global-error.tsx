"use client";

/**
 * Global error boundary — the last line of defense, rendered only when the root
 * layout itself throws. Because it replaces the root layout, it must provide
 * its own <html>/<body>, and globals.css is NOT loaded here — so inline styles
 * are the documented Next.js exception to the "no inline styles" rule (Tailwind
 * tokens are unavailable in this context).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "3rem 1.5rem",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: "#0b0b0c",
          color: "#fafafa",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: "0.5rem", color: "#a1a1aa", fontSize: "0.95rem" }}>
            A critical error occurred while loading the app. Please try again.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1.25rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#fafafa",
              color: "#0b0b0c",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
