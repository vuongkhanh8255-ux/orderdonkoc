/**
 * Shopee Open Platform v2 — Exchange Code → Access Token
 *
 * Chạy: node scripts/shopee-token.mjs <code> <shop_id>
 *
 * Hoặc paste cả URL redirect:
 *   node scripts/shopee-token.mjs "https://stellakinetics.space/shopee-callback?code=xxx&shop_id=yyy"
 */
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const PARTNER_ID  = 2035068;
const PARTNER_KEY = 'shpk6444466a5871535a5271646a54766f57674e5a786c62554179666f78646d';
const HOST        = 'https://partner.shopeemobile.com';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xkyhvcmnkrxdtmwtghln.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ── Parse arguments ──────────────────────────────────────────────────────
let code, shopId;

const arg = process.argv[2] || '';
if (arg.startsWith('http')) {
  // User pasted full URL
  const url = new URL(arg);
  code   = url.searchParams.get('code');
  shopId = url.searchParams.get('shop_id');
} else {
  code   = process.argv[2];
  shopId = process.argv[3];
}

if (!code || !shopId) {
  console.error('');
  console.error('Usage:');
  console.error('  node scripts/shopee-token.mjs <code> <shop_id>');
  console.error('  node scripts/shopee-token.mjs "https://stellakinetics.space/shopee-callback?code=xxx&shop_id=yyy"');
  console.error('');
  process.exit(1);
}

console.log(`\nCode:    ${code}`);
console.log(`Shop ID: ${shopId}`);

// ── Shopee API sign helper ───────────────────────────────────────────────
function makeSign(path, timestamp, accessToken = '', shopIdNum = 0) {
  let baseStr = PARTNER_ID.toString() + path + timestamp.toString();
  if (accessToken) baseStr += accessToken;
  if (shopIdNum)   baseStr += shopIdNum.toString();
  return crypto.createHmac('sha256', PARTNER_KEY).update(baseStr).digest('hex');
}

// ── Get Access Token ─────────────────────────────────────────────────────
async function getToken() {
  const path      = '/api/v2/auth/token/get';
  const timestamp = Math.floor(Date.now() / 1000);
  const sign      = makeSign(path, timestamp);

  const url = `${HOST}${path}?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${sign}`;
  const body = {
    code,
    shop_id: Number(shopId),
    partner_id: PARTNER_ID,
  };

  console.log('\n▶ Đang lấy access token...');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (data.error) {
    console.error('❌ Lỗi:', data.error, data.message);
    process.exit(1);
  }

  console.log('✅ Lấy token thành công!');
  console.log(`   access_token:  ${data.access_token?.slice(0, 30)}...`);
  console.log(`   refresh_token: ${data.refresh_token?.slice(0, 30)}...`);
  console.log(`   expire_in:     ${data.expire_in}s`);

  // Backup tokens to local file immediately
  const fs = await import('fs');
  const backup = { shop_id: shopId, ...data, saved_at: new Date().toISOString() };
  const backupPath = `scripts/shopee-token-${shopId}.json`;
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`   💾 Backup saved: ${backupPath}`);

  return data;
}

// ── Get Shop Info ────────────────────────────────────────────────────────
async function getShopInfo(accessToken) {
  const path      = '/api/v2/shop/get_shop_info';
  const timestamp = Math.floor(Date.now() / 1000);
  const sign      = makeSign(path, timestamp, accessToken, Number(shopId));

  const url = `${HOST}${path}?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${sign}&access_token=${accessToken}&shop_id=${shopId}`;

  console.log('\n▶ Đang lấy thông tin shop...');
  const res  = await fetch(url);
  const data = await res.json();

  if (data.error) {
    console.error('⚠️  Không lấy được shop info:', data.error, data.message);
    return null;
  }

  const shop = data.response;
  console.log(`   Shop name: ${shop?.shop_name}`);
  console.log(`   Region:    ${shop?.region}`);
  console.log(`   Status:    ${shop?.status}`);
  return shop;
}

// ── Save to Supabase ─────────────────────────────────────────────────────
async function saveToken(tokenData, shopInfo) {
  if (!SUPABASE_KEY) {
    console.log('\n⚠️  SUPABASE_SERVICE_KEY chưa set → không lưu DB');
    console.log('   Chạy lại với: SUPABASE_SERVICE_KEY="..." node scripts/shopee-token.mjs ...');
    return;
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  const record = {
    shop_id:        shopId,
    shop_name:      shopInfo?.shop_name || `Shop ${shopId}`,
    platform:       'shopee',
    partner_id:     PARTNER_ID,
    access_token:   tokenData.access_token,
    refresh_token:  tokenData.refresh_token,
    token_expires:  new Date(Date.now() + tokenData.expire_in * 1000).toISOString(),
    region:         shopInfo?.region || 'VN',
    status:         'active',
    updated_at:     new Date().toISOString(),
  };

  const { error } = await sb
    .from('shopee_tokens')
    .upsert(record, { onConflict: 'shop_id' });

  if (error) {
    console.log('\n⚠️  Chưa có bảng shopee_tokens → in token ra đây:');
    console.log(JSON.stringify(record, null, 2));
  } else {
    console.log(`\n✅ Đã lưu token vào Supabase (shopee_tokens) cho shop ${shopInfo?.shop_name || shopId}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────
const tokenData = await getToken();
const shopInfo  = await getShopInfo(tokenData.access_token);
await saveToken(tokenData, shopInfo);

console.log('\n═══════════════════════════════════════════════════');
console.log('  DONE! Lặp lại cho mỗi shop Shopee cần kết nối');
console.log('═══════════════════════════════════════════════════\n');
