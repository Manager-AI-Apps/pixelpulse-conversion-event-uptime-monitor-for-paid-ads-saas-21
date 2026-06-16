"use client";

/**
 * NewFunnelForm — interactive client component for creating a funnel with
 * ordered steps. Validates expectedEvents inline so founders can't save a
 * step with a blank eventName.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { createFunnel } from "@/lib/actions/funnel";
import type { FunnelStepInput } from "@/lib/actions/funnel";

// ---------------------------------------------------------------------------
// Step editor row
// ---------------------------------------------------------------------------

type StepDraft = Omit<FunnelStepInput, "expectedEvents"> & {
  id: string;
  expectedEventsRaw: string; // JSON string for the textarea
};

function StepRow({
  step,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  error,
}: {
  step: StepDraft;
  index: number;
  total: number;
  onChange: (id: string, patch: Partial<StepDraft>) => void;
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  error?: string;
}) {
  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-sm font-medium text-muted-foreground">
            Step {index + 1}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-7 p-0"
              disabled={index === 0}
              onClick={() => onMoveUp(step.id)}
              aria-label="Move step up"
            >
              <ChevronUp className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-7 p-0"
              disabled={index === total - 1}
              onClick={() => onMoveDown(step.id)}
              aria-label="Move step down"
            >
              <ChevronDown className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-7 p-0 text-destructive hover:text-destructive"
              onClick={() => onRemove(step.id)}
              aria-label="Remove step"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`url-${step.id}`} className="text-sm font-medium">
            URL <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`url-${step.id}`}
            placeholder="https://example.com/checkout"
            value={step.url}
            onChange={(e) => onChange(step.id, { url: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`action-${step.id}`} className="text-sm font-medium">
            Action description
          </Label>
          <Input
            id={`action-${step.id}`}
            placeholder="Click 'Buy now' button"
            value={step.action ?? ""}
            onChange={(e) => onChange(step.id, { action: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Human-readable description of what the headless browser does at
            this step.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor={`events-${step.id}`}
            className="text-sm font-medium"
          >
            Expected events (JSON)
          </Label>
          <textarea
            id={`events-${step.id}`}
            className="w-full min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
            placeholder={`[{"eventName": "purchase", "currency": "USD", "value": 99}]`}
            value={step.expectedEventsRaw}
            onChange={(e) =>
              onChange(step.id, { expectedEventsRaw: e.target.value })
            }
          />
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Array of objects with <code className="font-mono">eventName</code>{" "}
              (required), <code className="font-mono">currency</code>,{" "}
              <code className="font-mono">value</code>, and{" "}
              <code className="font-mono">dedupKey</code>.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

function newStep(): StepDraft {
  return {
    id: crypto.randomUUID(),
    url: "",
    action: "",
    expectedEventsRaw: "[]",
  };
}

export function NewFunnelForm({
  propertyId,
  userId,
}: {
  propertyId: string;
  userId: string;
}) {
  const router = useRouter();

  const [name, setName] = React.useState("");
  const [scheduleMinutes, setScheduleMinutes] = React.useState(15);
  const [steps, setSteps] = React.useState<StepDraft[]>([newStep()]);
  const [stepErrors, setStepErrors] = React.useState<Record<string, string>>(
    {},
  );
  const [globalError, setGlobalError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // -------------------------------------------------------------------------
  // Step mutations
  // -------------------------------------------------------------------------

  function handleStepChange(id: string, patch: Partial<StepDraft>) {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
    // Clear field-level error on change
    setStepErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function handleRemoveStep(id: string) {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }

  function handleMoveUp(id: string) {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }

  function handleMoveDown(id: string) {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGlobalError(null);
    setStepErrors({});

    // Validate step URLs
    const urlErrors: Record<string, string> = {};
    for (const step of steps) {
      if (!step.url.trim()) {
        urlErrors[step.id] = "URL is required.";
      }
    }
    if (Object.keys(urlErrors).length > 0) {
      setStepErrors(urlErrors);
      return;
    }

    // Parse expectedEvents JSON per step
    const parsedSteps: FunnelStepInput[] = [];
    const jsonErrors: Record<string, string> = {};

    for (const step of steps) {
      const raw = step.expectedEventsRaw.trim();
      if (!raw || raw === "[]") {
        parsedSteps.push({ url: step.url.trim(), action: step.action || undefined, expectedEvents: [] });
        continue;
      }
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          jsonErrors[step.id] = "Expected events must be a JSON array.";
          continue;
        }
        parsedSteps.push({
          url: step.url.trim(),
          action: step.action || undefined,
          expectedEvents: parsed as FunnelStepInput["expectedEvents"],
        });
      } catch {
        jsonErrors[step.id] = "Invalid JSON — check for missing quotes or commas.";
      }
    }

    if (Object.keys(jsonErrors).length > 0) {
      setStepErrors(jsonErrors);
      return;
    }

    setPending(true);
    try {
      await createFunnel({
        propertyId,
        userId,
        name: name.trim(),
        scheduleMinutes,
        steps: parsedSteps,
      });
      router.push(`/properties/${propertyId}/funnels`);
      router.refresh();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to create funnel.";
      setGlobalError(msg);
    } finally {
      setPending(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Funnel metadata */}
      <Card className="rounded-xl border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="font-display text-base font-medium">
            Funnel details
          </CardTitle>
          <CardDescription>
            Give the funnel a name and choose how often PixelPulse should replay
            it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="funnel-name" className="text-sm font-medium">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="funnel-name"
              placeholder="Checkout funnel"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="schedule" className="text-sm font-medium">
              Check interval (minutes)
            </Label>
            <Input
              id="schedule"
              type="number"
              min={5}
              max={1440}
              value={scheduleMinutes}
              onChange={(e) =>
                setScheduleMinutes(Number(e.target.value) || 15)
              }
            />
            <p className="text-xs text-muted-foreground">
              How often (in minutes) to run the synthetic browser replay.
              Minimum 5 minutes.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Steps */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-medium">Steps</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSteps((prev) => [...prev, newStep()])}
          >
            <Plus className="size-4" />
            Add step
          </Button>
        </div>

        {steps.map((step, index) => (
          <StepRow
            key={step.id}
            step={step}
            index={index}
            total={steps.length}
            onChange={handleStepChange}
            onRemove={handleRemoveStep}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            error={stepErrors[step.id]}
          />
        ))}
      </section>

      {/* Global error */}
      {globalError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">{globalError}</p>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Creating…" : "Create funnel"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
