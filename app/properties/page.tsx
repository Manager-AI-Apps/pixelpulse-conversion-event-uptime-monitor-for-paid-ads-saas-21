/**
 * /properties — list all monitored web properties for the signed-in user.
 *
 * Server Component: checks session, fetches properties, renders the shell.
 * Shows a create-property form inline via a dialog (client component below).
 */

import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  Activity,
  ExternalLink,
  LayoutDashboard,
  MonitorPlay,
  Plus,
  Settings,
  Globe,
} from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell, type NavItem } from "@/components/app-shell";
import { PageHeader } from "@/components/blocks/page-header";
import { EmptyState } from "@/components/blocks/empty-state";
import { DataTable, type Column } from "@/components/blocks/data-table";
import { Button } from "@/components/ui/button";
import { listProperties, type PublicProperty } from "@/lib/actions/property";

// ---------------------------------------------------------------------------
// Sidebar nav (shared across all authenticated pages)
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
// Table columns
// ---------------------------------------------------------------------------

const COLUMNS: Column<PublicProperty>[] = [
  {
    key: "name",
    header: "Property",
    cell: (row) => (
      <Link
        href={`/properties/${row.id}`}
        className="font-medium text-foreground hover:text-primary transition-colors"
      >
        {row.name}
      </Link>
    ),
  },
  {
    key: "url",
    header: "URL",
    cell: (row) => (
      <a
        href={row.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {row.url}
        <ExternalLink className="size-3 shrink-0" />
      </a>
    ),
  },
  {
    key: "funnels",
    header: "Funnels",
    cell: (row) => (
      <Button asChild variant="ghost" size="sm">
        <Link href={`/properties/${row.id}/funnels`}>
          <MonitorPlay className="size-4" />
          View funnels
        </Link>
      </Button>
    ),
  },
  {
    key: "created",
    header: "Created",
    cell: (row) =>
      row.createdAt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PropertiesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const properties = await listProperties(session.user.id, db);

  return (
    <AppShell
      appName="PixelPulse"
      nav={NAV}
      header={<span className="font-display text-sm font-medium">Properties</span>}
      footer={
        <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
          <Activity className="size-4" />
          <span className="truncate">{session.user.email}</span>
        </div>
      }
    >
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="Properties"
          description="Monitored web properties. Each property can have multiple funnels tracked by PixelPulse."
          actions={
            <Button asChild size="sm">
              <Link href="/properties/new">
                <Plus className="size-4" />
                Add Property
              </Link>
            </Button>
          }
        />

        <DataTable
          columns={COLUMNS}
          rows={properties}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={Globe}
              title="No properties yet"
              description="Add your first web property to start monitoring your conversion events across GA4, Meta Pixel, and Stripe."
              action={
                <Button asChild size="sm">
                  <Link href="/properties/new">
                    <Plus className="size-4" />
                    Add Property
                  </Link>
                </Button>
              }
            />
          }
        />
      </div>
    </AppShell>
  );
}
