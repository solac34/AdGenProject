"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

export default function TopNav() {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Dashboard" },
    { href: "/settings", label: "Agent Settings" },
    { href: "/segmentations", label: "Segmentations" },
    { href: "/populate-data", label: "Populate Data" }
  ];
  const index =
    items.findIndex((i) => i.href === pathname || (i.href !== "/" && pathname.startsWith(i.href))) ?? 0;
  const activeIndex = index < 0 ? 0 : index;

  return (
    <div className="mb-6 flex justify-center pt-4">
      <nav
        className="relative grid items-center rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-sm"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        <motion.div
          className="absolute top-1 bottom-1 rounded-full bg-brand-blue/25 shadow-glow"
          style={{
            width: `calc(100% / ${items.length})`,
            left: `calc(${activeIndex} * (100% / ${items.length}))`
          }}
          transition={{ type: "spring", stiffness: 350, damping: 28 }}
        />
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative z-10 px-4 py-2 text-sm rounded-full text-center transition ${
                active ? "text-white" : "text-zinc-300 hover:text-white"
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


