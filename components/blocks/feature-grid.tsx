import * as React from "react";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// FeatureGrid — the "what it does" section of a landing page. Tie each feature
// to a real must-have capability from the spec. `icon` is a rendered element,
// e.g. icon: <ShieldCheck className="size-6" />.

export type Feature = {
  icon?: React.ReactNode;
  title: string;
  description: string;
};

export function FeatureGrid({ features }: { features: Feature[] }) {
  return (
    <section className="mx-auto grid max-w-6xl gap-6 px-6 py-20 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((feature, i) => (
        <Card key={i}>
          <CardHeader>
            {feature.icon ? (
              <div className="mb-2 text-primary">{feature.icon}</div>
            ) : null}
            <CardTitle className="font-display text-lg">{feature.title}</CardTitle>
            <CardDescription>{feature.description}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </section>
  );
}
