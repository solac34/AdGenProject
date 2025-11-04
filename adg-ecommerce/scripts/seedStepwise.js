/* eslint-disable no-console */
// Step-by-step realistic seeder
// - 100 users (≈50% US)
// - Per user: 1–4 sessions, realistic event flow; 10% order chance if cart activity var
// - Anonymous sessions to reach ~10k events total
// - Writes: Firestore(users), BigQuery(user_events, user_orders)

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

function isoDT(dt) {
  const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}

function randEventId() { return Math.floor(1e12 + Math.random() * 9e12); } // int64
function sessionId() { return `sess_${faker.string.alphanumeric({ length: 12 })}`; }

async function getCatalog(firestore) {
  const snap = await firestore.collection('products').get();
  const list = [];
  snap.forEach(d => list.push(d.data()));
  return list.map(p => ({ id: p.product_id, name: p.product_name, price: Number(p.product_price || 0) })).filter(p => p.id);
}

function createUser(isUS) {
  const id = `user_${faker.string.uuid()}`;
  const country = isUS ? 'United States' : faker.location.country();
  const city = faker.location.city();
  return { id, name: faker.person.fullName(), email: faker.internet.email().toLowerCase(), user_location: `${city}, ${country}` };
}

function pickProducts(catalog) {
  const n = 1 + Math.floor(Math.random() * 4);
  const chosen = faker.helpers.arrayElements(catalog, n);
  const payload = {}; let total = 0;
  chosen.forEach(p => { const q = 1 + Math.floor(Math.random()*3); payload[p.id] = { quantity: q, gift: Math.random()<0.1 }; total += p.price*q; });
  return { payload, total };
}

function buildUserSessions({ userId, cc, catalog }) {
  const cats = ['electronics','fashion','home','sports','beauty','toys','books','grocery','pets','automotive'];
  const sessions = 1 + Math.floor(Math.random()*4);
  const events = []; const orders = [];
  const now = Date.now(); const base = new Date(now - Math.floor(Math.random()*1000*60*60*24*30));

  for (let s=0;s<sessions;s++) {
    const sid = sessionId(); let t = new Date(base.getTime()+s*1000*60*(10+Math.random()*80));
    const push = (name, payload={}) => { events.push({ event_id:[randEventId()], session_id:sid, user_id:userId, event_name:name, event_time:isoDT(t), path_name:name.includes('product')?'/product':name.includes('category')?'/category':'/', event_location:cc, payload }); t=new Date(t.getTime()+1000*(2+Math.random()*10)); };
    push('page_view', { pathname:'/' }); faker.helpers.arrayElements(cats,1+Math.floor(Math.random()*3)).forEach(c=>push('category_click',{category:c}));
    const clicks = 1+Math.floor(Math.random()*5); let cart=false; for (let i=0;i<clicks;i++){ const p=faker.helpers.arrayElement(catalog); push('product_click',{product_id:p.id}); if(Math.random()<0.5) push('product_share',{product_id:p.id}); if(Math.random()<0.6){ push('cart_add',{product_id:p.id,quantity:1+Math.floor(Math.random()*2)}); cart=true; } }
    if(cart && Math.random()<0.10){ push('cart_open_click'); push('checkout_click'); const sel=pickProducts(catalog); push('checkout_success',{amountCents:Math.round(sel.total*100),products:sel.payload}); orders.push({ sid, payload:sel.payload, total:sel.total }); }
  }
  return { events, orders };
}

async function main(){
  const firestore = buildFirestore(); const bq=buildBQ(); const catalog=await getCatalog(firestore);
  if(!catalog.length) throw new Error('No products found. Run seed:products first.');

  const usersCount=100; const totalEventsTarget=10000;
  console.log('Create 100 users (≈50% US)');
  const users=[]; for(let i=0;i<usersCount;i++){ const u=createUser(i<usersCount/2); users.push(u); await firestore.collection('users').doc(u.id).set({ id:u.id,name:u.name,email:u.email,user_location:u.user_location,createdAt:isoDT(new Date()) },{ merge:true }); }

  console.log('Generate user sessions and orders, streaming to BigQuery...');
  let eventsCount=0; const batchEvents=[]; const batchOrders=[];
  async function flush(){ if(batchOrders.length){ await bq.dataset(DATASET).table(ORDERS_TABLE).insert(batchOrders).catch(e=>console.error('orders',e?.errors?.[0]||e)); batchOrders.length=0; } if(batchEvents.length){ await bq.dataset(DATASET).table(EVENTS_TABLE).insert(batchEvents).catch(e=>console.error('events',e?.errors?.[0]||e)); eventsCount+=batchEvents.length; batchEvents.length=0; console.log(`events inserted: ${eventsCount}`);} }

  for(const u of users){ const { events, orders } = buildUserSessions({ userId:u.id, cc:u.user_location, catalog }); batchEvents.push(...events); orders.forEach(o=>batchOrders.push({ order_id:`ord_${faker.string.alphanumeric({length:10})}`, user_id:u.id, session_id:o.sid, products_payload:o.payload, paid_amount:Number(o.total), order_date:isoDT(new Date()), session_location:u.user_location })); if(batchEvents.length>=1000) await flush(); }

  console.log('Generate anonymous sessions until ~10k events');
  const cities=['New York, United States','Los Angeles, United States','London, United Kingdom','Berlin, Germany','Tokyo, Japan','Amsterdam, Netherlands'];
  while(eventsCount+batchEvents.length<totalEventsTarget){ const cc=faker.helpers.arrayElement(cities); const { events }=buildUserSessions({ userId:'anonymous', cc, catalog }); events.forEach(e=>{ e.user_id='anonymous'; }); batchEvents.push(...events); if(batchEvents.length>=1000) await flush(); }

  await flush();
  console.log('Done.');
}

main().catch(e=>{ console.error(e); process.exit(1); });


