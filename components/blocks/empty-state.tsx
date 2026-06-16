import * as React from "react";
import type { LucideIcon } from "lucide-react";

// EmptyState — the friendly "nothing here yet" panel. Every list/table MUST
// render one of these instead of a blank area, with a first-action CTA so the
// app never looks broken on first visit. Voice should match the product's
// art direction.

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-10 text-center sm:p-12">
      {Icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
      ) : null}
      <h3 className="font-display text-base font-medium">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
