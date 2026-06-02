// src/components/KocPerformanceTab.jsx
//
// Hiệu suất KOC cho 1 shop (mặc định Bodymiss). 2 chế độ:
//  • Marketplace  — TikTok Creator Marketplace: tìm & đánh giá KOC (follower, GMV toàn sàn,
//                   live/video, nhân khẩu học). Nguồn: action=koc_creators (gọi trực tiếp).
//  • Doanh số KOC — doanh số thực KOC mang về cho shop (đơn affiliate đã đồng bộ về Supabase).
//                   Nguồn: action=koc_orders (gom từ bảng tiktok_affiliate_orders, sync từ 01/04/2026).

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
const fromUnix = (s) => { const n = Number(s) || 0; return n ? new Date(n * 1000).toLocaleDateString('vi-VN') : '—'; };
const sellerKeyOf = (name, fallback) => (name || '').toLowerCase().split(' ')[0] || fallback;

const GENDER = {
  MALE:   { icon: '♂', label: 'Nam', color: '#3b82f6' },
  FEMALE: { icon: '♀', label: 'Nữ',  color: '#ec4899' },
};
const ageLabel = (a) => String(a || '').replace('AGE_RANGE_', '').replace('_PLUS', '+').replace('_', '–');

const selectStyle = { padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', fontWeight: 600, color: '#334155', cursor: 'pointer' };

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
          : <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.3rem' }}>🧑</div>}
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

  const sorted = useMemo(() => [...creators].sort((a, b) => (Number(b[sortKey]) || 0) - (Number(a[sortKey]) || 0)), [creators, sortKey]);
  const summary = useMemo(() => {
    const totFollow = creators.reduce((s, c) => s + (c.followers || 0), 0);
    const totGmv = creators.reduce((s, c) => s + (c.gmv || 0), 0);
    const avgLiveUv = creators.length ? creators.reduce((s, c) => s + (c.avg_live_uv || 0), 0) / creators.length : 0;
    return { totFollow, totGmv, avgLiveUv, n: creators.length };
  }, [creators]);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>
          Creator Marketplace TikTok — tìm & đánh giá KOC {shopName && <b style={{ color: ACCENT }}>· {shopName}</b>}
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {shops.length > 1 && (
            <select value={seller} onChange={e => setSeller(e.target.value)} style={selectStyle}>
              {shops.map(s => <option key={s.open_id || s.shop_id} value={sellerKeyOf(s.seller_name, s.shop_id)}>{s.seller_name}</option>)}
            </select>
          )}
          <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={selectStyle}>
            {MKT_SORTS.map(s => <option key={s.key} value={s.key}>Sắp xếp: {s.label}</option>)}
          </select>
          <button onClick={() => fetchCreators(seller)} disabled={loading} style={{ ...selectStyle, background: ACCENT, color: '#fff', border: 'none', opacity: loading ? 0.6 : 1 }}>{loading ? '⏳' : '🔄'} Tải lại</button>
        </div>
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
          ❌ {error}
          <button onClick={() => fetchCreators(seller)} style={{ marginLeft: 12, padding: '4px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>Thử lại</button>
        </div>
      )}
      {!loading && !error && creators.length === 0 && <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Không có dữ liệu creator.</div>}

      {!loading && !error && sorted.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16 }}>
            {sorted.map((c, i) => <CreatorCard key={c.open_id || i} c={c} rank={i + 1} />)}
          </div>
          {nextToken && (
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
  { key: 'qty',        label: 'Số lượng' },
  { key: 'commission', label: 'Hoa hồng' },
];

function SalesView() {
  const [shops, setShops]   = useState([]);
  const [seller, setSeller] = useState('body');
  const [start, setStart]   = useState('2026-04-01');
  const [end, setEnd]       = useState(toYmd(new Date()));
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const [sortKey, setSortKey] = useState('gmv');

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
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({ action: 'koc_orders', seller, start_date: start, end_date: end });
      const r = await fetch(`${API}?${qs}`);
      const j = await r.json();
      if (!j.ok) { setError(j.error || 'Lỗi tải dữ liệu'); setData(null); return; }
      setData(j);
    } catch (e) { setError(e.message); setData(null); } finally { setLoading(false); }
  }, [seller, start, end]);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  const rows = useMemo(() => {
    const cs = data?.creators ? [...data.creators] : [];
    cs.sort((a, b) => (Number(b[sortKey]) || 0) - (Number(a[sortKey]) || 0));
    return cs;
  }, [data, sortKey]);
  const totals = data?.totals || { gmv: 0, orders: 0, commission: 0, qty: 0 };
  const sync = data?.sync;

  const th = { padding: '10px 12px', fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'right', whiteSpace: 'nowrap' };
  const td = { padding: '10px 12px', fontSize: '0.86rem', color: '#0f172a', textAlign: 'right', whiteSpace: 'nowrap', borderTop: '1px solid #f1f5f9' };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0 }}>
          Doanh số thật KOC mang về cho shop (đơn affiliate) {data?.shop && <b style={{ color: ACCENT }}>· {data.shop}</b>}
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {shops.length > 1 && (
            <select value={seller} onChange={e => setSeller(e.target.value)} style={selectStyle}>
              {shops.map(s => <option key={s.open_id || s.shop_id || s.seller_name} value={sellerKeyOf(s.seller_name, s.shop_id)}>{s.seller_name}</option>)}
            </select>
          )}
          <input type="date" value={start} min="2026-04-01" onChange={e => setStart(e.target.value)} style={selectStyle} />
          <span style={{ color: '#94a3b8' }}>→</span>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={selectStyle} />
          <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={selectStyle}>
            {SALES_SORTS.map(s => <option key={s.key} value={s.key}>Sắp xếp: {s.label}</option>)}
          </select>
          <button onClick={fetchSales} disabled={loading} style={{ ...selectStyle, background: ACCENT, color: '#fff', border: 'none', opacity: loading ? 0.6 : 1 }}>{loading ? '⏳' : '🔄'} Tải lại</button>
        </div>
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
          Chưa có đơn affiliate trong khoảng này.<br />
          <span style={{ fontSize: '0.8rem' }}>Nếu shop vừa kết nối, dữ liệu đang được đồng bộ — quay lại sau vài phút.</span>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ ...th, textAlign: 'center', width: 50 }}>#</th>
                  <th style={{ ...th, textAlign: 'left' }}>KOC</th>
                  <th style={th}>Đơn</th>
                  <th style={th}>GMV</th>
                  <th style={th}>SL</th>
                  <th style={th}>Hoa hồng</th>
                  <th style={th}>Đơn gần nhất</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={c.username || i} style={{ background: i % 2 ? '#fcfcfd' : '#fff' }}>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: i < 3 ? ACCENT : '#94a3b8' }}>{i + 1}</td>
                    <td style={{ ...td, textAlign: 'left' }}>
                      <a href={`https://www.tiktok.com/@${c.username}`} target="_blank" rel="noreferrer" style={{ color: ACCENT, textDecoration: 'none', fontWeight: 700 }}>@{c.username}</a>
                    </td>
                    <td style={td}>{fmtNum(c.orders)}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{fmtVnd(c.gmv)} đ</td>
                    <td style={td}>{fmtNum(c.qty)}</td>
                    <td style={td}>{fmtVnd(c.commission)} đ</td>
                    <td style={{ ...td, color: '#94a3b8', fontSize: '0.78rem' }}>{fromUnix(c.last_order)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

      {/* Mode toggle */}
      <div style={{ display: 'inline-flex', gap: 4, background: '#f1f5f9', borderRadius: 12, padding: 4, marginBottom: 16 }}>
        <button style={tabBtn(mode === 'marketplace')} onClick={() => setMode('marketplace')}>🔍 Marketplace</button>
        <button style={tabBtn(mode === 'sales')} onClick={() => setMode('sales')}>💰 Doanh số KOC</button>
      </div>

      {mode === 'marketplace' ? <MarketplaceView /> : <SalesView />}
    </div>
  );
}
