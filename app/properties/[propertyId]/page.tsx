/**
 * /properties/[propertyId] — property detail page.
 *
 * Server Component: checks session, fetches property (+ ownership), renders
 * property details and a quick-nav to funnels.
 */

import Link from "next/link";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import {
  Activity,
  ExternalLink,
  Globe,
  LayoutDashboard,
  MonitorPlay,
  Plus,
  Settings,
} from "lucide-react";
import { eq, and } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { property as propertyTable } from "@/lib/db/schema";
import { AppShell, type NavItem } from "@/components/app-shell";
import { PageHeader } from "@/components/blocks/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listFunnels } from "@/lib/actions/funnel";

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

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  // Fetch property + verify ownership in a single query
  const [prop, funnels] = await Promise.all([
    db
      .select()
      .from(propertyTable)
      .where(
        and(
          eq(propertyTable.id, propertyId),
          eq(propertyTable.userId, session.user.id),
        ),
      )
      .then((rows) => rows[0] ?? null),
    listFunnels(propertyId, session.user.id, db),
  ]);

  if (!prop) notFound();

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
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title={prop.name}
          description={prop.url}
          actions={
            <Button asChild variant="outline" size="sm">
              <a href={prop.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" />
                Visit site
              </a>
            </Button>
          }
        />

        {/* Property info card */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="rounded-xl border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base font-medium">
                Snippet Key
              </CardTitle>
              <CardDescription>
                Embed this key in your one-line JS snippet to scope beacon
                events to this property.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <code className="font-mono tabular-nums text-sm break-all bg-muted rounded-md px-2 py-1">
                {prop.snippetKey}
              </code>
            </CardContent>
          </Card>

          <Card className="rounded-xl border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base font-medium">
                Funnels
              </CardTitle>
              <CardDescription>
                {funnels.length === 0
                  ? "No funnels created yet."
                  : `${funnels.length} funnel${funnels.length === 1 ? "" : "s"} configured.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/properties/${propertyId}/funnels`}>
                  <MonitorPlay className="size-4" />
                  View funnels
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href={`/properties/${propertyId}/funnels/new`}>
                  <Plus className="size-4" />
                  Add Funnel
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Recent funnels quick-list */}
        {funnels.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-xl font-medium">Funnels</h2>
            <div className="grid gap-3">
              {funnels.map((f) => (
                <Link
                  key={f.id}
                  href={`/properties/${propertyId}/funnels/${f.id}`}
                  className="group flex items-center justify-between rounded-xl border bg-card p-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <MonitorPlay className="size-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-foreground group-hover:text-primary transition-colors">
                        {f.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Every {f.scheduleMinutes} min ·{" "}
                        {f.enabled ? "Active" : "Paused"}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
