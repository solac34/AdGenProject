/* eslint-disable no-console */
/**
 * Ultra Gerçekçi Veri Üretim Script v3 - MEGA VERSION
 * 
 * 🚀 YENİ ÖZELLİKLER v3:
 * - 2500 user (5x veri!)
 * - DOĞRU SIGNUP AKIŞI: anonymous → signup → user_id
 * - Aynı session'da anonymous ve user_id eventi
 * - Firestore: "id" → "user_id" field
 * - 150,000+ event
 */

const bcrypt = require('bcryptjs');
const { faker } = require('@faker-js/faker');
const { Firestore } = require('@google-cloud/firestore');
const { BigQuery } = require('@google-cloud/bigquery');

const PROJECT_ID = process.env.GCP_PROJECT_ID || 'eighth-upgrade-475017-u5';
const FIRESTORE_DB_ID = process.env.FIRESTORE_DB_ID || 'adgen-db';
const DATASET = process.env.BQ_DATASET || 'adgen_bq';
const EVENTS_TABLE = process.env.BQ_EVENTS_TABLE || 'user_events';
const ORDERS_TABLE = process.env.BQ_ORDERS_TABLE || 'user_orders';

const KEYFILE = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.BQ_KEYFILE || './eighth-upgrade-475017-u5-95fdc326baca.json';
const SA_JSON = process.env.GCP_SERVICE_ACCOUNT_JSON;

// ============= CONFIGURATION =============
const CONFIG = {
  totalUsers: 1026,
  minSessionsPerUser: 1,
  maxSessionsPerUser: 10,
  orderChance: 0.20,
  anonSessionCount: 3000,
  locationDistribution: {
    us: 0.50,
    eu: 0.40,
    other: 0.10
  }
};

// ============= HELPERS =============
function buildFirestore() {
  if (SA_JSON) {
    const credentials = typeof SA_JSON === 'string' && SA_JSON.trim().startsWith('{')
      ? JSON.parse(SA_JSON)
      : JSON.parse(Buffer.from(SA_JSON, 'base64').toString('utf8'));
    return new Firestore({ projectId: PROJECT_ID, databaseId: FIRESTORE_DB_ID, credentials });
  }
  if (KEYFILE) return new Firestore({ projectId: PROJECT_ID, databaseId: FIRESTORE_DB_ID, keyFilename: KEYFILE });
  return new Firestore({ projectId: PROJECT_ID, databaseId: FIRESTORE_DB_ID });
}

function buildBQ() {
  if (SA_JSON) {
    const credentials = typeof SA_JSON === 'string' && SA_JSON.trim().startsWith('{')
      ? JSON.parse(SA_JSON)
      : JSON.parse(Buffer.from(SA_JSON, 'base64').toString('utf8'));
    return new BigQuery({ projectId: PROJECT_ID, credentials });
  }
  if (KEYFILE) return new BigQuery({ projectId: PROJECT_ID, keyFilename: KEYFILE });
  return new BigQuery({ projectId: PROJECT_ID });
}

function rnd(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isoDatetime(dt) {
  const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}

function sessionId() {
  return `${faker.string.uuid()}`;
}

function genOrderId() {
  return `ord_${Date.now()}_${faker.string.alphanumeric({ length: 5 })}`;
}

function genEventId() {
  return Number(`${Date.now()}${randomInt(100, 999)}`);
}

// ============= LOCATION DATA =============
const US_CITIES = [
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix',
  'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose',
  'Austin', 'Jacksonville', 'Fort Worth', 'Columbus', 'Charlotte',
  'San Francisco', 'Indianapolis', 'Seattle', 'Denver', 'Boston',
  'Portland', 'Nashville', 'Atlanta', 'Miami', 'Las Vegas'
];

const EU_CITIES = [
  { city: 'London', country: 'United Kingdom' },
  { city: 'Berlin', country: 'Germany' },
  { city: 'Paris', country: 'France' },
  { city: 'Madrid', country: 'Spain' },
  { city: 'Rome', country: 'Italy' },
  { city: 'Amsterdam', country: 'Netherlands' },
  { city: 'Vienna', country: 'Austria' },
  { city: 'Brussels', country: 'Belgium' },
  { city: 'Stockholm', country: 'Sweden' },
  { city: 'Copenhagen', country: 'Denmark' },
  { city: 'Oslo', country: 'Norway' },
  { city: 'Helsinki', country: 'Finland' },
  { city: 'Warsaw', country: 'Poland' },
  { city: 'Prague', country: 'Czech Republic' },
  { city: 'Lisbon', country: 'Portugal' },
  { city: 'Dublin', country: 'Ireland' },
  { city: 'Athens', country: 'Greece' },
  { city: 'Budapest', country: 'Hungary' },
  { city: 'Zurich', country: 'Switzerland' },
  { city: 'Munich', country: 'Germany' }
];

const OTHER_CITIES = [
  { city: 'Istanbul', country: 'Türkiye' },
  { city: 'Tokyo', country: 'Japan' },
  { city: 'Sydney', country: 'Australia' },
  { city: 'Toronto', country: 'Canada' },
  { city: 'Singapore', country: 'Singapore' },
  { city: 'Dubai', country: 'United Arab Emirates' },
  { city: 'Mumbai', country: 'India' },
  { city: 'São Paulo', country: 'Brazil' },
  { city: 'Mexico City', country: 'Mexico' },
  { city: 'Seoul', country: 'South Korea' }
];

function getRandomLocation() {
  const rand = Math.random();

  if (rand < CONFIG.locationDistribution.us) {
    const city = rnd(US_CITIES);
    return `${city}, United States`;
  } else if (rand < CONFIG.locationDistribution.us + CONFIG.locationDistribution.eu) {
    const loc = rnd(EU_CITIES);
    return `${loc.city}, ${loc.country}`;
  } else {
    const loc = rnd(OTHER_CITIES);
    return `${loc.city}, ${loc.country}`;
  }
}

// ============= USER GENERATION =============
async function createUser(catalog) {
  const userId = `user_${faker.string.uuid()}`;
  const location = getRandomLocation();
  const password = faker.internet.password({ length: 12 });
  const hashedPassword = await bcrypt.hash(password, 10);

  const createdAt = faker.date.between({
    from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    to: new Date()
  });

  // Kullanıcının ana kategorisini belirle (katalogdan bir ürünün kategorisi)
  const randomProduct = rnd(catalog);
  const primaryCategory = randomProduct.category;

  // %70 ihtimalle sadece 1 kategori, %30 ihtimalle 2 kategori
  let userCategories = [primaryCategory];
  if (Math.random() < 0.30) {
    // İkinci bir kategori ekle (primary category'den farklı olmalı)
    const otherCategories = CATEGORIES.filter(c => c !== primaryCategory);
    if (otherCategories.length > 0) {
      const secondCategory = rnd(otherCategories);
      userCategories.push(secondCategory);
    }
  }

  return {
    user_id: userId, // DEĞİŞTİ: id → user_id
    email: faker.internet.email().toLowerCase(),
    name: faker.person.fullName(),
    user_location: location,
    password: hashedPassword,
    createdAt,
    categories: userCategories, // Kullanıcının ilgileneceği kategoriler
    primaryCategory // Ana kategori
  };
}

// ============= PRODUCT CATALOG =============
async function getCatalog(firestore) {
  const snap = await firestore.collection('products').get();
  const products = [];
  snap.forEach((d) => {
    const data = d.data();
    products.push({
      id: data.product_id,
      name: data.product_name,
      price: Number(data.product_price || 0),
      category: data.category || 'general'
    });
  });
  return products.filter(p => p.id && p.price > 0);
}

// ============= EVENT FLOW GENERATION =============
const CATEGORIES = ['electronics', 'fashion', 'home', 'sports', 'beauty', 'toys', 'books', 'grocery', 'pets', 'automotive'];

/**
 * 🆕 DOĞRU SIGNUP FLOW - anonymous → signup → user_id
 */
function buildSignupFlow({ userId, sessionId, location, startTime, userEmail, userName }) {
  const events = [];
  let currentTime = new Date(startTime);

  const addEvent = (eventName, payload = {}, delaySeconds = null, useUserId = false) => {
    const delay = delaySeconds !== null ? delaySeconds : randomInt(2, 8);
    currentTime = new Date(currentTime.getTime() + delay * 1000);

    events.push({
      event_id: [genEventId()],
      session_id: sessionId,
      user_id: useUserId ? userId : 'anonymous', // ANAHTAR: signup öncesi anonymous!
      event_name: eventName,
      event_time: isoDatetime(currentTime),
      path_name: getPathForEvent(eventName, payload),
      event_location: location,
      payload: JSON.stringify(payload)
    });
  };

  const getPathForEvent = (eventName, payload) => {
    if (eventName.includes('signup') || eventName.includes('login')) return '/signup';
    if (eventName.includes('product') && payload.product_id) return `/product/${payload.product_id}`;
    if (eventName.includes('category')) return `/category/${payload.category || payload.slug || 'general'}`;
    if (eventName.includes('cart')) return '/cart';
    return '/';
  };

  // Landing page (ANONYMOUS)
  addEvent('page_view', { pathname: '/' }, 0, false);

  // Biraz gezinme (ANONYMOUS)
  if (Math.random() < 0.70) {
    const cat = rnd(CATEGORIES);
    addEvent('category_click', { category: cat, slug: cat }, randomInt(3, 10), false);
    addEvent('page_view', { pathname: `/category/${cat}` }, randomInt(2, 5), false);
  }

  // Signup flow başlıyor (hala ANONYMOUS)
  addEvent('auth_signup_click', {}, randomInt(5, 15), false);
  addEvent('page_view', { pathname: '/signup' }, randomInt(1, 2), false);

  // Form doldurma süresi (ANONYMOUS)
  const formFillTime = randomInt(20, 60);

  // SIGNUP SUCCESS - BU NOKTADA USER_ID EDİNİYOR!
  addEvent('auth_signup_success', {
    email: userEmail,
    name: userName
  }, formFillTime, true); // useUserId = true!

  // Signup sonrası birkaç event (artık USER_ID ile)
  if (Math.random() < 0.60) {
    addEvent('page_view', { pathname: '/' }, randomInt(2, 5), true);
  }

  return { events };
}

/**
 * Normal shopping session (user_id ile, signup sonrası)
 */
function buildShoppingFlow({ userId, sessionId, location, catalog, startTime, shouldOrder, userCategories }) {
  const events = [];
  let currentTime = new Date(startTime);

  const addEvent = (eventName, payload = {}, delaySeconds = null) => {
    const delay = delaySeconds !== null ? delaySeconds : randomInt(2, 15);
    currentTime = new Date(currentTime.getTime() + delay * 1000);

    events.push({
      event_id: [genEventId()],
      session_id: sessionId,
      user_id: userId || 'anonymous',
      event_name: eventName,
      event_time: isoDatetime(currentTime),
      path_name: getPathForEvent(eventName, payload),
      event_location: location,
      payload: JSON.stringify(payload)
    });
  };

  const getPathForEvent = (eventName, payload) => {
    if (eventName.includes('product') && payload.product_id) return `/product/${payload.product_id}`;
    if (eventName.includes('category')) return `/category/${payload.category || payload.slug || 'general'}`;
    if (eventName.includes('cart')) return '/cart';
    return '/';
  };

  // Landing
  addEvent('page_view', { pathname: '/' }, 0);

  // Category browsing - Kullanıcının kategorilerini kullan
  // Anonymous session için random kategoriler, registered user için belirlenen kategoriler
  const browsedCategories = userCategories && userCategories.length > 0
    ? userCategories
    : faker.helpers.arrayElements(CATEGORIES, randomInt(1, 3));

  for (const cat of browsedCategories) {
    addEvent('category_click', { category: cat, slug: cat });
    addEvent('page_view', { pathname: `/category/${cat}` }, randomInt(1, 3));

    const productsToView = randomInt(1, 5);
    const categoryProducts = catalog.filter(p =>
      p.category === cat || Math.random() < 0.3
    );

    if (categoryProducts.length > 0) {
      const viewedProducts = faker.helpers.arrayElements(
        categoryProducts,
        Math.min(productsToView, categoryProducts.length)
      );

      for (const product of viewedProducts) {
        addEvent('product_click', { product_id: product.id });
        addEvent('page_view', { pathname: `/product/${product.id}` }, randomInt(2, 5));

        if (Math.random() < 0.20) {
          addEvent('product_share', { product_id: product.id }, randomInt(1, 3));
        }

        if (Math.random() < 0.60) {
          const quantity = randomInt(1, 3);
          addEvent('cart_add', { product_id: product.id, quantity }, randomInt(1, 4));
        }
      }
    }
  }

  const hasCartItems = events.some(e => e.event_name === 'cart_add');

  if (hasCartItems && Math.random() < 0.80) {
    addEvent('cart_open_click', {}, randomInt(5, 15));
    addEvent('page_view', { pathname: '/cart' }, randomInt(1, 2));

    if (shouldOrder && userId) {
      const cartAddEvents = events.filter(e => e.event_name === 'cart_add');
      const cartProducts = {};

      cartAddEvents.forEach(e => {
        const payload = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload;
        const productId = payload.product_id;
        const quantity = payload.quantity || 1;

        if (!cartProducts[productId]) {
          cartProducts[productId] = { quantity: 0, gift: Math.random() < 0.15 };
        }
        cartProducts[productId].quantity += quantity;
      });

      const productIds = Object.keys(cartProducts);
      const productsToBuy = Math.random() < 0.70
        ? productIds
        : faker.helpers.arrayElements(productIds, randomInt(1, productIds.length));

      const finalCart = {};
      let totalAmount = 0;

      productsToBuy.forEach(pid => {
        const product = catalog.find(p => p.id === pid);
        if (product) {
          const qty = cartProducts[pid].quantity;
          finalCart[pid] = {
            quantity: qty,
            gift: cartProducts[pid].gift
          };
          totalAmount += product.price * qty;
        }
      });

      if (Object.keys(finalCart).length > 0) {
        if (Math.random() < 0.30) {
          const randomProduct = rnd(Object.keys(finalCart));
          addEvent('cart_gift_toggle', { product_id: randomProduct, gift: true }, randomInt(2, 5));
          finalCart[randomProduct].gift = true;
        }

        addEvent('checkout_click', { totalCents: Math.round(totalAmount * 100) }, randomInt(3, 8));

        const paymentDelay = randomInt(15, 45);
        addEvent('checkout_success', {
          amountCents: Math.round(totalAmount * 100),
          products: finalCart
        }, paymentDelay);

        addEvent('cart_clear', {}, 1);

        const order = {
          order_id: genOrderId(),
          user_id: userId,
          session_id: sessionId,
          products_payload: JSON.stringify(finalCart),
          paid_amount: Number(totalAmount.toFixed(2)),
          order_date: isoDatetime(currentTime),
          session_location: location
        };

        return { events, order };
      }
    }
  }

  return { events, order: null };
}

// ============= MAIN SCRIPT =============
async function main() {
  console.log('🚀 Ultra Gerçekçi Veri Üretimi v3 - MEGA VERSION!');
  console.log('✨ 5x VERİ + DOĞRU SIGNUP AKIŞI (anonymous → signup → user_id)\n');

  const firestore = buildFirestore();
  const bq = buildBQ();

  console.log('📦 Ürün katalogu yükleniyor...');
  const catalog = await getCatalog(firestore);
  console.log(`   ✓ ${catalog.length} ürün yüklendi\n`);

  if (catalog.length === 0) {
    throw new Error('❌ Ürün bulunamadı! Önce npm run seed:products çalıştırın.');
  }

  // ============= PHASE 1: USER CREATION =============
  console.log(`👥 PHASE 1: ${CONFIG.totalUsers} kullanıcı oluşturuluyor...`);
  const users = [];

  for (let i = 0; i < CONFIG.totalUsers; i++) {
    const user = await createUser(catalog);
    users.push(user);

    if ((i + 1) % 500 === 0) {
      console.log(`   ${i + 1}/${CONFIG.totalUsers} kullanıcı oluşturuldu`);
    }
  }

  console.log(`   ✓ ${users.length} kullanıcı oluşturuldu`);

  const locationStats = {
    us: users.filter(u => u.user_location.includes('United States')).length,
    eu: users.filter(u => EU_CITIES.some(eu => u.user_location.includes(eu.country))).length,
    other: 0
  };
  locationStats.other = users.length - locationStats.us - locationStats.eu;

  const categoryStats = {
    singleCategory: users.filter(u => u.categories.length === 1).length,
    twoCategories: users.filter(u => u.categories.length === 2).length
  };

  console.log(`   📍 Lokasyon Dağılımı:`);
  console.log(`      US: ${locationStats.us} (%${(locationStats.us / users.length * 100).toFixed(1)})`);
  console.log(`      EU: ${locationStats.eu} (%${(locationStats.eu / users.length * 100).toFixed(1)})`);
  console.log(`      Diğer: ${locationStats.other} (%${(locationStats.other / users.length * 100).toFixed(1)})`);

  console.log(`   🏷️  Kategori Deviation Dağılımı:`);
  console.log(`      1 Kategori (dev:0): ${categoryStats.singleCategory} (%${(categoryStats.singleCategory / users.length * 100).toFixed(1)})`);
  console.log(`      2 Kategori (dev:1): ${categoryStats.twoCategories} (%${(categoryStats.twoCategories / users.length * 100).toFixed(1)})\n`);

  console.log('💾 Kullanıcılar Firestore\'a yazılıyor...');
  const userBatchSize = 500;
  for (let i = 0; i < users.length; i += userBatchSize) {
    const batch = firestore.batch();
    users.slice(i, i + userBatchSize).forEach(u => {
      const ref = firestore.collection('users').doc(u.user_id); // user_id kullan
      batch.set(ref, {
        user_id: u.user_id, // DEĞİŞTİ: id → user_id
        email: u.email,
        name: u.name,
        password: u.password,
        user_location: u.user_location,
        createdAt: isoDatetime(u.createdAt)
      }, { merge: true });
    });
    await batch.commit();

    if ((i + userBatchSize) % 1000 === 0 || (i + userBatchSize) >= users.length) {
      console.log(`   ${Math.min(i + userBatchSize, users.length)}/${users.length} kullanıcı yazıldı`);
    }
  }
  console.log('   ✓ Firestore yazma tamamlandı\n');

  // ============= PHASE 2: SIGNUP + EVENTS + ORDERS =============
  console.log('📊 PHASE 2: Signup, event ve order verileri oluşturuluyor...');
  console.log('   ⚠️ Bu işlem 2500 user için ~10-15 dakika sürebilir...\n');

  const allEvents = [];
  const allOrders = [];
  let signupEventCount = 0;
  let anonymousSignupEventCount = 0;

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const sessionsCount = randomInt(CONFIG.minSessionsPerUser, CONFIG.maxSessionsPerUser);

    for (let s = 0; s < sessionsCount; s++) {
      const sessionIdValue = sessionId();
      const isFirstSession = (s === 0);

      if (isFirstSession) {
        // İlk session = Signup (ANONYMOUS → USER_ID geçişi)
        const signupTime = new Date(user.createdAt);

        const { events } = buildSignupFlow({
          userId: user.user_id,
          sessionId: sessionIdValue,
          location: user.user_location,
          startTime: signupTime,
          userEmail: user.email,
          userName: user.name
        });

        allEvents.push(...events);
        signupEventCount++;

        // Anonymous event sayısını say
        anonymousSignupEventCount += events.filter(e => e.user_id === 'anonymous').length;

      } else {
        // Sonraki sessionlar = Normal shopping (USER_ID ile)
        const shouldOrder = Math.random() < CONFIG.orderChance;

        const minSessionTime = new Date(Math.max(
          user.createdAt.getTime() + 60 * 60 * 1000,
          user.createdAt.getTime() + 1000
        ));

        const now = Date.now();

        if (minSessionTime.getTime() > now) {
          continue;
        }

        const sessionTime = faker.date.between({
          from: minSessionTime,
          to: new Date(now)
        });

        const { events, order } = buildShoppingFlow({
          userId: user.user_id,
          sessionId: sessionIdValue,
          location: user.user_location,
          catalog,
          startTime: sessionTime,
          shouldOrder,
          userCategories: user.categories
        });

        allEvents.push(...events);

        if (order) {
          allOrders.push(order);
        }
      }
    }

    if ((i + 1) % 250 === 0) {
      console.log(`   ${i + 1}/${users.length} kullanıcının verileri oluşturuldu (${allEvents.length} event, ${allOrders.length} order)`);
    }
  }

  console.log(`   ✓ ${users.length} kullanıcı için veri oluşturuldu`);
  console.log(`   📝 ${signupEventCount} signup flow`);
  console.log(`   👻 ${anonymousSignupEventCount} anonymous signup eventi (signup öncesi)`);
  console.log(`   📈 ${allEvents.length} event`);
  console.log(`   🛒 ${allOrders.length} order\n`);

  // ============= PHASE 3: ANONYMOUS SESSIONS =============
  console.log(`👤 PHASE 3: ${CONFIG.anonSessionCount} tam anonim session oluşturuluyor...`);

  const anonLocations = [
    ...US_CITIES.map(c => `${c}, United States`),
    ...EU_CITIES.map(eu => `${eu.city}, ${eu.country}`),
    ...OTHER_CITIES.map(o => `${o.city}, ${o.country}`)
  ];

  for (let i = 0; i < CONFIG.anonSessionCount; i++) {
    const sessionIdValue = sessionId();
    const location = rnd(anonLocations);

    const startTime = faker.date.between({
      from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      to: new Date()
    });

    const { events } = buildShoppingFlow({
      userId: null,
      sessionId: sessionIdValue,
      location,
      catalog,
      startTime,
      shouldOrder: false,
      userCategories: null // Anonymous session için random kategoriler kullanılacak
    });

    allEvents.push(...events);
  }

  console.log(`   ✓ ${CONFIG.anonSessionCount} anonim session oluşturuldu`);
  console.log(`   📈 Toplam event sayısı: ${allEvents.length}\n`);

  // ============= PHASE 4: BIGQUERY INSERT =============
  console.log('💾 PHASE 4: BigQuery\'e veriler yazılıyor...\n');

  // Orders
  if (allOrders.length > 0) {
    console.log(`🛒 ${allOrders.length} sipariş yazılıyor...`);
    const orderBatchSize = 500;
    for (let i = 0; i < allOrders.length; i += orderBatchSize) {
      const slice = allOrders.slice(i, i + orderBatchSize);
      try {
        await bq.dataset(DATASET).table(ORDERS_TABLE).insert(slice);
        if ((i + orderBatchSize) % 1000 === 0 || (i + orderBatchSize) >= allOrders.length) {
          console.log(`   ✓ ${Math.min(i + orderBatchSize, allOrders.length)}/${allOrders.length} sipariş yazıldı`);
        }
      } catch (err) {
        console.error(`   ❌ Hata (batch ${i}-${i + orderBatchSize}):`, err?.errors?.[0]?.errors?.[0] || err.message);
      }
    }
  }

  // Events
  console.log(`\n📊 ${allEvents.length} event yazılıyor...`);
  const eventBatchSize = 2000;
  for (let i = 0; i < allEvents.length; i += eventBatchSize) {
    const slice = allEvents.slice(i, i + eventBatchSize);
    try {
      await bq.dataset(DATASET).table(EVENTS_TABLE).insert(slice);
      if ((i + eventBatchSize) % 10000 === 0 || (i + eventBatchSize) >= allEvents.length) {
        console.log(`   ✓ ${Math.min(i + eventBatchSize, allEvents.length)}/${allEvents.length} event yazıldı`);
      }
    } catch (err) {
      console.error(`   ❌ Hata (batch ${i}-${i + eventBatchSize}):`, err?.errors?.[0]?.errors?.[0] || err.message);
    }
  }

  // ============= SUMMARY =============
  console.log('\n' + '='.repeat(80));
  console.log('✅ VERİ OLUŞTURMA TAMAMLANDI! - MEGA VERSION');
  console.log('='.repeat(80));
  console.log(`👥 Kullanıcı: ${users.length}`);
  console.log(`📝 Signup Flow: ${signupEventCount}`);
  console.log(`👻 Anonymous signup eventi: ${anonymousSignupEventCount} (signup öncesi)`);
  console.log(`📊 Toplam Event: ${allEvents.length}`);
  console.log(`🛒 Sipariş: ${allOrders.length}`);
  console.log(`📍 Lokasyon: %${(locationStats.us / users.length * 100).toFixed(0)} US, %${(locationStats.eu / users.length * 100).toFixed(0)} EU, %${(locationStats.other / users.length * 100).toFixed(0)} Diğer`);
  console.log(`🏷️  Kategori Dev: %${(categoryStats.singleCategory / users.length * 100).toFixed(0)} tek kategori, %${(categoryStats.twoCategories / users.length * 100).toFixed(0)} iki kategori`);
  console.log(`\n🆕 v3 ÖZELLİKLERİ:`);
  console.log(`   ✓ DOĞRU signup akışı: anonymous → signup → user_id`);
  console.log(`   ✓ Aynı session'da hem anonymous hem user_id eventi`);
  console.log(`   ✓ Firestore field: "id" → "user_id"`);
  console.log(`   ✓ 5x veri: ${users.length} user, ${allEvents.length} event`);
  console.log(`   ✓ Signup öncesi tüm eventler anonymous`);
  console.log(`   ✓ Signup sonrası tüm eventler user_id ile`);
  console.log(`   ✓ Kullanıcı başına kategori deviation: min:0 max:1 (hedef: %70 tek kategori)`);
  console.log('='.repeat(80) + '\n');
}

main().catch(err => {
  console.error('\n❌ HATA:', err);
  console.error(err.stack);
  process.exit(1);
});

