// src/components/KocPerformanceTab.jsx
//
// Hiệu suất KOC — Doanh số THẬT mỗi KOC mang về cho shop (đơn affiliate đã đồng bộ
// về Supabase). Nguồn: action=koc_orders (gom theo creator) + koc_products (drill-down
// sản phẩm). Bảng xếp hạng GMV/đơn/video/hoa hồng (VND), lọc theo ngày, search tên KOC,
// bấm 1 KOC để xem sản phẩm họ làm video / kéo đơn.

import React, { useState, useEffect, useCallback, useMemo } from 'react';

const API = '/api/tiktok-shop/analytics';
const ACCENT = '#ea580c';
const FLOOR = '2026-04-01';

// ── Formatters ───────────────────────────────────────────────────────────────
const fmtNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('vi-VN') : '0'; };
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
const shortName = (s) => { const t = (s || '').trim(); return t.length > 46 ? t.slice(0, 46) + '…' : t; };

const selectStyle = { padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', fontWeight: 600, color: '#334155', cursor: 'pointer' };
const inputStyle  = { padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', color: '#334155' };

// ── Letter avatar (orders API không trả avatar) ────────────────────────────────
const AVA_COLORS = ['#ea580c', '#3b82f6', '#16a34a', '#8b5cf6', '#0891b2', '#d97706', '#ec4899', '#ef4444', '#14b8a6'];
const avaColor = (name) => { let h = 0; const s = name || ''; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return AVA_COLORS[h % AVA_COLORS.length]; };
const LetterAva = ({ name, size = 30 }) => {
  const ch = ((name || '?').replace(/^@/, '').charAt(0) || '?').toUpperCase();
  return <span style={{ width: size, height: size, borderRadius: '50%', background: avaColor(name), color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size * 0.42, flexShrink: 0 }}>{ch}</span>;
};

// ── Search box ─────────────────────────────────────────────────────────────────
const SearchBox = ({ value, onChange }) => (
  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
    <span style={{ position: 'absolute', left: 10, fontSize: '0.85rem', color: '#94a3b8' }}>🔍</span>
    <input value={value} onChange={e => onChange(e.target.value)} placeholder="Tìm tên KOC…" style={{ ...inputStyle, paddingLeft: 30, width: 180 }} />
    {value && <button onClick={() => onChange('')} style={{ position: 'absolute', right: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', fontSize: '0.9rem' }}>✕</button>}
  </div>
);

const SALES_SORTS = [
  { key: 'gmv',        label: 'GMV' },
  { key: 'orders',     label: 'Số đơn' },
  { key: 'videos',     label: 'Số video' },
  { key: 'commission', label: 'Hoa hồng' },
];

// ── Drill-down: sản phẩm 1 KOC kéo đơn (theo đúng khoảng ngày đang chọn) ─────────
const PROD_GRID = '22px 36px 1fr 78px 78px 104px';
const ProductBreakdown = ({ state }) => {
  if (!state || state.loading) return <div style={{ padding: 14, color: '#94a3b8', fontSize: '0.82rem' }}>⏳ Đang tải sản phẩm…</div>;
  if (state.error) return <div style={{ padding: 14, color: '#b91c1c', fontSize: '0.82rem' }}>❌ {state.error}</div>;
  const ps = state.products || [];
  if (!ps.length) return <div style={{ padding: 14, color: '#94a3b8', fontSize: '0.82rem' }}>Không có sản phẩm trong khoảng này.</div>;
  const cell = { fontSize: '0.8rem', whiteSpace: 'nowrap' };
  return (
    <div style={{ padding: '10px 16px', background: '#fafafa' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>📦 Sản phẩm KOC làm video / kéo đơn ({ps.length})</div>
      <div style={{ display: 'grid', gridTemplateColumns: PROD_GRID, gap: 8, alignItems: 'center', padding: '0 10px 4px', fontSize: '0.66rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
        <span></span><span></span><span>Sản phẩm</span><span style={{ textAlign: 'right' }}>Video</span><span style={{ textAlign: 'right' }}>Đơn</span><span style={{ textAlign: 'right' }}>GMV</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ps.map((p, i) => (
          <div key={p.product_id || i} style={{ display: 'grid', gridTemplateColumns: PROD_GRID, gap: 8, alignItems: 'center', background: '#fff', borderRadius: 8, padding: '7px 10px', border: '1px solid #f1f5f9' }}>
            <span style={{ fontWeight: 800, color: '#94a3b8', fontSize: '0.78rem' }}>{i + 1}</span>
            {p.image
              ? <img src={p.image} alt="" referrerPolicy="no-referrer" style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover' }} />
              : <span style={{ width: 34, height: 34, borderRadius: 6, background: '#f1f5f9', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>📦</span>}
            <a href={`https://shop.tiktok.com/view/product/${p.product_id}`} target="_blank" rel="noreferrer" title={p.name || p.product_id}
              style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: '#0f172a', textDecoration: 'none', fontSize: '0.82rem' }}>
              {shortName(p.name) || `SP ${p.product_id}`}
            </a>
            <span style={{ ...cell, color: '#7c3aed', fontWeight: 700, textAlign: 'right' }}>🎬 {fmtNum(p.videos)}</span>
            <span style={{ ...cell, color: '#64748b', textAlign: 'right' }}>{fmtNum(p.orders)}</span>
            <span style={{ ...cell, color: ACCENT, fontWeight: 800, textAlign: 'right' }}>{fmtVnd(p.gmv)} đ</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
export default function KocPerformanceTab() {
  const [shops, setShops]   = useState([]);
  const [seller, setSeller] = useState('body');
  const [start, setStart]   = useState(FLOOR);
  const [end, setEnd]       = useState(toYmd(new Date()));
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const [sortKey, setSortKey] = useState('gmv');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [prodCache, setProdCache] = useState({});

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

  // Drill-down dùng đúng khoảng ngày đang chọn (start/end). prodCache bị xoá mỗi lần
  // đổi ngày/shop (trong fetchSales) nên dữ liệu sản phẩm luôn khớp filter hiện tại.
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
  const totals = data?.totals || { gmv: 0, orders: 0, commission: 0 };
  const sync = data?.sync;

  const today = toYmd(new Date());
  const presets = [
    { key: 'all',       label: 'Tất cả',  s: FLOOR,          e: today },
    { key: 'yesterday', label: 'Hôm qua', s: daysAgoYmd(1),  e: daysAgoYmd(1) },
    { key: '7d',        label: '7 ngày',  s: daysAgoYmd(6),  e: today },
    { key: '30d',       label: '30 ngày', s: daysAgoYmd(29), e: today },
  ];
  const activePreset = presets.find(p => p.s === start && p.e === end)?.key;
  const presetBtn = (active) => ({ padding: '7px 14px', borderRadius: 9, border: `1px solid ${active ? ACCENT : '#e5e7eb'}`, background: active ? ACCENT : '#fff', color: active ? '#fff' : '#475569', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' });

  const th = { padding: '10px 12px', fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'right', whiteSpace: 'nowrap' };
  const td = { padding: '9px 12px', fontSize: '0.86rem', color: '#0f172a', textAlign: 'right', whiteSpace: 'nowrap', borderTop: '1px solid #f1f5f9' };

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', margin: '0 0 4px' }}>🌟 Hiệu suất KOC</h1>
      <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 14px' }}>
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
        <input type="date" value={start} min={FLOOR} onChange={e => setStart(e.target.value)} style={inputStyle} />
        <span style={{ color: '#94a3b8' }}>→</span>
        <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={inputStyle} />
        <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={selectStyle}>
          {SALES_SORTS.map(s => <option key={s.key} value={s.key}>Sắp xếp: {s.label}</option>)}
        </select>
        <SearchBox value={search} onChange={setSearch} />
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
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ ...th, textAlign: 'center', width: 44 }}>#</th>
                  <th style={{ ...th, textAlign: 'left' }}>KOC</th>
                  <th style={th}>GMV</th>
                  <th style={th}>Đơn</th>
                  <th style={th}>🎬 Video</th>
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
                        <td style={td}>{fmtVnd(c.commission)} đ</td>
                        <td style={{ ...td, color: '#94a3b8', fontSize: '0.78rem' }}>{fromUnix(c.last_order)}</td>
                      </tr>
                      {open && (
                        <tr><td colSpan={7} style={{ padding: 0, borderTop: `2px solid ${ACCENT}` }}><ProductBreakdown state={prodCache[c.username]} /></td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '8px 14px', fontSize: '0.72rem', color: '#94a3b8', borderTop: '1px solid #f1f5f9' }}>
            💡 Bấm vào 1 KOC để xem sản phẩm họ làm video / kéo đơn (theo đúng khoảng ngày đang chọn).
            {data && data.count > (data.shown || 0) && <span> · Bảng hiển thị top {fmtNum(data.shown)}/{fmtNum(data.count)} KOC theo GMV (tổng phía trên vẫn tính đủ).</span>}
          </div>
        </div>
      )}
    </div>
  );
}
