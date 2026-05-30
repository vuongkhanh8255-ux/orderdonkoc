// src/components/TikTokProductAnalyticsTab.jsx — Phân tích sản phẩm TikTok (top bán chạy theo gian hàng)
// Built by Quốc Khánh
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = '/api/tiktok-shop/analytics';
const PAGE_SIZE = 30;

// ── Helpers ──────────────────────────────────────────────────────────────────
const toYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtVnd = (v) => { const n = Number(v) || 0; return n.toLocaleString('vi-VN') + ' ₫'; };
const fmtInt = (v) => (Number(v) || 0).toLocaleString('vi-VN');
const fmtPct = (v) => `${((Number(v) || 0) * 100).toFixed(2)}%`;
const fmtDate = (s) => { if (!s) return '—'; const d = new Date(s + (s.length <= 10 ? 'T00:00:00' : '')); return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); };

const STATUS_MAP = {
  ACTIVATE: { label: 'Trên kệ', color: '#16a34a', bg: '#f0fdf4' },
  LIVE: { label: 'Trên kệ', color: '#16a34a', bg: '#f0fdf4' },
  SELLER_DEACTIVATED: { label: 'Đã ẩn', color: '#64748b', bg: '#f8fafc' },
  PLATFORM_DEACTIVATED: { label: 'Bị khoá', color: '#dc2626', bg: '#fef2f2' },
  FREEZE: { label: 'Tạm khoá', color: '#d97706', bg: '#fffbeb' },
  DELETED: { label: 'Đã xoá', color: '#dc2626', bg: '#fef2f2' },
  DRAFT: { label: 'Nháp', color: '#64748b', bg: '#f8fafc' },
};
const statusChip = (s) => STATUS_MAP[s] || (s ? { label: s, color: '#64748b', bg: '#f8fafc' } : { label: '—', color: '#94a3b8', bg: '#f8fafc' });

// ── Styles ───────────────────────────────────────────────────────────────────
const CARD = { background: '#fff', borderRadius: 14, border: '1px solid #eef2f7', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' };
const TH = { padding: '11px 14px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: '2px solid #e5e7eb', background: '#f8fafc', whiteSpace: 'nowrap' };
const TD = { padding: '12px 14px', borderBottom: '1px solid #f1f5f9', fontSize: '0.84rem', color: '#0f172a', verticalAlign: 'middle' };
const BTN = { padding: '8px 16px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' };
const BTN_ON = { ...BTN, border: '1.5px solid #ea580c', background: '#fff7ed', color: '#ea580c' };
const INPUT = { padding: '8px 11px', borderRadius: 9, border: '2px solid #e5e7eb', fontSize: '0.84rem', outline: 'none', fontFamily: 'inherit', color: '#0f172a' };

const SORTABLE = [
  { key: 'gmv', label: 'GMV', align: 'right' },
  { key: 'units_sold', label: 'Đã bán', align: 'right' },
  { key: 'orders', label: 'Đơn hàng', align: 'right' },
  { key: 'click_through_rate', label: 'CTR', align: 'right' },
];

export default function TikTokProductAnalyticsTab() {
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState('');
  const [range, setRange] = useState(() => {
    const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 7);
    return { start: toYmd(start), end: toYmd(end) };
  });
  const [sortField, setSortField] = useState('gmv');
  const [sortOrder, setSortOrder] = useState('DESC');

  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(null);
  const [latestDate, setLatestDate] = useState(null);
  const [nextToken, setNextToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const reqIdRef = useRef(0);

  // ── Load shops once ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}?action=shops`);
        const json = await res.json();
        if (json.ok && Array.isArray(json.data)) {
          setShops(json.data);
          if (json.data.length) setShopId(prev => prev || String(json.data[0].shop_id));
        } else setError(json.error || 'Không tải được danh sách gian hàng');
      } catch (e) { setError(e.message); }
    })();
  }, []);

  // ── Fetch products (reset=true → page 1; false → append next page) ──
  const fetchProducts = useCallback(async (reset = true) => {
    if (!shopId) return;
    const myReq = ++reqIdRef.current;
    reset ? setLoading(true) : setLoadingMore(true);
    if (reset) setError('');
    try {
      const qs = new URLSearchParams({
        action: 'products', shop_id: shopId,
        start_date: range.start, end_date: range.end,
        sort_field: sortField, sort_order: sortOrder, page_size: String(PAGE_SIZE),
      });
      if (!reset && nextToken) qs.set('page_token', nextToken);
      const res = await fetch(`${API}?${qs}`);
      const json = await res.json();
      if (myReq !== reqIdRef.current) return; // stale response — ignore
      if (json.ok) {
        setProducts(prev => reset ? (json.products || []) : [...prev, ...(json.products || [])]);
        setTotal(json.total ?? null);
        setLatestDate(json.latest_available_date || null);
        setNextToken(json.next_page_token || null);
      } else {
        setError(json.error || 'Không tải được dữ liệu sản phẩm');
        if (reset) setProducts([]);
      }
    } catch (e) {
      if (myReq === reqIdRef.current) { setError(e.message); if (reset) setProducts([]); }
    } finally {
      if (myReq === reqIdRef.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [shopId, range.start, range.end, sortField, sortOrder, nextToken]);

  // Reload when shop / range / sort changes (page 1)
  useEffect(() => { if (shopId) fetchProducts(true); /* eslint-disable-next-line */ }, [shopId, range.start, range.end, sortField, sortOrder]);

  const onSort = (key) => {
    if (key === sortField) setSortOrder(o => (o === 'DESC' ? 'ASC' : 'DESC'));
    else { setSortField(key); setSortOrder('DESC'); }
  };

  const setPreset = (days) => {
    const end = new Date(); const start = new Date(); start.setDate(start.getDate() - days);
    setRange({ start: toYmd(start), end: toYmd(end) });
  };
  const setThisMonth = () => {
    const now = new Date();
    setRange({ start: toYmd(new Date(now.getFullYear(), now.getMonth(), 1)), end: toYmd(now) });
  };

  const copyId = (id) => { navigator.clipboard?.writeText(id); setCopied(id); setTimeout(() => setCopied(''), 1200); };

  // Page totals (visible rows)
  const sums = products.reduce((a, p) => ({ gmv: a.gmv + (p.gmv || 0), units: a.units + (p.units_sold || 0), orders: a.orders + (p.orders || 0) }), { gmv: 0, units: 0, orders: 0 });
  const shopName = shops.find(s => String(s.shop_id) === String(shopId))?.seller_name || '';

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1200, margin: '0 auto', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 42, height: 42, borderRadius: 12, background: '#fff1f2', border: '1px solid #fecdd3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>🏆</span>
            Phân tích sản phẩm TikTok
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            Top sản phẩm bán chạy theo gian hàng — GMV, lượt bán, đơn hàng
            <span style={{ marginLeft: 12, fontSize: '0.7rem', color: '#c4b5a0', fontStyle: 'italic' }}>Built by Quốc Khánh</span>
          </p>
        </div>
        {/* Shop selector */}
        {shops.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>🏪 Gian hàng:</span>
            <select value={shopId} onChange={e => setShopId(e.target.value)}
              style={{ ...INPUT, fontWeight: 700, background: '#fff1f2', border: '2px solid #fecdd3', cursor: 'pointer', minWidth: 190 }}>
              {shops.map(s => <option key={s.shop_id} value={s.shop_id}>{s.seller_name || `Shop ${s.shop_id}`}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Controls: date range */}
      <div style={{ ...CARD, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>📅 Khoảng ngày:</span>
        <button style={range.start === toYmd(new Date()) && range.end === toYmd(new Date()) ? BTN_ON : BTN} onClick={() => setPreset(0)}>Hôm nay</button>
        <button style={BTN} onClick={() => setPreset(7)}>7 ngày</button>
        <button style={BTN} onClick={() => setPreset(28)}>28 ngày</button>
        <button style={BTN} onClick={setThisMonth}>Tháng này</button>
        <span style={{ color: '#cbd5e1' }}>|</span>
        <input type="date" value={range.start} max={range.end} onChange={e => setRange(r => ({ ...r, start: e.target.value }))} style={INPUT} />
        <span style={{ color: '#94a3b8' }}>→</span>
        <input type="date" value={range.end} min={range.start} max={toYmd(new Date())} onChange={e => setRange(r => ({ ...r, end: e.target.value }))} style={INPUT} />
        <button style={{ ...BTN_ON, marginLeft: 'auto' }} onClick={() => fetchProducts(true)} disabled={loading}>{loading ? '⏳ Đang tải…' : '🔄 Làm mới'}</button>
      </div>

      {/* Info row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Pill label="Gian hàng" value={shopName || '—'} />
        <Pill label="Tổng SP có doanh số" value={total != null ? fmtInt(total) : '—'} />
        <Pill label="GMV (đang hiển thị)" value={fmtVnd(sums.gmv)} accent />
        <Pill label="Đã bán (hiển thị)" value={fmtInt(sums.units)} />
        <Pill label="TikTok cập nhật tới" value={fmtDate(latestDate)} />
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12, padding: '12px 16px', marginBottom: 14, color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Table */}
      <div style={{ ...CARD, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 44, textAlign: 'center' }}>#</th>
                <th style={TH}>Sản phẩm</th>
                <th style={{ ...TH, textAlign: 'center' }}>Trạng thái</th>
                {SORTABLE.map(c => {
                  const active = sortField === c.key;
                  return (
                    <th key={c.key} style={{ ...TH, textAlign: 'right', cursor: 'pointer', color: active ? '#ea580c' : '#64748b', userSelect: 'none' }} onClick={() => onSort(c.key)} title="Bấm để sắp xếp">
                      {c.label} {active ? (sortOrder === 'DESC' ? '↓' : '↑') : '⇅'}
                    </th>
                  );
                })}
                <th style={{ ...TH, textAlign: 'right' }}>Tồn kho</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ ...TD, textAlign: 'center', padding: '48px', color: '#ea580c', fontWeight: 700 }}>⏳ Đang tải dữ liệu…</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={8} style={{ ...TD, textAlign: 'center', padding: '48px', color: '#94a3b8' }}>Không có sản phẩm nào có doanh số trong khoảng ngày này.</td></tr>
              ) : products.map((p, i) => {
                const sc = statusChip(p.status);
                return (
                  <tr key={p.product_id} style={{ transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = '#fffaf6'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ ...TD, textAlign: 'center', fontWeight: 800, color: i < 3 ? '#ea580c' : '#94a3b8' }}>{i + 1}</td>
                    <td style={TD}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0, background: 'linear-gradient(135deg,#fff1f2,#ffe4e6)', border: '1px solid #fecdd3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem' }}>🧴</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: '#0f172a', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', maxWidth: 420 }}>{p.product_name}</div>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2, cursor: 'pointer' }} onClick={() => copyId(p.product_id)} title="Bấm để copy ID">
                            ID: {p.product_id} {copied === p.product_id ? '✅' : '📋'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, color: sc.color, background: sc.bg }}>● {sc.label}</span>
                    </td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{fmtVnd(p.gmv)}</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#ea580c' }}>{fmtInt(p.units_sold)}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{fmtInt(p.orders)}</td>
                    <td style={{ ...TD, textAlign: 'right', color: '#64748b' }}>{fmtPct(p.click_through_rate)}</td>
                    <td style={{ ...TD, textAlign: 'right', color: '#64748b' }}>{p.stock != null ? fmtInt(p.stock) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && nextToken && (
          <div style={{ textAlign: 'center', padding: '14px' }}>
            <button style={BTN} onClick={() => fetchProducts(false)} disabled={loadingMore}>{loadingMore ? 'Đang tải…' : '⬇ Tải thêm sản phẩm'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Pill({ label, value, accent }) {
  return (
    <div style={{ ...CARD, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 130 }}>
      <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</span>
      <span style={{ fontSize: '0.98rem', fontWeight: 800, color: accent ? '#ea580c' : '#0f172a' }}>{value}</span>
    </div>
  );
}
