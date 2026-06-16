import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Standard shadcn `cn` helper. Composes class names with `clsx` and resolves
 * Tailwind conflicts (e.g. `px-2 px-4` → `px-4`) with `tailwind-merge`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
