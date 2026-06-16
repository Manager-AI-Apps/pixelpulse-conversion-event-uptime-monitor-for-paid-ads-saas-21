/**
 * DashboardContent — pure render component for the /dashboard page.
 *
 * Accepts pre-fetched DashboardData as a prop so it can be tested in Vitest
 * without hitting the database. The parent server component (page.tsx) fetches
 * the data and passes it in.
 */

import * as React from "react";
import { Activity, CheckCircle2, XCircle } from "lucide-react";

import { DataTable, type Column } from "@/components/blocks/data-table";
import { EmptyState } from "@/components/blocks/empty-state";
import { PageHeader } from "@/components/blocks/page-header";
import { StatCard } from "@/components/blocks/stat-card";
import type { DashboardData, RunSummary } from "@/lib/queries/dashboard";

// ---------------------------------------------------------------------------
// Table column definition
// ---------------------------------------------------------------------------

const COLUMNS: Column<RunSummary>[] = [
  {
    key: "funnel",
    header: "Funnel",
    cell: (row) => (
      <span className="font-medium text-foreground">{row.funnelName}</span>
    ),
  },
  {
    key: "property",
    header: "Property",
    cell: (row) => (
      <span className="text-muted-foreground">{row.propertyName}</span>
    ),
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: "uptime7d",
    header: "7 Days",
    numeric: true,
    cell: (row) => `${row.uptimePct7d.toFixed(1)}%`,
  },
  {
    key: "uptime30d",
    header: "30 Days",
    numeric: true,
    cell: (row) => `${row.uptimePct30d.toFixed(1)}%`,
  },
  {
    key: "diagnosis",
    header: "Last Diagnosis",
    cell: (row) =>
      row.diagnosis ? (
        <span className="text-sm text-muted-foreground">{row.diagnosis}</span>
      ) : (
        <span className="text-xs text-muted-foreground/50">—</span>
      ),
  },
];

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  if (status === "passed") {
    return (
      <span className="flex items-center gap-1 text-sm font-medium text-green-600 dark:text-green-400">
        <CheckCircle2 className="size-3.5" />
        Passed
      </span>
    );
  }
  if (status === "failed" || status === "error") {
    return (
      <span className="flex items-center gap-1 text-sm font-medium text-destructive">
        <XCircle className="size-3.5" />
        {status === "error" ? "Error" : "Failed"}
      </span>
    );
  }
  // running or other
  return (
    <span className="text-sm text-muted-foreground capitalize">{status}</span>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function DashboardContent({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-6">
      {/* Page title */}
      <PageHeader
        title="Dashboard"
        description="Track funnel uptime over 7 days and 30 days."
      />

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Funnels" value={data.totalFunnels} icon={Activity} />
        <StatCard
          label="Passing"
          value={data.passingFunnels}
          icon={CheckCircle2}
          hint="Latest run passed"
        />
        <StatCard
          label="Failing"
          value={data.failingFunnels}
          icon={XCircle}
          hint="Latest run failed or errored"
        />
      </div>

      {/* Recent runs table */}
      <section className="space-y-3">
        <h2 className="font-display text-xl font-medium">Recent Monitor Runs</h2>
        <DataTable
          columns={COLUMNS}
          rows={data.recentRuns}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              title="No monitor runs yet"
              description="Set up your first funnel to start tracking conversion events across GA4, Meta Pixel, and Stripe."
              icon={Activity}
            />
          }
        />
      </section>
    </div>
  );
}
