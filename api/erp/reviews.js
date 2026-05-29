let _token = null;
let _tokenExp = 0;

const BASE = () => process.env.ERP_API_URL || 'https://stella-erp.autotool.click';

async function getToken() {
  if (_token && Date.now() < _tokenExp) return _token;
  const res = await fetch(`${BASE()}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: process.env.ERP_USERNAME || 'eherb',
      password: process.env.ERP_PASSWORD || 'Eherb@2026$',
    }),
  });
  const data = await res.json();
  if (!data.token) throw new Error(data.message || 'ERP login failed');
  _token = data.token;
  _tokenExp = new Date(data.expiresAt).getTime() - 60_000;
  return _token;
}

async function fetchAll(token, endpoint, startDate, endDate) {
  const url = (p) =>
    `${BASE()}${endpoint}?startDate=${startDate}&endDate=${endDate}&page=${p}&limit=50`;

  const first = await fetch(url(1), { headers: { Authorization: `Bearer ${token}` } });
  const d = await first.json();
  if (!d.success) return { total: 0, data: [] };

  const all = [...d.data];
  const pages = Math.ceil(d.total / 50);

  if (pages > 1) {
    const tasks = [];
    for (let p = 2; p <= pages; p++) {
      tasks.push(
        fetch(url(p), { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((r) => (r.success ? r.data : []))
          .catch(() => []),
      );
    }
    (await Promise.all(tasks)).forEach((c) => all.push(...c));
  }

  return { total: d.total, data: all };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const u = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const platform = u.searchParams.get('platform') || 'both';
  const startDate = u.searchParams.get('startDate');
  const endDate = u.searchParams.get('endDate');

  if (!startDate || !endDate)
    return res.status(400).json({ error: 'startDate and endDate required' });

  try {
    const token = await getToken();
    const result = {};
    const tasks = [];

    if (platform !== 'tiktok')
      tasks.push(
        fetchAll(token, '/api/review/shopee', startDate, endDate).then(
          (d) => (result.shopee = d),
        ),
      );
    if (platform !== 'shopee')
      tasks.push(
        fetchAll(token, '/api/review/tiktok', startDate, endDate).then(
          (d) => (result.tiktok = d),
        ),
      );

    await Promise.all(tasks);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('ERP reviews error:', err);
    return res.status(500).json({ error: err.message });
  }
}
