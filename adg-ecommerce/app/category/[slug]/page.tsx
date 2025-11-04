import { getCategoryBySlug, getProductsByCategoryId } from "@/lib/data";
import ProductGrid from "@/components/ProductGrid";
import { notFound } from "next/navigation";

type Props = { params: { slug: string } };

export default function CategoryPage({ params }: Props) {
  const category = getCategoryBySlug(params.slug);
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

