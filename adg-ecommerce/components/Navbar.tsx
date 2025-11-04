"use client";

import Link from "next/link";
import type { Category } from "@/lib/types";
import { track } from "@/lib/track";

export default function Navbar({ categories }: { categories: Category[] }) {
  return (
    <nav className="navbar" aria-label="Kategoriler">
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`/category/${c.slug}`}
          onClick={() => track("category_click", { categoryId: c.id, slug: c.slug })}
        >
          {c.name}
        </Link>
      ))}
    </nav>
  );
}

