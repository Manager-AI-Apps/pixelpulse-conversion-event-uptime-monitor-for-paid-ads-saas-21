/**
 * /properties/[propertyId]/snippet
 *
 * Shows the one-line install snippet for a property.  Treat the snippet URL as
 * a secret — it contains the snippetKey that scopes all beacon events.
 * Authenticated, ownership-verified server component.
 */

import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Code,
  Globe,
  LayoutDashboard,
  Settings,
} from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { property as propertyTable } from "@/lib/db/schema";
import { AppShell, type NavItem } from "@/components/app-shell";
import { PageHeader } from "@/components/blocks/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Nav
// ---------------------------------------------------------------------------

const NAV: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: <LayoutDashboard className="size-4" />,
  },
  {
    title: "Properties",
    href: "/properties",
    icon: <Globe className="size-4" />,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: <Settings className="size-4" />,
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SnippetPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const prop = await db
    .select({
      id: propertyTable.id,
      name: propertyTable.name,
      url: propertyTable.url,
      snippetKey: propertyTable.snippetKey,
    })
    .from(propertyTable)
    .where(
      and(
        eq(propertyTable.id, propertyId),
        eq(propertyTable.userId, session.user.id),
      ),
    )
    .then((rows) => rows[0] ?? null);

  if (!prop) notFound();

  const scriptTag = `<script src="/api/snippet/${prop.snippetKey}" async></script>`;

  return (
    <AppShell
      appName="PixelPulse"
      nav={NAV}
      header={
        <span className="font-display text-sm font-medium">{prop.name}</span>
      }
      footer={
        <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
          <Activity className="size-4" />
          <span className="truncate">{session.user.email}</span>
        </div>
      }
    >
      <div className="max-w-3xl mx-auto space-y-6">
        <PageHeader
          title="Install Snippet"
          description={`One-line tracking snippet for ${prop.name}`}
        />

        {/* Security warning */}
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">
              Treat this snippet as a secret
            </p>
            <p className="text-sm text-muted-foreground">
              The URL contains your property&apos;s unique snippet key. Anyone
              with this key can send events to your property. Do not commit it
              to a public repository.
            </p>
          </div>
        </div>

        {/* Installation card */}
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Code className="size-4 text-muted-foreground" />
              <CardTitle className="font-display text-base font-medium">
                Installation
              </CardTitle>
              <Badge variant="secondary" className="ml-auto text-xs">
                Step 1 of 1
              </Badge>
            </div>
            <CardDescription>
              Paste this tag inside the{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
                &lt;head&gt;
              </code>{" "}
              of every page you want to monitor. The script fires a{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
                pageview
              </code>{" "}
              event automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm font-mono tabular-nums">
              <code>{scriptTag}</code>
            </pre>

            <p className="text-sm text-muted-foreground">
              You can also fire custom events from your JavaScript:
            </p>

            <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm font-mono tabular-nums">
              <code>{`window.pixelpulse('purchase', { value: 99, currency: 'USD' });`}</code>
            </pre>
          </CardContent>
        </Card>

        {/* How it works card */}
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-base font-medium">
              How it works
            </CardTitle>
            <CardDescription>
              PixelPulse validates every beacon against your registered domain
              and rate-limits abusive traffic automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm text-muted-foreground">
              {[
                "Events are scoped to this property — only requests originating from your domain are accepted.",
                "Sensitive fields (email, name, phone, card numbers, tokens) are stripped before any data is stored.",
                "Requests are rate-limited at 60 events per minute per visitor IP to prevent abuse.",
              ].map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
