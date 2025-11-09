"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { ReactNode } from "react";

function Tab({ href, label, icon }: { href: string; label: string; icon: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname.startsWith(href));
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition",
        active
          ? "bg-brand-blue/20 text-white border border-brand-blue/40 shadow-glow"
          : "bg-white/5 text-zinc-300 hover:bg-white/10 border border-white/10"
      )}
    >
      <span className="h-4 w-4">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

export default function TopTabs() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-brand-gray4/80 backdrop-blur supports-[backdrop-filter]:bg-brand-gray4/60 border-b border-white/10">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 py-3 flex items-center gap-2">
        <Tab
          href="/"
          label="Dashboard"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
              <path strokeWidth="2" d="M3 12h7V3H3v9zm0 9h7v-7H3v7zm11 0h7V12h-7v9zm0-18v7h7V3h-7z" />
            </svg>
          }
        />
        <Tab
          href="/agent-settings"
          label="Agent Settings"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
              <path strokeWidth="2" d="M12 6V3m0 18v-3m6-6h3M3 12h3m10.95 4.95 2.12 2.12M4.93 4.93 7.05 7.05m0 9.9-2.12 2.12m12.02-12.02 2.12-2.12" />
            </svg>
          }
        />
        <Tab
          href="/segmentations"
          label="Segmentation Settings"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
              <path strokeWidth="2" d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
            </svg>
          }
        />
      </div>
    </nav>
  );
}


