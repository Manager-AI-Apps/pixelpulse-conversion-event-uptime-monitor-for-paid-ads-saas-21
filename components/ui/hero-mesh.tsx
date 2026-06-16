import * as React from "react";

import { cn } from "@/lib/utils";

export interface HeroMeshProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Opacity of the mesh layer. Defaults to 0.5 — the spec target window
   * is 0.40-0.60. Anything higher and the hero text needs its own contrast
   * backdrop to stay legible.
   */
  opacity?: number;
}

/**
 * HeroMesh renders a bold conic / radial mesh-gradient behind hero content.
 * Layers three soft radial gradients (one per brand role) on top of a
 * subtle conic sweep, blended with `screen` so the colors compound into a
 * fluid, Vercel-template-style mesh.
 *
 * If any --brand-* variable is unset, the gradient gracefully decays to a
 * single soft tint (var(--primary) → transparent) so the scaffold builds
 * standalone without a Director-provided palette.
 *
 * Place it as an absolutely-positioned sibling behind hero text:
 *
 *   <section className="relative isolate overflow-hidden">
 *     <HeroMesh />
 *     <div className="relative z-10">...hero content...</div>
 *   </section>
 */
export function HeroMesh({
  className,
  opacity = 0.5,
  style,
  ...props
}: HeroMeshProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
        className,
      )}
      style={{ opacity, ...style }}
      {...props}
    >
      {/* Conic sweep — adds the rotational hue mix that reads as "mesh". */}
      <div
        className="absolute inset-0"
        style={{
          background: `conic-gradient(from 180deg at 50% 50%,
            var(--brand-primary, var(--primary)) 0deg,
            var(--brand-secondary, var(--primary)) 120deg,
            var(--brand-accent, var(--primary)) 240deg,
            var(--brand-primary, var(--primary)) 360deg)`,
          filter: "blur(72px)",
        }}
      />
      {/* Radial blobs — each centered off-screen for soft falloff. */}
      <div
        className="absolute -left-1/4 top-0 h-[60%] w-[60%]"
        style={{
          background: `radial-gradient(closest-side, var(--brand-primary, var(--primary)), transparent 70%)`,
          mixBlendMode: "screen",
          filter: "blur(48px)",
        }}
      />
      <div
        className="absolute -right-1/4 top-1/4 h-[55%] w-[55%]"
        style={{
          background: `radial-gradient(closest-side, var(--brand-secondary, var(--primary)), transparent 70%)`,
          mixBlendMode: "screen",
          filter: "blur(48px)",
        }}
      />
      <div
        className="absolute left-1/3 -bottom-1/4 h-[50%] w-[50%]"
        style={{
          background: `radial-gradient(closest-side, var(--brand-accent, var(--primary)), transparent 70%)`,
          mixBlendMode: "screen",
          filter: "blur(48px)",
        }}
      />
    </div>
  );
}
