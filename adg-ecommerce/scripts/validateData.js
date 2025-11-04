/* eslint-disable no-console */
// Veri tutarlılığı kontrolü
const { BigQuery } = require('@google-cloud/bigquery');

const bq = new BigQuery({ 
  projectId: 'eighth-upgrade-475017-u5', 
  keyFilename: './eighth-upgrade-475017-u5-95fdc326baca.json' 
});

async function validate() {
  console.log('🔍 VERİ TUTARLILIĞI ANALİZİ');
  console.log('='.repeat(70) + '\n');
  
  // 1. Temel sayılar
  const [totalOrders] = await bq.query(`
    SELECT COUNT(*) as total FROM \`eighth-upgrade-475017-u5.adgen_bq.user_orders\`
  `);
  
  const [totalEvents] = await bq.query(`
    SELECT COUNT(*) as total FROM \`eighth-upgrade-475017-u5.adgen_bq.user_events\`
  `);
  
  console.log('📊 GENEL İSTATİSTİKLER:');
  console.log(`   Toplam Sipariş: ${totalOrders[0].total}`);
  console.log(`   Toplam Event: ${totalEvents[0].total}`);
  
  // 2. Siparişlerin checkout eventi ile uyumu
  const [ordersWithCheckout] = await bq.query(`
    SELECT COUNT(DISTINCT o.order_id) as count
    FROM \`eighth-upgrade-475017-u5.adgen_bq.user_orders\` o
    JOIN \`eighth-upgrade-475017-u5.adgen_bq.user_events\` e 
      ON o.session_id = e.session_id 
      AND e.event_name = 'checkout_success'
  `);
  
  console.log(`\n✅ TUTARLILIK KONTROLÜ:`);
  console.log(`   Checkout eventi olan sipariş: ${ordersWithCheckout[0].count}/${totalOrders[0].total}`);
  console.log(`   Uyum oranı: %${(ordersWithCheckout[0].count / totalOrders[0].total * 100).toFixed(1)}`);
  
  // 3. Anonim eventler
  const [anonEvents] = await bq.query(`
    SELECT COUNT(*) as count
    FROM \`eighth-upgrade-475017-u5.adgen_bq.user_events\`
    WHERE user_id = 'anonymous'
  `);
  
  console.log(`\n👤 ANONİM KULLANICILAR:`);
  console.log(`   Anonim event sayısı: ${anonEvents[0].count}`);
  console.log(`   Anonim oran: %${(anonEvents[0].count / totalEvents[0].total * 100).toFixed(1)}`);
  
  // 4. Lokasyon dağılımı
  const [locationStats] = await bq.query(`
    SELECT 
      CASE 
        WHEN event_location LIKE '%United States%' THEN 'US'
        WHEN event_location LIKE '%Germany%' OR event_location LIKE '%France%' 
          OR event_location LIKE '%Spain%' OR event_location LIKE '%Italy%'
          OR event_location LIKE '%Kingdom%' OR event_location LIKE '%Netherlands%'
          OR event_location LIKE '%Portugal%' THEN 'EU'
        ELSE 'Other'
      END as region,
      COUNT(*) as count
    FROM \`eighth-upgrade-475017-u5.adgen_bq.user_events\`
    WHERE event_location IS NOT NULL
    GROUP BY region
    ORDER BY count DESC
  `);
  
  console.log(`\n📍 LOKASYON DAĞILIMI:`);
  const totalWithLocation = locationStats.reduce((sum, r) => sum + Number(r.count), 0);
  locationStats.forEach(r => {
    const pct = (Number(r.count) / totalWithLocation * 100).toFixed(1);
    console.log(`   ${r.region}: ${r.count} (%${pct})`);
  });
  
  // 5. Sample tutarlı sipariş
  const [sampleOrder] = await bq.query(`
    SELECT 
      o.order_id,
      o.user_id,
      o.session_id,
      o.paid_amount,
      o.session_location,
      o.products_payload
    FROM \`eighth-upgrade-475017-u5.adgen_bq.user_orders\` o
    WHERE o.user_id != 'test_user'
    LIMIT 1
  `);
  
  if (sampleOrder.length > 0) {
    const order = sampleOrder[0];
    console.log(`\n🔍 ÖRNEK SİPARİŞ ANALİZİ:`);
    console.log(`   Order ID: ${order.order_id}`);
    console.log(`   User ID: ${order.user_id}`);
    console.log(`   Session ID: ${order.session_id}`);
    console.log(`   Tutar: ${order.paid_amount}`);
    console.log(`   Lokasyon: ${order.session_location}`);
    
    const [sessionEvents] = await bq.query(`
      SELECT event_name, event_time
      FROM \`eighth-upgrade-475017-u5.adgen_bq.user_events\`
      WHERE session_id = '${order.session_id}'
      ORDER BY event_time
    `);
    
    console.log(`   Session'daki eventler (${sessionEvents.length}):`);
    const eventNames = sessionEvents.map(e => e.event_name);
    const hasCartAdd = eventNames.includes('cart_add');
    const hasCheckoutClick = eventNames.includes('checkout_click');
    const hasCheckoutSuccess = eventNames.includes('checkout_success');
    const hasCartClear = eventNames.includes('cart_clear');
    
    console.log(`     ✓ cart_add: ${hasCartAdd ? '✅' : '❌'}`);
    console.log(`     ✓ checkout_click: ${hasCheckoutClick ? '✅' : '❌'}`);
    console.log(`     ✓ checkout_success: ${hasCheckoutSuccess ? '✅' : '❌'}`);
    console.log(`     ✓ cart_clear: ${hasCartClear ? '✅' : '❌'}`);
    
    console.log(`\n   Event Akışı: ${eventNames.slice(0, 10).join(' → ')}${eventNames.length > 10 ? ' ...' : ''}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Validasyon tamamlandı!\n');
}

validate().catch(err => {
  console.error('❌ Hata:', err.message);
  process.exit(1);
});

