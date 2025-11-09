import { getCategoryBySlug, getProductsByCategoryId } from "@/lib/data";
import ProductGrid from "@/components/ProductGrid";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) return notFound();
  const prods = getProductsByCategoryId(category.id);
  return (
    <div>
      <section className="hero">
        <h1>{category.name}</h1>
        <p>{prods.length} products in {category.name}.</p>
      </section>
      <ProductGrid products={prods} />
    </div>
  );
}

