/**
 * api/tiktok-shop/sync-analytics.js
 *
 * Vercel serverless — GET/POST /api/tiktok-shop/sync-analytics
 *
 * Sync TikTok Shop Analytics data → Supabase tiktok_shop_analytics_daily
 *
 * Query params:
 *   start_date  — YYYY-MM-DD (default: 3 days ago for cron)
 *   end_date    — YYYY-MM-DD (default: today)
 *   full_sync   — "1" to sync from 2026-04-01 (initial load)
 *
 * Cron: runs daily at 4am VN (21:00 UTC)
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const TIKTOK_BASE = 'https://open-api.tiktokglobalshop.com';
const API_VERSION = '202509';

// ── TikTok Sign ─────────────────────────────────────────────────────────────
const buildSign = (appSecret, path, urlParams) => {
  const keys = Object.keys(urlParams)
    .filter(k => k !== 'sign' && k !== 'access_token')
    .sort();
  const paramStr = keys.map(k => `${k}${urlParams[k]}`).join('');
  const base = `${appSecret}${path}${paramStr}${appSecret}`;
  return crypto.createHmac('sha256', appSecret).update(base).digest('hex');
};

// ── Fetch analytics for a date range ────────────────────────────────────────
const fetchShopPerformance = async ({ appKey, appSecret, accessToken, shopCipher, startDate, endDate, granularity }) => {
  const path = `/analytics/${API_VERSION}/shop/performance`;
  const ts   = String(Math.floor(Date.now() / 1000));

  const urlParams = {
    app_key:       appKey,
    timestamp:     ts,
    start_date_ge: startDate,
    end_date_lt:   endDate,
    granularity:   granularity || '1D',
    currency:      'LOCAL',
  };
  if (shopCipher) urlParams.shop_cipher = shopCipher;

  urlParams.sign = buildSign(appSecret, path, urlParams);

  const qs  = new URLSearchParams(urlParams);
  const url = `${TIKTOK_BASE}${path}?${qs.toString()}`;

  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-tts-access-token': accessToken,
        'content-type': 'application/json',
      },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { return { code: -1, message: `Parse error: ${text.slice(0, 300)}` }; }
  } catch (e) {
    clearTimeout(tid);
    return { code: -1, message: `Fetch error: ${e.message}` };
  }
};

// ── Date helpers ────────────────────────────────────────────────────────────
const toYmd = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const addDays = (ymd, n) => {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return toYmd(d);
};

// Split date range into chunks of maxDays (TikTok may limit range)
const splitRange = (start, end, maxDays = 30) => {
  const ranges = [];
  let cur = start;
  while (cur < end) {
    const chunkEnd = addDays(cur, maxDays);
    ranges.push({ start: cur, end: chunkEnd < end ? chunkEnd : end });
    cur = chunkEnd;
  }
  return ranges;
};

// Extract metric value — handles nested { value, currency } objects
const metricVal = (obj, key) => {
  if (!obj) return 0;
  const v = obj[key];
  if (v === null || v === undefined) return 0;
  if (typeof v === 'object' && v.value !== undefined) return Number(v.value) || 0;
  return Number(v) || 0;
};

// ── Main handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const started = Date.now();
  console.log('[sync-analytics] Starting...');

  const appKey    = (process.env.TIKTOK_ANALYTICS_APP_KEY    || process.env.TIKTOK_SHOP_APP_KEY)?.trim();
  const appSecret = (process.env.TIKTOK_ANALYTICS_APP_SECRET || process.env.TIKTOK_SHOP_APP_SECRET)?.trim();
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();

  if (!appKey || !appSecret || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing env config' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // ── Parse params ──────────────────────────────────────────────────────────
  const params    = { ...req.query, ...(req.body || {}) };
  const fullSync  = params.full_sync === '1';
  const today     = toYmd(new Date());

  let startDate, endDate;
  if (fullSync) {
    startDate = '2026-04-01';
    endDate   = addDays(today, 1); // end_date_lt is exclusive
  } else if (params.start_date && params.end_date) {
    startDate = params.start_date;
    endDate   = params.end_date;
  } else {
    // Default cron: sync last 3 days (to catch late data updates)
    const d = new Date();
    d.setDate(d.getDate() - 3);
    startDate = toYmd(d);
    endDate   = addDays(today, 1);
  }

  console.log(`[sync-analytics] Range: ${startDate} → ${endDate}, fullSync=${fullSync}`);

  // ── Get connections ───────────────────────────────────────────────────────
  let connections = [];
  const { data: analyticsConns } = await supabase
    .from('tiktok_analytics_connections')
    .select('access_token, shop_cipher, shop_id, seller_name')
    .not('access_token', 'is', null);

  if (analyticsConns?.length > 0) {
    connections = analyticsConns;
  } else {
    const { data: orderConns } = await supabase
      .from('tiktok_shop_connections')
      .select('access_token, shop_cipher, shop_id, seller_name')
      .not('access_token', 'is', null)
      .not('shop_cipher', 'is', null);
    connections = orderConns || [];
  }

  if (!connections.length) {
    return res.status(200).json({ success: true, message: 'No connections found', synced: 0 });
  }

  // ── Sync each shop ────────────────────────────────────────────────────────
  const results = [];
  let totalUpserted = 0;

  for (const conn of connections) {
    const shopLabel = conn.seller_name || conn.shop_id;
    console.log(`[sync-analytics] Processing shop: ${shopLabel}`);

    const ranges = splitRange(startDate, endDate, 30);
    let shopUpserted = 0;
    let shopError = null;

    for (const range of ranges) {
      try {
        const resp = await fetchShopPerformance({
          appKey, appSecret,
          accessToken: conn.access_token,
          shopCipher:  conn.shop_cipher,
          startDate:   range.start,
          endDate:     range.end,
          granularity: '1D',
        });

        if (resp?.code !== 0) {
          shopError = resp?.message || `code ${resp?.code}`;
          console.log(`[sync-analytics] API error for ${shopLabel}: ${shopError}`);
          continue;
        }

        const data = resp?.data;
        if (!data) continue;

        // ── Parse daily data from various response structures ────────────
        const dailyEntries = [];

        // Try known structures
        const timeSeries = data.daily_data || data.time_series || data.data_list || data.daily || [];

        if (Array.isArray(timeSeries) && timeSeries.length > 0) {
          for (const entry of timeSeries) {
            const date = entry.date || entry.dimensions?.date || entry.day;
            if (!date) continue;
            const m = entry.metrics || entry;
            dailyEntries.push({
              shop_id:         conn.shop_id,
              seller_name:     conn.seller_name,
              date,
              payment_amount:  metricVal(m, 'payment_amount') || metricVal(m, 'gmv'),
              order_count:     metricVal(m, 'order_count') || metricVal(m, 'orders'),
              buyer_count:     metricVal(m, 'buyer_count') || metricVal(m, 'buyers'),
              page_views:      metricVal(m, 'page_views') || metricVal(m, 'product_views'),
              raw_metrics:     m,
              synced_at:       new Date().toISOString(),
            });
          }
        }

        // If no time series but has summary metrics (granularity=ALL case), store as single entry
        if (dailyEntries.length === 0) {
          const perf = data.performance || data.metrics || data.summary || data;
          const gmv = metricVal(perf, 'payment_amount') || metricVal(perf, 'gmv') || metricVal(perf, 'total_payment_amount');
          const orders = metricVal(perf, 'order_count') || metricVal(perf, 'total_orders');
          const buyers = metricVal(perf, 'buyer_count') || metricVal(perf, 'unique_buyers');
          const pv = metricVal(perf, 'page_views') || metricVal(perf, 'product_views');

          // Only store if there's actual data
          if (gmv > 0 || orders > 0 || buyers > 0 || pv > 0) {
            dailyEntries.push({
              shop_id:         conn.shop_id,
              seller_name:     conn.seller_name,
              date:            range.start,
              payment_amount:  gmv,
              order_count:     orders,
              buyer_count:     buyers,
              page_views:      pv,
              raw_metrics:     perf,
              synced_at:       new Date().toISOString(),
            });
          }
        }

        // Compute derived fields
        for (const entry of dailyEntries) {
          entry.conversion_rate = entry.buyer_count > 0
            ? Number((entry.order_count / entry.buyer_count * 100).toFixed(2))
            : 0;
          entry.aov = entry.order_count > 0
            ? Number((entry.payment_amount / entry.order_count).toFixed(0))
            : 0;
          entry.currency = 'VND';
        }

        // ── Upsert to Supabase ──────────────────────────────────────────
        if (dailyEntries.length > 0) {
          const { error: upsertErr } = await supabase
            .from('tiktok_shop_analytics_daily')
            .upsert(dailyEntries, { onConflict: 'shop_id,date' });

          if (upsertErr) {
            console.error(`[sync-analytics] Upsert error:`, upsertErr.message);
            shopError = upsertErr.message;
          } else {
            shopUpserted += dailyEntries.length;
          }
        }

        console.log(`[sync-analytics] ${shopLabel} chunk ${range.start}→${range.end}: ${dailyEntries.length} entries`);

      } catch (err) {
        shopError = err.message;
        console.error(`[sync-analytics] Exception for ${shopLabel}:`, err.message);
      }
    }

    totalUpserted += shopUpserted;
    results.push({
      shop_id:     conn.shop_id,
      seller_name: conn.seller_name,
      upserted:    shopUpserted,
      error:       shopError,
    });
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[sync-analytics] Done in ${elapsed}s. Total upserted: ${totalUpserted}`);

  return res.status(200).json({
    success: true,
    start_date: startDate,
    end_date:   endDate,
    full_sync:  fullSync,
    total_upserted: totalUpserted,
    shops: results,
    elapsed_seconds: Number(elapsed),
    synced_at: new Date().toISOString(),
  });
}
