// Registers @testing-library/jest-dom matchers (toBeInTheDocument, etc.) with
// Vitest's expect and auto-cleans the DOM after each test.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
