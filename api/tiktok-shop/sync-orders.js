/**
 * api/tiktok-shop/sync-orders.js
 *
 * Vercel serverless function — POST /api/tiktok-shop/sync-orders
 *
 * 1. Reads all active connections from tiktok_shop_connections
 * 2. For each connection, calls TikTok Shop Order List API (last 30 days)
 * 3. Fetches order details in batches
 * 4. Upserts into tiktok_shop_orders table
 * 5. Returns sync summary
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const TIKTOK_BASE = 'https://open-api.tiktokglobalshop.com';

// ── TikTok Shop API Signature ─────────────────────────────────────────────────
// Algorithm: HMAC-SHA256( appSecret, appSecret + path + sorted_param_concat + appSecret )
// Exclude: 'sign', 'access_token', 'shop_cipher' from signing (per TikTok docs)
const buildSign = (appSecret, path, params) => {
  const keys = Object.keys(params)
    .filter(k => k !== 'sign' && k !== 'access_token' && k !== 'shop_cipher')
    .sort();
  const paramStr = keys.map(k => `${k}${params[k]}`).join('');
  const base = `${appSecret}${path}${paramStr}${appSecret}`;
  return crypto.createHmac('sha256', appSecret).update(base).digest('hex');
};

const buildUrl = (appKey, appSecret, path, extraParams = {}) => {
  const ts = String(Math.floor(Date.now() / 1000));
  const params = { app_key: appKey, timestamp: ts, ...extraParams };
  params.sign = buildSign(appSecret, path, params);
  return `${TIKTOK_BASE}${path}?${new URLSearchParams(params).toString()}`;
};

// ── Get order list (returns array of { order_id } objects) ───────────────────
const fetchOrderIds = async ({ appKey, appSecret, accessToken, shopCipher, createTimeGe, createTimeLt, pageToken }) => {
  const path = '/order/202309/orders';
  const extra = {
    shop_cipher: shopCipher,
    page_size: '50',
    sort_field: 'CREATE_TIME',
    sort_order: 'DESC',
    create_time_ge: String(createTimeGe),
    create_time_lt: String(createTimeLt),
  };
  if (pageToken) extra.page_token = pageToken;

  const url = buildUrl(appKey, appSecret, path, extra);
  const res = await fetch(url, {
    headers: { 'x-tts-access-token': accessToken, 'content-type': 'application/json' }
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text }; }
};

// ── Get order details ─────────────────────────────────────────────────────────
const fetchOrderDetails = async ({ appKey, appSecret, accessToken, shopCipher, orderIds }) => {
  const path = '/order/202309/orders/detail';
  const extra = { shop_cipher: shopCipher };
  const url = buildUrl(appKey, appSecret, path, extra);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-tts-access-token': accessToken, 'content-type': 'application/json' },
    body: JSON.stringify({ order_id_list: orderIds })
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text }; }
};

// ── Chunk array helper ────────────────────────────────────────────────────────
const chunk = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

// ── Normalize order for Supabase ──────────────────────────────────────────────
const normalizeOrder = (order, conn) => {
  const payment = order.payment || {};
  const items = order.line_items || order.item_list || [];
  return {
    id: String(order.id || order.order_id || ''),
    shop_id: conn.shop_id || null,
    open_id: conn.open_id || null,
    order_status: order.status || order.order_status || null,
    create_time: order.create_time || null,
    update_time: order.update_time || null,
    buyer_uid: order.buyer_uid || order.user_id || null,
    total_amount: String(payment.total_amount || order.payment_info?.total_amount || order.total_amount || ''),
    currency: payment.currency || order.payment_info?.currency || order.currency || null,
    line_items: items.map(item => ({
      item_id: item.item_id || item.product_id,
      sku_id: item.sku_id,
      product_name: item.product_name || item.item_name || item.sku_name,
      quantity: item.quantity || 1,
      sale_price: item.sale_price || item.sku_sale_price,
      currency: item.currency,
    })),
    raw_data: order,
    synced_at: new Date().toISOString(),
  };
};

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Allow GET for easy browser testing too
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const appKey    = process.env.TIKTOK_SHOP_APP_KEY?.trim();
  const appSecret = process.env.TIKTOK_SHOP_APP_SECRET?.trim();
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();

  if (!appKey || !appSecret || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: 'Missing configuration',
      missing: {
        TIKTOK_SHOP_APP_KEY: !appKey,
        TIKTOK_SHOP_APP_SECRET: !appSecret,
        SUPABASE_URL: !supabaseUrl,
        SUPABASE_KEY: !supabaseKey,
      }
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Get all active TikTok Shop connections
  const { data: connections, error: connErr } = await supabase
    .from('tiktok_shop_connections')
    .select('access_token, shop_cipher, shop_id, open_id, seller_name, access_token_expires_at')
    .not('access_token', 'is', null)
    .not('shop_cipher', 'is', null);

  if (connErr) {
    return res.status(500).json({ error: `Supabase error: ${connErr.message}` });
  }
  if (!connections?.length) {
    return res.status(200).json({
      success: true,
      totalSynced: 0,
      message: 'No active TikTok Shop connections found. Please authorize a shop first.',
    });
  }

  // Sync window: last 180 days
  const now = Math.floor(Date.now() / 1000);
  const createTimeGe = now - 180 * 24 * 3600;

  const results = [];
  let totalSynced = 0;

  for (const conn of connections) {
    const shopLabel = conn.seller_name || conn.shop_id || '(unknown)';
    try {
      // Step 1: Collect all order IDs (paginated)
      const allOrderIds = [];
      let pageToken = undefined;
      let page = 0;
      const MAX_PAGES = 5; // max 250 orders per sync

      while (page < MAX_PAGES) {
        const listResp = await fetchOrderIds({
          appKey, appSecret,
          accessToken: conn.access_token,
          shopCipher: conn.shop_cipher,
          createTimeGe,
          createTimeLt: now,
          pageToken,
        });

        const orderList = listResp?.data?.order_list || listResp?.data?.orders || [];
        const ids = orderList.map(o => String(o.order_id || o.id)).filter(Boolean);
        allOrderIds.push(...ids);

        const nextToken = listResp?.data?.next_page_token || listResp?.data?.cursor;
        if (!nextToken || ids.length === 0) break;
        pageToken = nextToken;
        page++;
      }

      if (allOrderIds.length === 0) {
        // Capture raw response for debugging
        const debugResp = await fetchOrderIds({
          appKey, appSecret,
          accessToken: conn.access_token,
          shopCipher: conn.shop_cipher,
          createTimeGe,
          createTimeLt: now,
        });
        results.push({
          shop: shopLabel,
          synced: 0,
          note: 'No orders in sync window',
          api_code: debugResp?.code,
          api_message: debugResp?.message,
          api_debug: JSON.stringify(debugResp).slice(0, 500),
        });
        continue;
      }

      // Step 2: Fetch details in batches of 50
      const orderBatches = chunk(allOrderIds, 50);
      const allOrders = [];

      for (const batch of orderBatches) {
        const detailResp = await fetchOrderDetails({
          appKey, appSecret,
          accessToken: conn.access_token,
          shopCipher: conn.shop_cipher,
          orderIds: batch,
        });
        const orders = detailResp?.data?.order_list || detailResp?.data?.orders || [];
        allOrders.push(...orders);
      }

      if (allOrders.length === 0) {
        results.push({ shop: shopLabel, synced: 0, note: 'Order IDs found but detail fetch returned empty' });
        continue;
      }

      // Step 3: Upsert to Supabase
      const records = allOrders
        .map(o => normalizeOrder(o, conn))
        .filter(r => r.id); // skip orders without ID

      if (records.length > 0) {
        const { error: upsertErr } = await supabase
          .from('tiktok_shop_orders')
          .upsert(records, { onConflict: 'id' });

        if (upsertErr) throw new Error(upsertErr.message);
        totalSynced += records.length;
        results.push({ shop: shopLabel, synced: records.length });
      }

    } catch (err) {
      results.push({ shop: shopLabel, synced: 0, error: err.message });
    }
  }

  return res.status(200).json({
    success: true,
    totalSynced,
    connections: connections.length,
    results,
    syncedAt: new Date().toISOString(),
  });
}
