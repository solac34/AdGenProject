/* eslint-disable no-console */
// Quick seeding script for demo runs (small, fast, resilient)
// Writes 2 users to Firestore and a few rows to BigQuery tables

const { Firestore } = require('@google-cloud/firestore');
const { BigQuery } = require('@google-cloud/bigquery');

const PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'eighth-upgrade-475017-u5';
const FIRESTORE_DB_ID = process.env.FIRESTORE_DB_ID || '(default)';
const DATASET = process.env.BQ_DATASET || 'adgen_bq';
const EVENTS_TABLE = process.env.BQ_EVENTS_TABLE || 'user_events';
const ORDERS_TABLE = process.env.BQ_ORDERS_TABLE || 'user_orders';

function buildFirestore() {
  try {
    return new Firestore({ projectId: PROJECT_ID, databaseId: FIRESTORE_DB_ID });
  } catch (e) {
    console.error('Firestore init error', e);
    throw e;
  }
}

function buildBQ() {
  try {
    return new BigQuery({ projectId: PROJECT_ID });
  } catch (e) {
    console.error('BigQuery init error', e);
    throw e;
  }
}

function nowIso() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}

function genEventId() {
  const rnd = Math.floor(100 + Math.random() * 900);
  return Number(`${Date.now()}${rnd}`);
}

async function main() {
  const fs = buildFirestore();
  const bq = buildBQ();

  console.log('👥 Writing 2 demo users to Firestore ...');
  const users = [
    { user_id: `user_demo_${Date.now()}_a`, email: 'demo.a@example.com', name: 'Demo A', user_location: 'New York, United States', createdAt: nowIso() },
    { user_id: `user_demo_${Date.now()}_b`, email: 'demo.b@example.com', name: 'Demo B', user_location: 'London, United Kingdom', createdAt: nowIso() },
  ];
  try {
    const batch = fs.batch();
    for (const u of users) {
      batch.set(fs.collection('users').doc(u.user_id), u, { merge: true });
    }
    await batch.commit();
    console.log('   ✓ Firestore users written');
  } catch (e) {
    console.error('   ❌ Firestore write error', e);
    throw e;
  }

  console.log('📊 Writing demo events/orders to BigQuery ...');
  const order = {
    order_id: `ord_demo_${Date.now()}`,
    user_id: users[0].user_id,
    session_id: `sess_${Date.now()}`,
    products_payload: JSON.stringify({ demo_product: { quantity: 1, gift: false } }),
    paid_amount: 99.0,
    order_date: nowIso(),
    session_location: users[0].user_location,
  };
  const events = [
    {
      event_id: [genEventId()],
      session_id: order.session_id,
      user_id: users[0].user_id,
      event_name: 'page_view',
      event_time: nowIso(),
      path_name: '/',
      event_location: users[0].user_location,
      payload: JSON.stringify({})
    },
    {
      event_id: [genEventId()],
      session_id: order.session_id,
      user_id: users[0].user_id,
      event_name: 'checkout_success',
      event_time: nowIso(),
      path_name: '/cart',
      event_location: users[0].user_location,
      payload: JSON.stringify({ amountCents: 9900 })
    }
  ];

  try {
    await bq.dataset(DATASET).table(ORDERS_TABLE).insert([order]);
    await bq.dataset(DATASET).table(EVENTS_TABLE).insert(events);
    console.log('   ✓ BigQuery rows written');
  } catch (e) {
    console.error('   ❌ BigQuery insert error', e?.errors?.[0]?.errors?.[0] || e);
    throw e;
  }

  console.log('✅ SEED QUICK COMPLETED');
}

main().catch((e) => {
  console.error('❌ SEED QUICK FAILED', e);
  process.exit(1);
});
