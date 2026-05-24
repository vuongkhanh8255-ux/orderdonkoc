/**
 * Shopee Order Sync → Supabase
 *
 * Chạy:  node scripts/shopee-sync.mjs
 * Env:   SUPABASE_SERVICE_KEY (bắt buộc)
 *        DAYS_BACK (mặc định 30)
 *        SHOP_ID  (để trống = tất cả shop trong shopee_tokens)
 */
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const PARTNER_ID  = 2035068;
const PARTNER_KEY = 'shpk6444466a5871535a5271646a54766f57674e5a786c62554179666f78646d';
const HOST        = 'https://partner.shopeemobile.com';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xkyhvcmnkrxdtmwtghln.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DAYS_BACK   = Number(process.env.DAYS_BACK || 30);
const ONLY_SHOP   = process.env.SHOP_ID || '';

if (!SUPABASE_KEY) { console.error('❌ SUPABASE_SERVICE_KEY chưa set'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Shopee API helpers ───────────────────────────────────────────────────
function makeSign(path, ts, accessToken, shopId) {
  const base = PARTNER_ID.toString() + path + ts.toString() + accessToken + shopId.toString();
  return crypto.createHmac('sha256', PARTNER_KEY).update(base).digest('hex');
}

async function callApi(path, accessToken, shopId, params = {}) {
  const ts = Math.floor(Date.now() / 1000);
  const sign = makeSign(path, ts, accessToken, shopId);
  let url = `${HOST}${path}?partner_id=${PARTNER_ID}&timestamp=${ts}&sign=${sign}&access_token=${accessToken}&shop_id=${shopId}`;
  for (const [k, v] of Object.entries(params)) url += `&${k}=${encodeURIComponent(v)}`;
  const res = await fetch(url);
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Fetch all orders in time range ───────────────────────────────────────
async function fetchOrders(accessToken, shopId, timeFrom, timeTo) {
  const allOrders = [];
  const STATUSES = ['UNPAID','READY_TO_SHIP','PROCESSED','SHIPPED','COMPLETED','IN_CANCEL','CANCELLED'];

  for (const status of STATUSES) {
    let cursor = '';
    while (true) {
      const params = {
        time_range_field: 'create_time',
        time_from: timeFrom,
        time_to: timeTo,
        page_size: 100,
        order_status: status,
      };
      if (cursor) params.cursor = cursor;

      const res = await callApi('/api/v2/order/get_order_list', accessToken, shopId, params);
      if (res.error) {
        // Skip silently if no orders for this status
        break;
      }

      const orders = res.response?.order_list || [];
      allOrders.push(...orders);

      if (!res.response?.more) break;
      cursor = res.response.next_cursor;
      await sleep(200);
    }
  }

  return allOrders;
}

// ── Fetch order details in batches ───────────────────────────────────────
async function fetchOrderDetails(accessToken, shopId, orderSns) {
  const details = [];
  const BATCH = 20; // smaller batch to avoid timeouts
  const total = orderSns.length;

  for (let i = 0; i < total; i += BATCH) {
    const batch = orderSns.slice(i, i + BATCH);
    try {
      const res = await callApi('/api/v2/order/get_order_detail', accessToken, shopId, {
        order_sn_list: batch.join(','),
        response_optional_fields: 'buyer_username,recipient_address,item_list,actual_shipping_fee,total_amount,pay_time,payment_method,checkout_shipping_carrier'
      });

      if (res.response?.order_list) {
        details.push(...res.response.order_list);
      }
      // Progress every 200 orders
      if ((i + BATCH) % 200 < BATCH) {
        process.stdout.write(`  📋 ${Math.min(i + BATCH, total)}/${total} `);
      }
    } catch (e) {
      console.error(`  ⚠️ Batch ${i}-${i+BATCH} failed: ${e.message}`);
    }
    await sleep(350);
  }
  console.log('');
  return details;
}

// ── Fetch escrow (income) for orders ─────────────────────────────────────
async function fetchEscrow(accessToken, shopId, orderSn) {
  const res = await callApi('/api/v2/payment/get_escrow_detail', accessToken, shopId, {
    order_sn: orderSn
  });
  return res.response?.order_income || null;
}

// ── Transform & upsert to Supabase ───────────────────────────────────────
async function upsertOrders(orders, shopId, shopName) {
  const records = orders.map(o => {
    const addr = o.recipient_address || {};
    const items = (o.item_list || []).map(i => ({
      item_id: i.item_id,
      item_name: i.item_name,
      model_name: i.model_name,
      qty: i.model_quantity_purchased,
      price: i.model_discounted_price,
      original_price: i.model_original_price,
      sku: i.model_sku || i.item_sku,
    }));

    return {
      order_sn:           o.order_sn,
      shop_id:            shopId.toString(),
      shop_name:          shopName,
      order_status:       o.order_status,
      create_time:        o.create_time,
      update_time:        o.update_time,
      pay_time:           o.pay_time || null,
      buyer_username:     o.buyer_username,
      currency:           o.currency || 'VND',
      total_amount:       o.total_amount || 0,
      shipping_fee:       o.estimated_shipping_fee || 0,
      actual_shipping_fee: o.actual_shipping_fee || 0,
      shipping_carrier:   o.checkout_shipping_carrier || '',
      payment_method:     o.payment_method || '',
      cod:                o.cod || false,
      item_count:         items.length,
      items:              JSON.stringify(items),
      recipient_name:     addr.name || '',
      recipient_phone:    addr.phone || '',
      recipient_province: addr.state || addr.region || '',
      recipient_city:     addr.city || addr.district || '',
      updated_at:         new Date().toISOString(),
    };
  });

  // Upsert in batches of 200
  const BATCH = 200;
  let total = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error } = await sb.from('shopee_orders').upsert(batch, { onConflict: 'order_sn' });
    if (error) console.error(`    ⚠️ Upsert error: ${error.message}`);
    else total += batch.length;
  }
  return total;
}

// ── Refresh token if needed ──────────────────────────────────────────────
async function refreshToken(shop) {
  const expires = new Date(shop.token_expires);
  if (expires > new Date(Date.now() + 3600 * 1000)) {
    return shop.access_token; // still valid > 1hr
  }

  console.log(`    🔄 Refreshing token...`);
  const path = '/api/v2/auth/access_token/get';
  const ts = Math.floor(Date.now() / 1000);
  const baseStr = PARTNER_ID.toString() + path + ts.toString();
  const sign = crypto.createHmac('sha256', PARTNER_KEY).update(baseStr).digest('hex');

  const url = `${HOST}${path}?partner_id=${PARTNER_ID}&timestamp=${ts}&sign=${sign}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: shop.refresh_token,
      partner_id: PARTNER_ID,
      shop_id: Number(shop.shop_id),
    }),
  });
  const data = await res.json();

  if (data.error) {
    console.error(`    ❌ Refresh failed: ${data.error} ${data.message}`);
    return null;
  }

  // Update token in Supabase
  await sb.from('shopee_tokens').update({
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    token_expires: new Date(Date.now() + data.expire_in * 1000).toISOString(),
    updated_at:    new Date().toISOString(),
  }).eq('shop_id', shop.shop_id);

  console.log(`    ✅ Token refreshed`);
  return data.access_token;
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  SHOPEE ORDER SYNC');
  console.log(`  Khoảng: ${DAYS_BACK} ngày gần nhất`);
  console.log('═══════════════════════════════════════════════════\n');

  // Get all shops from shopee_tokens
  let query = sb.from('shopee_tokens').select('*').eq('status', 'active');
  if (ONLY_SHOP) query = query.eq('shop_id', ONLY_SHOP);
  const { data: shops } = await query;

  if (!shops?.length) {
    console.log('❌ Không có shop nào trong shopee_tokens');
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const timeFrom = now - DAYS_BACK * 86400;
  let grandTotal = 0;
  let errorCount = 0;

  for (const shop of shops) {
    console.log(`▶ ${shop.shop_name} (${shop.shop_id})`);

    const accessToken = await refreshToken(shop);
    if (!accessToken) { errorCount++; continue; }

    // Shopee limits time_range to 15 days max per request
    const WINDOW = 15 * 86400;
    let allOrderSns = [];

    for (let from = timeFrom; from < now; from += WINDOW) {
      const to = Math.min(from + WINDOW, now);
      const fromDate = new Date(from * 1000).toISOString().slice(0, 10);
      const toDate = new Date(to * 1000).toISOString().slice(0, 10);
      process.stdout.write(`  ${fromDate} → ${toDate} ... `);

      const orders = await fetchOrders(accessToken, Number(shop.shop_id), from, to);
      allOrderSns.push(...orders.map(o => o.order_sn));
      console.log(`${orders.length} đơn`);
      await sleep(300);
    }

    if (!allOrderSns.length) {
      console.log('  Không có đơn hàng\n');
      continue;
    }

    // Deduplicate
    allOrderSns = [...new Set(allOrderSns)];
    console.log(`  📦 Tổng: ${allOrderSns.length} đơn → lấy chi tiết...`);

    const details = await fetchOrderDetails(accessToken, Number(shop.shop_id), allOrderSns);
    console.log(`  📋 Chi tiết: ${details.length} đơn`);

    const upserted = await upsertOrders(details, shop.shop_id, shop.shop_name);
    console.log(`  ✅ Đã lưu: ${upserted} đơn\n`);
    grandTotal += upserted;
  }

  console.log('═══════════════════════════════════════════════════');
  console.log(`  HOÀN THÀNH`);
  console.log(`  Tổng đơn đã sync : ${grandTotal}`);
  console.log(`  Số lỗi           : ${errorCount}`);
  console.log('═══════════════════════════════════════════════════');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
