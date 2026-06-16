import Link from "next/link";
import {
  Activity,
  Bell,
  MonitorPlay,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeatureGrid, type Feature } from "@/components/blocks/feature-grid";
import { Hero } from "@/components/blocks/hero";
import { ThemeToggle } from "@/components/theme-toggle";

// expected_routes: /sign-in /sign-up

const FEATURES: Feature[] = [
  {
    icon: <MonitorPlay className="size-6" />,
    title: "Visual Funnel Recorder",
    description:
      "Click-record your signup or checkout path once in the Chrome extension. PixelPulse replays it on a headless browser every 15 minutes from a clean residential IP.",
  },
  {
    icon: <ShieldCheck className="size-6" />,
    title: "Per-Step Event Assertions",
    description:
      "Assert GA4, Meta Pixel (browser + CAPI), Google Ads conversion linker, and Stripe Purchase events — checking event name, currency, value, and dedup key at every funnel step.",
  },
  {
    icon: <Bell className="size-6" />,
    title: "Slack Alerts with Diagnosis",
    description:
      "Get a Slack message with an exact diagnosis — \"Purchase fired without value\", \"duplicate via gtag + GTM\", or \"CAPI silent fail\" — not just a generic check-failed ping.",
  },
  {
    icon: <Activity className="size-6" />,
    title: "Uptime Dashboard",
    description:
      "See every synthetic run, event assertion result, and alert history in one place. Spot trends before your ad spend optimizes against a vanity event.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="font-display text-base font-semibold tracking-tight">
          PixelPulse
        </span>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-up">Sign up</Link>
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <Hero
        eyebrow={
          <Badge variant="secondary">Conversion event monitoring</Badge>
        }
        title="Stop burning ad spend on a broken pixel."
        subtitle="PixelPulse continuously simulates your signup and checkout flow, then alerts you in Slack the moment your GA4, Meta Pixel, Google Ads, or Stripe Purchase event stops firing."
        actions={
          <>
            <Button asChild size="lg">
              <Link href="/sign-up">Start monitoring free</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </>
        }
      />

      <FeatureGrid features={FEATURES} />

      <section className="mx-auto max-w-3xl px-6 pb-24 text-center">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Ready to protect your ad spend?
        </h2>
        <p className="mt-3 text-muted-foreground">
          One-line JS snippet install. No GTM expertise required. If your
          Purchase event breaks today, PixelPulse calls it out before the week
          is out.
        </p>
        <div className="mt-8">
          <Button asChild size="lg">
            <Link href="/sign-up">Get started — it&apos;s free</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
