/**
 * /properties/[propertyId]/funnels/new — create a new funnel.
 *
 * Server Component wrapper; the NewFunnelForm is a client component for
 * interactive step-builder UX.
 */

import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { Activity, Globe, LayoutDashboard, Settings } from "lucide-react";
import { eq, and } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { property as propertyTable } from "@/lib/db/schema";
import { AppShell, type NavItem } from "@/components/app-shell";
import { PageHeader } from "@/components/blocks/page-header";
import { NewFunnelForm } from "./form";

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

export default async function NewFunnelPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  // Verify property ownership before rendering the form
  const prop = await db
    .select({ id: propertyTable.id, name: propertyTable.name })
    .from(propertyTable)
    .where(
      and(
        eq(propertyTable.id, propertyId),
        eq(propertyTable.userId, session.user.id),
      ),
    )
    .then((rows) => rows[0] ?? null);

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
      <div className="max-w-3xl mx-auto space-y-6">
        <PageHeader
          title="New Funnel"
          description={`Add a monitored funnel for ${prop.name}.`}
        />
        <NewFunnelForm propertyId={propertyId} userId={session.user.id} />
      </div>
    </AppShell>
  );
}
