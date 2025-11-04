import { categories, getProductsByCategoryId } from "@/lib/data";
import ProductGrid from "@/components/ProductGrid";

export default function HomePage() {
  return (
    <div>
      <section className="hero">
        <h1>Everything In One Place</h1>
        <p>Clean, negative-space design. Fast, simple and delightful shopping.</p>
      </section>
      {categories.map((c) => {
        const prods = getProductsByCategoryId(c.id).slice(0, 8);
        return (
          <section key={c.id} style={{ margin: "48px 0" }}>
            <div className="row" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>{c.name}</h2>
              <a href={`/category/${c.slug}`}>View all</a>
            </div>
            <ProductGrid products={prods} />
          </section>
        );
      })}
    </div>
  );
}

