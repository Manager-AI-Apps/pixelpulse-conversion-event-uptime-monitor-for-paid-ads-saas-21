import * as React from "react";

import { HeroMesh } from "@/components/ui/hero-mesh";

// Hero — the top of a marketing/landing page. Brand mesh backdrop + a centered
// headline, subtitle, and CTA slot. Fill with the product's real name and value
// prop (never generic SaaS copy). `eyebrow` is a small pill/label above the
// title; `actions` is the CTA button row.

export function Hero({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden px-6 pb-20 pt-16 sm:pt-24">
      <HeroMesh />
      <div className="relative z-10 mx-auto max-w-3xl text-center">
        {eyebrow ? <div className="mb-5 flex justify-center">{eyebrow}</div> : null}
        <h1 className="text-balance font-display text-4xl font-semibold tracking-tight sm:text-6xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl">
            {subtitle}
          </p>
        ) : null}
        {actions ? (
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  );
}
