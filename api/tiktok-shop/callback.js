import { createClient } from '@supabase/supabase-js';

const DEFAULT_TOKEN_URL = 'https://auth.tiktok-shops.com/api/v2/token/get';

const html = ({ title, status, details = [], tone = 'success' }) => {
  const color = tone === 'error' ? '#dc2626' : '#16a34a';
  const bg = tone === 'error' ? '#fef2f2' : '#f0fdf4';
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

const getTokenBundle = (payload) => {
  const data = payload?.data || payload;
  return {
    access_token: data?.access_token,
    refresh_token: data?.refresh_token,
    access_token_expire_in: data?.access_token_expire_in || data?.access_token_expire_at || data?.access_token_expires_at,
    refresh_token_expire_in: data?.refresh_token_expire_in || data?.refresh_token_expire_at || data?.refresh_token_expires_at,
    open_id: data?.open_id,
    seller_name: data?.seller_name,
    seller_base_region: data?.seller_base_region,
    user_type: data?.user_type,
    shop_id: data?.shop_id,
    shop_cipher: data?.shop_cipher
  };
};

const readJsonSafely = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
};

const isTokenSuccess = (response, payload) => {
  const data = payload?.data || payload;
  if (!response.ok) return false;
  if (payload?.code !== undefined && Number(payload.code) !== 0) return false;
  return !!data?.access_token;
};

const buildTokenAttempts = ({ appKey, appSecret, authCode, merchantId, tokenUrl }) => {
  if (merchantId) {
    return [{
      name: 'merchant-oauth-access-token',
      url: 'https://open.tiktokapis.com/merchant/oauth/token/',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-tt-target-idc': 'alisg'
      },
      body: new URLSearchParams({
        client_key: appKey,
        client_secret: appSecret,
        grant_type: 'access_token',
        merchant_id: merchantId
      }).toString()
    }];
  }

  return [
    {
      name: 'auth-v2-token-get-query',
      method: 'GET',
      url: `${tokenUrl}?${new URLSearchParams({
        app_key: appKey,
        app_secret: appSecret,
        grant_type: 'authorized_code',
        auth_code: authCode
      }).toString()}`,
      headers: {},
      body: undefined
    },
    {
      name: 'shop-v2-token-get-form',
      url: tokenUrl,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        app_key: appKey,
        app_secret: appSecret,
        grant_type: 'authorized_code',
        auth_code: authCode
      }).toString()
    },
    {
      name: 'auth-v2-token-get-json',
      url: tokenUrl,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_key: appKey,
        app_secret: appSecret,
        grant_type: 'authorized_code',
        auth_code: authCode
      })
    },
    {
      name: 'legacy-getAccessToken-json',
      url: 'https://open-api.tiktokglobalshop.com/api/token/getAccessToken',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_key: appKey,
        app_secret: appSecret,
        grant_type: 'authorized_code',
        auth_code: authCode
      })
    }
  ];
};

export default async function handler(req, res) {
  const requestUrl = new URL(req.url, `https://${req.headers.host || 'koc-tool.vercel.app'}`);
  const authCode = requestUrl.searchParams.get('auth_code') || requestUrl.searchParams.get('code');
  const merchantId = requestUrl.searchParams.get('merchant_id')
    || requestUrl.searchParams.get('merchantId')
    || requestUrl.searchParams.get('seller_id')
    || requestUrl.searchParams.get('shop_id');
  const state = requestUrl.searchParams.get('state');
  const callbackError = requestUrl.searchParams.get('error') || requestUrl.searchParams.get('error_description');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (callbackError) {
    res.status(400).send(html({
      title: 'TikTok Shop authorization failed',
      status: callbackError,
      tone: 'error',
      details: Array.from(requestUrl.searchParams.entries())
    }));
    return;
  }

  if (!authCode && !merchantId) {
    res.status(200).send(html({
      title: 'TikTok Shop Callback',
      status: 'Callback URL hoạt động, nhưng chưa có authorization code.',
      details: Array.from(requestUrl.searchParams.entries())
    }));
    return;
  }

  const appKey = process.env.TIKTOK_SHOP_APP_KEY?.trim();
  const appSecret = process.env.TIKTOK_SHOP_APP_SECRET?.trim();
  const tokenUrl = process.env.TIKTOK_SHOP_TOKEN_URL?.trim() || DEFAULT_TOKEN_URL;
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();

  if (!appKey || !appSecret || !supabaseUrl || !supabaseKey) {
    res.status(500).send(html({
      title: 'Thiếu cấu hình TikTok/Supabase',
      status: 'Cần set TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET và Supabase env trên Vercel.',
      tone: 'error',
      details: [
        ['TIKTOK_SHOP_APP_KEY', appKey ? 'OK' : 'Missing'],
        ['TIKTOK_SHOP_APP_SECRET', appSecret ? 'OK' : 'Missing'],
        ['SUPABASE_URL/VITE_SUPABASE_URL', supabaseUrl ? 'OK' : 'Missing'],
        ['SUPABASE key', supabaseKey ? 'OK' : 'Missing']
      ]
    }));
    return;
  }

  try {
    const attempts = buildTokenAttempts({ appKey, appSecret, authCode, merchantId, tokenUrl });
    const attemptResults = [];
    let tokenResponse = null;
    let tokenPayload = null;

    for (const attempt of attempts) {
      const response = await fetch(attempt.url, {
        method: attempt.method || 'POST',
        headers: attempt.headers,
        body: attempt.body
      });
      const payload = await readJsonSafely(response);
      attemptResults.push({
        name: attempt.name,
        url: attempt.url,
        http_status: response.status,
        response: payload
      });
      if (isTokenSuccess(response, payload)) {
        tokenResponse = response;
        tokenPayload = payload;
        break;
      }
    }

    const bundle = getTokenBundle(tokenPayload);

    if (!tokenResponse || !bundle.access_token) {
      const lastAttempt = attemptResults[attemptResults.length - 1] || {};
      res.status(502).send(html({
        title: 'Kh?ng ??i ???c TikTok token',
        status: lastAttempt.response?.message || lastAttempt.response?.error_description || 'TikTok token API failed',
        tone: 'error',
        details: [
          ['token_url', lastAttempt.url || tokenUrl],
          ['http_status', lastAttempt.http_status || '-'],
          ['merchant_id', merchantId || '-'],
          ['auth_code_present', authCode ? 'yes' : 'no'],
          ['grant_type', merchantId ? 'access_token' : 'authorized_code'],
          ['query', JSON.stringify(Object.fromEntries(requestUrl.searchParams.entries()))],
          ['attempts', JSON.stringify(attemptResults)]
        ]
      }));
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const record = {
      connection_type: 'shop',
      open_id: bundle.open_id || null,
      shop_id: requestUrl.searchParams.get('shop_id') || bundle.shop_id || merchantId || null,
      shop_cipher: requestUrl.searchParams.get('shop_cipher') || bundle.shop_cipher || null,
      seller_name: bundle.seller_name || null,
      seller_base_region: bundle.seller_base_region || null,
      user_type: bundle.user_type ?? null,
      access_token: bundle.access_token,
      refresh_token: bundle.refresh_token || null,
      access_token_expires_at: toIsoFromEpochSeconds(bundle.access_token_expire_in),
      refresh_token_expires_at: toIsoFromEpochSeconds(bundle.refresh_token_expire_in),
      raw_response: tokenPayload,
      last_auth_code: authCode,
      state: state || null,
      updated_at: new Date().toISOString()
    };

    const conflictKey = record.open_id ? 'open_id' : record.shop_id ? 'shop_id' : undefined;
    const query = supabase.from('tiktok_shop_connections');
    const { error: saveError } = conflictKey
      ? await query.upsert(record, { onConflict: conflictKey })
      : await query.insert(record);

    if (saveError) throw saveError;

    res.status(200).send(html({
      title: 'TikTok Shop đã kết nối',
      status: 'Đã đổi token và lưu connection vào Supabase.',
      details: [
        ['seller_name', record.seller_name || '-'],
        ['open_id', record.open_id || '-'],
        ['shop_id', record.shop_id || '-'],
        ['shop_cipher', record.shop_cipher || '-'],
        ['access_token_expires_at', record.access_token_expires_at || '-']
      ]
    }));
  } catch (error) {
    res.status(500).send(html({
      title: 'Lỗi callback TikTok Shop',
      status: error?.message || 'Unknown error',
      tone: 'error',
      details: [
        ['code', error?.code || '-'],
        ['details', error?.details || '-'],
        ['hint', error?.hint || '-']
      ]
    }));
  }
}
