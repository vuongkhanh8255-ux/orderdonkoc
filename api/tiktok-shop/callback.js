import { createClient } from '@supabase/supabase-js';

// ── Correct TikTok Shop Open Platform v2 token endpoint ───────────────────────
// ALWAYS use auth.tiktok-shops.com — NOT open-api.tiktokglobalshop.com
const TIKTOK_TOKEN_URL = 'https://auth.tiktok-shops.com/api/v2/token/get';

const html = ({ title, status, details = [], tone = 'success' }) => {
  const color  = tone === 'error' ? '#dc2626' : '#16a34a';
  const bg     = tone === 'error' ? '#fef2f2' : '#f0fdf4';
  const border = tone === 'error' ? '#fecaca' : '#bbf7d0';

  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f7f9; font-family: Inter, Arial, sans-serif; color: #111827; }
      main { width: min(720px, calc(100vw - 32px)); background: #fff; border: 1px solid #e5e7eb; border-radius: 20px; padding: 28px; box-shadow: 0 18px 48px rgba(15,23,42,.08); }
      .icon { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 12px; background: #fff7ed; border: 1px solid #fed7aa; color: #ea580c; font-weight: 900; font-size: 22px; margin-bottom: 16px; }
      h1 { margin: 0; font-size: 24px; }
      p { color: #64748b; line-height: 1.55; }
      .status { margin: 18px 0; padding: 14px; border-radius: 14px; color: ${color}; background: ${bg}; border: 1px solid ${border}; font-weight: 800; }
      .details { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px; display: grid; gap: 8px; }
      .row { display: grid; grid-template-columns: 180px 1fr; gap: 10px; font-size: 14px; }
      .key { color: #475569; font-weight: 800; }
      .value { color: #0f172a; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    </style>
  </head>
  <body>
    <main>
      <div class="icon">♪</div>
      <h1>${title}</h1>
      <p>TikTok Shop đã redirect về Stella Kinetics. Trang này được render từ Vercel API để xử lý token an toàn phía server.</p>
      <div class="status">${status}</div>
      <div class="details">
        ${details.map(([key, value]) => `<div class="row"><div class="key">${key}</div><div class="value">${String(value ?? '')}</div></div>`).join('')}
      </div>
    </main>
  </body>
</html>`;
};

const toIsoFromEpochSeconds = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return new Date(num * 1000).toISOString();
};

const getTokenBundle = (data) => {
  // TikTok v2 wraps everything in data.data; some responses return flat
  const d = data?.data || data;
  return {
    access_token:          d?.access_token,
    refresh_token:         d?.refresh_token,
    access_token_expire_in:  d?.access_token_expire_in  || d?.access_token_expire_at  || d?.access_token_expires_at,
    refresh_token_expire_in: d?.refresh_token_expire_in || d?.refresh_token_expire_at || d?.refresh_token_expires_at,
    open_id:             d?.open_id,
    seller_name:         d?.seller_name,
    seller_base_region:  d?.seller_base_region,
    user_type:           d?.user_type,
    shop_id:             d?.shop_id,
    shop_cipher:         d?.shop_cipher,
  };
};

// ── Exchange auth_code → access_token via TikTok Shop v2 API ─────────────────
// Correct format: GET https://auth.tiktok-shops.com/api/v2/token/get?app_key=...&app_secret=...&auth_code=...&grant_type=authorized_code
const exchangeAuthCode = async (appKey, appSecret, authCode) => {
  const url = new URL(TIKTOK_TOKEN_URL);
  url.searchParams.set('app_key',    appKey);
  url.searchParams.set('app_secret', appSecret);
  url.searchParams.set('auth_code',  authCode);
  url.searchParams.set('grant_type', 'authorized_code');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { _raw: text }; }

  return { url: url.toString(), httpStatus: response.status, payload };
};

export default async function handler(req, res) {
  const requestUrl  = new URL(req.url, `https://${req.headers.host || 'koc-tool.vercel.app'}`);
  const authCode    = requestUrl.searchParams.get('auth_code') || requestUrl.searchParams.get('code');
  const state       = requestUrl.searchParams.get('state');
  const callbackErr = requestUrl.searchParams.get('error') || requestUrl.searchParams.get('error_description');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  // ── TikTok returned an error ──────────────────────────────────────────────
  if (callbackErr) {
    return res.status(400).send(html({
      title: 'TikTok Shop authorization failed',
      status: callbackErr,
      tone: 'error',
      details: Array.from(requestUrl.searchParams.entries()),
    }));
  }

  // ── No auth code present ──────────────────────────────────────────────────
  if (!authCode) {
    return res.status(200).send(html({
      title: 'TikTok Shop Callback',
      status: 'Callback URL hoạt động, nhưng chưa có authorization code.',
      details: Array.from(requestUrl.searchParams.entries()),
    }));
  }

  // ── Read env vars ─────────────────────────────────────────────────────────
  const appKey      = process.env.TIKTOK_SHOP_APP_KEY?.trim();
  const appSecret   = process.env.TIKTOK_SHOP_APP_SECRET?.trim();
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();

  if (!appKey || !appSecret || !supabaseUrl || !supabaseKey) {
    return res.status(500).send(html({
      title: 'Thiếu cấu hình TikTok / Supabase',
      status: 'Cần set TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET và Supabase env trên Vercel.',
      tone: 'error',
      details: [
        ['TIKTOK_SHOP_APP_KEY',    appKey      ? '✅ OK' : '❌ Missing'],
        ['TIKTOK_SHOP_APP_SECRET', appSecret   ? '✅ OK' : '❌ Missing'],
        ['SUPABASE_URL',           supabaseUrl ? '✅ OK' : '❌ Missing'],
        ['SUPABASE key',           supabaseKey ? '✅ OK' : '❌ Missing'],
      ],
    }));
  }

  try {
    // ── Exchange code for token ─────────────────────────────────────────────
    const { url: tokenUrl, httpStatus, payload } = await exchangeAuthCode(appKey, appSecret, authCode);
    const bundle = getTokenBundle(payload);

    // ── Check for success ───────────────────────────────────────────────────
    const apiCode = payload?.code !== undefined ? Number(payload.code) : null;
    const success = httpStatus >= 200 && httpStatus < 300 && (apiCode === null || apiCode === 0) && !!bundle.access_token;

    if (!success) {
      return res.status(502).send(html({
        title: 'Không đổi được TikTok token',
        status: payload?.message || `HTTP ${httpStatus} — token API failed`,
        tone: 'error',
        details: [
          ['token_url',     tokenUrl],
          ['http_status',   httpStatus],
          ['api_code',      apiCode ?? '-'],
          ['api_message',   payload?.message || '-'],
          ['auth_code',     authCode?.slice(0, 20) + '...'],
          ['raw_response',  JSON.stringify(payload)],
        ],
      }));
    }

    // ── Save to Supabase ────────────────────────────────────────────────────
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const shopIdFromQuery = requestUrl.searchParams.get('shop_id');
    const shopCipherFromQuery = requestUrl.searchParams.get('shop_cipher');

    const record = {
      connection_type:          'shop',
      open_id:                  bundle.open_id || null,
      shop_id:                  shopIdFromQuery || bundle.shop_id || null,
      shop_cipher:              shopCipherFromQuery || bundle.shop_cipher || null,
      seller_name:              bundle.seller_name || null,
      seller_base_region:       bundle.seller_base_region || null,
      user_type:                bundle.user_type ?? null,
      access_token:             bundle.access_token,
      refresh_token:            bundle.refresh_token || null,
      access_token_expires_at:  toIsoFromEpochSeconds(bundle.access_token_expire_in),
      refresh_token_expires_at: toIsoFromEpochSeconds(bundle.refresh_token_expire_in),
      raw_response:             payload,
      last_auth_code:           authCode,
      state:                    state || null,
      updated_at:               new Date().toISOString(),
    };

    // Upsert: prefer open_id as conflict key, fallback to shop_id, else insert
    const conflictKey = record.open_id ? 'open_id' : record.shop_id ? 'shop_id' : undefined;
    const query = supabase.from('tiktok_shop_connections');
    const { error: saveError } = conflictKey
      ? await query.upsert(record, { onConflict: conflictKey })
      : await query.insert(record);

    if (saveError) throw saveError;

    return res.status(200).send(html({
      title: 'TikTok Shop đã kết nối ✅',
      status: 'Đã đổi token thành công và lưu vào Supabase. Bạn có thể đóng trang này.',
      details: [
        ['seller_name',            record.seller_name || '-'],
        ['open_id',                record.open_id || '-'],
        ['shop_id',                record.shop_id || '-'],
        ['shop_cipher',            record.shop_cipher || '-'],
        ['access_token_expires_at', record.access_token_expires_at || '-'],
        ['seller_base_region',     record.seller_base_region || '-'],
      ],
    }));

  } catch (error) {
    return res.status(500).send(html({
      title: 'Lỗi callback TikTok Shop',
      status: error?.message || 'Unknown error',
      tone: 'error',
      details: [
        ['code',    error?.code    || '-'],
        ['details', error?.details || '-'],
        ['hint',    error?.hint    || '-'],
      ],
    }));
  }
}
