import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const HOST = 'https://partner.shopeemobile.com';
const APP  = { id: 2035068, envKey: 'SHOPEE_PARTNER_KEY' };

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getSupabase() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function makeSign(partnerKey, partnerId, path, ts, accessToken = '', shopId = 0) {
  let base = partnerId.toString() + path + ts.toString();
  if (accessToken) base += accessToken;
  if (shopId) base += shopId.toString();
  return crypto.createHmac('sha256', partnerKey).update(base).digest('hex');
}

async function shopeeApi(partnerKey, method, apiPath, accessToken, shopId, params = {}, body = null) {
  const ts = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, APP.id, apiPath, ts, accessToken, Number(shopId));
  let url = `${HOST}${apiPath}?partner_id=${APP.id}&timestamp=${ts}&sign=${sign}&access_token=${accessToken}&shop_id=${shopId}`;
  for (const [k, v] of Object.entries(params)) url += `&${k}=${encodeURIComponent(v)}`;

  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

async function refreshIfNeeded(supabase, tokenRow) {
  const partnerKey = process.env[APP.envKey]?.trim();
  if (!partnerKey) throw new Error(`${APP.envKey} not configured`);

  const expiresAt = new Date(tokenRow.token_expires).getTime();
  if (Date.now() < expiresAt - 5 * 60 * 1000) return tokenRow;

  const path = '/api/v2/auth/access_token/get';
  const ts = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, APP.id, path, ts);

  const resp = await fetch(`${HOST}${path}?partner_id=${APP.id}&timestamp=${ts}&sign=${sign}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shop_id: Number(tokenRow.shop_id), refresh_token: tokenRow.refresh_token, partner_id: APP.id }),
  });
  const result = await resp.json();
  if (result.error || !result.access_token) throw new Error(`Token refresh failed: ${result.error}`);

  const updated = {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    token_expires: new Date(Date.now() + (result.expire_in || 14400) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  await supabase.from('shopee_tokens').update(updated).eq('id', tokenRow.id);
  return { ...tokenRow, ...updated };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchOrderList(partnerKey, accessToken, shopId, timeFrom, timeTo) {
  const STATUSES = ['READY_TO_SHIP', 'PROCESSED', 'SHIPPED', 'COMPLETED', 'IN_CANCEL', 'CANCELLED'];
  const allSns = [];

  for (const status of STATUSES) {
    let cursor = '';
    while (true) {
      const params = {
        time_range_field: 'create_time',
        time_from: timeFrom, time_to: timeTo,
        page_size: 100, order_status: status,
      };
      if (cursor) params.cursor = cursor;

      const res = await shopeeApi(partnerKey, 'GET', '/api/v2/order/get_order_list', accessToken, shopId, params);
      if (res.error) break;

      const orders = res.response?.order_list || [];
      allSns.push(...orders.map(o => o.order_sn));

      if (!res.response?.more) break;
      cursor = res.response.next_cursor;
      await sleep(200);
    }
  }
  return [...new Set(allSns)];
}

async function fetchOrderDetails(partnerKey, accessToken, shopId, orderSns) {
  const details = [];
  const BATCH = 20;
  for (let i = 0; i < orderSns.length; i += BATCH) {
    const batch = orderSns.slice(i, i + BATCH);
    const res = await shopeeApi(partnerKey, 'GET', '/api/v2/order/get_order_detail', accessToken, shopId, {
      order_sn_list: batch.join(','),
      response_optional_fields: 'buyer_username,recipient_address,item_list,actual_shipping_fee,total_amount,pay_time,payment_method,checkout_shipping_carrier',
    });
    if (res.response?.order_list) details.push(...res.response.order_list);
    await sleep(300);
  }
  return details;
}

function transformOrders(orders, shopId, shopName) {
  return orders.map(o => {
    const addr = o.recipient_address || {};
    const items = (o.item_list || []).map(i => ({
      item_id: i.item_id, item_name: i.item_name, model_name: i.model_name,
      qty: i.model_quantity_purchased, price: i.model_discounted_price,
      original_price: i.model_original_price, sku: i.model_sku || i.item_sku,
    }));
    return {
      order_sn: o.order_sn, shop_id: shopId.toString(), shop_name: shopName,
      order_status: o.order_status, create_time: o.create_time,
      update_time: o.update_time, pay_time: o.pay_time || null,
      buyer_username: o.buyer_username, currency: o.currency || 'VND',
      total_amount: o.total_amount || 0,
      shipping_fee: o.estimated_shipping_fee || 0,
      actual_shipping_fee: o.actual_shipping_fee || 0,
      shipping_carrier: o.checkout_shipping_carrier || '',
      payment_method: o.payment_method || '', cod: o.cod || false,
      item_count: items.length, items: JSON.stringify(items),
      recipient_name: addr.name || '', recipient_phone: addr.phone || '',
      recipient_province: addr.state || addr.region || '',
      recipient_city: addr.city || addr.district || '',
      updated_at: new Date().toISOString(),
    };
  });
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const partnerKey = process.env[APP.envKey]?.trim();
  const supabase = getSupabase();
  if (!partnerKey || !supabase) return res.status(500).json({ error: 'Missing env config' });

  const url = new URL(req.url, `https://${req.headers.host}`);
  const fullSync = url.searchParams.get('full_sync') === '1';
  const days = Number(url.searchParams.get('days')) || (fullSync ? 60 : 7);
  const shopIdFilter = url.searchParams.get('shop_id');

  let query = supabase.from('shopee_tokens').select('*').eq('app_type', 'dashboard').eq('status', 'active');
  if (shopIdFilter) query = query.eq('shop_id', shopIdFilter);
  const { data: shops, error: dbErr } = await query;
  if (dbErr) return res.status(500).json({ error: dbErr.message });
  if (!shops?.length) return res.json({ success: true, message: 'No shops found', results: [] });

  const now = Math.floor(Date.now() / 1000);
  const timeFrom = now - days * 86400;
  const WINDOW = 15 * 86400;
  const results = [];
  const startTime = Date.now();

  for (const shop of shops) {
    const shopResult = { shop_id: shop.shop_id, shop_name: shop.shop_name, orders_synced: 0, error: null };
    try {
      const token = await refreshIfNeeded(supabase, shop);
      let allSns = [];

      for (let from = timeFrom; from < now; from += WINDOW) {
        const to = Math.min(from + WINDOW, now);
        const sns = await fetchOrderList(partnerKey, token.access_token, Number(shop.shop_id), from, to);
        allSns.push(...sns);
      }
      allSns = [...new Set(allSns)];

      if (allSns.length > 0) {
        const details = await fetchOrderDetails(partnerKey, token.access_token, Number(shop.shop_id), allSns);
        const records = transformOrders(details, shop.shop_id, shop.shop_name);

        const BATCH = 200;
        let upserted = 0;
        for (let i = 0; i < records.length; i += BATCH) {
          const batch = records.slice(i, i + BATCH);
          const { error } = await supabase.from('shopee_orders').upsert(batch, { onConflict: 'order_sn' });
          if (!error) upserted += batch.length;
        }
        shopResult.orders_synced = upserted;
      }
    } catch (err) {
      shopResult.error = err.message;
    }
    results.push(shopResult);
  }

  const totalSynced = results.reduce((s, r) => s + r.orders_synced, 0);
  res.json({
    success: true,
    total_synced: totalSynced,
    shops_processed: results.length,
    days_back: days,
    elapsed_seconds: ((Date.now() - startTime) / 1000).toFixed(1),
    results,
  });
}
