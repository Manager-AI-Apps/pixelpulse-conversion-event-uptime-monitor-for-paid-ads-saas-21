"use client";

// AppShell — the authenticated frame for every signed-in page.
//
// Wraps content in shadcn's sidebar (responsive: a fixed rail on desktop, a
// slide-over sheet on mobile) + a sticky header with the sidebar trigger, an
// optional page-title/breadcrumb slot, and the theme toggle. Pass `nav` for the
// menu; the active item is derived from the current path. Colors come entirely
// from the archetype tokens (see app/globals.css --sidebar-*), so the shell
// matches the app's theme automatically.
//
// Usage (from a server component page):
//   <AppShell appName="InboxGuard" nav={NAV} header={<PageHeader title="Overview" />}>
//     ...page content...
//   </AppShell>

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export type NavItem = {
  title: string;
  href: string;
  /**
   * A rendered icon ELEMENT, e.g. `icon: <Inbox className="size-4" />`.
   * Pass an element, not a component reference — AppShell is a client
   * component, and function/component props can't cross the server→client
   * boundary (a server page rendering AppShell would otherwise error).
   */
  icon?: React.ReactNode;
};

export function AppShell({
  appName,
  nav,
  header,
  footer,
  children,
}: {
  appName: string;
  nav: NavItem[];
  /** Optional page title / breadcrumb rendered at the left of the top bar. */
  header?: React.ReactNode;
  /** Optional sidebar footer content (e.g. a user menu / sign-out). */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="font-display text-base font-semibold tracking-tight">
              {appName}
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {nav.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                      >
                        <Link href={item.href}>
                          {item.icon}
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        {footer ? <SidebarFooter>{footer}</SidebarFooter> : null}
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex flex-1 items-center justify-between gap-2">
            <div className="min-w-0">{header}</div>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
