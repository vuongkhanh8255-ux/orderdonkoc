import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const TIKTOK_TOKEN_URL  = 'https://auth.tiktok-shops.com/api/v2/token/get';
const TIKTOK_API_BASE   = 'https://open-api.tiktokglobalshop.com';

// ── HTML response renderer ────────────────────────────────────────────────────
const html = ({ title, status, details = [], tone = 'success' }) => {
  const color  = tone === 'error' ? '#dc2626' : '#16a34a';
  const bg     = tone === 'error' ? '#fef2f2' : '#f0fdf4';
  const border = tone === 'error' ? '#fecaca' : '#bbf7d0';
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>${title}</title>
    <style>
      body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f7f9;font-family:Inter,Arial,sans-serif;color:#111827}
      main{width:min(720px,calc(100vw - 32px));background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:28px;box-shadow:0 18px 48px rgba(15,23,42,.08)}
      .icon{width:44px;height:44px;display:grid;place-items:center;border-radius:12px;background:#fff7ed;border:1px solid #fed7aa;color:#ea580c;font-weight:900;font-size:22px;margin-bottom:16px}
      h1{margin:0;font-size:24px}
      p{color:#64748b;line-height:1.55}
      .status{margin:18px 0;padding:14px;border-radius:14px;color:${color};background:${bg};border:1px solid ${border};font-weight:800}
      .details{background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px;display:grid;gap:8px}
      .row{display:grid;grid-template-columns:180px 1fr;gap:10px;font-size:14px}
      .key{color:#475569;font-weight:800}
      .value{color:#0f172a;word-break:break-word;font-family:ui-monospace,monospace}
    </style>
  </head>
  <body>
    <main>
      <div class="icon">♪</div>
      <h1>${title}</h1>
      <p>TikTok Shop đã redirect về Stella Kinetics. Trang này được render từ Vercel API để xử lý token an toàn phía server.</p>
      <div class="status">${status}</div>
      <div class="details">
        ${details.map(([k,v])=>`<div class="row"><div class="key">${k}</div><div class="value">${String(v??'')}</div></div>`).join('')}
      </div>
    </main>
  </body>
</html>`;
};

const toIso = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
};

// ── TikTok API sign ───────────────────────────────────────────────────────────
const buildSign = (appSecret, path, params) => {
  const keys = Object.keys(params)
    .filter(k => k !== 'sign' && k !== 'access_token' && k !== 'shop_cipher')
    .sort();
  const base = `${appSecret}${path}${keys.map(k=>`${k}${params[k]}`).join('')}${appSecret}`;
  return crypto.createHmac('sha256', appSecret).update(base).digest('hex');
};

const signedUrl = (appKey, appSecret, path, extra = {}) => {
  const ts = String(Math.floor(Date.now() / 1000));
  const params = { app_key: appKey, timestamp: ts, ...extra };
  params.sign = buildSign(appSecret, path, params);
  return `${TIKTOK_API_BASE}${path}?${new URLSearchParams(params)}`;
};

// ── Step 1: exchange auth_code → access_token ─────────────────────────────────
const exchangeToken = async (appKey, appSecret, authCode) => {
  const url = new URL(TIKTOK_TOKEN_URL);
  url.searchParams.set('app_key',    appKey);
  url.searchParams.set('app_secret', appSecret);
  url.searchParams.set('auth_code',  authCode);
  url.searchParams.set('grant_type', 'authorized_code');

  const res  = await fetch(url.toString());
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { _raw: text }; }
  return { httpStatus: res.status, payload };
};

// ── Step 2: get authorized shops (to obtain shop_id + shop_cipher) ────────────
const getAuthorizedShops = async (appKey, appSecret, accessToken) => {
  const path = '/authorization/202309/shops';
  const url  = signedUrl(appKey, appSecret, path);
  try {
    const res  = await fetch(url, {
      headers: { 'x-tts-access-token': accessToken, 'content-type': 'application/json' }
    });
    const text = await res.text();
    return JSON.parse(text);
  } catch { return null; }
};

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const reqUrl      = new URL(req.url, `https://${req.headers.host || 'koc-tool.vercel.app'}`);
  const authCode    = reqUrl.searchParams.get('auth_code') || reqUrl.searchParams.get('code');
  const state       = reqUrl.searchParams.get('state');
  const callbackErr = reqUrl.searchParams.get('error') || reqUrl.searchParams.get('error_description');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (callbackErr) {
    return res.status(400).send(html({ title: 'TikTok Shop authorization failed', status: callbackErr, tone: 'error', details: Array.from(reqUrl.searchParams.entries()) }));
  }
  if (!authCode) {
    return res.status(200).send(html({ title: 'TikTok Shop Callback', status: 'Callback URL hoạt động, chưa có authorization code.', details: Array.from(reqUrl.searchParams.entries()) }));
  }

  const appKey      = process.env.TIKTOK_SHOP_APP_KEY?.trim();
  const appSecret   = process.env.TIKTOK_SHOP_APP_SECRET?.trim();
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();

  if (!appKey || !appSecret || !supabaseUrl || !supabaseKey) {
    return res.status(500).send(html({
      title: 'Thiếu cấu hình', tone: 'error',
      status: 'Cần set TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET và Supabase env trên Vercel.',
      details: [
        ['TIKTOK_SHOP_APP_KEY',    appKey      ? '✅' : '❌ Missing'],
        ['TIKTOK_SHOP_APP_SECRET', appSecret   ? '✅' : '❌ Missing'],
        ['SUPABASE_URL',           supabaseUrl ? '✅' : '❌ Missing'],
        ['SUPABASE key',           supabaseKey ? '✅' : '❌ Missing'],
      ]
    }));
  }

  try {
    // ── 1. Token exchange ───────────────────────────────────────────────────
    const { httpStatus, payload } = await exchangeToken(appKey, appSecret, authCode);
    const d        = payload?.data || payload;
    const apiCode  = payload?.code !== undefined ? Number(payload.code) : null;
    const ok       = httpStatus >= 200 && httpStatus < 300 && (apiCode === null || apiCode === 0) && !!d?.access_token;

    if (!ok) {
      return res.status(502).send(html({
        title: 'Không đổi được TikTok token', tone: 'error',
        status: payload?.message || `HTTP ${httpStatus}`,
        details: [
          ['http_status',  httpStatus],
          ['api_code',     apiCode ?? '-'],
          ['api_message',  payload?.message || '-'],
          ['raw_response', JSON.stringify(payload)],
        ]
      }));
    }

    const accessToken = d.access_token;

    // ── 2. Get authorized shops → shop_id + shop_cipher ────────────────────
    let shopId     = reqUrl.searchParams.get('shop_id')     || d.shop_id     || null;
    let shopCipher = reqUrl.searchParams.get('shop_cipher') || d.shop_cipher || null;
    let shopName   = d.seller_name || null;

    if (!shopCipher) {
      const shopsResp = await getAuthorizedShops(appKey, appSecret, accessToken);
      const shops = shopsResp?.data?.shops || shopsResp?.data?.list || [];
      if (shops.length > 0) {
        const shop = shops[0];
        shopId     = shopId     || shop.id     || shop.shop_id  || null;
        shopCipher = shopCipher || shop.cipher || shop.shop_cipher || null;
        shopName   = shopName   || shop.name   || shop.shop_name  || null;
      }
    }

    // ── 3. Save to Supabase ─────────────────────────────────────────────────
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const record = {
      connection_type:          'shop',
      open_id:                  d.open_id        || null,
      shop_id:                  shopId,
      shop_cipher:              shopCipher,
      seller_name:              shopName,
      seller_base_region:       d.seller_base_region || null,
      user_type:                d.user_type      ?? null,
      access_token:             accessToken,
      refresh_token:            d.refresh_token  || null,
      access_token_expires_at:  toIso(d.access_token_expire_in  || d.access_token_expire_at),
      refresh_token_expires_at: toIso(d.refresh_token_expire_in || d.refresh_token_expire_at),
      raw_response:             payload,
      last_auth_code:           authCode,
      state:                    state || null,
      updated_at:               new Date().toISOString(),
    };

    const conflictKey = record.open_id ? 'open_id' : record.shop_id ? 'shop_id' : undefined;
    const { error: saveError } = conflictKey
      ? await supabase.from('tiktok_shop_connections').upsert(record, { onConflict: conflictKey })
      : await supabase.from('tiktok_shop_connections').insert(record);

    if (saveError) throw saveError;

    return res.status(200).send(html({
      title: 'TikTok Shop đã kết nối ✅',
      status: 'Đã đổi token thành công và lưu vào Supabase. Bạn có thể đóng trang này.',
      details: [
        ['seller_name',            record.seller_name          || '-'],
        ['open_id',                record.open_id              || '-'],
        ['shop_id',                record.shop_id              || '-'],
        ['shop_cipher',            record.shop_cipher ? '✅ Có' : '⚠️ Không có (sẽ sync order bị lỗi)'],
        ['access_token_expires_at', record.access_token_expires_at || '-'],
        ['seller_base_region',     record.seller_base_region   || '-'],
      ]
    }));

  } catch (err) {
    return res.status(500).send(html({
      title: 'Lỗi callback TikTok Shop', tone: 'error',
      status: err?.message || 'Unknown error',
      details: [['code', err?.code || '-'], ['details', err?.details || '-'], ['hint', err?.hint || '-']]
    }));
  }
}
