import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const HOST = 'https://partner.shopeemobile.com';

/* ── Multi-app config ───────────────────────────────────────────────────── */
const APPS = {
  dashboard:  { id: 2035068, envKey: 'SHOPEE_PARTNER_KEY',           label: 'Stella Kinetics Dashboard', table: 'shopee_tokens' },
  ads:        { id: 2035170, envKey: 'SHOPEE_ADS_PARTNER_KEY',       label: 'SK Ads Service',            table: 'shopee_tokens' },
  marketing:  { id: 2035171, envKey: 'SHOPEE_MARKETING_PARTNER_KEY', label: 'SK Marketing',              table: 'shopee_tokens' },
  livestream: { id: 2035172, envKey: 'SHOPEE_LIVESTREAM_PARTNER_KEY', label: 'SK Livestream',             table: 'shopee_tokens' },
  video:      { id: 2035173, envKey: 'SHOPEE_VIDEO_PARTNER_KEY',     label: 'SK Video',                  table: 'shopee_tokens' },
};

/* ── HTML renderer ──────────────────────────────────────────────────────── */
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
    .icon{width:44px;height:44px;display:grid;place-items:center;border-radius:12px;background:#fff3e0;border:1px solid #ffcc80;color:#ee4d2d;font-weight:900;font-size:22px;margin-bottom:16px}
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
    <div class="icon">S</div>
    <h1>${title}</h1>
    <p>Shopee vừa redirect về Stella Kinetics. Token đã được xử lý tự động.</p>
    <div class="status">${status}</div>
    <div class="details">
      ${details.map(([k,v])=>`<div class="row"><div class="key">${k}</div><div class="value">${String(v??'')}</div></div>`).join('')}
    </div>
  </main>
</body>
</html>`;
};

/* ── Shopee sign helper ─────────────────────────────────────────────────── */
function makeSign(partnerKey, partnerId, path, ts, accessToken = '', shopId = 0) {
  let base = partnerId.toString() + path + ts.toString();
  if (accessToken) base += accessToken;
  if (shopId)      base += shopId.toString();
  return crypto.createHmac('sha256', partnerKey).update(base).digest('hex');
}

/* ── Exchange code → token ──────────────────────────────────────────────── */
async function exchangeToken(partnerKey, partnerId, code, shopId) {
  const path = '/api/v2/auth/token/get';
  const ts   = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, partnerId, path, ts);
  const url  = `${HOST}${path}?partner_id=${partnerId}&timestamp=${ts}&sign=${sign}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, shop_id: Number(shopId), partner_id: partnerId }),
  });
  return res.json();
}

/* ── Get shop info ──────────────────────────────────────────────────────── */
async function getShopInfo(partnerKey, partnerId, accessToken, shopId) {
  const path = '/api/v2/shop/get_shop_info';
  const ts   = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, partnerId, path, ts, accessToken, Number(shopId));
  const url  = `${HOST}${path}?partner_id=${partnerId}&timestamp=${ts}&sign=${sign}&access_token=${accessToken}&shop_id=${shopId}`;

  try {
    const res  = await fetch(url);
    const data = await res.json();
    return data.response || null;
  } catch { return null; }
}

/* ── Main handler ───────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  const reqUrl  = new URL(req.url, `https://${req.headers.host || 'koc-tool.vercel.app'}`);
  const code    = reqUrl.searchParams.get('code');
  const shopId  = reqUrl.searchParams.get('shop_id');
  const appName = reqUrl.searchParams.get('app') || 'dashboard';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!code || !shopId) {
    return res.status(400).send(html({
      title: 'Shopee Callback', tone: 'error',
      status: 'Thiếu code hoặc shop_id trong URL.',
      details: Array.from(reqUrl.searchParams.entries()),
    }));
  }

  // Resolve app — try specified app first, then try ALL apps
  let matchedApp = null;
  let partnerKey = null;

  if (APPS[appName]) {
    const key = process.env[APPS[appName].envKey]?.trim();
    if (key) {
      matchedApp = { ...APPS[appName], name: appName };
      partnerKey = key;
    }
  }

  // Fallback: try all apps if specified one failed
  if (!matchedApp) {
    for (const [name, app] of Object.entries(APPS)) {
      const key = process.env[app.envKey]?.trim();
      if (key) {
        matchedApp = { ...app, name };
        partnerKey = key;
        break;
      }
    }
  }

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();

  if (!matchedApp || !partnerKey || !supabaseUrl || !supabaseKey) {
    return res.status(500).send(html({
      title: 'Thiếu cấu hình', tone: 'error',
      status: `App "${appName}" chưa có key hoặc thiếu Supabase env.`,
      details: [
        ['app', appName],
        ['partner_key', partnerKey ? '✅' : '❌ Missing'],
        ['SUPABASE_URL', supabaseUrl ? '✅' : '❌ Missing'],
        ['SUPABASE key', supabaseKey ? '✅' : '❌ Missing'],
      ],
    }));
  }

  try {
    // 1. Exchange code → token
    const tokenData = await exchangeToken(partnerKey, matchedApp.id, code, shopId);

    if (tokenData.error || !tokenData.access_token) {
      // If specified app failed, try other apps
      let success = false;
      for (const [name, app] of Object.entries(APPS)) {
        if (name === matchedApp.name) continue;
        const key = process.env[app.envKey]?.trim();
        if (!key) continue;
        const tryData = await exchangeToken(key, app.id, code, shopId);
        if (!tryData.error && tryData.access_token) {
          matchedApp = { ...app, name };
          partnerKey = key;
          Object.assign(tokenData, tryData);
          success = true;
          break;
        }
      }
      if (!success) {
        return res.status(502).send(html({
          title: 'Lỗi đổi token Shopee', tone: 'error',
          status: `${tokenData.error || 'unknown'}: ${tokenData.message || 'Không lấy được access token'}`,
          details: [
            ['app', matchedApp.label],
            ['shop_id', shopId],
            ['error', tokenData.error || '-'],
            ['message', tokenData.message || '-'],
          ],
        }));
      }
    }

    // 2. Get shop info
    const shopInfo = await getShopInfo(partnerKey, matchedApp.id, tokenData.access_token, shopId);

    // 3. Save to Supabase
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const record = {
      shop_id:        shopId,
      shop_name:      shopInfo?.shop_name || `Shop ${shopId}`,
      platform:       'shopee',
      partner_id:     matchedApp.id,
      app_type:       matchedApp.name,
      access_token:   tokenData.access_token,
      refresh_token:  tokenData.refresh_token,
      token_expires:  new Date(Date.now() + (tokenData.expire_in || 14400) * 1000).toISOString(),
      region:         shopInfo?.region || 'VN',
      status:         'active',
      updated_at:     new Date().toISOString(),
    };

    // Use composite key: shop_id + app_type for multi-app per shop
    const { data: existing } = await supabase
      .from(matchedApp.table)
      .select('id')
      .eq('shop_id', shopId)
      .eq('app_type', matchedApp.name)
      .maybeSingle();

    let saveError;
    if (existing) {
      ({ error: saveError } = await supabase
        .from(matchedApp.table)
        .update(record)
        .eq('id', existing.id));
    } else {
      ({ error: saveError } = await supabase
        .from(matchedApp.table)
        .insert(record));
    }

    if (saveError) throw saveError;

    return res.status(200).send(html({
      title: `${matchedApp.label} đã kết nối ✅`,
      status: `Đã lưu token cho ${record.shop_name}. Bạn có thể đóng trang này.`,
      details: [
        ['app',           matchedApp.label],
        ['shop_name',     record.shop_name],
        ['shop_id',       record.shop_id],
        ['region',        record.region],
        ['token_expires', record.token_expires],
        ['status',        'active ✅'],
      ],
    }));

  } catch (err) {
    return res.status(500).send(html({
      title: 'Lỗi callback Shopee', tone: 'error',
      status: err?.message || 'Unknown error',
      details: [['app', matchedApp?.label || appName], ['code', err?.code || '-'], ['details', err?.details || '-']],
    }));
  }
}
