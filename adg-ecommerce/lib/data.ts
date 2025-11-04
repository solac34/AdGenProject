import { Category, Product } from "./types";

export const categories: Category[] = [
  { id: "cat-electronics", slug: "electronics", name: "Electronics" },
  { id: "cat-fashion", slug: "fashion", name: "Fashion" },
  { id: "cat-home", slug: "home", name: "Home & Living" },
  { id: "cat-sports", slug: "sports", name: "Sports" },
  { id: "cat-beauty", slug: "beauty", name: "Beauty" },
  { id: "cat-toys", slug: "toys", name: "Toys" },
  { id: "cat-books", slug: "books", name: "Books" },
  { id: "cat-grocery", slug: "grocery", name: "Grocery" },
  { id: "cat-pets", slug: "pets", name: "Pet" },
  { id: "cat-automotive", slug: "automotive", name: "Automotive" }
];

function USD(dollars: number) { return Math.round(dollars * 100); }

const names: Record<string, string[]> = {
  "cat-fashion": ["Organic Cotton T-Shirt","Slim-Fit Jeans","Midi Skirt","Oversized Hoodie","Tailored Blazer","Everyday Sneakers","Chino Shorts","Oxford Shirt","Cable Knit Sweater","Leather Boots"],
  "cat-electronics": ["Smartphone 128GB","14\" Laptop i5 16GB","Bluetooth Headphones","Smartwatch","11\" Tablet 256GB","Game Console","55\" 4K TV","DSLR Camera","Portable SSD 1TB","4K Drone"],
  "cat-home": ["Solid Wood Dining Table","Velvet Sofa","Orthopedic Pillow","Cotton Duvet Set","Area Rug 160x230","Floor Lamp","Bookshelf","Dining Chair Set (2)","Robot Vacuum","Air Fryer 4.5L"],
  "cat-sports": ["Running Shoes","Yoga Mat","Dumbbell Set 10kg","Basketball","Resistance Bands Set","Bike Helmet","Gym Duffel Bag","Tennis Racket","Soccer Cleats","Fitness Tracker"],
  "cat-beauty": ["Hydrating Face Cream","Foaming Cleanser","Sunscreen SPF 50","Eau de Parfum 50ml","Hair Serum","Matte Lipstick","Hand Cream","Eye Cream","Shower Gel","Shampoo 500ml"],
  "cat-toys": ["Building Bricks Set","Plush Bear","Wooden Puzzle","RC Car","Painting Kit","Science Lab Kit","Modeling Clay Pack","Chess Set","Kids Scooter","Family Board Game"],
  "cat-books": ["Novel – Night and Fog","Self-Help – Habits","Science – A Brief History of Time","Business – Zero to One","Psychology – Thinking, Fast and Slow","Classic – Crime and Punishment","Fantasy – Children of Fire","History – Empires","Poetry – Blue Notebook","Kids – Story Box"],
  "cat-grocery": ["Ground Coffee 500g","Organic Olive Oil 1L","Almonds 250g","Pasta 500g (6-pack)","Rice 2.5kg","Canned Tuna (3)","Rolled Oats 1kg","Peanut Butter 700g","Milk 1L (6-pack)","Mineral Water (24)"],
  "cat-pets": ["Cat Food 2kg","Dog Food 3kg","Cat Litter 10L","Scratching Post","Leash","Stainless Water Bowl","Toy Ball","Bird Seed 1kg","Dog House","Cat Carrier"],
  "cat-automotive": ["Winter Tires 16\" (Set of 4)","Motor Oil 5W-30 4L","Alloy Wheels 17\" (Set of 4)","Car Battery 60Ah","Dash Cam","Trunk Organizer","Snow Chains","Car Air Freshener","Phone Mount","Tire Pressure Gauge"]
};

const priceMap: Record<string, number[]> = {
  "cat-fashion": [19,69,49,59,149,99,39,49,79,179],
  "cat-electronics": [899,1299,149,249,599,499,399,899,129,799],
  "cat-home": [699,1299,39,99,179,79,149,129,399,149],
  "cat-sports": [129,29,59,29,25,49,39,119,129,69],
  "cat-beauty": [24,14,19,69,22,18,8,29,7,12],
  "cat-toys": [39,19,14,49,15,29,9,24,59,29],
  "cat-books": [14,12,18,16,20,13,17,18,9,8],
  "cat-grocery": [8,12,7,6,7,5,4,6,5,4],
  "cat-pets": [22,28,10,20,9,8,4,7,89,29],
  "cat-automotive": [520,35,680,140,95,22,49,8,15,12]
};

const seasonByCat: Record<string, string> = {
  "cat-fashion": "Spring–Fall (March–October)",
  "cat-electronics": "Year-round",
  "cat-home": "Year-round",
  "cat-sports": "Spring–Summer (April–September)",
  "cat-beauty": "Year-round",
  "cat-toys": "Gifting season peaks (November–December) & birthdays",
  "cat-books": "Year-round (peaks in September & December)",
  "cat-grocery": "Year-round",
  "cat-pets": "Year-round",
  "cat-automotive": "Winter prep (October–January) & road‑trip season (May–August)"
};

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function marketingDescription(catName: string, productName: string): string {
  const season = seasonByCat[categories.find(c => c.name === catName || c.id === catName)?.id || "cat-electronics"] || "Year-round";
  return (
    `${productName} — premium quality for everyday life.\n` +
    `Seasonality: ${season}.\n` +
    `Primary audiences: inclusive age range 16–65+, across diverse backgrounds; ideal for students, professionals, and families.\n` +
    `Top regions: United States, Canada, United Kingdom; growing interest in EU and APAC.\n` +
    `Usage: designed for comfort and performance; pairs well with complementary items in the ${catName} category.\n` +
    `Campaign notes: highlight benefits, lifestyle imagery, and UGC; focus on moments (weekend, commute, gifting, holidays).`
  );
}

export const products: Product[] = categories.flatMap((cat) => {
  const list = names[cat.id] || [];
  return list.slice(0, 10).map((title, idx) => {
    const price = priceMap[cat.id]?.[idx] ?? 19;
    const pid = `p_${cat.slug}_${slugify(title)}`;
    return {
      id: pid,
      categoryId: cat.id,
      title,
      priceCents: USD(price),
      description: marketingDescription(cat.name, title),
      image: `https://picsum.photos/seed/${pid}/800/600`
    } as Product;
  });
});

export function getCategoryBySlug(slug: string) {
  return categories.find((c) => c.slug === slug) || null;
}

export function getProductsByCategoryId(categoryId: string) {
  return products.filter((p) => p.categoryId === categoryId);
}

export function getProductById(productId: string) {
  return products.find((p) => p.id === productId) || null;
}

