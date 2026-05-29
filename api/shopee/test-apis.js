import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const HOST = 'https://partner.shopeemobile.com';

const APPS = {
  dashboard:  { id: 2035068, envKey: 'SHOPEE_PARTNER_KEY',            label: 'Stella Kinetics Dashboard (ERP)' },
  ads:        { id: 2035170, envKey: 'SHOPEE_ADS_PARTNER_KEY',        label: 'SK Ads Service' },
  marketing:  { id: 2035171, envKey: 'SHOPEE_MARKETING_PARTNER_KEY',  label: 'SK Marketing' },
  livestream: { id: 2035172, envKey: 'SHOPEE_LIVESTREAM_PARTNER_KEY', label: 'SK Livestream' },
  video:      { id: 2035173, envKey: 'SHOPEE_VIDEO_PARTNER_KEY',     label: 'SK Video' },
};

const TESTS = {
  dashboard: [
    { path: '/api/v2/shop/get_shop_info', label: 'Shop Info' },
    { path: '/api/v2/product/get_item_list', label: 'Products', params: { offset: 0, page_size: 5, item_status: 'NORMAL' } },
    { path: '/api/v2/order/get_order_list', label: 'Orders', params: { time_range_field: 'create_time', time_from: '__7d__', time_to: '__now__', page_size: 5, order_status: 'COMPLETED' } },
    { path: '/api/v2/logistics/get_channel_list', label: 'Logistics Channels' },
    { path: '/api/v2/returns/get_return_list', label: 'Returns' },
    { path: '/api/v2/payment/get_wallet_transactions', label: 'Wallet Transactions', params: { page_no: 1, page_size: 5, wallet_type: 'SIP_WALLET' } },
    { path: '/api/v2/product/get_item_list', label: 'Products (BANNED)', params: { offset: 0, page_size: 5, item_status: 'BANNED' } },
    // Analytics / traffic attempts
    { path: '/api/v2/shop/get_shop_performance', label: '⭐ Shop Performance (traffic?)' },
    { path: '/api/v2/data/get_shop_traffic', label: '⭐ Shop Traffic' },
    { path: '/api/v2/seller/get_shop_category_list', label: 'Shop Categories' },
  ],
  ads: [
    { path: '/api/v2/ads/get_campaign_list', label: 'Campaign List' },
    { path: '/api/v2/ads/get_all_ads_daily_performance', label: 'Ads Daily Performance', params: { start_date: '__7d_ymd__', end_date: '__now_ymd__' } },
    { path: '/api/v2/ads/get_recommended_keyword_list', label: 'Recommended Keywords' },
  ],
  marketing: [
    { path: '/api/v2/discount/get_discount_list', label: 'Discounts', params: { discount_status: 'ongoing', page_no: 1, page_size: 5 } },
    { path: '/api/v2/voucher/get_voucher_list', label: 'Vouchers', params: { voucher_status: 'ongoing', page_no: 1, page_size: 5 } },
    { path: '/api/v2/top_picks/get_top_picks_list', label: 'Top Picks' },
    { path: '/api/v2/bundle_deal/get_bundle_deal_list', label: 'Bundle Deals' },
    { path: '/api/v2/add_on_deal/get_add_on_deal_list', label: 'Add-On Deals' },
    { path: '/api/v2/flash_sale/get_time_slot_id', label: 'Flash Sale Slots', params: { start_time: '__now__', end_time: '__30d__' } },
  ],
  livestream: [
    // Session management
    { path: '/api/v2/livestream/get_session_list', label: '📺 Session List' },
    { path: '/api/v2/livestream/get_session_detail', label: '📺 Session Detail' },
    { path: '/api/v2/livestream/get_session_metric', label: '📊 Session Metrics' },
    // Item management in live
    { path: '/api/v2/livestream/get_item_list', label: '🛒 Items in Live' },
    { path: '/api/v2/livestream/get_item_count', label: '🛒 Item Count' },
    { path: '/api/v2/livestream/get_show_item', label: '⭐ Featured Item' },
    { path: '/api/v2/livestream/get_item_set_list', label: '📦 Item Sets' },
    { path: '/api/v2/livestream/get_recent_item_list', label: '🕐 Recent Items' },
    { path: '/api/v2/livestream/get_like_item_list', label: '❤️ Liked Items' },
    // Comments
    { path: '/api/v2/livestream/get_latest_comment_list', label: '💬 Comments' },
    // Media
    { path: '/api/v2/livestream/upload_image', label: '🖼️ Upload Image (check)' },
    // Fallback general
    { path: '/api/v2/shop/get_shop_info', label: 'Shop Info (via Livestream)' },
  ],
  video: [
    // Media Space / Video
    { path: '/api/v2/media_space/init_video_upload', label: '🎬 Init Video Upload' },
    { path: '/api/v2/media_space/get_video_upload_result', label: '🎬 Video Upload Result' },
    { path: '/api/v2/video/get_video_list', label: '📹 Video List', params: { page_no: 1, page_size: 5 } },
    { path: '/api/v2/media_space/get_video_list', label: '📹 Video List (media_space)' },
    { path: '/api/v2/shop/get_shop_info', label: 'Shop Info (via Video)' },
  ],
};

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

async function refreshIfNeeded(supabase, tokenRow, app, partnerKey) {
  const expiresAt = new Date(tokenRow.token_expires).getTime();
  if (Date.now() < expiresAt - 5 * 60 * 1000) return tokenRow;
  const path = '/api/v2/auth/access_token/get';
  const ts = Math.floor(Date.now() / 1000);
  const sign = makeSign(partnerKey, app.id, path, ts);
  const resp = await fetch(`${HOST}${path}?partner_id=${app.id}&timestamp=${ts}&sign=${sign}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shop_id: Number(tokenRow.shop_id), refresh_token: tokenRow.refresh_token, partner_id: app.id }),
  });
  const result = await resp.json();
  if (!result.access_token) return tokenRow;
  const updated = { access_token: result.access_token, refresh_token: result.refresh_token, token_expires: new Date(Date.now() + (result.expire_in || 14400) * 1000).toISOString(), updated_at: new Date().toISOString() };
  await supabase.from('shopee_tokens').update(updated).eq('id', tokenRow.id);
  return { ...tokenRow, ...updated };
}

function resolveParams(params) {
  if (!params) return {};
  const now = Math.floor(Date.now() / 1000);
  const resolved = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === '__now__') resolved[k] = now;
    else if (v === '__7d__') resolved[k] = now - 7 * 86400;
    else if (v === '__30d__') resolved[k] = now + 30 * 86400;
    else if (v === '__now_ymd__') resolved[k] = new Date().toISOString().slice(0, 10);
    else if (v === '__7d_ymd__') resolved[k] = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    else resolved[k] = v;
  }
  return resolved;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'Missing Supabase config' });

  const url = new URL(req.url, `https://${req.headers.host}`);
  const shopId = url.searchParams.get('shop_id') || '341325550';

  const results = {};

  for (const [appName, app] of Object.entries(APPS)) {
    const partnerKey = process.env[app.envKey]?.trim();
    if (!partnerKey) { results[appName] = { label: app.label, error: `Missing ${app.envKey}` }; continue; }

    const { data: tokenRow } = await supabase.from('shopee_tokens').select('*').eq('shop_id', shopId).eq('app_type', appName).maybeSingle();
    if (!tokenRow) { results[appName] = { label: app.label, error: `No token for shop ${shopId}` }; continue; }

    let token;
    try { token = await refreshIfNeeded(supabase, tokenRow, app, partnerKey); } catch (e) { results[appName] = { label: app.label, error: `Refresh failed: ${e.message}` }; continue; }

    const endpoints = [];
    for (const test of (TESTS[appName] || [])) {
      const params = resolveParams(test.params);
      const ts = Math.floor(Date.now() / 1000);
      const sign = makeSign(partnerKey, app.id, test.path, ts, token.access_token, Number(shopId));
      let apiUrl = `${HOST}${test.path}?partner_id=${app.id}&timestamp=${ts}&sign=${sign}&access_token=${token.access_token}&shop_id=${shopId}`;
      for (const [k, v] of Object.entries(params)) apiUrl += `&${k}=${encodeURIComponent(v)}`;

      try {
        const r = await fetch(apiUrl);
        const data = await r.json();
        const hasResponse = data.response !== undefined && data.response !== null;
        const hasError = !!data.error;
        endpoints.push({
          label: test.label,
          path: test.path,
          status: hasResponse && !hasError ? '✅' : '❌',
          error: hasError ? `${data.error}: ${data.message || ''}` : null,
          sample: hasResponse ? JSON.stringify(data.response).slice(0, 300) : null,
        });
      } catch (e) {
        endpoints.push({ label: test.label, path: test.path, status: '❌', error: e.message });
      }
    }
    results[appName] = { label: app.label, endpoints };
  }

  res.json({ shop_id: shopId, results });
}
