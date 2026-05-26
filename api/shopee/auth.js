import crypto from 'crypto';

const HOST = 'https://partner.shopeemobile.com';

/**
 * Shopee Multi-App OAuth
 *
 * GET /api/shopee/auth           → Stella Kinetics Dashboard (default)
 * GET /api/shopee/auth?app=ads   → SK Ads Service
 * GET /api/shopee/auth?app=marketing → SK Marketing
 * GET /api/shopee/auth?app=livestream → SK Livestream
 * GET /api/shopee/auth?app=video → SK Video
 */

const APPS = {
  dashboard:  { id: 2035068, envKey: 'SHOPEE_PARTNER_KEY',          label: 'Stella Kinetics Dashboard' },
  ads:        { id: 2035170, envKey: 'SHOPEE_ADS_PARTNER_KEY',      label: 'SK Ads Service' },
  marketing:  { id: 2035171, envKey: 'SHOPEE_MARKETING_PARTNER_KEY', label: 'SK Marketing' },
  livestream: { id: 2035172, envKey: 'SHOPEE_LIVESTREAM_PARTNER_KEY', label: 'SK Livestream' },
  video:      { id: 2035173, envKey: 'SHOPEE_VIDEO_PARTNER_KEY',    label: 'SK Video' },
};

export default async function handler(req, res) {
  const reqUrl  = new URL(req.url, `https://${req.headers.host || 'koc-tool.vercel.app'}`);
  const appName = reqUrl.searchParams.get('app') || 'dashboard';
  const app     = APPS[appName];

  if (!app) {
    return res.status(400).json({
      error: `App "${appName}" không hợp lệ`,
      available: Object.keys(APPS),
    });
  }

  const partnerKey = process.env[app.envKey]?.trim();
  if (!partnerKey) {
    return res.status(500).json({ error: `${app.envKey} chưa set trên Vercel` });
  }

  // state = app name để callback biết app nào
  const redirect  = 'https://stellakinetics.space/shopee-callback';
  const path      = '/api/v2/shop/auth_partner';
  const timestamp = Math.floor(Date.now() / 1000);
  const baseStr   = app.id.toString() + path + timestamp.toString();
  const sign      = crypto.createHmac('sha256', partnerKey).update(baseStr).digest('hex');

  const authUrl = `${HOST}${path}?partner_id=${app.id}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(redirect + '?app=' + appName)}`;

  res.redirect(302, authUrl);
}
