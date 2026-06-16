/**
 * /dashboard — authenticated overview page.
 *
 * Server Component: checks session, fetches dashboard data, renders the shell
 * and passes data to the client-renderable DashboardContent component.
 * Never hits the DB in middleware (edge-safe check is in middleware.ts).
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Activity, LayoutDashboard, MonitorPlay, Settings } from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell, type NavItem } from "@/components/app-shell";
import { dashboardQuery } from "@/lib/queries/dashboard";
import { DashboardContent } from "./content";

// ---------------------------------------------------------------------------
// Nav items for the sidebar
// ---------------------------------------------------------------------------

const NAV: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: <LayoutDashboard className="size-4" />,
  },
  {
    title: "Funnels",
    href: "/funnels",
    icon: <MonitorPlay className="size-4" />,
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

export default async function DashboardPage() {
  // Real session check in Node runtime (not edge middleware)
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/sign-in");
  }

  const data = await dashboardQuery(db, session.user.id);

  return (
    <AppShell
      appName="PixelPulse"
      nav={NAV}
      footer={
        <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
          <Activity className="size-4" />
          <span className="truncate">{session.user.email}</span>
        </div>
      }
    >
      <DashboardContent data={data} />
    </AppShell>
  );
}
