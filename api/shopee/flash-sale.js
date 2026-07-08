import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const HOST = 'https://partner.shopeemobile.com';
const DEFAULT_SHOP_ID = 341325550;

/* ── Multi-app config ───────────────────────────────────────────────────── */
const APPS = {
  dashboard: { id: 2035068, envKey: 'SHOPEE_PARTNER_KEY' },
  marketing: { id: 2035171, envKey: 'SHOPEE_MARKETING_PARTNER_KEY' },
  ads: { id: 2035170, envKey: 'SHOPEE_ADS_PARTNER_KEY' },
};

/* ── CORS headers ───────────────────────────────────────────────────────── */
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // API động: cấm cache để Cloudflare/trình duyệt không giữ lại lỗi hay dữ liệu cũ
  // (mặc định Vercel là "public, max-age=0" → vẫn cho cache, gây kẹt lỗi transient giữa các bản deploy).
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
}

/* ── Shopee sign helper ─────────────────────────────────────────────────── */
function makeSign(partnerKey, partnerId, path, ts, accessToken = '', shopId = 0) {
  let base = partnerId.toString() + path + ts.toString();
  if (accessToken) base += accessToken;
  if (shopId) base += shopId.toString();
  return crypto.createHmac('sha256', partnerKey).update(base).digest('hex');
}

/* ── fetch có TIMEOUT (né 1 call Shopee treo làm kẹt hàm tới trần 60s Vercel → 504) ── */
async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

/* ── Supabase client ────────────────────────────────────────────────────── */
function getSupabase() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* ── Load token from Supabase ───────────────────────────────────────────── */
async function loadToken(supabase, shopId, appType) {
  const { data, error } = await supabase
    .from('shopee_tokens')
    .select('*')
    .eq('shop_id', String(shopId))
    .eq('app_type', appType)
    .maybeSingle();
  if (error) throw new Error(`DB error loading ${appType} token: ${error.message}`);
  if (!data) throw new Error(`No ${appType} token found for shop ${shopId}. Please connect via OAuth first.`);
  return data;
}

/* ── Refresh expired token ──────────────────────────────────────────────── */
async function refreshIfNeeded(supabase, tokenRow, app) {
  const expiresAt = new Date(tokenRow.token_expires).getTime();
  // Refresh if token expires within 5 minutes
  if (Date.now() < expiresAt - 5 * 60 * 1000) return tokenRow;

  const partnerKey = process.env[app.envKey]?.trim();
  if (!partnerKey) throw new Error(`${app.envKey} not configured`);

  const path = '/api/v2/auth/access_token/get';
  const ts = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, app.id, path, ts);
  const url = `${HOST}${path}?partner_id=${app.id}&timestamp=${ts}&sign=${sign}`;

  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: Number(tokenRow.shop_id),
      refresh_token: tokenRow.refresh_token,
      partner_id: app.id,
    }),
  });
  const result = await resp.json();

  if (result.error || !result.access_token) {
    throw new Error(`Token refresh failed: ${result.error || 'unknown'} — ${result.message || ''}`);
  }

  // Update in DB
  const updated = {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    token_expires: new Date(Date.now() + (result.expire_in || 14400) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from('shopee_tokens')
    .update(updated)
    .eq('id', tokenRow.id);

  return { ...tokenRow, ...updated };
}

/* ── Shopee API caller (GET) ────────────────────────────────────────────── */
async function shopeeGet(partnerKey, partnerId, apiPath, accessToken, shopId, extraParams = {}) {
  const ts = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, partnerId, apiPath, ts, accessToken, Number(shopId));

  const params = new URLSearchParams({
    partner_id: partnerId.toString(),
    timestamp: ts.toString(),
    sign,
    access_token: accessToken,
    shop_id: shopId.toString(),
    ...extraParams,
  });

  const url = `${HOST}${apiPath}?${params.toString()}`;
  const resp = await fetchWithTimeout(url);
  return resp.json();
}

/* ── Shopee API caller (POST) ───────────────────────────────────────────── */
async function shopeePost(partnerKey, partnerId, apiPath, accessToken, shopId, body = {}) {
  const ts = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, partnerId, apiPath, ts, accessToken, Number(shopId));

  const params = new URLSearchParams({
    partner_id: partnerId.toString(),
    timestamp: ts.toString(),
    sign,
    access_token: accessToken,
    shop_id: shopId.toString(),
  });

  const url = `${HOST}${apiPath}?${params.toString()}`;
  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return resp.json();
}

/* ── Get credentials for an app type ────────────────────────────────────── */
async function getCredentials(supabase, shopId, appType) {
  const app = APPS[appType];
  if (!app) throw new Error(`Unknown app type: ${appType}`);

  const partnerKey = process.env[app.envKey]?.trim();
  if (!partnerKey) throw new Error(`${app.envKey} not configured on server`);

  let tokenRow = await loadToken(supabase, shopId, appType);
  tokenRow = await refreshIfNeeded(supabase, tokenRow, app);

  return { partnerKey, partnerId: app.id, accessToken: tokenRow.access_token, shopId };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Shopee Ads (CPC) — merged here to stay within the 12-function Hobby limit.
   Exposed via action=ads&mode=summary|campaigns&days=N (multi-shop).
   ═══════════════════════════════════════════════════════════════════════════ */

/* Shopee Ads daily-performance API wants dates as DD-MM-YYYY */
function toShopeeDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/* Parse Shopee's DD-MM-YYYY back to a local-midnight Date (for in-memory window slicing) */
function parseShopeeDate(s) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s || '');
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

function adsNum(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

/* Normalize one daily row to a stable shape, tolerating field-name drift across regions */
function normalizeDaily(row) {
  const impression = adsNum(row.impression ?? row.impressions);
  const clicks = adsNum(row.clicks ?? row.click);
  const expense = adsNum(row.expense ?? row.cost);
  const gmv = adsNum(row.broad_gmv ?? row.gmv ?? row.broad_order_amount);
  const orders = adsNum(row.broad_order ?? row.broad_order_count ?? row.order ?? row.checkout);
  return {
    date: row.date || row.performance_date || '',
    impression, clicks, expense, gmv, orders,
    ctr: impression > 0 ? clicks / impression : adsNum(row.ctr),
    cpc: clicks > 0 ? expense / clicks : adsNum(row.cpc),
    roas: expense > 0 ? gmv / expense : adsNum(row.broad_roi ?? row.roi),
    raw: row,
  };
}

function sumAdsTotals(daily) {
  const t = { impression: 0, clicks: 0, expense: 0, gmv: 0, orders: 0 };
  for (const d of daily) {
    t.impression += d.impression; t.clicks += d.clicks;
    t.expense += d.expense; t.gmv += d.gmv; t.orders += d.orders;
  }
  t.ctr = t.impression > 0 ? t.clicks / t.impression : 0;
  t.cpc = t.clicks > 0 ? t.expense / t.clicks : 0;
  t.roas = t.expense > 0 ? t.gmv / t.expense : 0;
  return t;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Shopee Ads endpoints rate-limit easily. error_rate_limit is a transient QPS cap
   (retry with backoff); ads_rate_limit_total_api is a longer total-quota cap that a
   short backoff won't clear — retry it once at most so we don't hammer the quota. */
async function shopeeGetRetry(partnerKey, partnerId, apiPath, accessToken, shopId, extraParams = {}, tries = 4) {
  let res;
  for (let i = 0; i < tries; i++) {
    res = await shopeeGet(partnerKey, partnerId, apiPath, accessToken, shopId, extraParams);
    const err = res.error || '';
    if (!/rate_limit/i.test(err)) return res;
    if (/total_api/i.test(err) && i >= 1) return res;
    await sleep(700 * (i + 1));
  }
  return res;
}

/* Pull the per-campaign daily metrics array, tolerating field-name drift across regions */
function pickCampaignRows(c) {
  const cand = c.campaign_daily_performance || c.ads_daily_performance || c.metrics_list
    || c.performance_list || c.daily_performance_list || c.daily_performance || c.daily;
  if (Array.isArray(cand)) return cand;
  // Some regions return a flat per-campaign object (single period) rather than a daily array
  if (c.impression != null || c.expense != null || c.broad_gmv != null) return [c];
  return [];
}

/* Page through every product-level campaign id (the first page is mostly old/paused
   campaigns with no recent spend — the spending ones live deeper in the list). */
async function fetchAllCampaignIds(partnerKey, partnerId, accessToken, shopId, maxPages = 6) {
  const ids = [];
  const PAGE = 50;
  for (let p = 0; p < maxPages; p++) {
    const idRes = await shopeeGetRetry(partnerKey, partnerId,
      '/api/v2/ads/get_product_level_campaign_id_list',
      accessToken, shopId, { ad_type: 'all', offset: p * PAGE, limit: PAGE });
    const batch = (idRes.response?.campaign_list || idRes.response?.campaign_id_list || [])
      .map((c) => (typeof c === 'object' ? c.campaign_id : c))
      .filter(Boolean);
    ids.push(...batch);
    const hasNext = idRes.response?.has_next_page ?? (batch.length === PAGE);
    if (!hasNext || batch.length === 0) break;
  }
  return ids;
}

/* Unwrap the campaign array from get_product_campaign_daily_performance, which may
   come back as a flat array of campaigns OR wrapped in [{ shop_id, region, campaign_list }]. */
function extractCampaignList(pResp) {
  if (Array.isArray(pResp)) {
    if (pResp.length && pResp[0]?.campaign_list) return pResp.flatMap((x) => x.campaign_list || []);
    return pResp;
  }
  return pResp?.campaign_list || pResp?.performance_list || [];
}

/* GMS (GMV Max / auto ads) aggregate for a date window — returns a totals row + status. */
async function fetchGmsAggregate(partnerKey, partnerId, accessToken, shopId, startDate, endDate) {
  const res = await shopeeGetRetry(partnerKey, partnerId,
    '/api/v2/ads/get_gms_campaign_performance',
    accessToken, shopId, { start_date: startDate, end_date: endDate });
  if (/rate_limit/i.test(res.error || '')) return { row: null, status: 'rate_limited', note: res.error };
  if (res.error) return { row: null, status: 'error', note: res.error };

  const resp = res.response;
  const arr = Array.isArray(resp) ? resp : (resp ? [resp] : []);
  const agg = { impression: 0, clicks: 0, expense: 0, gmv: 0, orders: 0 };
  let found = false;
  for (const g of arr) {
    const rep = g.report || g;
    const impression = adsNum(rep.impression ?? rep.impressions);
    const clicks = adsNum(rep.clicks);
    const expense = adsNum(rep.expense);
    const gmv = adsNum(rep.gmv ?? rep.broad_gmv);
    const orders = adsNum(rep.orders ?? rep.broad_order);
    if (impression || clicks || expense || gmv) found = true;
    agg.impression += impression; agg.clicks += clicks;
    agg.expense += expense; agg.gmv += gmv; agg.orders += orders;
  }
  if (!found) return { row: null, status: 'no_data' };
  return {
    status: 'ok',
    row: {
      ...agg,
      ctr: agg.impression > 0 ? agg.clicks / agg.impression : 0,
      cpc: agg.clicks > 0 ? agg.expense / agg.clicks : 0,
      roas: agg.expense > 0 ? agg.gmv / agg.expense : 0,
    },
  };
}

/* ── Cache sync (cron) ──────────────────────────────────────────────────────
   GMS is rate-limited (ads_rate_limit_total_api), so we snapshot it ~3x/shop/day
   here instead of on every page view. One snapshot per 7/14/30-day window. */
const ADS_WINDOWS = [7, 14, 30];

async function syncShopAdsCache(supabase, tk) {
  const app = APPS.ads;
  const partnerKey = process.env[app.envKey]?.trim();
  const refreshed = await refreshIfNeeded(supabase, tk, app);
  const at = refreshed.access_token;
  const sid = String(refreshed.shop_id);
  const shopName = tk.shop_name || sid;
  const now = new Date();
  const maxWin = Math.max(...ADS_WINDOWS);

  // Manual campaigns: pull the first page of ids + their daily rows over the widest window
  // ONCE, then derive each window in memory (the manual endpoint isn't rate-limited).
  const ids = await fetchAllCampaignIds(partnerKey, app.id, at, sid, 1);
  const startMax = new Date(now); startMax.setDate(startMax.getDate() - (maxWin - 1)); startMax.setHours(0, 0, 0, 0);
  const manual = []; // { id, name, ad_type, rows: [{ t, m }] }
  for (let i = 0; i < ids.length; i += 50) {
    const slice = ids.slice(i, i + 50);
    const perfRes = await shopeeGetRetry(partnerKey, app.id,
      '/api/v2/ads/get_product_campaign_daily_performance', at, sid,
      { start_date: toShopeeDate(startMax), end_date: toShopeeDate(now), campaign_id_list: slice.join(',') });
    for (const c of extractCampaignList(perfRes.response)) {
      const rows = pickCampaignRows(c)
        .map((r) => ({ t: parseShopeeDate(r.date)?.getTime() ?? 0, m: normalizeDaily(r) }));
      manual.push({
        id: String(c.campaign_id),
        name: c.campaign_name || c.ad_name || `#${c.campaign_id}`,
        ad_type: c.ad_type || 'manual',
        rows,
      });
    }
  }

  const cacheRows = [];
  const metaRows = [];
  for (const win of ADS_WINDOWS) {
    const start = new Date(now); start.setDate(start.getDate() - (win - 1)); start.setHours(0, 0, 0, 0);
    const startD = toShopeeDate(start);
    const endD = toShopeeDate(now);
    const winStart = start.getTime();

    const gms = await fetchGmsAggregate(partnerKey, app.id, at, sid, startD, endD);
    metaRows.push({ shop_id: sid, window_days: win, gms_status: gms.status, note: gms.note || null, synced_at: new Date().toISOString() });
    if (gms.row) {
      cacheRows.push({
        shop_id: sid, window_days: win, campaign_id: 'gms', shop_name: shopName,
        campaign_name: 'GMV Max (Tự động)', ad_type: 'gms',
        ...gms.row, start_date: startD, end_date: endD,
      });
    }

    for (const c of manual) {
      const totals = sumAdsTotals(c.rows.filter((x) => x.t >= winStart).map((x) => x.m));
      if (totals.expense > 0 || totals.gmv > 0 || totals.clicks > 0) {
        cacheRows.push({
          shop_id: sid, window_days: win, campaign_id: c.id, shop_name: shopName,
          campaign_name: c.name, ad_type: c.ad_type,
          impression: totals.impression, clicks: totals.clicks, expense: totals.expense,
          gmv: totals.gmv, orders: totals.orders, ctr: totals.ctr, cpc: totals.cpc, roas: totals.roas,
          start_date: startD, end_date: endD,
        });
      }
    }
  }

  // Replace this shop's snapshot wholesale so campaigns that went inactive disappear.
  await supabase.from('shopee_ads_campaign_cache').delete().eq('shop_id', sid);
  if (cacheRows.length) await supabase.from('shopee_ads_campaign_cache').insert(cacheRows);
  await supabase.from('shopee_ads_sync_meta').upsert(metaRows, { onConflict: 'shop_id,window_days' });

  return {
    shop_id: sid, shop_name: shopName, cached_rows: cacheRows.length,
    gms: metaRows.map((m) => `${m.window_days}d:${m.gms_status}`).join(' '),
  };
}

/** action=ads_sync — cron-driven cache refresh (don't call rate-limited GMS per page view) */
async function handleAdsSync(supabase, reqUrl, req) {
  const app = APPS.ads;
  const partnerKey = process.env[app.envKey]?.trim();
  if (!partnerKey) return { success: false, error: `${app.envKey} not configured` };

  // Allow Vercel cron, or an explicit manual override (so a random hit can't drain GMS quota).
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const isCron = ua.includes('vercel-cron') || !!req.headers['x-vercel-cron'];
  if (!isCron && reqUrl.searchParams.get('manual') !== '1') {
    return { success: false, error: 'Forbidden: cron only (append &manual=1 to force)' };
  }

  const shopId = reqUrl.searchParams.get('shop_id');
  let query = supabase.from('shopee_tokens').select('*').eq('app_type', 'ads').eq('status', 'active');
  if (shopId) query = query.eq('shop_id', shopId);
  const { data: tokens, error } = await query;
  if (error) return { success: false, error: `DB error: ${error.message}` };
  if (!tokens?.length) return { success: true, synced: [], message: 'No ads shops connected' };

  const synced = [];
  for (const tk of tokens) {
    try { synced.push(await syncShopAdsCache(supabase, tk)); }
    catch (e) { synced.push({ shop_id: tk.shop_id, error: e.message }); }
    await sleep(400);
  }
  return { success: true, synced_at: new Date().toISOString(), shops: synced.length, synced };
}

/* Read the cached campaign breakdown for a shop + window (dashboard campaigns mode). */
async function loadCachedCampaigns(supabase, shopId, windowDays) {
  const sid = String(shopId);
  const [cacheRes, metaRes] = await Promise.all([
    supabase.from('shopee_ads_campaign_cache').select('*').eq('shop_id', sid).eq('window_days', windowDays),
    supabase.from('shopee_ads_sync_meta').select('*').eq('shop_id', sid).eq('window_days', windowDays).maybeSingle(),
  ]);
  const rows = cacheRes.data || [];
  const meta = metaRes.data || null;

  const campaigns = rows.map((r) => ({
    campaign_id: r.campaign_id,
    campaign_name: r.campaign_name,
    ad_type: r.ad_type,
    totals: {
      impression: Number(r.impression), clicks: Number(r.clicks), expense: Number(r.expense),
      gmv: Number(r.gmv), orders: Number(r.orders),
      ctr: Number(r.ctr), cpc: Number(r.cpc), roas: Number(r.roas),
    },
    daily: [],
  })).sort((a, b) => b.totals.expense - a.totals.expense);

  let note = null;
  if (campaigns.length === 0) {
    if (!meta) note = 'Chưa đồng bộ — dữ liệu sẽ có sau lần chạy đồng bộ kế tiếp';
    else if (meta.gms_status === 'rate_limited') note = 'GMV Max bị giới hạn API khi đồng bộ — sẽ cập nhật lần sau';
    else note = 'no_active_campaigns';
  }
  return { campaigns, note, synced_at: meta?.synced_at || null, gms_status: meta?.gms_status || null };
}

/* Per-shop fetch: balance + toggle + daily performance (+campaigns) */
async function fetchShopAds(supabase, tk, startDate, endDate, withCampaigns, days) {
  const app = APPS.ads;
  const partnerKey = process.env[app.envKey]?.trim();
  const refreshed = await refreshIfNeeded(supabase, tk, app);
  const at = refreshed.access_token;
  const sid = refreshed.shop_id;

  const [balanceRes, toggleRes, dailyRes] = await Promise.all([
    shopeeGetRetry(partnerKey, app.id, '/api/v2/ads/get_total_balance', at, sid),
    shopeeGetRetry(partnerKey, app.id, '/api/v2/ads/get_shop_toggle_info', at, sid),
    shopeeGetRetry(partnerKey, app.id, '/api/v2/ads/get_all_cpc_ads_daily_performance', at, sid,
      { start_date: startDate, end_date: endDate }),
  ]);

  const balance = adsNum(balanceRes.response?.total_balance ?? balanceRes.response?.balance);
  const toggleOn = toggleRes.response?.auto_top_up_status === 'open'
    || toggleRes.response?.campaign_surface_status === 'open'
    || !!toggleRes.response;

  // get_all_cpc_ads_daily_performance returns a bare array in `response`;
  // fall back to wrapped shapes seen in other regions.
  const dResp = dailyRes.response;
  const rawDaily = Array.isArray(dResp)
    ? dResp
    : (dResp?.performance_list || dResp?.daily_performance_list
      || dResp?.shop_all_cpc_ads_daily_performance || dResp?.all_cpc_ads_daily_performance
      || dResp?.cpc_ads_daily_performance || []);
  const daily = rawDaily.map(normalizeDaily).sort((a, b) => (a.date > b.date ? 1 : -1));
  const totals = sumAdsTotals(daily);

  let campaigns = null;
  if (withCampaigns) {
    // Campaigns come from the cron-built cache (GMS is rate-limited if called live per view).
    campaigns = await loadCachedCampaigns(supabase, sid, days).catch((e) => ({ error: e.message }));
  }

  return {
    shop_id: sid,
    shop_name: tk.shop_name || sid,
    balance, toggle_on: toggleOn, totals, daily, campaigns,
    _debug: {
      balance: balanceRes.error || balanceRes.message || null,
      daily: dailyRes.error || dailyRes.message || null,
    },
  };
}

/** action=ads — CPC summary across every shop with an active 'ads' token */
async function handleAds(supabase, reqUrl) {
  const app = APPS.ads;
  const partnerKey = process.env[app.envKey]?.trim();
  if (!partnerKey) return { success: false, error: `${app.envKey} not configured` };

  const mode = reqUrl.searchParams.get('mode') || 'summary';
  const shopId = reqUrl.searchParams.get('shop_id');
  const days = Math.min(Math.max(parseInt(reqUrl.searchParams.get('days') || '7', 10), 1), 60);

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  const startDate = reqUrl.searchParams.get('start_date') || toShopeeDate(start);
  const endDate = reqUrl.searchParams.get('end_date') || toShopeeDate(now);
  const withCampaigns = mode === 'campaigns';

  let query = supabase.from('shopee_tokens').select('*').eq('app_type', 'ads').eq('status', 'active');
  if (shopId) query = query.eq('shop_id', shopId);
  const { data: tokens, error: dbErr } = await query;
  if (dbErr) return { success: false, error: `DB error: ${dbErr.message}` };
  if (!tokens?.length) {
    return { success: true, shops: [], message: 'Chưa shop nào kết nối app Ads. Cấp quyền tại /api/shopee/auth?app=ads' };
  }

  // Sequential (not Promise.all) + small gap: Shopee ads endpoints rate-limit across shops.
  const shops = [];
  for (const tk of tokens) {
    try {
      shops.push(await fetchShopAds(supabase, tk, startDate, endDate, withCampaigns, days));
    } catch (err) {
      shops.push({ shop_id: tk.shop_id, shop_name: tk.shop_name || tk.shop_id, error: err.message });
    }
    await sleep(250);
  }

  return { success: true, start_date: startDate, end_date: endDate, days, shops };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Action handlers
   ═══════════════════════════════════════════════════════════════════════════ */

/** 1. Get available Flash Sale time slots */
async function handleTimeSlots(supabase, shopId) {
  const creds = await getCredentials(supabase, shopId, 'marketing');
  // Shopee requires start_time >= now — add 5min buffer to avoid clock-skew/race condition
  const now = Math.floor(Date.now() / 1000);
  const startTime = now + 300; // 5 minutes from now to be safe

  // Try correct endpoint name first
  let result = await shopeeGet(
    creds.partnerKey, creds.partnerId,
    '/api/v2/shop_flash_sale/get_time_slot_id',
    creds.accessToken, creds.shopId,
    { start_time: startTime, end_time: startTime + 30 * 86400 },
  );

  console.log('[FS TimeSlots] start_time:', startTime, 'result:', JSON.stringify(result).slice(0, 500));

  // If param error, also return useful message
  if (result.error) return { ok: false, error: result.error, message: result.message || 'Lỗi lấy khung giờ' };
  return { ok: true, data: result.response };
}

/** 2. Get product list with details */
async function handleProducts(supabase, shopId, params) {
  const offset = params.offset || '0';
  const pageSize = params.page_size || '20';

  const creds = await getCredentials(supabase, shopId, 'dashboard');

  // Step 1: Get item IDs
  const listResult = await shopeeGet(
    creds.partnerKey, creds.partnerId,
    '/api/v2/product/get_item_list',
    creds.accessToken, creds.shopId,
    { offset, page_size: pageSize, item_status: 'NORMAL' },
  );

  if (listResult.error) return { ok: false, error: listResult.error, message: listResult.message };

  const items = listResult.response?.item || [];
  if (items.length === 0) {
    return {
      ok: true,
      data: {
        items: [],
        total: listResult.response?.total_count || 0,
        has_next: listResult.response?.has_next_page || false,
      },
    };
  }

  // Step 2: Get base info for all items
  const itemIds = items.map((i) => i.item_id).join(',');
  const infoResult = await shopeeGet(
    creds.partnerKey, creds.partnerId,
    '/api/v2/product/get_item_base_info',
    creds.accessToken, creds.shopId,
    { item_id_list: itemIds },
  );

  if (infoResult.error) return { ok: false, error: infoResult.error, message: infoResult.message };

  return {
    ok: true,
    data: {
      items: infoResult.response?.item_list || [],
      total: listResult.response?.total_count || 0,
      has_next: listResult.response?.has_next_page || false,
    },
  };
}

/** 3. Get product models/variants */
async function handleProductModels(supabase, shopId, params) {
  const itemId = params.item_id;
  if (!itemId) return { ok: false, error: 'Missing item_id parameter' };

  const creds = await getCredentials(supabase, shopId, 'dashboard');
  const result = await shopeeGet(
    creds.partnerKey, creds.partnerId,
    '/api/v2/product/get_model_list',
    creds.accessToken, creds.shopId,
    { item_id: itemId },
  );

  if (result.error) return { ok: false, error: result.error, message: result.message };

  // Lấy thêm TÊN SP thật (để đắp khi file Excel để tên trống/vô nghĩa như "a")
  let item_name = '';
  try {
    const info = await shopeeGet(
      creds.partnerKey, creds.partnerId,
      '/api/v2/product/get_item_base_info',
      creds.accessToken, creds.shopId,
      { item_id_list: String(itemId) },
    );
    item_name = info.response?.item_list?.[0]?.item_name || '';
  } catch { /* tên optional, không chặn models */ }

  return { ok: true, data: { ...result.response, item_name } };
}

/** 3b. SOI GIÁ FS: giá trong template vs giá bán HIỆN TẠI của shop → SP nào giảm chưa đủ sẽ bị
    Shopee từ chối "Product Criteria". Read-only. ?min_discount=N (% tối thiểu coi là đủ, mặc định 10). */
async function handleFsPriceAudit(supabase, shopId, params) {
  const minDiscount = Math.max(0, Number(params.min_discount) || 10);
  // 1) Gom giá FS từ MỌI template của shop
  const { data: tmpls } = await supabase.from('flash_sale_templates').select('name, rows').eq('shop_id', String(shopId));
  if (!tmpls || !tmpls.length) return { ok: false, error: 'no_template', message: 'Shop chưa có template FS nào.' };
  const fsMap = new Map();  // `${item}_${model}` -> { item_id, model_id, fs_price(min), templates:Set }
  const itemSet = new Set();
  for (const t of tmpls) {
    for (const r of (Array.isArray(t.rows) ? t.rows : [])) {
      const item = String(r.item_id || ''); if (!item) continue;
      const model = (String(r.model_id) === '0' || !r.model_id) ? '0' : String(r.model_id);
      const price = Number(r.price) || 0; if (!price) continue;
      const key = `${item}_${model}`;
      const ex = fsMap.get(key);
      if (!ex) fsMap.set(key, { item_id: item, model_id: model, fs_price: price, templates: new Set([t.name]) });
      else { ex.fs_price = Math.min(ex.fs_price, price); ex.templates.add(t.name); }
      itemSet.add(item);
    }
  }
  const items = [...itemSet];

  // 2) Giá bán HIỆN TẠI từng item (get_model_list) — có deadline + chạy song song nhẹ
  const creds = await getCredentials(supabase, shopId, 'dashboard');
  const deadline = Date.now() + 48000;
  const priceMap = new Map();  // `${item}_${model}` -> { current, original, stock, name }
  const nameMap = new Map();
  let scanned = 0, apiErr = 0;
  const CONC = 4;
  for (let i = 0; i < items.length; i += CONC) {
    if (Date.now() > deadline) break;
    await Promise.all(items.slice(i, i + CONC).map(async (item) => {
      const r = await shopeeGet(creds.partnerKey, creds.partnerId, '/api/v2/product/get_model_list', creds.accessToken, creds.shopId, { item_id: item });
      scanned++;
      if (r.error) { apiErr++; return; }
      for (const m of (r.response?.model || [])) {
        const pi = (m.price_info && m.price_info[0]) || {};
        const mk = (m.model_id === 0 || !m.model_id) ? '0' : String(m.model_id);
        priceMap.set(`${item}_${mk}`, {
          current: Number(pi.current_price) || 0,
          original: Number(pi.original_price) || 0,
          stock: Number(m.stock_info_v2?.summary_info?.total_available_stock) || 0,
          name: m.model_name || '',
        });
      }
    }));
  }
  // Tên SP (1 lượt batch)
  try {
    const info = await shopeeGet(creds.partnerKey, creds.partnerId, '/api/v2/product/get_item_base_info', creds.accessToken, creds.shopId, { item_id_list: items.slice(0, 50).join(',') });
    for (const it of (info.response?.item_list || [])) nameMap.set(String(it.item_id), it.item_name || '');
  } catch { /* tên optional */ }

  // 3) So sánh + gợi ý giá
  const floor1k = (v) => Math.floor(v / 1000) * 1000;
  const rows = [];
  for (const [key, f] of fsMap) {
    const p = priceMap.get(key);
    const base = { item_id: f.item_id, model_id: f.model_id, item_name: nameMap.get(f.item_id) || '', templates: [...f.templates], fs_price: f.fs_price };
    if (!p || !p.current) { rows.push({ ...base, model_name: p?.name || '', current: null, original: null, stock: p?.stock ?? null, discount_pct: null, status: 'khong_thay', suggest_price: null }); continue; }
    const disc = (p.current - f.fs_price) / p.current * 100;
    let status = 'ok';
    if (f.fs_price >= p.current) status = 'fs_cao_hon';      // FS ≥ giá bán → chắc chắn bị chặn
    else if (disc < minDiscount) status = 'mong';            // giảm chưa đủ sâu
    rows.push({ ...base, model_name: p.name, current: p.current, original: p.original, stock: p.stock, discount_pct: Math.round(disc * 10) / 10, status, suggest_price: floor1k(p.current * (1 - minDiscount / 100)) });
  }
  const order = { fs_cao_hon: 0, mong: 1, khong_thay: 2, ok: 3 };
  rows.sort((a, b) => (order[a.status] - order[b.status]) || ((a.discount_pct ?? 999) - (b.discount_pct ?? 999)));
  const cnt = (s) => rows.filter(r => r.status === s).length;
  return { ok: true, data: {
    shop_id: String(shopId), min_discount: minDiscount, rows,
    summary: { total: rows.length, fs_cao_hon: cnt('fs_cao_hon'), mong: cnt('mong'), khong_thay: cnt('khong_thay'), ok: cnt('ok'),
      items_scanned: scanned, items_total: items.length, api_err: apiErr, incomplete: scanned < items.length },
  } };
}

/** 4. Create a Flash Sale */
async function handleCreate(supabase, shopId, body) {
  const { time_slot_id } = body || {};
  if (!time_slot_id) return { ok: false, error: 'Missing time_slot_id in request body' };

  const creds = await getCredentials(supabase, shopId, 'marketing');

  // Correct Shopee v2 endpoint: create_shop_flash_sale (not add_flash_sale)
  // Body uses timeslot_id (no underscore between time/slot in some versions)
  let result = await shopeePost(
    creds.partnerKey, creds.partnerId,
    '/api/v2/shop_flash_sale/create_shop_flash_sale',
    creds.accessToken, creds.shopId,
    { timeslot_id: Number(time_slot_id) },
  );

  // Fallback: try alternate endpoint names if not found
  if (result.error === 'error_not_found') {
    result = await shopeePost(
      creds.partnerKey, creds.partnerId,
      '/api/v2/shop_flash_sale/add_flash_sale',
      creds.accessToken, creds.shopId,
      { time_slot_id: Number(time_slot_id) },
    );
  }

  console.log('[FS Create] timeslot_id:', time_slot_id, 'result:', JSON.stringify(result).slice(0, 500));

  if (result.error) return { ok: false, error: result.error, message: result.message, detail: result };
  return { ok: true, data: result.response };
}

/** 5. Add items to a Flash Sale */
async function handleAddItems(supabase, shopId, body) {
  const { flash_sale_id, items } = body || {};
  if (!flash_sale_id) return { ok: false, error: 'Missing flash_sale_id in request body' };
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'Missing or empty items array in request body' };
  }

  const creds = await getCredentials(supabase, shopId, 'marketing');

  // Correct Shopee v2 endpoint: add_shop_flash_sale_items
  let result = await shopeePost(
    creds.partnerKey, creds.partnerId,
    '/api/v2/shop_flash_sale/add_shop_flash_sale_items',
    creds.accessToken, creds.shopId,
    { flash_sale_id: Number(flash_sale_id), items },
  );

  // Fallback: try alternate endpoint name
  if (result.error === 'error_not_found') {
    result = await shopeePost(
      creds.partnerKey, creds.partnerId,
      '/api/v2/shop_flash_sale/add_flash_sale_item',
      creds.accessToken, creds.shopId,
      { flash_sale_id: Number(flash_sale_id), items },
    );
  }

  console.log('[FS AddItems] flash_sale_id:', flash_sale_id, 'items:', items.length, 'result:', JSON.stringify(result).slice(0, 500));

  if (result.error) return { ok: false, error: result.error, message: result.message, detail: result };
  // Shopee có thể trả 200 NHƯNG kèm failed_items (SP bị từ chối: đã nằm ở FS khác, hết hàng, giá sai…).
  // Nếu KHÔNG thêm được SP nào → coi là THẤT BẠI để auto-FS rollback (xoá khung rỗng), tránh khung trống.
  const resp = result.response || {};
  const failed = Array.isArray(resp.failed_items) ? resp.failed_items : [];
  const added = items.length - failed.length;
  if (added <= 0) {
    return { ok: false, error: 'all_items_failed', message: failed[0]?.err_msg || failed[0]?.fail_message || 'Shopee từ chối toàn bộ sản phẩm', failed: failed.length, detail: resp };
  }
  return { ok: true, data: resp, added, failed: failed.length };
}

/** 6. List existing Flash Sales — PHÂN TRANG lấy HẾT (không còn cứng 50) */
async function handleList(supabase, shopId) {
  const creds = await getCredentials(supabase, shopId, 'marketing');
  const all = [];
  let offset = 0; const limit = 100; let total = Infinity;
  for (let page = 0; page < 40 && offset < total; page++) {
    const result = await shopeeGet(
      creds.partnerKey, creds.partnerId,
      '/api/v2/shop_flash_sale/get_shop_flash_sale_list',
      creds.accessToken, creds.shopId,
      { type: 0, offset, limit },
    );
    if (result.error === 'error_not_found' || result.error === 'error_param'
        || result.error === 'shop_flash_sale_param_error') {
      if (offset === 0) return { ok: true, data: { flash_sale_list: [] } };
      break;
    }
    if (result.error) {
      if (offset === 0) return { ok: false, error: result.error, message: result.message };
      break; // đã lấy được 1 phần → dừng, trả phần đã có
    }
    const resp = result.response || {};
    const list = resp.flash_sale_list || resp.flash_sale || [];
    all.push(...list);
    total = Number(resp.total_count) || (list.length < limit ? offset + list.length : total);
    if (list.length < limit) break;
    offset += limit;
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log('[FS List] tong cong:', all.length);
  return { ok: true, data: { flash_sale_list: all, total_count: all.length } };
}

/** 6b. Danh sách SẢN PHẨM trong 1 Flash Sale (xem SP trong khung giờ) */
async function handleItemList(supabase, shopId, params) {
  const flashSaleId = Number(params?.flash_sale_id || 0);
  if (!flashSaleId) return { ok: false, error: 'Missing flash_sale_id' };
  const creds = await getCredentials(supabase, shopId, 'marketing');
  const items = []; const models = [];
  let offset = 0; const limit = 100;
  for (let page = 0; page < 20; page++) {
    const result = await shopeeGet(
      creds.partnerKey, creds.partnerId,
      '/api/v2/shop_flash_sale/get_shop_flash_sale_items',
      creds.accessToken, creds.shopId,
      { flash_sale_id: flashSaleId, offset, limit },
    );
    if (result.error) { if (offset === 0) return { ok: false, error: result.error, message: result.message }; break; }
    const resp = result.response || {};
    const pageItems = resp.item_info || resp.items || [];
    items.push(...pageItems);
    if (Array.isArray(resp.models)) models.push(...resp.models);
    if (pageItems.length < limit) break;
    offset += limit;
    await new Promise((r) => setTimeout(r, 120));
  }
  return { ok: true, data: { flash_sale_id: flashSaleId, item_info: items, models } };
}

/** 6c. Xóa 1 SẢN PHẨM khỏi MỌI khung giờ chưa kết thúc — không đụng SP khác.
 *  body: { item_id, flash_sale_ids?: [] } (FE truyền sẵn list FS có SP thì nhanh hơn). */
async function handleDeleteItemAll(supabase, shopId, body) {
  const itemId = Number(body?.item_id || 0);
  if (!itemId) return { ok: false, error: 'Missing item_id' };
  const creds = await getCredentials(supabase, shopId, 'marketing');

  let targetFs = Array.isArray(body?.flash_sale_ids) ? body.flash_sale_ids.map(Number).filter(Boolean) : null;
  if (!targetFs) {
    const lr = await handleList(supabase, shopId);
    const ld = lr.data; const fsList = Array.isArray(ld) ? ld : (ld?.flash_sale_list || []);
    targetFs = (fsList || []).filter((f) => Number(f.type) !== 3 && f.status !== 3).map((f) => Number(f.flash_sale_id)).filter(Boolean);
  }

  const removed = []; const skipped = [];
  // Ngắt ~45s/lần (dưới trần Vercel 60s) → tránh timeout trả HTML. Phần chưa xử trả về remaining_ids,
  // FE gọi tiếp với đúng list đó (đường nhanh, khỏi quét lại) cho tới hết.
  const t0 = Date.now(); const BUDGET_MS = 45000;
  let i = 0;
  for (; i < targetFs.length; i++) {
    if (Date.now() - t0 > BUDGET_MS) break;
    const fsId = targetFs[i];
    let has = true;
    try {
      const itRes = await shopeeGet(
        creds.partnerKey, creds.partnerId,
        '/api/v2/shop_flash_sale/get_shop_flash_sale_items',
        creds.accessToken, creds.shopId,
        { flash_sale_id: fsId, offset: 0, limit: 100 },
      );
      const its = itRes.response?.item_info || itRes.response?.items || [];
      if (its.length) has = its.some((it) => Number(it.item_id) === itemId);
    } catch { /* không chắc → vẫn thử xóa */ }
    if (!has) continue;

    const delRes = await shopeePost(
      creds.partnerKey, creds.partnerId,
      '/api/v2/shop_flash_sale/delete_shop_flash_sale_items',
      creds.accessToken, creds.shopId,
      { flash_sale_id: fsId, item_ids: [itemId] },
    );
    if (delRes.error) skipped.push({ flash_sale_id: fsId, error: delRes.error, message: delRes.message });
    else removed.push(fsId);
    await new Promise((r) => setTimeout(r, 200));
  }
  const remaining = targetFs.slice(i);
  return { ok: true, data: { item_id: itemId, removed_count: removed.length, removed, skipped, remaining_ids: remaining, partial: remaining.length > 0 } };
}

/** 7. Delete a Flash Sale */
async function handleDelete(supabase, shopId, body) {
  const { flash_sale_id } = body || {};
  if (!flash_sale_id) return { ok: false, error: 'Missing flash_sale_id in request body' };

  const creds = await getCredentials(supabase, shopId, 'marketing');

  // Try correct endpoint name first
  let result = await shopeePost(
    creds.partnerKey, creds.partnerId,
    '/api/v2/shop_flash_sale/delete_shop_flash_sale',
    creds.accessToken, creds.shopId,
    { flash_sale_id: Number(flash_sale_id) },
  );

  if (result.error === 'error_not_found') {
    result = await shopeePost(
      creds.partnerKey, creds.partnerId,
      '/api/v2/shop_flash_sale/delete_flash_sale',
      creds.accessToken, creds.shopId,
      { flash_sale_id: Number(flash_sale_id) },
    );
  }

  if (result.error) return { ok: false, error: result.error, message: result.message };
  return { ok: true, data: result.response };
}

/** list_shops — shops with an active marketing token, for the Flash Sale shop selector */
async function handleListShops(supabase) {
  const { data, error } = await supabase
    .from('shopee_tokens')
    .select('shop_id, shop_name')
    .eq('app_type', 'marketing')
    .eq('status', 'active');
  if (error) return { ok: false, error: error.message };
  const seen = new Set();
  const shops = [];
  for (const r of (data || [])) {
    const sid = String(r.shop_id);
    if (seen.has(sid)) continue;
    seen.add(sid);
    shops.push({ shop_id: sid, shop_name: r.shop_name || `Shop ${sid}` });
  }
  return { ok: true, data: { shops } };
}

// ── AUTO FLASH SALE (cron ~2h sáng) ───────────────────────────────────────────
// Mỗi shop có template: lấp TẤT CẢ khung trống. Mỗi FS bốc NGẪU NHIÊN ~max_items
// variant từ 1 template ngẫu nhiên của shop; add lỗi vượt giới hạn → tự giảm dần;
// lỗi → xoá FS rỗng (rollback). dry_run=1 → chỉ báo kế hoạch, không tạo thật.
function fsShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function fsBuildItems(rows) {
  const byItem = {};
  for (const r of rows) {
    const iid = String(r.item_id || '');
    if (!iid) continue;
    (byItem[iid] = byItem[iid] || []).push(r);
  }
  return Object.entries(byItem).map(([iid, rs]) => ({
    item_id: Number(iid),
    purchase_limit: 0,
    models: rs.map((r) => ({
      model_id: (String(r.model_id) === '0' || !r.model_id) ? 0 : Number(r.model_id),
      input_promo_price: Number(r.price) || 0,
      stock: Number(r.stock) || 100,
    })),
  }));
}

async function runAutoFsForShop(supabase, shopId, templates, maxItems, dryRun, maxSlots, deadline) {
  const out = [];
  const slotsRes = await handleTimeSlots(supabase, shopId);
  const sd = slotsRes.ok ? slotsRes.data : null;
  const slots = Array.isArray(sd) ? sd : (sd?.time_slot_list || sd?.time_slot || []);
  if (!slots.length) return [{ shopId, status: 'no_slots' }];

  let used = new Set();
  try {
    const lr = await handleList(supabase, shopId);
    const ld = lr.data;
    const fsList = Array.isArray(ld) ? ld : (ld?.flash_sale_list || ld?.flash_sale || []);
    let delCount = 0;
    for (const f of (fsList || [])) {
      const sid = String(f.timeslot_id || f.time_slot_id);
      // Khung RỖNG (rác tạo hụt từ code cũ) → xoá để vòng dưới tạo lại + lấp SP.
      // Guard: chỉ xoá khi số SP RÕ RÀNG = 0 (field có mặt); thiếu field → coi như đã có SP (an toàn).
      const hasCount = ('item_count' in f) || ('enabled_item_count' in f);
      const cnt = Number(f.item_count || 0) + Number(f.enabled_item_count || 0);
      const isEmpty = hasCount && cnt === 0 && f.flash_sale_id;
      // XOÁ CÓ GIỚI HẠN: bỏ qua khi dry_run (không đụng thật), tối đa 8 khung/shop/lượt,
      // dừng khi hết ngân sách thời gian. Trước đây xoá KHÔNG giới hạn → 1 shop nhiều khung rỗng
      // ăn hết 60s → Vercel giết → 504. Cron sau tự xoá tiếp phần còn lại (FS idempotent).
      if (isEmpty && !dryRun && delCount < 8 && !(deadline && Date.now() > deadline)) {
        try { await handleDelete(supabase, shopId, { flash_sale_id: f.flash_sale_id }); delCount++; continue; }
        catch { /* xoá lỗi → coi như đang bận, để lần cron sau xử */ }
      }
      used.add(sid); // đã có SP, hoặc khung rỗng chưa xoá lần này → không lấp đè
    }
  } catch { /* list lỗi không chặn */ }

  // MỖI KHUNG = TRỌN 1 FILE TEMPLATE (~10 SP), xoay vòng các file (Khánh chốt 3/7: "mỗi khung
  // nhiều SP luôn chứ ko phải ít"). Shopee CHO 1 SP nằm nhiều khung KHÁC GIỜ (bằng chứng: FS tạo
  // tay 9/9 SP nhiều khung liền vẫn ok) → không cần chia đều pool như trước. An toàn: SP nào bị
  // Shopee từ chối thì rớt riêng (failed_items), cả khung fail → rollback xoá khung rỗng sẵn có.
  const tmplSets = fsShuffle(templates
    .map((t) => fsBuildItems(Array.isArray(t.rows) ? t.rows : []).slice(0, maxItems))
    .filter((set) => set.length));
  if (!tmplSets.length) return [{ shopId, status: 'no_items' }];
  const nModels = (its) => its.reduce((s, it) => s + (it.models?.length || 0), 0);

  // Khung TRỐNG cần lấp (chưa có FS), tối đa maxSlots
  const emptySlots = slots.filter((s) => { const id = s.timeslot_id || s.time_slot_id; return id && !used.has(String(id)); }).slice(0, maxSlots);

  let ti = 0; // con trỏ xoay vòng template
  for (const slot of emptySlots) {
    if (deadline && Date.now() > deadline) { out.push({ shopId, status: 'skip_het_gio' }); break; } // hết ngân sách → dừng, cron sau lấp tiếp
    const slotId = slot.timeslot_id || slot.time_slot_id;
    let items = tmplSets[ti % tmplSets.length];
    ti++;

    if (dryRun) { out.push({ shopId, slotId, status: 'dry_run', products: items.length, variants: nModels(items) }); continue; }

    const createRes = await handleCreate(supabase, shopId, { time_slot_id: slotId });
    if (!createRes.ok) { out.push({ shopId, slotId, status: 'create_fail', error: createRes.error || createRes.message }); continue; }
    const fsId = createRes.data?.flash_sale_id;
    if (!fsId) { out.push({ shopId, slotId, status: 'no_fsid' }); continue; }

    let addRes = await handleAddItems(supabase, shopId, { flash_sale_id: fsId, items });
    let tries = 0;
    // CHỈ co lại khi Shopee TỪ CHỐI vì vượt trần SẢN PHẨM/FS của shop — bỏ bớt 1 SẢN PHẨM/lần.
    while (!addRes.ok && /exceed_max_item|max number of item/i.test(JSON.stringify(addRes)) && items.length > 1 && tries < 15) {
      if (deadline && Date.now() > deadline) break; // hết giờ giữa chừng retry → dừng, không để lố timeout
      items = items.slice(0, items.length - 1);
      addRes = await handleAddItems(supabase, shopId, { flash_sale_id: fsId, items });
      tries++;
    }
    if (!addRes.ok) {
      try { await handleDelete(supabase, shopId, { flash_sale_id: fsId }); } catch { /* rollback */ }
      // kèm err_msg thật của Shopee (Product Criteria / delisted / hết kho…) — 'all_items_failed' không nói lên gì
      out.push({ shopId, slotId, status: 'add_fail', error: [addRes.error, addRes.message].filter(Boolean).join(' — ') });
    } else {
      out.push({ shopId, slotId, status: 'ok', fsId, products: addRes.added ?? items.length, failed: addRes.failed || 0, variants: nModels(items) });
    }
    await new Promise((r) => setTimeout(r, 300)); // giãn nhịp tránh rate-limit
  }
  return out;
}

async function handleAutoFlashSaleAll(supabase, reqUrl, req) {
  // Mở (không bắt secret) — giống các endpoint cron khác (auto_boost_all, auto_reply_comments)
  // để cron-job.org ping thẳng URL trần là chạy. An toàn: chỉ lấp khung FS TRỐNG bằng template
  // sẵn có của shop, idempotent (khung đã có FS thì bỏ qua) → kích nhiều lần cũng vô hại.
  const maxItems = Math.max(1, Number(reqUrl.searchParams.get('max_items')) || 20);
  const maxSlots = Math.max(1, Number(reqUrl.searchParams.get('max_slots')) || 15);
  const source = reqUrl.searchParams.get('source') || 'cron';
  const dryRun = reqUrl.searchParams.get('dry_run') === '1';
  const onlyShop = reqUrl.searchParams.get('shop_id');

  const { data: tmpls } = await supabase.from('flash_sale_templates').select('id, name, shop_id, rows');
  const byShop = {};
  for (const t of (tmpls || [])) {
    if (onlyShop && onlyShop !== 'all' && String(t.shop_id) !== String(onlyShop)) continue;
    if (!Array.isArray(t.rows) || !t.rows.length) continue;
    (byShop[String(t.shop_id)] = byShop[String(t.shop_id)] || []).push(t);
  }

  // Chạy TUẦN TỰ + ngân sách thời gian (né timeout 60s Vercel). FS idempotent (bỏ khung đã có FS)
  // → lần cron sau tự lấp tiếp shop bị "skip_het_gio". Trước đây chạy Promise.all tất cả shop → quá 60s → fail.
  const startTs = Date.now();
  const deadline = startTs + 40000; // 40s: chừa ~20s cho 1 shop đang chạy dở + call cuối (fetch timeout 8s) < trần 60s
  const results = [];
  for (const [sid, tmps] of Object.entries(byShop)) {
    if (Date.now() > deadline) { results.push({ shopId: sid, status: 'skip_het_gio' }); continue; }
    try { results.push(...await runAutoFsForShop(supabase, sid, tmps, maxItems, dryRun, maxSlots, deadline)); }
    catch (e) { results.push({ shopId: sid, status: 'shop_error', error: e.message }); }
  }
  const summary = {
    shops: Object.keys(byShop).length,
    created: results.filter((r) => r.status === 'ok').length,
    dry: results.filter((r) => r.status === 'dry_run').length,
    fail: results.filter((r) => (r.status || '').includes('fail') || r.status === 'shop_error').length,
    total: results.length,
  };
  if (!dryRun) { try { await supabase.from('fs_auto_log').insert({ source, summary, results }); } catch (e) { console.error('fs_auto_log err', e.message); } }
  return { ok: true, dry_run: dryRun, ...summary, results };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main handler
   ═══════════════════════════════════════════════════════════════════════════ */
export default async function handler(req, res) {
  setCors(res);

  // Handle preflight
  if (req.method === 'OPTIONS') return res.status(204).end();

  const reqUrl = new URL(req.url, `https://${req.headers.host || 'koc-tool.vercel.app'}`);
  let action = reqUrl.searchParams.get('action');
  const shopId = reqUrl.searchParams.get('shop_id') || DEFAULT_SHOP_ID;

  // Vercel cron can't reliably carry a query string in the path, so a cron hit on the
  // bare function (identified by its header / user-agent) is treated as the ads cache sync.
  if (!action) {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    if (req.headers['x-vercel-cron'] || ua.includes('vercel-cron')) action = 'ads_sync';
  }

  if (!action) {
    return res.status(400).json({
      ok: false,
      error: 'Missing ?action= parameter',
      available: ['ads', 'ads_sync', 'time_slots', 'products', 'product_models', 'create', 'add_items', 'list', 'list_shops', 'delete'],
    });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ ok: false, error: 'Supabase not configured on server' });
  }

  // Collect query params for GET actions
  const params = Object.fromEntries(reqUrl.searchParams.entries());

  try {
    let result;

    switch (action) {
      case 'ads':
        result = await handleAds(supabase, reqUrl);
        break;
      case 'ads_sync':
        result = await handleAdsSync(supabase, reqUrl, req);
        break;
      case 'time_slots':
        result = await handleTimeSlots(supabase, shopId);
        break;
      case 'products':
        result = await handleProducts(supabase, shopId, params);
        break;
      case 'product_models':
        result = await handleProductModels(supabase, shopId, params);
        break;
      case 'fs_price_audit':
        result = await handleFsPriceAudit(supabase, shopId, params);
        break;
      case 'create':
        if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST required for create' });
        result = await handleCreate(supabase, shopId, req.body);
        break;
      case 'add_items':
        if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST required for add_items' });
        result = await handleAddItems(supabase, shopId, req.body);
        break;
      case 'list':
        result = await handleList(supabase, shopId);
        break;
      case 'list_shops':
        result = await handleListShops(supabase);
        break;
      case 'delete':
        if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST required for delete' });
        result = await handleDelete(supabase, shopId, req.body);
        break;
      case 'item_list':
        result = await handleItemList(supabase, shopId, params);
        break;
      case 'delete_item_all':
        if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST required for delete_item_all' });
        result = await handleDeleteItemAll(supabase, shopId, req.body);
        break;
      case 'auto_flash_sale_all':
        result = await handleAutoFlashSaleAll(supabase, reqUrl, req);
        break;
      default:
        return res.status(400).json({
          ok: false,
          error: `Unknown action: ${action}`,
          available: ['ads', 'ads_sync', 'time_slots', 'products', 'product_models', 'create', 'add_items', 'list', 'list_shops', 'delete'],
        });
    }

    // Always return 200 so Cloudflare doesn't intercept with its own HTML error page.
    // The `ok` field in JSON body indicates success/failure to the frontend.
    return res.status(200).json(result);

  } catch (err) {
    // Return 200 with ok:false so Cloudflare doesn't replace response with HTML error page
    return res.status(200).json({
      ok: false,
      error: err.message || 'Internal server error',
    });
  }
}
