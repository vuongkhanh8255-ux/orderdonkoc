/**
 * api/tiktok-shop/analytics.js
 *
 * Vercel serverless — GET /api/tiktok-shop/analytics
 *
 * Proxy to TikTok Shop Analytics API:
 *   GET /analytics/{version}/shop/performance
 *
 * Query params:
 *   start_date  — YYYY-MM-DD (required)
 *   end_date    — YYYY-MM-DD (required)
 *   granularity — ALL | 1D  (default: 1D)
 *   shop_id     — filter specific shop (optional)
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const TIKTOK_BASE = 'https://open-api.tiktokglobalshop.com';
const API_VERSION = '202509';

// ── TikTok Sign (same algorithm as sync-orders) ─────────────────────────────
const buildSign = (appSecret, path, urlParams) => {
  const keys = Object.keys(urlParams)
    .filter(k => k !== 'sign' && k !== 'access_token')
    .sort();
  const paramStr = keys.map(k => `${k}${urlParams[k]}`).join('');
  const base = `${appSecret}${path}${paramStr}${appSecret}`;
  return crypto.createHmac('sha256', appSecret).update(base).digest('hex');
};

// ── Call TikTok Analytics endpoint ───────────────────────────────────────────
const fetchShopPerformance = async ({ appKey, appSecret, accessToken, shopCipher, startDate, endDate, granularity }) => {
  const path = `/analytics/${API_VERSION}/shop/performance`;
  const ts   = String(Math.floor(Date.now() / 1000));

  const urlParams = {
    app_key:      appKey,
    timestamp:    ts,
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
  const tid  = setTimeout(() => ctrl.abort(), 15_000);
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
    catch { return { code: -1, message: `Parse error: ${text.slice(0, 200)}` }; }
  } catch (e) {
    clearTimeout(tid);
    return { code: -1, message: `Fetch error: ${e.message}` };
  }
};

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Allow GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Config: prefer analytics app, fallback to orders app ───────────────────
  const appKey    = (process.env.TIKTOK_ANALYTICS_APP_KEY    || process.env.TIKTOK_SHOP_APP_KEY)?.trim();
  const appSecret = (process.env.TIKTOK_ANALYTICS_APP_SECRET || process.env.TIKTOK_SHOP_APP_SECRET)?.trim();
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();

  if (!appKey || !appSecret || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing env config', missing: { appKey: !appKey, appSecret: !appSecret, supabaseUrl: !supabaseUrl, supabaseKey: !supabaseKey } });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // ── Parse params ───────────────────────────────────────────────────────────
  const params     = { ...req.query, ...(req.body || {}) };
  const startDate  = params.start_date;
  const endDate    = params.end_date;
  const granularity = params.granularity || '1D';
  const shopIdFilter = params.shop_id || '';

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Missing start_date and/or end_date (format: YYYY-MM-DD)' });
  }

  // ── Get connections (try analytics table first, fallback to orders table) ──
  let connections = [];
  const { data: analyticsConns } = await supabase
    .from('tiktok_analytics_connections')
    .select('access_token, shop_cipher, shop_id, seller_name, access_token_expires_at')
    .not('access_token', 'is', null);

  if (analyticsConns && analyticsConns.length > 0) {
    connections = analyticsConns;
  } else {
    // Fallback: try orders connections (in case analytics scope was added to orders app)
    const { data: orderConns } = await supabase
      .from('tiktok_shop_connections')
      .select('access_token, shop_cipher, shop_id, seller_name, access_token_expires_at')
      .not('access_token', 'is', null)
      .not('shop_cipher', 'is', null);
    connections = orderConns || [];
  }

  if (!connections.length) {
    return res.status(200).json({ success: true, data: [], message: 'No connections found. Authorize shops with Analytics app first.' });
  }

  // Filter by shop if specified
  const connsToProcess = shopIdFilter
    ? connections.filter(c => String(c.shop_id) === String(shopIdFilter))
    : connections;

  // ── Call analytics for each shop ───────────────────────────────────────────
  const results = [];
  for (const conn of connsToProcess) {
    const shopLabel = conn.seller_name || conn.shop_id || 'unknown';
    try {
      const resp = await fetchShopPerformance({
        appKey, appSecret,
        accessToken: conn.access_token,
        shopCipher:  conn.shop_cipher,
        startDate, endDate, granularity,
      });

      if (resp?.code === 0 && resp?.data) {
        results.push({
          shop_id:     conn.shop_id,
          seller_name: conn.seller_name,
          data:        resp.data,
        });
      } else {
        results.push({
          shop_id:     conn.shop_id,
          seller_name: conn.seller_name,
          error:       resp?.message || `code ${resp?.code}`,
          code:        resp?.code,
        });
      }
    } catch (err) {
      results.push({
        shop_id:     conn.shop_id,
        seller_name: conn.seller_name,
        error:       err.message,
      });
    }
  }

  return res.status(200).json({
    success: true,
    start_date: startDate,
    end_date:   endDate,
    granularity,
    shops: results,
    fetchedAt: new Date().toISOString(),
  });
}
