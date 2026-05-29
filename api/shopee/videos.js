import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const HOST = 'https://partner.shopeemobile.com';

const APP = { id: 2035173, envKey: 'SHOPEE_VIDEO_PARTNER_KEY' };

/* ── Helpers ─────────────────────────────────────────────────────── */
function makeSign(partnerKey, partnerId, path, ts, accessToken = '', shopId = 0) {
  let base = partnerId.toString() + path + ts.toString();
  if (accessToken) base += accessToken;
  if (shopId) base += shopId.toString();
  return crypto.createHmac('sha256', partnerKey).update(base).digest('hex');
}

function getSupabase() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function refreshIfNeeded(supabase, tokenRow, app) {
  const expiresAt = new Date(tokenRow.token_expires).getTime();
  if (Date.now() < expiresAt - 5 * 60 * 1000) return tokenRow;

  const partnerKey = process.env[app.envKey]?.trim();
  if (!partnerKey) throw new Error(`${app.envKey} not configured`);

  const path = '/api/v2/auth/access_token/get';
  const ts = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, app.id, path, ts);
  const url = `${HOST}${path}?partner_id=${app.id}&timestamp=${ts}&sign=${sign}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: Number(tokenRow.shop_id),
      refresh_token: tokenRow.refresh_token,
      partner_id: app.id,
    }),
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

async function shopeeGet(partnerKey, partnerId, apiPath, accessToken, shopId, extraParams = {}) {
  const ts = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, partnerId, apiPath, ts, accessToken, Number(shopId));
  const params = new URLSearchParams({
    partner_id: partnerId.toString(),
    timestamp: ts.toString(),
    sign, access_token: accessToken, shop_id: shopId.toString(),
    ...extraParams,
  });
  const resp = await fetch(`${HOST}${apiPath}?${params.toString()}`);
  return resp.json();
}

/* ── Handler ─────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  const u = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const action = u.searchParams.get('action') || 'list';
  const shopId = u.searchParams.get('shop_id');       // optional: filter 1 shop
  const pageSize = parseInt(u.searchParams.get('page_size') || '20');

  // ── Test livestream/video API endpoints ──
  if (action === 'test_apis') {
    return testApis(supabase, shopId || '341325550', res);
  }

  try {
    // Load all video tokens (or single shop)
    let query = supabase.from('shopee_tokens').select('*').eq('app_type', 'video');
    if (shopId) query = query.eq('shop_id', shopId);
    const { data: tokens, error: dbErr } = await query;
    if (dbErr) throw new Error(`DB error: ${dbErr.message}`);
    if (!tokens?.length) return res.status(200).json({ success: true, shops: [] });

    const partnerKey = process.env[APP.envKey]?.trim();
    if (!partnerKey) return res.status(500).json({ error: `${APP.envKey} not configured` });

    // Fetch posted videos from all shops in parallel.
    // Endpoint: GET /api/v2/video/get_video_list
    // Required params: page_no, page_size, list_type (1 = draft, 2 = posted)
    const results = await Promise.all(tokens.map(async (tk) => {
      try {
        const refreshed = await refreshIfNeeded(supabase, tk, APP);

        const data = await shopeeGet(partnerKey, APP.id, '/api/v2/video/get_video_list',
          refreshed.access_token, refreshed.shop_id,
          { page_no: 1, page_size: pageSize, list_type: 2 });

        if (data.error) {
          return {
            shop_id: tk.shop_id,
            shop_name: tk.shop_name || tk.shop_id,
            videos: [], total: 0,
            error: `${data.error}: ${data.message || ''}`.trim(),
          };
        }

        const list = data.response?.list || [];
        return {
          shop_id: tk.shop_id,
          shop_name: tk.shop_name || tk.shop_id,
          videos: list,
          total: data.response?.total_count ?? list.length,
        };
      } catch (err) {
        return { shop_id: tk.shop_id, shop_name: tk.shop_name || tk.shop_id, videos: [], total: 0, error: err.message };
      }
    }));

    return res.status(200).json({ success: true, shops: results });
  } catch (err) {
    console.error('Shopee video error:', err);
    return res.status(500).json({ error: err.message });
  }
}

/* ── Test APIs: check livestream + video endpoints ───────────── */
async function testApis(supabase, shopId, res) {
  const APPS = {
    livestream: { id: 2035172, envKey: 'SHOPEE_LIVESTREAM_PARTNER_KEY', label: 'SK Livestream' },
    video:      { id: 2035173, envKey: 'SHOPEE_VIDEO_PARTNER_KEY',     label: 'SK Video' },
  };

  const TESTS = {
    livestream: [
      '/api/v2/livestream/get_session_list',
      '/api/v2/livestream/get_session_detail',
      '/api/v2/livestream/get_session_metric',
      '/api/v2/livestream/get_item_list',
      '/api/v2/livestream/get_item_count',
      '/api/v2/livestream/get_show_item',
      '/api/v2/livestream/get_item_set_list',
      '/api/v2/livestream/get_recent_item_list',
      '/api/v2/livestream/get_like_item_list',
      '/api/v2/livestream/get_latest_comment_list',
    ],
    video: [
      '/api/v2/media_space/init_video_upload',
      '/api/v2/media_space/get_video_upload_result',
      '/api/v2/media_space/get_video_list',
      '/api/v2/media_space/get_media_space_list',
      '/api/v2/video/get_video_list',
    ],
  };

  const results = {};

  for (const [appName, app] of Object.entries(APPS)) {
    const partnerKey = process.env[app.envKey]?.trim();
    if (!partnerKey) { results[appName] = { label: app.label, error: `Missing ${app.envKey}` }; continue; }

    const { data: tk } = await supabase.from('shopee_tokens').select('*')
      .eq('shop_id', shopId).eq('app_type', appName).maybeSingle();
    if (!tk) { results[appName] = { label: app.label, error: `No token for shop ${shopId}` }; continue; }

    let token;
    try { token = await refreshIfNeeded(supabase, tk, app); }
    catch (e) { results[appName] = { label: app.label, error: `Refresh: ${e.message}` }; continue; }

    const endpoints = [];
    for (const path of TESTS[appName]) {
      const ts = Math.floor(Date.now() / 1000);
      const sign = makeSign(partnerKey, app.id, path, ts, token.access_token, Number(shopId));
      const url = `${HOST}${path}?partner_id=${app.id}&timestamp=${ts}&sign=${sign}&access_token=${token.access_token}&shop_id=${shopId}`;
      try {
        const r = await fetch(url);
        const d = await r.json();
        const ok = d.response !== undefined && d.response !== null && !d.error;
        endpoints.push({
          path: path.replace('/api/v2/', ''),
          status: ok ? '✅' : '❌',
          error: d.error ? `${d.error}: ${d.message || ''}` : null,
          sample: d.response ? JSON.stringify(d.response).slice(0, 200) : null,
        });
      } catch (e) {
        endpoints.push({ path: path.replace('/api/v2/', ''), status: '❌', error: e.message });
      }
    }
    results[appName] = { label: app.label, endpoints };
  }

  return res.json({ shop_id: shopId, results });
}
