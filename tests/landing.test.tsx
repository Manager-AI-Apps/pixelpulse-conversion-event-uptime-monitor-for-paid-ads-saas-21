import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

// Mock Next.js Link and navigation
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock ThemeToggle to avoid complex dependencies
vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button aria-label="toggle theme">Theme</button>,
}));

describe("landing page", () => {
  it("renders product name PixelPulse and broken pixel text", () => {
    render(<Home />);
    // Product name should appear
    const pixelPulseElements = screen.getAllByText(/PixelPulse/i);
    expect(pixelPulseElements.length).toBeGreaterThan(0);
    // Value prop should mention broken pixel
    expect(screen.getByText(/broken pixel/i)).toBeInTheDocument();
  });

  it("CTA links to /sign-up", () => {
    render(<Home />);
    const signUpLinks = document
      .querySelectorAll("a[href='/sign-up']");
    expect(signUpLinks.length).toBeGreaterThan(0);
  });
});
