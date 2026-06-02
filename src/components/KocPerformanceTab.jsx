// src/components/KocPerformanceTab.jsx
//
// Hiệu suất KOC cho 1 shop (mặc định Bodymiss). 2 chế độ:
//  • Marketplace  — TikTok Creator Marketplace: tìm & đánh giá KOC (follower, GMV toàn sàn,
//                   live/video, nhân khẩu học). Nguồn: action=koc_creators.
//  • Doanh số KOC — doanh số thực KOC mang về cho shop (đơn affiliate đã đồng bộ về Supabase):
//                   GMV/đơn/SL/hoa hồng + số video + bóc tách sản phẩm. Nguồn: koc_orders / koc_products.

import React, { useState, useEffect, useCallback, useMemo } from 'react';

const API = '/api/tiktok-shop/analytics';
const ACCENT = '#ea580c';

// ── Formatters ───────────────────────────────────────────────────────────────
const fmtNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('vi-VN') : '0'; };
const fmtCompact = (v) => {
  const n = Number(v); if (!Number.isFinite(n) || n === 0) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
};
const fmtUsd = (v) => {
  const n = Number(v); if (!Number.isFinite(n) || n === 0) return '$0';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};
const fmtVnd = (v) => {
  const n = Number(v) || 0;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} tỷ`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toLocaleString('vi-VN');
};
const toYmd = (d) => { const dt = d instanceof Date ? d : new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`; };
const daysAgoYmd = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return toYmd(d); };
const fromUnix = (s) => { const n = Number(s) || 0; return n ? new Date(n * 1000).toLocaleDateString('vi-VN') : '—'; };
const sellerKeyOf = (name, fallback) => (name || '').toLowerCase().split(' ')[0] || fallback;

const GENDER = {
  MALE:   { icon: '♂', label: 'Nam', color: '#3b82f6' },
  FEMALE: { icon: '♀', label: 'Nữ',  color: '#ec4899' },
};
const ageLabel = (a) => String(a || '').replace('AGE_RANGE_', '').replace('_PLUS', '+').replace('_', '–');

const selectStyle = { padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', fontWeight: 600, color: '#334155', cursor: 'pointer' };
const inputStyle  = { padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', color: '#334155' };

// ── Letter avatar (KOC icon — orders API không trả avatar) ─────────────────────
const AVA_COLORS = ['#ea580c', '#3b82f6', '#16a34a', '#8b5cf6', '#0891b2', '#d97706', '#ec4899', '#ef4444', '#14b8a6'];
const avaColor = (name) => { let h = 0; const s = name || ''; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return AVA_COLORS[h % AVA_COLORS.length]; };
const LetterAva = ({ name, size = 30 }) => {
  const ch = ((name || '?').replace(/^@/, '').charAt(0) || '?').toUpperCase();
  return <span style={{ width: size, height: size, borderRadius: '50%', background: avaColor(name), color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size * 0.42, flexShrink: 0 }}>{ch}</span>;
};

// ── Search box ─────────────────────────────────────────────────────────────────
const SearchBox = ({ value, onChange, placeholder }) => (
  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
    <span style={{ position: 'absolute', left: 10, fontSize: '0.85rem', color: '#94a3b8' }}>🔍</span>
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || 'Tìm tên KOC…'}
      style={{ ...inputStyle, paddingLeft: 30, width: 190 }} />
    {value && <button onClick={() => onChange('')} style={{ position: 'absolute', right: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', fontSize: '0.9rem' }}>✕</button>}
  </div>
);

// ════════════════════════════════════════════════════════════════════════════
// MARKETPLACE VIEW (tìm & đánh giá KOC)
// ════════════════════════════════════════════════════════════════════════════
const MKT_SORTS = [
  { key: 'followers',   label: 'Follower' },
  { key: 'live_gmv',    label: 'GMV Live' },
  { key: 'video_gmv',   label: 'GMV Video' },
  { key: 'gmv',         label: 'GMV tổng' },
  { key: 'avg_live_uv', label: 'Live UV TB' },
];

const CreatorCard = ({ c, rank }) => {
  const g = GENDER[c.gender] || null;
  const topAge = (c.age_ranges || [])[0];
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 18, border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(15,23,42,0.06)', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', overflow: 'hidden' }}>
      <span style={{ position: 'absolute', top: 12, right: 12, fontSize: '0.68rem', fontWeight: 800, color: rank <= 3 ? '#fff' : '#94a3b8', background: rank <= 3 ? ACCENT : '#f1f5f9', borderRadius: 20, padding: '2px 9px' }}>#{rank}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {c.avatar
          ? <img src={c.avatar} alt={c.nickname} referrerPolicy="no-referrer" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #fed7aa' }} />
          : <LetterAva name={c.nickname || c.username} size={52} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.nickname} {c.region && <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>· {c.region}</span>}
          </div>
          {c.username && <a href={`https://www.tiktok.com/@${c.username}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: ACCENT, textDecoration: 'none', fontWeight: 600 }}>@{c.username}</a>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, background: '#f8fafc', borderRadius: 10, padding: '8px 10px' }}>
          <div style={{ fontSize: '0.66rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>👥 Follower</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a' }}>{fmtCompact(c.followers)}</div>
        </div>
        <div style={{ flex: 1, background: '#f8fafc', borderRadius: 10, padding: '8px 10px' }}>
          <div style={{ fontSize: '0.66rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>📺 Live UV TB</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a' }}>{fmtCompact(c.avg_live_uv)}</div>
        </div>
      </div>
      <div style={{ background: '#fff7ed', borderRadius: 10, padding: '10px 12px', border: '1px solid #fed7aa' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '0.68rem', color: '#9a3412', fontWeight: 700, textTransform: 'uppercase' }}>GMV creator (toàn sàn)</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: ACCENT }}>{fmtUsd(c.gmv)}</span>
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: '0.74rem', color: '#7c2d12' }}>
          <span>🔴 Live <b>{fmtUsd(c.live_gmv)}</b></span>
          <span>🎬 Video <b>{fmtUsd(c.video_gmv)}</b></span>
        </div>
      </div>
      {(g || topAge) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: '0.74rem' }}>
          {g && <span style={{ background: `${g.color}15`, color: g.color, borderRadius: 20, padding: '3px 10px', fontWeight: 700 }}>{g.icon} {g.label} {c.gender_pct ? `${c.gender_pct.toFixed(0)}%` : ''}</span>}
          {topAge && <span style={{ background: '#f1f5f9', color: '#475569', borderRadius: 20, padding: '3px 10px', fontWeight: 700 }}>🎂 {ageLabel(topAge)}</span>}
        </div>
      )}
    </div>
  );
};

function MarketplaceView() {
  const [shops, setShops]         = useState([]);
  const [seller, setSeller]       = useState('body');
  const [creators, setCreators]   = useState([]);
  const [nextToken, setNextToken] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]         = useState(null);
  const [sortKey, setSortKey]     = useState('followers');
  const [shopName, setShopName]   = useState('');
  const [search, setSearch]       = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}?action=koc_creators&list=1`);
        const j = await r.json();
        if (cancelled || !j.ok || !Array.isArray(j.shops)) return;
        setShops(j.shops);
        const body = j.shops.find(s => (s.seller_name || '').toLowerCase().includes('body'));
        if (body) setSeller(sellerKeyOf(body.seller_name, 'body'));
      } catch { /* keep default */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchCreators = useCallback(async (sellerKey, token = null, append = false) => {
    if (append) setLoadingMore(true); else { setLoading(true); setError(null); }
    try {
      const qs = new URLSearchParams({ action: 'koc_creators', seller: sellerKey, page_size: '20' });
      if (token) qs.set('page_token', token);
      const r = await fetch(`${API}?${qs}`);
      const j = await r.json();
      if (!j.ok) { setError(j.error || `Lỗi (code ${j.code || '?'})`); if (!append) setCreators([]); return; }
      setShopName(j.shop || '');
      setNextToken(j.next_page_token || null);
      setCreators(prev => append ? [...prev, ...(j.creators || [])] : (j.creators || []));
    } catch (e) {
      setError(e.message || 'Không tải được dữ liệu'); if (!append) setCreators([]);
    } finally {
      if (append) setLoadingMore(false); else setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCreators(seller); }, [seller, fetchCreators]);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const arr = creators.filter(c => !q || (c.username || '').toLowerCase().includes(q) || (c.nickname || '').toLowerCase().includes(q));
    return arr.sort((a, b) => (Number(b[sortKey]) || 0) - (Number(a[sortKey]) || 0));
  }, [creators, sortKey, search]);
  const summary = useMemo(() => {
    const totFollow = creators.reduce((s, c) => s + (c.followers || 0), 0);
    const totGmv = creators.reduce((s, c) => s + (c.gmv || 0), 0);
    const avgLiveUv = creators.length ? creators.reduce((s, c) => s + (c.avg_live_uv || 0), 0) / creators.length : 0;
    return { totFollow, totGmv, avgLiveUv, n: creators.length };
  }, [creators]);

  return (
    <>
      <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 10px' }}>
        Creator Marketplace TikTok — tìm & đánh giá KOC {shopName && <b style={{ color: ACCENT }}>· {shopName}</b>}
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        {shops.length > 1 && (
          <select value={seller} onChange={e => setSeller(e.target.value)} style={selectStyle}>
            {shops.map(s => <option key={s.open_id || s.shop_id} value={sellerKeyOf(s.seller_name, s.shop_id)}>{s.seller_name}</option>)}
          </select>
        )}
        <SearchBox value={search} onChange={setSearch} placeholder="Tìm tên KOC (trong KQ)…" />
        <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={selectStyle}>
          {MKT_SORTS.map(s => <option key={s.key} value={s.key}>Sắp xếp: {s.label}</option>)}
        </select>
        <button onClick={() => fetchCreators(seller)} disabled={loading} style={{ ...selectStyle, background: ACCENT, color: '#fff', border: 'none', opacity: loading ? 0.6 : 1 }}>{loading ? '⏳' : '🔄'} Tải lại</button>
      </div>

      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 14px', fontSize: '0.76rem', color: '#92400e', margin: '0 0 16px' }}>
        ⚠️ GMV ở đây là GMV <b>tổng của creator trên toàn TikTok Shop</b> (không phải doanh số riêng cho shop). Để xem doanh số thật KOC mang về cho shop → chuyển qua tab <b>💰 Doanh số KOC</b>.
      </div>

      {!loading && creators.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          {[
            { label: 'KOC hiển thị', value: fmtNum(summary.n), icon: '🧑‍🤝‍🧑' },
            { label: 'Tổng follower', value: fmtCompact(summary.totFollow), icon: '👥' },
            { label: 'Tổng GMV (toàn sàn)', value: fmtUsd(summary.totGmv), icon: '💰' },
            { label: 'Live UV TB', value: fmtCompact(summary.avgLiveUv), icon: '📺' },
          ].map(s => (
            <div key={s.label} style={{ flex: '1 1 180px', background: '#fff', borderRadius: 14, padding: '14px 18px', border: '1px solid #f1f5f9', borderLeft: `4px solid ${ACCENT}`, boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{s.icon} {s.label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', marginTop: 4 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>⏳ Đang tải KOC…</div>}
      {!loading && error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 20, color: '#b91c1c', fontSize: '0.86rem' }}>
          ❌ {error}<button onClick={() => fetchCreators(seller)} style={{ marginLeft: 12, padding: '4px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>Thử lại</button>
        </div>
      )}
      {!loading && !error && sorted.length === 0 && <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>{search ? `Không tìm thấy KOC "${search}".` : 'Không có dữ liệu creator.'}</div>}

      {!loading && !error && sorted.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16 }}>
            {sorted.map((c, i) => <CreatorCard key={c.open_id || i} c={c} rank={i + 1} />)}
          </div>
          {nextToken && !search && (
            <div style={{ textAlign: 'center', marginTop: 22 }}>
              <button onClick={() => fetchCreators(seller, nextToken, true)} disabled={loadingMore} style={{ padding: '10px 28px', borderRadius: 12, border: `1px solid ${ACCENT}`, background: loadingMore ? '#fff7ed' : '#fff', color: ACCENT, fontWeight: 800, fontSize: '0.86rem', cursor: 'pointer' }}>{loadingMore ? '⏳ Đang tải…' : '⬇️ Tải thêm KOC'}</button>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SALES VIEW (doanh số thật KOC mang về cho shop)
// ════════════════════════════════════════════════════════════════════════════
const SALES_SORTS = [
  { key: 'gmv',        label: 'GMV' },
  { key: 'orders',     label: 'Số đơn' },
  { key: 'videos',     label: 'Số video' },
  { key: 'qty',        label: 'Số lượng' },
  { key: 'commission', label: 'Hoa hồng' },
];

// Drill-down: products one KOC drove
const ProductBreakdown = ({ state }) => {
  if (!state || state.loading) return <div style={{ padding: 14, color: '#94a3b8', fontSize: '0.82rem' }}>⏳ Đang tải sản phẩm…</div>;
  if (state.error) return <div style={{ padding: 14, color: '#b91c1c', fontSize: '0.82rem' }}>❌ {state.error}</div>;
  const ps = state.products || [];
  if (!ps.length) return <div style={{ padding: 14, color: '#94a3b8', fontSize: '0.82rem' }}>Không có sản phẩm trong khoảng này.</div>;
  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, background: '#fafafa' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>📦 Sản phẩm KOC này làm video / kéo đơn ({ps.length})</div>
      {ps.map((p, i) => (
        <div key={p.product_id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem', background: '#fff', borderRadius: 8, padding: '7px 11px', border: '1px solid #f1f5f9' }}>
          <span style={{ width: 20, fontWeight: 800, color: '#94a3b8', flexShrink: 0 }}>{i + 1}</span>
          {p.image
            ? <img src={p.image} alt="" referrerPolicy="no-referrer" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
            : <span style={{ width: 36, height: 36, borderRadius: 6, background: '#f1f5f9', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>📦</span>}
          <a href={`https://shop.tiktok.com/view/product/${p.product_id}`} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: '#0f172a', textDecoration: 'none' }}>
            {p.name || `SP ${p.product_id}`}
          </a>
          <span style={{ color: '#7c3aed', fontWeight: 700, whiteSpace: 'nowrap' }}>🎬 {fmtNum(p.videos)} video</span>
          <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{fmtNum(p.orders)} đơn</span>
          <span style={{ color: ACCENT, fontWeight: 800, minWidth: 90, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtVnd(p.gmv)} đ</span>
        </div>
      ))}
    </div>
  );
};

function SalesView() {
  const [shops, setShops]   = useState([]);
  const [seller, setSeller] = useState('body');
  const [start, setStart]   = useState('2026-04-01');
  const [end, setEnd]       = useState(toYmd(new Date()));
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const [sortKey, setSortKey] = useState('gmv');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);   // username currently expanded
  const [prodCache, setProdCache] = useState({});    // { username: {loading, error, products} }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}?action=koc_orders&list=1`);
        const j = await r.json();
        if (cancelled || !j.ok || !Array.isArray(j.shops)) return;
        setShops(j.shops);
        const body = j.shops.find(s => (s.seller_name || '').toLowerCase().includes('body'));
        if (body) setSeller(sellerKeyOf(body.seller_name, 'body'));
      } catch { /* keep default */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchSales = useCallback(async () => {
    setLoading(true); setError(null); setExpanded(null); setProdCache({});
    try {
      const qs = new URLSearchParams({ action: 'koc_orders', seller, start_date: start, end_date: end });
      const r = await fetch(`${API}?${qs}`);
      const j = await r.json();
      if (!j.ok) { setError(j.error || 'Lỗi tải dữ liệu'); setData(null); return; }
      setData(j);
    } catch (e) { setError(e.message); setData(null); } finally { setLoading(false); }
  }, [seller, start, end]);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  const toggleExpand = (username) => {
    if (expanded === username) { setExpanded(null); return; }
    setExpanded(username);
    if (!prodCache[username]) {
      setProdCache(p => ({ ...p, [username]: { loading: true } }));
      const qs = new URLSearchParams({ action: 'koc_products', seller, creator: username, start_date: start, end_date: end });
      fetch(`${API}?${qs}`).then(r => r.json()).then(j => {
        setProdCache(p => ({ ...p, [username]: j.ok ? { products: j.products || [] } : { error: j.error || 'Lỗi' } }));
      }).catch(e => setProdCache(p => ({ ...p, [username]: { error: e.message } })));
    }
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cs = (data?.creators || []).filter(c => !q || (c.username || '').toLowerCase().includes(q));
    return [...cs].sort((a, b) => (Number(b[sortKey]) || 0) - (Number(a[sortKey]) || 0));
  }, [data, sortKey, search]);
  const totals = data?.totals || { gmv: 0, orders: 0, commission: 0, qty: 0 };
  const sync = data?.sync;

  // Quick date presets
  const presets = [
    { key: 'yesterday', label: 'Hôm qua', s: daysAgoYmd(1), e: daysAgoYmd(1) },
    { key: '7d',  label: '7 ngày',  s: daysAgoYmd(6),  e: toYmd(new Date()) },
    { key: '30d', label: '30 ngày', s: daysAgoYmd(29), e: toYmd(new Date()) },
  ];
  const activePreset = presets.find(p => p.s === start && p.e === end)?.key;
  const presetBtn = (active) => ({ padding: '7px 14px', borderRadius: 9, border: `1px solid ${active ? ACCENT : '#e5e7eb'}`, background: active ? ACCENT : '#fff', color: active ? '#fff' : '#475569', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' });

  const th = { padding: '10px 12px', fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'right', whiteSpace: 'nowrap' };
  const td = { padding: '9px 12px', fontSize: '0.86rem', color: '#0f172a', textAlign: 'right', whiteSpace: 'nowrap', borderTop: '1px solid #f1f5f9' };

  return (
    <>
      <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 10px' }}>
        Doanh số thật KOC mang về cho shop (đơn affiliate) {data?.shop && <b style={{ color: ACCENT }}>· {data.shop}</b>}
      </p>

      {/* Filter bar — nằm ngang */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        {shops.length > 1 && (
          <select value={seller} onChange={e => setSeller(e.target.value)} style={selectStyle}>
            {shops.map(s => <option key={s.open_id || s.shop_id || s.seller_name} value={sellerKeyOf(s.seller_name, s.shop_id)}>{s.seller_name}</option>)}
          </select>
        )}
        {presets.map(p => <button key={p.key} style={presetBtn(activePreset === p.key)} onClick={() => { setStart(p.s); setEnd(p.e); }}>{p.label}</button>)}
        <input type="date" value={start} min="2026-04-01" onChange={e => setStart(e.target.value)} style={inputStyle} />
        <span style={{ color: '#94a3b8' }}>→</span>
        <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={inputStyle} />
        <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={selectStyle}>
          {SALES_SORTS.map(s => <option key={s.key} value={s.key}>Sắp xếp: {s.label}</option>)}
        </select>
        <SearchBox value={search} onChange={setSearch} placeholder="Tìm tên KOC…" />
        <button onClick={fetchSales} disabled={loading} style={{ ...selectStyle, background: ACCENT, color: '#fff', border: 'none', opacity: loading ? 0.6 : 1 }}>{loading ? '⏳' : '🔄'} Tải lại</button>
      </div>

      {sync && (
        <div style={{ fontSize: '0.74rem', color: '#64748b', margin: '0 0 14px' }}>
          🔄 Đồng bộ tới <b>{sync.newest_date || '—'}</b> · {fmtNum(sync.total_synced)} dòng đơn ·{' '}
          {sync.backfill_done ? <span style={{ color: '#16a34a', fontWeight: 700 }}>đã đủ từ 01/04/2026</span> : <span style={{ color: ACCENT, fontWeight: 700 }}>đang backfill về 01/04/2026…</span>}
          {sync.last_run_at && ` · lần cuối ${new Date(sync.last_run_at).toLocaleString('vi-VN')}`}
        </div>
      )}

      {!loading && data && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          {[
            { label: 'KOC có đơn', value: fmtNum(data.count), icon: '🧑‍🤝‍🧑' },
            { label: 'Tổng GMV', value: `${fmtVnd(totals.gmv)} đ`, icon: '💰' },
            { label: 'Tổng đơn', value: fmtNum(totals.orders), icon: '🛒' },
            { label: 'Tổng hoa hồng', value: `${fmtVnd(totals.commission)} đ`, icon: '💸' },
          ].map(s => (
            <div key={s.label} style={{ flex: '1 1 180px', background: '#fff', borderRadius: 14, padding: '14px 18px', border: '1px solid #f1f5f9', borderLeft: `4px solid ${ACCENT}`, boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{s.icon} {s.label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', marginTop: 4 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>⏳ Đang tải doanh số…</div>}
      {!loading && error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 20, color: '#b91c1c', fontSize: '0.86rem' }}>
          ❌ {error}<button onClick={fetchSales} style={{ marginLeft: 12, padding: '4px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>Thử lại</button>
        </div>
      )}
      {!loading && !error && data && rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: 50, color: '#94a3b8', fontSize: '0.88rem' }}>
          {search ? `Không tìm thấy KOC "${search}".` : <>Chưa có đơn affiliate trong khoảng này.<br /><span style={{ fontSize: '0.8rem' }}>Nếu shop vừa kết nối, dữ liệu đang được đồng bộ — quay lại sau vài phút.</span></>}
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ ...th, textAlign: 'center', width: 44 }}>#</th>
                  <th style={{ ...th, textAlign: 'left' }}>KOC</th>
                  <th style={th}>GMV</th>
                  <th style={th}>Đơn</th>
                  <th style={th}>🎬 Video</th>
                  <th style={th}>SL</th>
                  <th style={th}>Hoa hồng</th>
                  <th style={th}>Gần nhất</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => {
                  const open = expanded === c.username;
                  return (
                    <React.Fragment key={c.username || i}>
                      <tr onClick={() => toggleExpand(c.username)} style={{ background: open ? '#fff7ed' : (i % 2 ? '#fcfcfd' : '#fff'), cursor: 'pointer' }}>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: i < 3 ? ACCENT : '#94a3b8' }}>{i + 1}</td>
                        <td style={{ ...td, textAlign: 'left' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <span style={{ color: '#cbd5e1', fontSize: '0.7rem', width: 10 }}>{open ? '▼' : '▶'}</span>
                            <LetterAva name={c.username} size={30} />
                            <a href={`https://www.tiktok.com/@${c.username}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: ACCENT, textDecoration: 'none', fontWeight: 700 }}>@{c.username}</a>
                          </div>
                        </td>
                        <td style={{ ...td, fontWeight: 800 }}>{fmtVnd(c.gmv)} đ</td>
                        <td style={td}>{fmtNum(c.orders)}</td>
                        <td style={{ ...td, color: '#7c3aed', fontWeight: 700 }}>{fmtNum(c.videos)}</td>
                        <td style={td}>{fmtNum(c.qty)}</td>
                        <td style={td}>{fmtVnd(c.commission)} đ</td>
                        <td style={{ ...td, color: '#94a3b8', fontSize: '0.78rem' }}>{fromUnix(c.last_order)}</td>
                      </tr>
                      {open && (
                        <tr><td colSpan={8} style={{ padding: 0, borderTop: `2px solid ${ACCENT}` }}><ProductBreakdown state={prodCache[c.username]} /></td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '8px 14px', fontSize: '0.72rem', color: '#94a3b8', borderTop: '1px solid #f1f5f9' }}>💡 Bấm vào 1 KOC để xem sản phẩm họ làm video / kéo đơn.</div>
        </div>
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PARENT — header + mode toggle
// ════════════════════════════════════════════════════════════════════════════
export default function KocPerformanceTab() {
  const [mode, setMode] = useState('marketplace'); // 'marketplace' | 'sales'

  const tabBtn = (active) => ({
    padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
    fontSize: '0.85rem', fontWeight: 800,
    background: active ? ACCENT : 'transparent', color: active ? '#fff' : '#64748b',
    transition: 'background 0.15s, color 0.15s',
  });

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', margin: '0 0 14px' }}>🌟 Hiệu suất KOC</h1>

      <div style={{ display: 'inline-flex', gap: 4, background: '#f1f5f9', borderRadius: 12, padding: 4, marginBottom: 16 }}>
        <button style={tabBtn(mode === 'marketplace')} onClick={() => setMode('marketplace')}>🔍 Marketplace</button>
        <button style={tabBtn(mode === 'sales')} onClick={() => setMode('sales')}>💰 Doanh số KOC</button>
      </div>

      {mode === 'marketplace' ? <MarketplaceView /> : <SalesView />}
    </div>
  );
}
