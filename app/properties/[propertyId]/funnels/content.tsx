"use client";

/**
 * FunnelListContent — pure render component for the /properties/[propertyId]/funnels page.
 *
 * Accepts pre-fetched funnel data as props so it can be tested in Vitest
 * without hitting the database. The parent server component (page.tsx) fetches
 * the data and passes it in.
 */

import * as React from "react";
import Link from "next/link";
import { Plus, MonitorPlay } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/blocks/data-table";
import { EmptyState } from "@/components/blocks/empty-state";
import { PageHeader } from "@/components/blocks/page-header";
import type { PublicFunnel } from "@/lib/actions/funnel";

// ---------------------------------------------------------------------------
// Column definition
// ---------------------------------------------------------------------------

function makeFunnelColumns(propertyId: string): Column<PublicFunnel>[] {
  return [
    {
      key: "name",
      header: "Funnel",
      cell: (row) => (
        <Link
          href={`/properties/${propertyId}/funnels/${row.id}`}
          className="font-medium text-foreground hover:text-primary transition-colors"
        >
          {row.name}
        </Link>
      ),
    },
    {
      key: "schedule",
      header: "Schedule",
      numeric: true,
      cell: (row) => `Every ${row.scheduleMinutes}m`,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) =>
        row.enabled ? (
          <Badge variant="secondary" className="gap-1">
            <span className="size-1.5 rounded-full bg-green-500 inline-block" />
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Paused
          </Badge>
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
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function FunnelListContent({
  funnels,
  propertyId,
}: {
  funnels: PublicFunnel[];
  propertyId: string;
}) {
  const columns = React.useMemo(
    () => makeFunnelColumns(propertyId),
    [propertyId],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Funnels"
        description="Monitored click-paths that PixelPulse replays on a schedule to verify your conversion tracking."
        actions={
          <Button asChild size="sm">
            <Link href={`/properties/${propertyId}/funnels/new`}>
              <Plus className="size-4" />
              Add Funnel
            </Link>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={funnels}
        getRowKey={(row) => row.id}
        empty={
          <EmptyState
            icon={MonitorPlay}
            title="No funnels yet"
            description="Record your first signup or checkout path and PixelPulse will monitor your pixel events every 15 minutes."
            action={
              <Button asChild size="sm">
                <Link href={`/properties/${propertyId}/funnels/new`}>
                  <Plus className="size-4" />
                  Add Funnel
                </Link>
              </Button>
            }
          />
        }
      />
    </div>
  );
}
