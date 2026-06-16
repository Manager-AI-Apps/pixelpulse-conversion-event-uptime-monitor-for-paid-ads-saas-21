/**
 * /properties/[propertyId]/funnels — funnel list for a property.
 *
 * Server Component: checks session, verifies property ownership,
 * fetches funnels, renders FunnelListContent (client component).
 */

import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { Activity, Globe, LayoutDashboard, Settings } from "lucide-react";
import { eq, and } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { property as propertyTable } from "@/lib/db/schema";
import { AppShell, type NavItem } from "@/components/app-shell";
import { listFunnels } from "@/lib/actions/funnel";
import { FunnelListContent } from "./content";

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

export default async function FunnelsPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  // Verify property ownership
  const [prop, funnels] = await Promise.all([
    db
      .select({ id: propertyTable.id, name: propertyTable.name })
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
      <div className="max-w-6xl mx-auto">
        <FunnelListContent funnels={funnels} propertyId={propertyId} />
      </div>
    </AppShell>
  );
}
