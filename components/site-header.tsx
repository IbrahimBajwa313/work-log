"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarRange,
  LayoutDashboard,
  Menu,
  Moon,
  Shield,
  Sun,
  Target,
  X,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  /** Match only exact path (for home). */
  exact?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "App",
    items: [
      { href: "/", label: "Dashboard", Icon: LayoutDashboard, exact: true },
      { href: "/monthly-targets", label: "Monthly Targets", Icon: Target },
      { href: "/yearly-targets", label: "Yearly Plans", Icon: CalendarRange },
    ],
  },
  {
    label: "Azkar",
    items: [
      { href: "/morning-azkar", label: "Morning Azkar", Icon: Sun },
      { href: "/evening-azkar", label: "Evening Azkar", Icon: Moon },
    ],
  },
  {
    label: "Admin",
    items: [{ href: "/admin", label: "Admin Panel", Icon: Shield }],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function navLinkClass(active: boolean, compact = false) {
  return `inline-flex items-center gap-2 rounded-xl font-semibold transition-all ${
    compact ? "px-3 py-2 text-sm w-full" : "px-3 py-2 text-sm"
  } ${
    active
      ? "bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-cyan-2)] text-[#070d0d] shadow-[0_0_18px_-4px_var(--accent-cyan-glow)]"
      : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-white"
  }`;
}

export function SiteHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  if (pathname.startsWith("/admin")) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--card-border)] bg-[#070d0d]/90 backdrop-blur-xl safe-top">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="group flex min-w-0 shrink items-center gap-2.5 rounded-xl py-1 pr-2 transition-opacity hover:opacity-90"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Work Logging"
            className="h-9 w-auto shrink-0 sm:h-10"
          />
          <span className="hidden truncate text-sm font-extrabold tracking-tight text-white sm:block sm:text-base">
            Work Logging
          </span>
        </Link>

        <nav
          className="hidden items-center gap-1 lg:flex"
          aria-label="Main navigation"
        >
          {ALL_ITEMS.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={navLinkClass(active)}
                aria-current={active ? "page" : undefined}
              >
                <item.Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="touch-target inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--card-border)] bg-white/5 text-white transition-colors hover:border-[var(--accent-cyan)]/40"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <Link
          href="/"
          className="hidden items-center gap-1.5 rounded-xl border border-[var(--card-border)] bg-white/5 px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:text-white md:inline-flex lg:hidden"
        >
          <BarChart3 className="h-3.5 w-3.5 text-[var(--accent-cyan)]" />
          Dashboard
        </Link>
      </div>

      {mobileOpen ? (
        <>
          <button
            type="button"
            aria-label="Close menu overlay"
            className="fixed inset-0 top-[57px] z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <nav
            id="mobile-nav"
            className="relative z-50 border-t border-[var(--card-border)] bg-[#070d0d]/98 px-4 py-4 lg:hidden"
            aria-label="Mobile navigation"
          >
            <div className="mx-auto max-w-7xl space-y-5">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    {group.label}
                  </p>
                  <ul className="space-y-1">
                    {group.items.map((item) => {
                      const active = isActive(pathname, item);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={navLinkClass(active, true)}
                            aria-current={active ? "page" : undefined}
                          >
                            <item.Icon className="h-4 w-4 shrink-0" />
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </nav>
        </>
      ) : null}
    </header>
  );
}
