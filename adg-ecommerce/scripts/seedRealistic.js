/* eslint-disable no-console */
// Seed 1000 users to Firestore, 100k events (30% anonymous) to BigQuery user_events,
// and realistic orders to user_orders. 50% of users are US, rest random.

const { faker } = require('@faker-js/faker');
const { Firestore } = require('@google-cloud/firestore');
const { BigQuery } = require('@google-cloud/bigquery');

const PROJECT_ID = process.env.GCP_PROJECT_ID || 'eighth-upgrade-475017-u5';
const FIRESTORE_DB_ID = process.env.FIRESTORE_DB_ID || 'adgen-db';
const DATASET = process.env.BQ_DATASET || 'adgen_bq';
const EVENTS_TABLE = process.env.BQ_EVENTS_TABLE || 'user_events';
const ORDERS_TABLE = process.env.BQ_ORDERS_TABLE || 'user_orders';

const KEYFILE = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.BQ_KEYFILE;
const SA_JSON = process.env.GCP_SERVICE_ACCOUNT_JSON;

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

function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function isoDatetime(dt) {
  const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19);
}

async function getCatalog(firestore) {
  const snap = await firestore.collection('products').get();
  const products = [];
  snap.forEach((d) => products.push(d.data()));
  const simplified = products.map(p => ({ id: p.product_id || p.product_id === '' ? p.product_id : p.product_id, fallbackId: p.product_id, name: p.product_name, price: Number(p.product_price || 0) }));
  return simplified.filter(p => p.id || p.fallbackId).map(p => ({ id: p.id || p.fallbackId, name: p.name, price: p.price }));
}

function createUser(isUS) {
  const id = `user_${faker.string.uuid()}`;
  let country = isUS ? 'United States' : faker.location.country();
  // Normalize some country names to English
  if (country === 'Türkiye' || country === 'Turkey') country = 'Türkiye';
  const city = isUS ? faker.location.city() : faker.location.city();
  return {
    id,
    name: faker.person.fullName(),
    email: faker.internet.email().toLowerCase(),
    user_location: `${city}, ${country}`
  };
}

function sessionId() { return `sess_${faker.string.alphanumeric({ length: 12 })}`; }

function pickProducts(catalog) {
  const n = 1 + Math.floor(Math.random() * 4); // 1-4 products
  const chosen = faker.helpers.arrayElements(catalog, n);
  const payload = {};
  let total = 0;
  chosen.forEach(p => {
    const qty = 1 + Math.floor(Math.random() * 3);
    payload[p.id] = { quantity: qty, gift: Math.random() < 0.1 };
    total += p.price * qty;
  });
  return { payload, total };
}

function buildFlow({ userId, session, cityCountry, catalog }) {
  // Build a realistic browsing flow → maybe order
  const now = Date.now();
  const start = new Date(now - Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 30)); // last 30d
  const events = [];
  const push = (name, payload) => {
    events.push({
      event_id: [Number(`${Date.now()}${Math.floor(Math.random()*1000)}`)],
      session_id: session,
      user_id: userId || 'anonymous',
      event_name: name,
      event_time: isoDatetime(new Date(start.getTime() + events.length * 1000 * (2 + Math.random() * 10))),
      path_name: name.includes('product') ? '/product' : name.includes('category') ? '/category' : '/',
      event_location: cityCountry || null,
      payload: payload || {}
    });
  };

  push('page_view', { pathname: '/' });
  const categories = ['electronics','fashion','home','sports','beauty','toys','books','grocery','pets','automotive'];
  const browsedCats = faker.helpers.arrayElements(categories, 1 + Math.floor(Math.random()*3));
  browsedCats.forEach(c => push('category_click', { category: c }));

  const clickCount = 1 + Math.floor(Math.random()*5);
  for (let i=0;i<clickCount;i++) {
    const p = rnd(catalog);
    push('product_click', { product_id: p.id });
    if (Math.random() < 0.5) push('product_share', { product_id: p.id });
    if (Math.random() < 0.6) push('cart_add', { product_id: p.id, quantity: 1 + Math.floor(Math.random()*2) });
  }

  // if there's cart activity, maybe checkout
  const hasCart = events.some(e => e.event_name === 'cart_add');
  if (hasCart && Math.random() < 0.25 && userId) {
    push('cart_open_click');
    push('checkout_click');
    const { payload, total } = pickProducts(catalog);
    push('checkout_success', { amountCents: Math.round(total * 100), products: payload });
    return { events, order: { payload, total } };
  }
  return { events, order: null };
}

async function main() {
  const firestore = buildFirestore();
  const bq = buildBQ();

  const catalog = await getCatalog(firestore);
  if (!catalog.length) throw new Error('No products found in Firestore. Run seed:products first.');

  // 1) Users
  const users = [];
  for (let i=0;i<1000;i++) {
    const isUS = i < 500; // 50% US
    users.push(createUser(isUS));
  }

  console.log('Writing users to Firestore...');
  const userBatchSize = 500;
  for (let i=0;i<users.length;i+=userBatchSize) {
    const batch = firestore.batch();
    users.slice(i, i+userBatchSize).forEach(u => {
      const ref = firestore.collection('users').doc(u.id);
      batch.set(ref, { id: u.id, email: u.email, name: u.name, user_location: u.user_location, createdAt: isoDatetime(new Date()) }, { merge: true });
    });
    await batch.commit();
  }

  // 2) Sessions & events
  const totalEventsTarget = 100000;
  const eventsRows = [];
  const ordersRows = [];

  // Anonymous share 30%
  const anonTarget = Math.floor(totalEventsTarget * 0.30);
  let anonEvents = 0;

  function enqueueEvents(rows) {
    rows.forEach(r => eventsRows.push(r));
  }

  // Build user sessions first
  for (const u of users) {
    const sessions = 1 + Math.floor(Math.random() * 4);
    for (let s=0;s<sessions;s++) {
      const sess = sessionId();
      const { events, order } = buildFlow({ userId: u.id, session: sess, cityCountry: u.user_location, catalog });
      enqueueEvents(events);
      if (order) {
        ordersRows.push({
          order_id: `ord_${faker.string.alphanumeric({ length: 10 })}`,
          user_id: u.id,
          session_id: sess,
          products_payload: order.payload,
          paid_amount: Number(order.total),
          order_date: isoDatetime(new Date()),
          session_location: u.user_location
        });
      }
    }
  }

  // Add anonymous sessions until we reach 30% events share
  const cities = ['New York, United States','Los Angeles, United States','London, United Kingdom','Berlin, Germany','Tokyo, Japan','Amsterdam, Netherlands'];
  while (anonEvents < anonTarget) {
    const sess = sessionId();
    const cc = rnd(cities);
    const { events } = buildFlow({ userId: null, session: sess, cityCountry: cc, catalog });
    enqueueEvents(events);
    anonEvents += events.length;
  }

  // If we are under 100k, top-up with more user events; if over, slice down.
  if (eventsRows.length < totalEventsTarget) {
    const deficit = totalEventsTarget - eventsRows.length;
    for (let i=0;i<deficit;i++) {
      const u = rnd(users);
      eventsRows.push({
        event_id: [Number(`${Date.now()}${Math.floor(Math.random()*1000)}`)],
        session_id: sessionId(),
        user_id: u.id,
        event_name: 'page_view',
        event_time: isoDatetime(new Date()),
        path_name: '/',
        event_location: u.user_location,
        payload: { pathname: '/' }
      });
    }
  } else if (eventsRows.length > totalEventsTarget) {
    eventsRows.length = totalEventsTarget;
  }

  console.log(`Total events prepared: ${eventsRows.length}, orders: ${ordersRows.length}`);

  // 3) Insert to BigQuery in batches
  const insertBatch = async (table, rows, size = 5000) => {
    for (let i=0;i<rows.length;i+=size) {
      const slice = rows.slice(i, i+size);
      await bq.dataset(DATASET).table(table).insert(slice);
      console.log(`Inserted ${Math.min(i+size, rows.length)}/${rows.length} into ${table}`);
    }
  };

  // Insert orders first so we can validate the table mapping quickly
  await insertBatch(ORDERS_TABLE, ordersRows, 1000);
  try {
    await insertBatch(EVENTS_TABLE, eventsRows, 5000);
  } catch (e) {
    console.error('Event insert had partial failures; orders are inserted successfully.', e?.errors?.[0] || e);
  }

  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


