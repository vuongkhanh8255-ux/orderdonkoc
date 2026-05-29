import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const HOST = 'https://partner.shopeemobile.com';
const APP = { id: 2035170, envKey: 'SHOPEE_ADS_PARTNER_KEY' };

/* ── Helpers ─────────────────────────────────────────────────────── */
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

async function refreshIfNeeded(supabase, tokenRow) {
  const expiresAt = new Date(tokenRow.token_expires).getTime();
  if (Date.now() < expiresAt - 5 * 60 * 1000) return tokenRow;

  const partnerKey = process.env[APP.envKey]?.trim();
  if (!partnerKey) throw new Error(`${APP.envKey} not configured`);

  const path = '/api/v2/auth/access_token/get';
  const ts = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, APP.id, path, ts);
  const url = `${HOST}${path}?partner_id=${APP.id}&timestamp=${ts}&sign=${sign}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shop_id: Number(tokenRow.shop_id), refresh_token: tokenRow.refresh_token, partner_id: APP.id }),
  });
  const result = await resp.json();
  if (!result.access_token) throw new Error(`Token refresh failed: ${result.error || 'unknown'}`);

  const updated = {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    token_expires: new Date(Date.now() + (result.expire_in || 14400) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  await supabase.from('shopee_tokens').update(updated).eq('id', tokenRow.id);
  return { ...tokenRow, ...updated };
}

async function shopeeGet(partnerKey, apiPath, accessToken, shopId, extraParams = {}) {
  const ts = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, APP.id, apiPath, ts, accessToken, Number(shopId));
  const params = new URLSearchParams({
    partner_id: APP.id.toString(),
    timestamp: ts.toString(),
    sign, access_token: accessToken, shop_id: shopId.toString(),
    ...extraParams,
  });
  const resp = await fetch(`${HOST}${apiPath}?${params.toString()}`);
  return resp.json();
}

/* Shopee Ads daily-performance API wants dates as DD-MM-YYYY */
function toShopeeDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

/* Normalize one daily row to a stable shape, tolerating field-name drift across regions */
function normalizeDaily(row) {
  const impression = num(row.impression ?? row.impressions);
  const clicks = num(row.clicks ?? row.click);
  const expense = num(row.expense ?? row.cost);
  const gmv = num(row.broad_gmv ?? row.gmv ?? row.broad_order_amount);
  const orders = num(row.broad_order ?? row.broad_order_count ?? row.order ?? row.checkout);
  return {
    date: row.date || row.performance_date || '',
    impression, clicks, expense, gmv, orders,
    ctr: impression > 0 ? clicks / impression : num(row.ctr),
    cpc: clicks > 0 ? expense / clicks : num(row.cpc),
    roas: expense > 0 ? gmv / expense : num(row.broad_roi ?? row.roi),
    raw: row,
  };
}

function sumTotals(daily) {
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

/* ── Per-shop fetch: balance + toggle + daily performance ─────────── */
async function fetchShopAds(supabase, partnerKey, tk, startDate, endDate, withCampaigns) {
  const refreshed = await refreshIfNeeded(supabase, tk);
  const at = refreshed.access_token;
  const sid = refreshed.shop_id;

  const [balanceRes, toggleRes, dailyRes] = await Promise.all([
    shopeeGet(partnerKey, '/api/v2/ads/get_total_balance', at, sid),
    shopeeGet(partnerKey, '/api/v2/ads/get_shop_toggle_info', at, sid),
    shopeeGet(partnerKey, '/api/v2/ads/get_all_cpc_ads_daily_performance', at, sid,
      { start_date: startDate, end_date: endDate }),
  ]);

  const balance = num(balanceRes.response?.total_balance ?? balanceRes.response?.balance);
  const toggleOn = toggleRes.response?.auto_top_up_status === 'open'
    || toggleRes.response?.campaign_surface_status === 'open'
    || !!toggleRes.response;

  const rawDaily = dailyRes.response?.performance_list || dailyRes.response?.daily_performance_list || [];
  const daily = rawDaily.map(normalizeDaily).sort((a, b) => (a.date > b.date ? 1 : -1));
  const totals = sumTotals(daily);

  let campaigns = null;
  if (withCampaigns) {
    campaigns = await fetchCampaigns(partnerKey, at, sid, startDate, endDate).catch((e) => ({ error: e.message }));
  }

  return {
    shop_id: sid,
    shop_name: tk.shop_name || sid,
    balance,
    toggle_on: toggleOn,
    totals,
    daily,
    campaigns,
    _debug: {
      balance: balanceRes.error || balanceRes.message || null,
      daily: dailyRes.error || dailyRes.message || null,
    },
  };
}

/* ── Per-campaign breakdown (optional, action=campaigns) ──────────── */
async function fetchCampaigns(partnerKey, accessToken, shopId, startDate, endDate) {
  const idRes = await shopeeGet(partnerKey, '/api/v2/ads/get_product_level_campaign_id_list',
    accessToken, shopId, { ad_type: 'all', offset: 0, limit: 50 });

  const idList = (idRes.response?.campaign_list || idRes.response?.campaign_id_list || [])
    .map((c) => (typeof c === 'object' ? c.campaign_id : c))
    .filter(Boolean);

  if (idList.length === 0) return { campaigns: [], note: idRes.error || 'no_campaigns' };

  // Shopee allows up to 100 campaign_id per call; we cap at 50 above.
  const perfRes = await shopeeGet(partnerKey, '/api/v2/ads/get_product_campaign_daily_performance',
    accessToken, shopId, { start_date: startDate, end_date: endDate, campaign_id_list: idList.join(',') });

  const list = perfRes.response?.campaign_list || perfRes.response?.performance_list || [];
  const campaigns = list.map((c) => {
    const rows = (c.ads_daily_performance || c.performance_list || c.daily_performance_list || []).map(normalizeDaily);
    return {
      campaign_id: c.campaign_id,
      campaign_name: c.campaign_name || c.ad_name || `#${c.campaign_id}`,
      totals: sumTotals(rows),
      daily: rows,
    };
  }).sort((a, b) => b.totals.expense - a.totals.expense);

  return { campaigns, note: perfRes.error || null };
}

/* ── Handler ─────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const supabase = getSupabase();
  if (!supabase) return res.status(200).json({ success: false, error: 'Supabase not configured' });

  const partnerKey = process.env[APP.envKey]?.trim();
  if (!partnerKey) return res.status(200).json({ success: false, error: `${APP.envKey} not configured` });

  const u = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const action = u.searchParams.get('action') || 'summary';
  const shopId = u.searchParams.get('shop_id');
  const days = Math.min(Math.max(parseInt(u.searchParams.get('days') || '7', 10), 1), 60);

  // Date range (Shopee ads = DD-MM-YYYY). Default: last `days` days incl. today.
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  const startDate = u.searchParams.get('start_date') || toShopeeDate(start);
  const endDate = u.searchParams.get('end_date') || toShopeeDate(now);
  const withCampaigns = action === 'campaigns';

  try {
    let query = supabase.from('shopee_tokens').select('*').eq('app_type', 'ads').eq('status', 'active');
    if (shopId) query = query.eq('shop_id', shopId);
    const { data: tokens, error: dbErr } = await query;
    if (dbErr) throw new Error(`DB error: ${dbErr.message}`);
    if (!tokens?.length) {
      return res.status(200).json({
        success: true, shops: [],
        message: 'Chưa shop nào kết nối app Ads. Cấp quyền tại /api/shopee/auth?app=ads',
      });
    }

    const shops = await Promise.all(tokens.map(async (tk) => {
      try {
        return await fetchShopAds(supabase, partnerKey, tk, startDate, endDate, withCampaigns);
      } catch (err) {
        return { shop_id: tk.shop_id, shop_name: tk.shop_name || tk.shop_id, error: err.message };
      }
    }));

    return res.status(200).json({ success: true, start_date: startDate, end_date: endDate, days, shops });
  } catch (err) {
    console.error('Shopee ads error:', err);
    return res.status(200).json({ success: false, error: err.message });
  }
}
