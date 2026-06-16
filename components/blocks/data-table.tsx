import * as React from "react";

import { EmptyState } from "@/components/blocks/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// DataTable — a thin, typed wrapper over the shadcn Table. Give it columns +
// rows; numeric columns get right-aligned mono tabular figures automatically,
// and an empty dataset renders an EmptyState instead of a bare table. Keep it
// server-renderable (no client state); reach for the full data grid only when a
// task genuinely needs sorting/pagination.

export type Column<T> = {
  /** Stable key for the column. */
  key: string;
  /** Header label. */
  header: string;
  /** Cell renderer for a row. */
  cell: (row: T) => React.ReactNode;
  /** Right-align + mono tabular-nums for figures. */
  numeric?: boolean;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  /** Stable React key per row; defaults to the array index. */
  getRowKey?: (row: T, index: number) => string;
  /** Shown when there are no rows. Defaults to a generic EmptyState. */
  empty?: React.ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <>
        {empty ?? (
          <EmptyState
            title="Nothing here yet"
            description="Items will show up here once you add them."
          />
        )}
      </>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead
                key={c.key}
                className={c.numeric ? "text-right" : c.className}
              >
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={getRowKey ? getRowKey(row, i) : i}>
              {columns.map((c) => (
                <TableCell
                  key={c.key}
                  className={
                    c.numeric
                      ? "text-right font-mono tabular-nums"
                      : c.className
                  }
                >
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
