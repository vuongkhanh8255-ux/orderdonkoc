/**
 * api/tiktok-shop/sync-orders.js
 *
 * Vercel serverless function — POST /api/tiktok-shop/sync-orders
 *
 * TikTok Sign Algorithm (per official docs):
 *   base = appSecret + path + sorted_url_params (exclude ONLY sign & access_token) + raw_body_json + appSecret
 *   sign = HMAC-SHA256(key=appSecret, msg=base)
 *   Note: shop_cipher IS included in the sign (unlike access_token)
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const TIKTOK_BASE = 'https://open-api.tiktokglobalshop.com';

// ── TikTok Sign ───────────────────────────────────────────────────────────────
// Official docs: exclude ONLY 'sign' and 'access_token'
// shop_cipher IS included in the sorted URL params
// body (raw JSON string) is appended after URL params
const buildSign = (appSecret, path, urlParams, bodyStr = '') => {
  const keys = Object.keys(urlParams)
    .filter(k => k !== 'sign' && k !== 'access_token')
    .sort();
  const paramStr = keys.map(k => `${k}${urlParams[k]}`).join('');
  // base = secret + path + sortedURLParams + bodyStr + secret
  const base = `${appSecret}${path}${paramStr}${bodyStr}${appSecret}`;
  return crypto.createHmac('sha256', appSecret).update(base).digest('hex');
};

// ── POST /order/202309/orders/search ─────────────────────────────────────────
// page_size and page_token are URL query params (not body)
// create_time_ge, create_time_lt are body params
const searchOrders = async ({ appKey, appSecret, accessToken, shopCipher, createTimeGe, createTimeLt, pageToken }) => {
  const path = '/order/202309/orders/search';
  const ts = String(Math.floor(Date.now() / 1000));

  // Body: only time filters
  const bodyObj = { create_time_ge: createTimeGe, create_time_lt: createTimeLt };
  const bodyStr = JSON.stringify(bodyObj);

  // URL params: app_key, timestamp, shop_cipher, page_size (and optional page_token)
  const urlParams = { app_key: appKey, timestamp: ts, shop_cipher: shopCipher, page_size: '50' };
  if (pageToken) urlParams.page_token = pageToken;

  const sign = buildSign(appSecret, path, urlParams, bodyStr);

  const qs = new URLSearchParams({ ...urlParams, sign });
  const url = `${TIKTOK_BASE}${path}?${qs.toString()}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-tts-access-token': accessToken,
      'content-type': 'application/json',
    },
    body: bodyStr,
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text }; }
};

// ── Normalize order for Supabase ──────────────────────────────────────────────
const normalizeOrder = (order, conn) => {
  const items = order.line_items || [];
  return {
    id: String(order.id || order.order_id || ''),
    shop_id: conn.shop_id || null,
    open_id: conn.open_id || null,
    order_status: order.status || order.order_status || null,
    create_time: order.create_time || null,
    update_time: order.update_time || null,
    buyer_uid: order.buyer_uid || order.user_id || null,
    total_amount: String(order.payment?.total_amount || order.total_amount || ''),
    currency: order.currency || items[0]?.currency || null,
    line_items: items.map(item => ({
      item_id: item.item_id || item.id,
      sku_id: item.sku_id,
      product_name: item.product_name || item.sku_name,
      quantity: item.quantity || 1,
      sale_price: item.sale_price || item.original_price,
      currency: item.currency,
    })),
    raw_data: order,
    synced_at: new Date().toISOString(),
  };
};

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const appKey      = process.env.TIKTOK_SHOP_APP_KEY?.trim();
  const appSecret   = process.env.TIKTOK_SHOP_APP_SECRET?.trim();
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();

  if (!appKey || !appSecret || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: 'Missing configuration',
      missing: { TIKTOK_SHOP_APP_KEY: !appKey, TIKTOK_SHOP_APP_SECRET: !appSecret, SUPABASE_URL: !supabaseUrl, SUPABASE_KEY: !supabaseKey }
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: connections, error: connErr } = await supabase
    .from('tiktok_shop_connections')
    .select('access_token, shop_cipher, shop_id, open_id, seller_name, access_token_expires_at')
    .not('access_token', 'is', null)
    .not('shop_cipher', 'is', null);

  if (connErr) return res.status(500).json({ error: `Supabase error: ${connErr.message}` });
  if (!connections?.length) {
    return res.status(200).json({ success: true, totalSynced: 0, message: 'No active TikTok Shop connections found.' });
  }

  // 4 × 15-day windows = last 60 days (2 months)
  const now = Math.floor(Date.now() / 1000);
  const WINDOW_SEC = 15 * 24 * 3600;
  const timeWindows = Array.from({ length: 4 }, (_, i) => ({
    createTimeLt: now - i * WINDOW_SEC,
    createTimeGe: now - (i + 1) * WINDOW_SEC,
  }));

  const results = [];
  let totalSynced = 0;

  for (const conn of connections) {
    const shopLabel = conn.seller_name || conn.shop_id || '(unknown)';
    try {
      const allOrders = [];
      let firstWindowDebug = null;
      const MAX_PAGES_PER_WINDOW = 300; // 300 pages × 50 orders = 15,000 max per window (covers 1000 orders/day × 15 days)

      for (const { createTimeGe, createTimeLt } of timeWindows) {
        let pageToken = undefined;
        let page = 0;

        while (page < MAX_PAGES_PER_WINDOW) {
          const resp = await searchOrders({
            appKey, appSecret,
            accessToken: conn.access_token,
            shopCipher: conn.shop_cipher,
            createTimeGe, createTimeLt,
            pageToken,
          });

          if (firstWindowDebug === null) {
            firstWindowDebug = {
              window: `${new Date(createTimeGe * 1000).toISOString().slice(0, 10)} → ${new Date(createTimeLt * 1000).toISOString().slice(0, 10)}`,
              code: resp?.code,
              message: resp?.message,
              orders_count: resp?.data?.orders?.length ?? 0,
            };
            console.log('[sync-orders] first window:', JSON.stringify(firstWindowDebug));
          }

          if (resp?.code !== 0) break;

          const orders = resp?.data?.orders || [];
          allOrders.push(...orders);

          const nextToken = resp?.data?.next_page_token;
          if (!nextToken || orders.length === 0) break; // no more pages
          pageToken = nextToken;
          page++;
        }
      }

      if (allOrders.length === 0) {
        results.push({ shop: shopLabel, synced: 0, note: 'No orders found across last 90 days', first_window_debug: firstWindowDebug });
        continue;
      }

      // Deduplicate
      const seen = new Set();
      const uniqueOrders = allOrders.filter(o => {
        const id = String(o.id || o.order_id || '');
        if (!id || seen.has(id)) return false;
        seen.add(id); return true;
      });

      const records = uniqueOrders.map(o => normalizeOrder(o, conn)).filter(r => r.id);

      if (records.length > 0) {
        const { error: upsertErr } = await supabase
          .from('tiktok_shop_orders')
          .upsert(records, { onConflict: 'id' });
        if (upsertErr) throw new Error(upsertErr.message);
        totalSynced += records.length;
        results.push({ shop: shopLabel, synced: records.length, total_found: uniqueOrders.length });
      }

    } catch (err) {
      results.push({ shop: shopLabel, synced: 0, error: err.message });
    }
  }

  return res.status(200).json({ success: true, totalSynced, connections: connections.length, results, syncedAt: new Date().toISOString() });
}
