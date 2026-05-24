/**
 * api/tiktok-shop/sync-reviews.js
 *
 * Vercel serverless — GET/POST /api/tiktok-shop/sync-reviews
 *
 * Sync TikTok Shop Customer Reviews → Supabase tiktok_shop_reviews
 *
 * Query params:
 *   shop_id     — (optional) sync specific shop only
 *   page_size   — items per page (default 20, max 100)
 *   full_sync   — "1" to sync all available reviews
 *
 * Uses TikTok Shop Open API — Customer Engagement / Customer Reviews
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const TIKTOK_BASE = 'https://open-api.tiktokglobalshop.com';

// ── TikTok HMAC Sign ─────────────────────────────────────────────────────────
const buildSign = (appSecret, path, urlParams) => {
  const keys = Object.keys(urlParams)
    .filter(k => k !== 'sign' && k !== 'access_token')
    .sort();
  const paramStr = keys.map(k => `${k}${urlParams[k]}`).join('');
  const base = `${appSecret}${path}${paramStr}${appSecret}`;
  return crypto.createHmac('sha256', appSecret).update(base).digest('hex');
};

// ── Fetch with timeout ─────────────────────────────────────────────────────────
const fetchWithTimeout = async (url, options = {}, timeoutMs = 20000) => {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    clearTimeout(tid);
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { return { code: -1, message: `Parse error: ${text.slice(0, 500)}` }; }
  } catch (e) {
    clearTimeout(tid);
    return { code: -1, message: `Fetch error: ${e.message}` };
  }
};

// ── Try fetching reviews from a TikTok API endpoint ───────────────────────────
const tryFetchReviews = async ({ appKey, appSecret, accessToken, shopCipher, path, pageSize, pageToken, version }) => {
  const ts = String(Math.floor(Date.now() / 1000));

  const urlParams = {
    app_key: appKey,
    timestamp: ts,
    page_size: String(pageSize || 20),
  };
  if (shopCipher) urlParams.shop_cipher = shopCipher;
  if (pageToken) urlParams.page_token = pageToken;

  urlParams.sign = buildSign(appSecret, path, urlParams);

  const qs = new URLSearchParams(urlParams);
  const url = `${TIKTOK_BASE}${path}?${qs.toString()}`;

  console.log(`[sync-reviews] Trying: GET ${path}`);

  const resp = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      'x-tts-access-token': accessToken,
      'content-type': 'application/json',
    },
  });

  return resp;
};

// ── Try POST-based endpoint ───────────────────────────────────────────────────
const tryPostReviews = async ({ appKey, appSecret, accessToken, shopCipher, path, pageSize, pageToken, body }) => {
  const ts = String(Math.floor(Date.now() / 1000));

  const urlParams = {
    app_key: appKey,
    timestamp: ts,
  };
  if (shopCipher) urlParams.shop_cipher = shopCipher;

  urlParams.sign = buildSign(appSecret, path, urlParams);

  const qs = new URLSearchParams(urlParams);
  const url = `${TIKTOK_BASE}${path}?${qs.toString()}`;

  console.log(`[sync-reviews] Trying: POST ${path}`);

  const requestBody = {
    page_size: pageSize || 20,
    ...body,
  };
  if (pageToken) requestBody.page_token = pageToken;

  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'x-tts-access-token': accessToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  return resp;
};

// ── Convert TikTok rating string/number to 1-5 ─────────────────────────────
const parseRating = (val) => {
  if (typeof val === 'number') return Math.min(5, Math.max(1, val));
  const map = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  if (typeof val === 'string') {
    if (map[val.toUpperCase()]) return map[val.toUpperCase()];
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1 && n <= 5) return n;
  }
  return null;
};

// ── Parse review items from different response formats ────────────────────────
const parseReviews = (data, shopId, sellerName) => {
  // Try different response structures
  const items = data?.reviews || data?.review_list || data?.review_data || data?.items || [];

  return items.map(r => {
    // Flexible field mapping — TikTok API may use different field names
    const reviewId = r.review_id || r.id || r.comment_id || null;
    const rating = parseRating(r.review_rating || r.rating || r.star || r.score);
    const reviewText = r.review_text || r.content || r.comment || r.text || '';
    const productName = r.product_name || r.product_title || '';
    const productId = r.product_id || '';
    const orderId = r.order_id || r.order_sn || '';
    const skuName = r.sku_name || r.sku_specification || r.variation || '';
    const reviewerName = r.reviewer_name || r.display_name || r.user_name || r.buyer_name || '';
    const reviewerAvatar = r.reviewer_avatar_url || r.avatar || '';
    const images = r.review_images || r.images || r.media || [];
    const sellerReply = r.seller_reply?.content || r.reply?.content || r.reply_content || r.seller_reply || null;
    const replyAt = r.seller_reply?.create_time || r.reply?.create_time || r.reply_time || null;

    // create_time could be in seconds or milliseconds
    let reviewAt = r.create_time || r.review_time || r.created_at || null;
    if (reviewAt && typeof reviewAt === 'number') {
      // If > 1e12, it's milliseconds
      reviewAt = reviewAt > 1e12
        ? new Date(reviewAt).toISOString()
        : new Date(reviewAt * 1000).toISOString();
    }

    let parsedReplyAt = null;
    if (replyAt && typeof replyAt === 'number') {
      parsedReplyAt = replyAt > 1e12
        ? new Date(replyAt).toISOString()
        : new Date(replyAt * 1000).toISOString();
    }

    return {
      shop_id: shopId,
      seller_name: sellerName,
      review_id: reviewId ? String(reviewId) : `${shopId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      order_id: orderId ? String(orderId) : null,
      product_id: productId ? String(productId) : null,
      product_name: productName,
      sku_name: skuName || null,
      rating,
      review_text: reviewText,
      reviewer_name: reviewerName,
      reviewer_avatar: reviewerAvatar || null,
      review_images: Array.isArray(images) ? images : [],
      seller_reply: typeof sellerReply === 'string' ? sellerReply : null,
      reply_at: parsedReplyAt,
      review_at: reviewAt || new Date().toISOString(),
      is_replied: !!(sellerReply || replyAt),
      platform: 'TikTok',
      raw_data: r,
      synced_at: new Date().toISOString(),
    };
  });
};

// ── Research API (separate from Partner API) ─────────────────────────────────
const RESEARCH_BASE = 'https://open.tiktokapis.com';

const getClientAccessToken = async (clientKey, clientSecret) => {
  try {
    const resp = await fetchWithTimeout(`${RESEARCH_BASE}/v2/oauth/token/`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }).toString(),
    }, 15000);

    if (resp?.data?.access_token) {
      console.log('[sync-reviews] Got Research API client_access_token');
      return resp.data.access_token;
    }
    console.log('[sync-reviews] Research API token failed:', resp?.message || JSON.stringify(resp).slice(0, 200));
    return null;
  } catch (e) {
    console.log('[sync-reviews] Research API token error:', e.message);
    return null;
  }
};

// Fetch reviews via Research API — requires product_id
const fetchResearchReviews = async (clientToken, productId, pageStart = 1, pageSize = 10) => {
  const resp = await fetchWithTimeout(`${RESEARCH_BASE}/v2/research/tts/review/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${clientToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      product_id: String(productId),
      fields: 'product_name,review_text,review_like_count,create_time,review_rating',
      page_start: pageStart,
      page_size: Math.min(10, pageSize), // Research API max is 10
    }),
  }, 15000);
  return resp;
};

// Fetch product list via Research API
const fetchResearchProducts = async (clientToken, shopName) => {
  try {
    const resp = await fetchWithTimeout(`${RESEARCH_BASE}/v2/research/tts/product/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${clientToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        fields: 'id,product_name,product_review_count,product_rating',
        page_start: 1,
        page_size: 10,
      }),
    }, 15000);
    return resp;
  } catch (e) {
    return { code: -1, message: e.message };
  }
};

// Get products from Partner API
const fetchPartnerProducts = async ({ appKey, appSecret, accessToken, shopCipher }) => {
  const path = '/product/202309/products/search';
  const ts = String(Math.floor(Date.now() / 1000));
  const urlParams = {
    app_key: appKey,
    timestamp: ts,
    page_size: '50',
  };
  if (shopCipher) urlParams.shop_cipher = shopCipher;
  urlParams.sign = buildSign(appSecret, path, urlParams);
  const qs = new URLSearchParams(urlParams);
  const url = `${TIKTOK_BASE}${path}?${qs.toString()}`;

  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'x-tts-access-token': accessToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ page_size: 50 }),
  }, 20000);
  return resp;
};

// Parse Research API review format → our standard format
const parseResearchReviews = (items, shopId, sellerName, productId, productName) => {
  return (items || []).map(r => {
    const rating = parseRating(r.review_rating);
    let reviewAt = r.create_time;
    if (reviewAt && typeof reviewAt === 'number') {
      reviewAt = reviewAt > 1e12
        ? new Date(reviewAt).toISOString()
        : new Date(reviewAt * 1000).toISOString();
    }

    return {
      shop_id: shopId,
      seller_name: sellerName,
      review_id: `research_${productId}_${r.create_time || Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      order_id: null,
      product_id: String(productId),
      product_name: r.product_name || productName || '',
      sku_name: null,
      rating,
      review_text: r.review_text || '',
      reviewer_name: '',
      reviewer_avatar: null,
      review_images: [],
      seller_reply: null,
      reply_at: null,
      review_at: reviewAt || new Date().toISOString(),
      is_replied: false,
      platform: 'TikTok',
      raw_data: r,
      synced_at: new Date().toISOString(),
    };
  });
};

// ── Endpoint paths to try (ordered by likelihood) ─────────────────────────────
const REVIEW_ENDPOINTS = [
  // Customer Engagement module (most likely for product reviews — separate from Customer Service which is chat)
  { method: 'GET',  path: '/customer_engagement/202309/reviews',         version: '202309' },
  { method: 'POST', path: '/customer_engagement/202309/reviews/search',  version: '202309' },
  { method: 'GET',  path: '/customer_engagement/202409/reviews',         version: '202409' },
  { method: 'POST', path: '/customer_engagement/202409/reviews/search',  version: '202409' },
  { method: 'GET',  path: '/customer_engagement/202509/reviews',         version: '202509' },
  { method: 'POST', path: '/customer_engagement/202509/reviews/search',  version: '202509' },
  // Product module — reviews may be under product
  { method: 'GET',  path: '/product/202309/reviews',                     version: '202309' },
  { method: 'GET',  path: '/product/202409/reviews',                     version: '202409' },
  { method: 'GET',  path: '/product/202509/reviews',                     version: '202509' },
  { method: 'POST', path: '/product/202309/reviews/search',              version: '202309' },
  // Seller module
  { method: 'GET',  path: '/seller/202309/reviews',                      version: '202309' },
  { method: 'GET',  path: '/seller/202409/reviews',                      version: '202409' },
  // Customer Service module (chat-based, but try anyway)
  { method: 'GET',  path: '/customer_service/202309/reviews',            version: '202309' },
  { method: 'POST', path: '/customer_service/202309/reviews/search',     version: '202309' },
  // Review standalone module
  { method: 'GET',  path: '/review/202309/reviews',                      version: '202309' },
  { method: 'POST', path: '/review/202309/reviews/search',               version: '202309' },
  // Order module — reviews might be linked to orders
  { method: 'GET',  path: '/order/202309/reviews',                       version: '202309' },
];

// ── Main handler ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const started = Date.now();
  console.log('[sync-reviews] Starting...');

  const appKey    = (process.env.TIKTOK_ANALYTICS_APP_KEY    || process.env.TIKTOK_SHOP_APP_KEY)?.trim();
  const appSecret = (process.env.TIKTOK_ANALYTICS_APP_SECRET || process.env.TIKTOK_SHOP_APP_SECRET)?.trim();
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();

  if (!appKey || !appSecret || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing env config', details: { appKey: !!appKey, appSecret: !!appSecret, supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey } });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // ── Parse params ────────────────────────────────────────────────────────────
  const params = { ...req.query, ...(req.body || {}) };
  const targetShopId = params.shop_id || null;
  const pageSize = Math.min(100, Math.max(1, parseInt(params.page_size) || 20));
  const fullSync = params.full_sync === '1';

  // ── Get connections ─────────────────────────────────────────────────────────
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

  if (targetShopId) {
    connections = connections.filter(c => c.shop_id === targetShopId);
  }

  if (!connections.length) {
    return res.status(200).json({ success: true, message: 'No connections found', synced: 0 });
  }

  // ── Discover working endpoint (try once with first connection) ──────────────
  let workingEndpoint = null;
  const firstConn = connections[0];

  for (const ep of REVIEW_ENDPOINTS) {
    try {
      let resp;
      if (ep.method === 'GET') {
        resp = await tryFetchReviews({
          appKey, appSecret,
          accessToken: firstConn.access_token,
          shopCipher: firstConn.shop_cipher,
          path: ep.path,
          pageSize: 1,
          version: ep.version,
        });
      } else {
        resp = await tryPostReviews({
          appKey, appSecret,
          accessToken: firstConn.access_token,
          shopCipher: firstConn.shop_cipher,
          path: ep.path,
          pageSize: 1,
          version: ep.version,
          body: {},
        });
      }

      console.log(`[sync-reviews] ${ep.method} ${ep.path} → code: ${resp?.code}, msg: ${resp?.message?.slice(0, 100)}`);

      // code 0 = success, or we got actual data
      if (resp?.code === 0 || resp?.data) {
        workingEndpoint = ep;
        console.log(`[sync-reviews] ✅ Found working endpoint: ${ep.method} ${ep.path}`);
        break;
      }
    } catch (e) {
      console.log(`[sync-reviews] ${ep.method} ${ep.path} → exception: ${e.message}`);
    }
  }

  // ── If Partner API found a working endpoint, use it ─────────────────────────
  if (workingEndpoint) {
    const results = [];
    let totalUpserted = 0;

    for (const conn of connections) {
      const shopLabel = conn.seller_name || conn.shop_id;
      console.log(`[sync-reviews] Processing shop: ${shopLabel}`);

      let shopUpserted = 0;
      let shopError = null;
      let pageToken = null;
      let pageNum = 0;
      const maxPages = fullSync ? 50 : 5;

      do {
        pageNum++;
        try {
          let resp;
          if (workingEndpoint.method === 'GET') {
            resp = await tryFetchReviews({
              appKey, appSecret,
              accessToken: conn.access_token,
              shopCipher: conn.shop_cipher,
              path: workingEndpoint.path,
              pageSize,
              pageToken,
              version: workingEndpoint.version,
            });
          } else {
            resp = await tryPostReviews({
              appKey, appSecret,
              accessToken: conn.access_token,
              shopCipher: conn.shop_cipher,
              path: workingEndpoint.path,
              pageSize,
              pageToken,
              version: workingEndpoint.version,
              body: {},
            });
          }

          if (resp?.code !== 0) {
            shopError = resp?.message || `code ${resp?.code}`;
            console.error(`[sync-reviews] API error for ${shopLabel}: ${shopError}`);
            break;
          }

          const data = resp?.data;
          if (!data) break;

          const reviews = parseReviews(data, conn.shop_id, conn.seller_name);

          if (reviews.length > 0) {
            const { error: upsertErr } = await supabase
              .from('tiktok_shop_reviews')
              .upsert(reviews, { onConflict: 'shop_id,review_id' });

            if (upsertErr) {
              console.error(`[sync-reviews] Upsert error:`, upsertErr.message);
              shopError = upsertErr.message;
            } else {
              shopUpserted += reviews.length;
            }
          }

          console.log(`[sync-reviews] ${shopLabel} page ${pageNum}: ${reviews.length} reviews`);

          pageToken = data.next_page_token || data.page_token || data.cursor || null;
          const hasMore = data.has_more !== false && data.more !== false && pageToken;
          if (!hasMore || reviews.length === 0) break;

        } catch (err) {
          shopError = err.message;
          console.error(`[sync-reviews] Exception for ${shopLabel}:`, err.message);
          break;
        }
      } while (pageToken && pageNum < maxPages);

      totalUpserted += shopUpserted;
      results.push({
        shop_id: conn.shop_id,
        seller_name: conn.seller_name,
        upserted: shopUpserted,
        pages_fetched: pageNum,
        error: shopError,
      });
    }

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[sync-reviews] Done in ${elapsed}s. Total upserted: ${totalUpserted}`);

    return res.status(200).json({
      success: true,
      source: 'partner_api',
      endpoint_used: `${workingEndpoint.method} ${workingEndpoint.path}`,
      total_upserted: totalUpserted,
      shops: results,
      elapsed_seconds: Number(elapsed),
      synced_at: new Date().toISOString(),
    });
  }

  // ── FALLBACK: Try Research API ──────────────────────────────────────────────
  console.log(`[sync-reviews] ❌ No Partner API endpoint found. Trying Research API fallback...`);

  const clientToken = await getClientAccessToken(appKey, appSecret);

  if (!clientToken) {
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    return res.status(200).json({
      success: false,
      message: 'Không tìm thấy endpoint Partner API cho reviews. Research API cũng không khả dụng (cần đăng ký scope research.data.basic).',
      partner_api_tried: REVIEW_ENDPOINTS.map(ep => `${ep.method} ${ep.path}`),
      elapsed_seconds: Number(elapsed),
      hint: 'Vào Partner Center → API Documentation → tìm mục "Reviews" hoặc "Customer Engagement". Nếu không có, đăng ký Research API tại developers.tiktok.com.',
    });
  }

  // ── Research API: get products then fetch reviews per product ───────────────
  console.log('[sync-reviews] Research API token acquired. Fetching products...');

  const results = [];
  let totalUpserted = 0;

  for (const conn of connections) {
    const shopLabel = conn.seller_name || conn.shop_id;
    console.log(`[sync-reviews] [Research] Processing shop: ${shopLabel}`);

    let shopUpserted = 0;
    let shopError = null;

    // Try to get product IDs from Partner API
    let productIds = [];
    try {
      const prodResp = await fetchPartnerProducts({
        appKey, appSecret,
        accessToken: conn.access_token,
        shopCipher: conn.shop_cipher,
      });

      if (prodResp?.code === 0 && prodResp?.data?.products) {
        productIds = prodResp.data.products.map(p => ({
          id: p.id || p.product_id,
          name: p.title || p.product_name || '',
        })).filter(p => p.id);
        console.log(`[sync-reviews] [Research] Found ${productIds.length} products for ${shopLabel}`);
      } else {
        console.log(`[sync-reviews] [Research] Product list failed: ${prodResp?.message || 'unknown'}`);
      }
    } catch (e) {
      console.log(`[sync-reviews] [Research] Product fetch error: ${e.message}`);
    }

    // Also try getting product IDs from existing analytics/orders in Supabase
    if (productIds.length === 0) {
      try {
        const { data: existingProducts } = await supabase
          .from('tiktok_shop_reviews')
          .select('product_id, product_name')
          .eq('shop_id', conn.shop_id)
          .not('product_id', 'is', null)
          .limit(50);

        if (existingProducts?.length > 0) {
          const seen = new Set();
          productIds = existingProducts
            .filter(p => p.product_id && !seen.has(p.product_id) && seen.add(p.product_id))
            .map(p => ({ id: p.product_id, name: p.product_name || '' }));
          console.log(`[sync-reviews] [Research] Using ${productIds.length} product IDs from Supabase`);
        }
      } catch (e) {
        console.log(`[sync-reviews] [Research] Supabase product lookup error: ${e.message}`);
      }
    }

    if (productIds.length === 0) {
      shopError = 'Không tìm thấy product IDs — cần có danh sách sản phẩm để query Research API';
      console.log(`[sync-reviews] [Research] No product IDs for ${shopLabel}`);
      results.push({ shop_id: conn.shop_id, seller_name: conn.seller_name, upserted: 0, error: shopError });
      continue;
    }

    // Fetch reviews for each product
    const maxProducts = fullSync ? productIds.length : Math.min(10, productIds.length);
    for (let i = 0; i < maxProducts; i++) {
      const prod = productIds[i];
      let pageStart = 1;
      const maxPages = fullSync ? 20 : 3; // 10 reviews per page max
      let pagesFetched = 0;

      do {
        pagesFetched++;
        try {
          const resp = await fetchResearchReviews(clientToken, prod.id, pageStart, 10);

          if (resp?.error || (resp?.code && resp.code !== 0)) {
            console.log(`[sync-reviews] [Research] Product ${prod.id} error: ${resp?.error?.message || resp?.message || 'unknown'}`);
            break;
          }

          const items = resp?.data?.reviews || resp?.data?.items || [];
          if (items.length === 0) break;

          const reviews = parseResearchReviews(items, conn.shop_id, conn.seller_name, prod.id, prod.name);

          if (reviews.length > 0) {
            const { error: upsertErr } = await supabase
              .from('tiktok_shop_reviews')
              .upsert(reviews, { onConflict: 'shop_id,review_id' });

            if (upsertErr) {
              console.error(`[sync-reviews] [Research] Upsert error:`, upsertErr.message);
            } else {
              shopUpserted += reviews.length;
            }
          }

          console.log(`[sync-reviews] [Research] Product ${prod.id} page ${pagesFetched}: ${items.length} reviews`);

          // Research API uses page_start (1-based index), not page_token
          if (items.length < 10) break;
          pageStart += items.length;

        } catch (err) {
          console.log(`[sync-reviews] [Research] Product ${prod.id} exception: ${err.message}`);
          break;
        }
      } while (pagesFetched < maxPages);
    }

    totalUpserted += shopUpserted;
    results.push({
      shop_id: conn.shop_id,
      seller_name: conn.seller_name,
      upserted: shopUpserted,
      products_queried: Math.min(maxProducts, productIds.length),
      error: shopError,
    });
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[sync-reviews] [Research] Done in ${elapsed}s. Total upserted: ${totalUpserted}`);

  return res.status(200).json({
    success: totalUpserted > 0,
    source: 'research_api',
    message: totalUpserted > 0
      ? `Synced ${totalUpserted} reviews via Research API`
      : 'Research API connected but no reviews found. Check product IDs or API permissions.',
    total_upserted: totalUpserted,
    shops: results,
    elapsed_seconds: Number(elapsed),
    synced_at: new Date().toISOString(),
  });
}
