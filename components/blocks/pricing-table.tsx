import * as React from "react";
import { Check } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// PricingTable — subscription tiers for apps that take payments. Mark the
// recommended tier with `featured`. `cta` is the button (e.g. a link to
// /sign-up or a Stripe checkout action).

export type PricingTier = {
  name: string;
  price: string;
  period?: string;
  description?: string;
  features: string[];
  cta?: React.ReactNode;
  featured?: boolean;
};

export function PricingTable({ tiers }: { tiers: PricingTier[] }) {
  return (
    <section className="mx-auto grid max-w-5xl gap-6 px-6 py-20 md:grid-cols-2 lg:grid-cols-3">
      {tiers.map((tier) => (
        <Card
          key={tier.name}
          className={tier.featured ? "border-primary shadow-md" : undefined}
        >
          <CardHeader>
            <CardTitle className="font-display text-lg">{tier.name}</CardTitle>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-3xl font-semibold tabular-nums">
                {tier.price}
              </span>
              {tier.period ? (
                <span className="text-sm text-muted-foreground">
                  /{tier.period}
                </span>
              ) : null}
            </div>
            {tier.description ? (
              <CardDescription>{tier.description}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-5">
            <ul className="space-y-2 text-sm">
              {tier.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            {tier.cta}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
