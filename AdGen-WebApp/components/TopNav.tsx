"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function TopNav() {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Dashboard" },
    { href: "/settings", label: "Agent Settings" }
  ];
  return (
    <div className="mb-6 flex justify-center">
      <nav className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-sm">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-2 text-sm rounded-full transition ${
                active
                  ? "bg-brand-blue text-white shadow-[0_8px_30px_rgba(0,122,204,0.35)]"
                  : "text-zinc-300 hover:text-white hover:bg-white/10"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}


