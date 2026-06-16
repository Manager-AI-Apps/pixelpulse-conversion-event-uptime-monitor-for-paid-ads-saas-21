import Link from "next/link";
import { BarChart3, Layers, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeatureGrid, type Feature } from "@/components/blocks/feature-grid";
import { Hero } from "@/components/blocks/hero";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Scaffold landing page — a working REFERENCE that composes the Hero +
 * FeatureGrid blocks. Every build MUST replace this with a product-specific
 * landing (real name, value prop, and features tied to the spec) using these
 * same blocks. Shipping this generic copy is a defect the conformance gate
 * catches.
 */
const FEATURES: Feature[] = [
  {
    icon: <BarChart3 className="size-6" />,
    title: "Dashboards out of the box",
    description:
      "Stat cards, data tables, and an app shell ready to render real data.",
  },
  {
    icon: <Layers className="size-6" />,
    title: "Composable blocks",
    description:
      "Hero, pricing, tables, empty states — all wired to the design system.",
  },
  {
    icon: <ShieldCheck className="size-6" />,
    title: "Themed per app",
    description:
      "Each build gets its own archetype: fonts, canvas, and accent that fit it.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="font-display text-base font-semibold tracking-tight">
          Build Engine
        </span>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-up">Get started</Link>
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <Hero
        eyebrow={<Badge variant="secondary">Generated end-to-end</Badge>}
        title="Modern SaaS, generated end-to-end."
        subtitle="This scaffold ships the design system every Build Engine app inherits: a per-app archetype, a shadcn UI kit, an app shell, and ready-made blocks."
        actions={
          <>
            <Button asChild size="lg">
              <Link href="/sign-up">Get started</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </>
        }
      />

      <FeatureGrid features={FEATURES} />
    </main>
  );
}
