"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

export default function TopNav() {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Dashboard" },
    { href: "/settings", label: "Agent Settings" }
  ];
  const index = Math.max(
    0,
    items.findIndex((i) => i.href === pathname)
  );

  return (
    <div className="mb-6 flex justify-center pt-4">
      <nav className="relative grid grid-cols-2 items-center rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-sm">
        <motion.div
          className="absolute top-1 bottom-1 rounded-full bg-brand-blue/25 shadow-glow"
          style={{ width: "calc(100% / 2)", left: `calc(${index} * (100% / 2))` }}
          transition={{ type: "spring", stiffness: 350, damping: 28 }}
        />
        {items.map((item) => {
          const active = pathname === item.href;
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


