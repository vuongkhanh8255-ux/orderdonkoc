// src/components/KocPerformanceTab.jsx
//
// Hiệu suất KOC — Doanh số THẬT mỗi KOC mang về cho shop (đơn affiliate đã đồng bộ
// về Supabase). Nguồn: action=koc_orders (gom theo creator) + koc_products (drill-down
// sản phẩm). Bảng xếp hạng GMV/đơn/video/hoa hồng (VND), lọc theo ngày, search tên KOC,
// bấm 1 KOC để xem sản phẩm họ làm video / kéo đơn.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAppData } from '../context/AppDataContext';

const API = '/api/tiktok-shop/analytics';
const ACCENT = '#ff6a2c';
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
const fmtViews = (v) => { const n = Number(v); if (!Number.isFinite(n) || v === null || v === undefined) return '—'; if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`; if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`; return String(n); };
// ROAS = Doanh thu (GMV) / (Hoa hồng + Cast). null khi chưa có chi phí (commission+cast = 0).
const roasOf = (gmv, commission, cast) => { const cost = (Number(commission) || 0) + (Number(cast) || 0); return cost > 0 ? (Number(gmv) || 0) / cost : null; };
const fmtRoas = (v) => { if (v == null || !Number.isFinite(v)) return '—'; return (v >= 10 ? v.toFixed(1) : v.toFixed(2)) + 'x'; };
const roasColor = (v) => v == null ? '#cbd5e1' : v >= 3 ? '#16a34a' : v >= 1 ? '#d97706' : '#dc2626';
const toYmd = (d) => { const dt = d instanceof Date ? d : new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`; };
// Ngày đăng: ưu tiên video_post_time thật ("2025-11-14 ..."), fallback đơn đầu tiên
const postLabel = (v) => v.video_post_time ? v.video_post_time.slice(0, 10).split('-').reverse().join('/') : fromUnix(v.first_order);
const daysAgoYmd = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return toYmd(d); };
const fromUnix = (s) => { const n = Number(s) || 0; return n ? new Date(n * 1000).toLocaleDateString('vi-VN') : '—'; };
const shortName = (s) => { const t = (s || '').trim(); return t.length > 46 ? t.slice(0, 46) + '…' : t; };

const selectStyle = { padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', fontWeight: 600, color: '#334155', cursor: 'pointer' };
const inputStyle  = { padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', color: '#334155' };
const dateInputStyle = { padding: '7px 8px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.8rem', color: '#334155', width: 132 };

// ── Letter avatar (orders API không trả avatar) ────────────────────────────────
const AVA_COLORS = ['#ff6a2c', '#3b82f6', '#16a34a', '#8b5cf6', '#0891b2', '#d97706', '#ec4899', '#ef4444', '#14b8a6'];
const avaColor = (name) => { let h = 0; const s = name || ''; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return AVA_COLORS[h % AVA_COLORS.length]; };
const LetterAva = ({ name, size = 30 }) => {
  const ch = ((name || '?').replace(/^@/, '').charAt(0) || '?').toUpperCase();
  return <span style={{ width: size, height: size, borderRadius: '50%', background: avaColor(name), color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size * 0.42, flexShrink: 0 }}>{ch}</span>;
};
// Avatar thật (từ cache) — lỗi tải thì fallback về chữ cái
const KocAvatar = ({ username, url, size = 30 }) => {
  const [err, setErr] = useState(false);
  if (url && !err) return <img src={url} referrerPolicy="no-referrer" onError={() => setErr(true)} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #f1f5f9' }} />;
  return <LetterAva name={username} size={size} />;
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
  { key: 'views',      label: 'View' },
  { key: 'orders',     label: 'Số đơn' },
  { key: 'vtotal',     label: 'Video tổng' },
  { key: 'vperiod',    label: 'Video kỳ' },
  { key: 'commission', label: 'Hoa hồng' },
  { key: 'cast',       label: 'Cast (chi phí)' },
  { key: 'roas',       label: 'ROAS' },
];

// Cache kết quả koc_orders theo (shop|seller|từ|đến) trong phiên → chọn lại khoảng đã xem là ra liền.
// "Tải lại" ép lấy mới (bỏ qua cache). Module-level nên còn nguyên khi chuyển tab rồi quay lại.
const SALES_CACHE = new Map();

// ── Drill-down: sản phẩm 1 KOC kéo đơn (theo đúng khoảng ngày đang chọn) ─────────
const PROD_GRID = '22px 36px 1fr 62px 62px 72px 104px';
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
        <span></span><span></span><span>Sản phẩm</span><span style={{ textAlign: 'right' }} title="Tổng clip đã đăng (toàn thời gian)">V.tổng</span><span style={{ textAlign: 'right' }} title="Clip đăng trong khoảng ngày đang chọn">V.kỳ</span><span style={{ textAlign: 'right' }}>Đơn</span><span style={{ textAlign: 'right' }}>GMV</span>
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
            <span style={{ ...cell, color: '#7c3aed', fontWeight: 700, textAlign: 'right' }}>{fmtNum(p.vtotal)}</span>
            <span style={{ ...cell, color: '#a855f7', fontWeight: 700, textAlign: 'right' }}>{p.vperiod > 0 ? fmtNum(p.vperiod) : '—'}</span>
            <span style={{ ...cell, color: '#64748b', textAlign: 'right' }}>{fmtNum(p.orders)}</span>
            <span style={{ ...cell, color: ACCENT, fontWeight: 800, textAlign: 'right' }}>{fmtVnd(p.gmv)} đ</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Drill-down: từng video của KOC + sản phẩm + ngày đăng + tổng view + view tháng ─
const VID_GRID = '20px 56px 1fr 76px 56px 60px 34px 70px 76px';
const ymShort = (ym) => ym ? 'T' + Number(ym.split('-')[1]) : 'Tháng';
const VideoBreakdown = ({ state, username }) => {
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  if (!state || state.loading) return <div style={{ padding: 14, color: '#94a3b8', fontSize: '0.82rem' }}>⏳ Đang tải video…</div>;
  if (state.error) return <div style={{ padding: 14, color: '#b91c1c', fontSize: '0.82rem' }}>❌ {state.error}</div>;
  const vs = state.videos || [];
  if (!vs.length) return <div style={{ padding: 14, color: '#94a3b8', fontSize: '0.82rem' }}>Không có video kéo đơn trong khoảng này.</div>;
  const cell = { fontSize: '0.8rem', whiteSpace: 'nowrap' };
  const mlabel = ymShort(state.ym);
  // Sắp xếp: bấm tiêu đề cột (cùng cột → đảo chiều). Mặc định ngày đăng mới nhất trước.
  const dateVal = (v) => v.video_post_time ? (Date.parse(v.video_post_time) || 0) : (Number(v.first_order) || 0) * 1000;
  const sortVal = (v) => sort.key === 'date' ? dateVal(v)
    : sort.key === 'views' ? Number(v.views) || 0
    : sort.key === 'month_views' ? Number(v.month_views) || 0
    : sort.key === 'orders' ? Number(v.orders) || 0
    : sort.key === 'cast' ? Number(v.cast) || 0
    : Number(v.gmv) || 0;
  const sorted = [...vs].sort((a, b) => sort.dir === 'asc' ? sortVal(a) - sortVal(b) : sortVal(b) - sortVal(a));
  const clickSort = (key) => setSort(s => s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' });
  const arrow = (key) => sort.key === key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : '';
  const sortTh = (key, label, align) => (
    <span onClick={() => clickSort(key)} title="Bấm để sắp xếp"
      style={{ cursor: 'pointer', userSelect: 'none', textAlign: align || 'left', color: sort.key === key ? ACCENT : '#94a3b8', fontWeight: sort.key === key ? 800 : 700 }}>
      {label}{arrow(key)}
    </span>
  );
  return (
    <div style={{ padding: '4px 16px 14px' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>🎬 Video KOC đã lên ({vs.length}) · bấm tiêu đề cột để sắp xếp · 👁 Tổng = view toàn bộ · 👁 {mlabel} = view trong tháng được chọn</div>
      <div style={{ display: 'grid', gridTemplateColumns: VID_GRID, gap: 8, alignItems: 'center', padding: '0 10px 4px', fontSize: '0.64rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
        <span></span><span>Video</span><span>Sản phẩm</span>{sortTh('date', 'Ngày đăng')}{sortTh('views', '👁 Tổng', 'right')}{sortTh('month_views', `👁 ${mlabel}`, 'right')}{sortTh('orders', 'Đơn', 'right')}{sortTh('gmv', 'GMV', 'right')}{sortTh('cast', '💵 Cast', 'right')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sorted.map((v, i) => (
          <div key={v.content_id || i} style={{ display: 'grid', gridTemplateColumns: VID_GRID, gap: 8, alignItems: 'center', background: '#fff', borderRadius: 8, padding: '7px 10px', border: '1px solid #f1f5f9' }}>
            <span style={{ fontWeight: 800, color: '#94a3b8', fontSize: '0.76rem' }}>{i + 1}</span>
            {v.content_type === 'VIDEO'
              ? <a href={`https://www.tiktok.com/@${username}/video/${v.content_id}`} target="_blank" rel="noreferrer" title={v.title || ''} style={{ color: '#7c3aed', fontWeight: 700, textDecoration: 'none', fontSize: '0.8rem' }}>🎬 Xem ↗</a>
              : <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.8rem' }}>🔴 {v.content_type || 'Khác'}</span>}
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }} title={v.product_name || v.top_product_id}>
              {v.product_image
                ? <img src={v.product_image} alt="" referrerPolicy="no-referrer" style={{ width: 24, height: 24, borderRadius: 5, objectFit: 'cover', flexShrink: 0 }} />
                : <span style={{ width: 24, height: 24, borderRadius: 5, background: '#f1f5f9', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.7rem' }}>📦</span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#0f172a' }}>{shortName(v.product_name) || `SP ${v.top_product_id || '—'}`}{v.product_count > 1 ? ` +${v.product_count - 1}` : ''}</span>
            </span>
            <span style={{ ...cell, color: '#0f172a', fontWeight: 700 }}>{postLabel(v)}</span>
            <span style={{ ...cell, color: '#475569', fontWeight: 800, textAlign: 'right' }}>{fmtViews(v.views)}</span>
            <span style={{ ...cell, color: '#0891b2', fontWeight: 800, textAlign: 'right' }}>{fmtViews(v.month_views)}</span>
            <span style={{ ...cell, color: '#64748b', textAlign: 'right' }}>{fmtNum(v.orders)}</span>
            <span style={{ ...cell, color: ACCENT, fontWeight: 800, textAlign: 'right' }}>{fmtVnd(v.gmv)} đ</span>
            <span style={{ ...cell, color: v.cast > 0 ? '#16a34a' : '#cbd5e1', fontWeight: 700, textAlign: 'right' }}>{v.cast > 0 ? `${fmtVnd(v.cast)} đ` : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Compact date-range picker (1 field + calendar popup) ──────────────────────
const MONTHS_VN = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
const DOW_VN = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const navBtn = { background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 7, width: 28, height: 28, cursor: 'pointer', fontSize: '1.05rem', color: '#475569', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const fmtRangeLabel = (s, e) => {
  const f = (d) => { const p = (d || '').split('-'); return p.length === 3 ? `${p[2]}/${p[1]}` : ''; };
  if (!s) return 'Chọn ngày';
  return (!e || e === s) ? f(s) : `${f(s)} → ${f(e)}`;
};

function DateRangePicker({ start, end, min, onChange }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState({ s: start, e: end });
  const [view, setView] = useState(() => { const d = end ? new Date(end) : new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const boxRef = useRef(null);
  const today = toYmd(new Date());
  const minYmd = min || '0000-01-01';

  // Mở popup: đồng bộ lại lựa chọn + lịch theo prop, gắn listener click-ngoài
  useEffect(() => {
    if (!open) return;
    setSel({ s: start, e: end });
    const d = end ? new Date(end) : new Date();
    setView({ y: d.getFullYear(), m: d.getMonth() });
    const h = (ev) => { if (boxRef.current && !boxRef.current.contains(ev.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, start, end]);

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const lead = (first.getDay() + 6) % 7; // Thứ 2 đầu tuần
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const out = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= days; d++) out.push(d);
    return out;
  }, [view]);

  const ymdOf = (d) => `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const shift = (delta) => setView(v => { let m = v.m + delta, y = v.y; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } return { y, m }; });
  const pick = (ymd) => {
    if (ymd < minYmd || ymd > today) return;
    setSel(p => (!p.s || p.e || ymd < p.s) ? { s: ymd, e: '' } : { s: p.s, e: ymd });
  };
  const apply = () => { if (sel.s) onChange(sel.s, sel.e || sel.s); setOpen(false); };

  return (
    <div ref={boxRef} style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ ...dateInputStyle, width: 'auto', minWidth: 118, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
        <span style={{ fontSize: '0.9rem' }}>📅</span>
        <span>{fmtRangeLabel(start, end)}</span>
        <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 60, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 12px 32px rgba(15,23,42,0.16)', padding: 12, width: 258 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button type="button" onClick={() => shift(-1)} style={navBtn}>‹</button>
            <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#1e293b' }}>{MONTHS_VN[view.m]} {view.y}</span>
            <button type="button" onClick={() => shift(1)} style={navBtn}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {DOW_VN.map(d => <div key={d} style={{ textAlign: 'center', fontSize: '0.66rem', fontWeight: 700, color: '#94a3b8' }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const ymd = ymdOf(d);
              const off = ymd < minYmd || ymd > today;
              const isEdge = ymd === sel.s || ymd === (sel.e || sel.s);
              const inRange = sel.s && sel.e && ymd > sel.s && ymd < sel.e;
              return (
                <button key={i} type="button" disabled={off} onClick={() => pick(ymd)}
                  style={{ height: 30, borderRadius: 7, border: 'none', cursor: off ? 'default' : 'pointer', fontSize: '0.78rem',
                    fontWeight: isEdge ? 800 : 500,
                    background: isEdge ? ACCENT : inRange ? '#ffe8d9' : 'transparent',
                    color: off ? '#cbd5e1' : isEdge ? '#fff' : '#334155' }}>{d}</button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{sel.s ? fmtRangeLabel(sel.s, sel.e || sel.s) : 'Chọn ngày bắt đầu'}</span>
            <button type="button" onClick={apply} disabled={!sel.s}
              style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', fontSize: '0.78rem', fontWeight: 700, cursor: sel.s ? 'pointer' : 'default', opacity: sel.s ? 1 : 0.5 }}>Áp dụng</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ── Định danh KOC: gán nhân sự theo brand (dùng chung bảng koc_brand_assignments với Booking) ──
const ASSIGN_TABLE = 'koc_brand_assignments';
const HIDDEN_STAFF = ['Anh Kiệt', 'Thiệu Huy'];
// Shop seller_name → brand_name (khớp convention bên Booking: EHERB / MILAGANICS / ...)
const brandOfShop = (sellerName) => {
  const s = (sellerName || '').toUpperCase();
  if (s.includes('BODY')) return 'BODYMISS';
  if (s.includes('EHERB') && s.includes('HCM')) return 'EHERB HCM';
  if (s.includes('EHERB')) return 'EHERB';
  if (s.includes('MILAGANIC')) return 'MILAGANICS';
  if (s.includes('MOAW')) return 'MOAW MOAWS';
  if (s.includes('HEALMII')) return 'HEALMII';
  return s.replace(/\s*VIỆT NAM\s*/g, '').trim() || '—';
};

function KocAssignCell({ username, brand, assignment, staffNames, currentUser, onChanged }) {
  const role = currentUser?.role || 'guest';
  const me = currentUser?.username || '';
  const isAdmin = role === 'admin';
  const isEcom = role === 'ecom';
  const canInteract = isAdmin || isEcom;
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState('');
  const [busy, setBusy] = useState(false);

  const status = assignment?.status; // 'proposed' | 'approved' | undefined
  const color = status === 'approved' ? '#16a34a' : status === 'proposed' ? '#d97706' : '#94a3b8';
  const bg = status === 'approved' ? '#f0fdf4' : status === 'proposed' ? '#fffbeb' : '#f8fafc';
  const border = status === 'approved' ? '#bbf7d0' : status === 'proposed' ? '#fde68a' : '#e5e7eb';

  const openModal = (e) => { e.stopPropagation(); if (!canInteract) return; setStaff(assignment?.staff_name || staffNames[0] || ''); setOpen(true); };
  const close = (e) => { e?.stopPropagation?.(); setOpen(false); };

  const save = async () => {
    const sn = (staff || '').trim(); if (!sn) return;
    setBusy(true);
    const nowIso = new Date().toISOString();
    const record = isAdmin
      ? { koc_id: username, brand_name: brand, staff_name: sn, assigned_at: assignment?.assigned_at || nowIso, updated_at: nowIso, status: 'approved', approved_by: me, approved_at: nowIso, proposed_by: assignment?.proposed_by || null, proposed_at: assignment?.proposed_at || null }
      : { koc_id: username, brand_name: brand, staff_name: sn, assigned_at: nowIso, updated_at: nowIso, status: 'proposed', proposed_by: me, proposed_at: nowIso, approved_by: null, approved_at: null };
    await supabase.from(ASSIGN_TABLE).upsert(record, { onConflict: 'koc_id,brand_name' });
    setBusy(false); setOpen(false); onChanged?.();
  };
  const approve = async () => {
    if (!isAdmin || !assignment) return;
    setBusy(true);
    const nowIso = new Date().toISOString();
    await supabase.from(ASSIGN_TABLE).upsert({ ...assignment, status: 'approved', approved_by: me, approved_at: nowIso, updated_at: nowIso }, { onConflict: 'koc_id,brand_name' });
    setBusy(false); setOpen(false); onChanged?.();
  };
  const remove = async () => {
    setBusy(true);
    await supabase.from(ASSIGN_TABLE).delete().eq('koc_id', username).eq('brand_name', brand);
    setBusy(false); setOpen(false); onChanged?.();
  };

  const canRemove = assignment && (isAdmin || (isEcom && status === 'proposed' && assignment.proposed_by === me));

  return (
    <>
      <button onClick={openModal} disabled={!canInteract}
        title={assignment ? `${status === 'proposed' ? 'Đề xuất' : 'Đang gán'}: ${assignment.staff_name}` : (canInteract ? 'Bấm để gán' : 'Chưa gán')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 14, fontSize: '0.74rem', fontWeight: 700, cursor: canInteract ? 'pointer' : 'default', color, background: bg, border: `1px solid ${border}`, maxWidth: 132, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {assignment ? <>{status === 'proposed' ? '🟡' : '🟢'} {assignment.staff_name}</> : (canInteract ? '+ Gán' : '—')}
      </button>
      {open && (
        <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: 370, fontFamily: "'Outfit', sans-serif", boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{isAdmin ? 'Gán nhân sự' : 'Đề xuất nhân sự'}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: '4px 0 2px' }}>@{username}</div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 14 }}>Brand: <b style={{ color: ACCENT }}>{brand}</b></div>
            <select value={staff} onChange={e => setStaff(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1.5px solid #e5e7eb', fontSize: '0.88rem', marginBottom: 10, boxSizing: 'border-box' }}>
              {!staffNames.length && <option value="">Chưa có nhân sự</option>}
              {staffNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {assignment && (
              <div style={{ fontSize: '0.74rem', color: '#64748b', background: '#f8fafc', borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>
                {status === 'proposed'
                  ? <>🟡 <b>Đề xuất</b>: {assignment.staff_name} — bởi <b>{assignment.proposed_by || '?'}</b></>
                  : <>🟢 Đang gán <b>{assignment.staff_name}</b> từ {assignment.approved_at ? new Date(assignment.approved_at).toLocaleDateString('vi-VN') : '—'}</>}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={save} disabled={busy || !staff} style={{ flex: 1, padding: '9px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer', opacity: busy || !staff ? 0.6 : 1 }}>{isAdmin ? (status === 'proposed' ? 'Duyệt + lưu' : 'Lưu gán') : 'Gửi đề xuất'}</button>
              {isAdmin && status === 'proposed' && <button onClick={approve} disabled={busy} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}>✓ Duyệt</button>}
              {canRemove && <button onClick={remove} disabled={busy} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}>Loại</button>}
              <button onClick={() => setOpen(false)} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function KocPerformanceTab() {
  const [shops, setShops]   = useState([]);
  const [shopId, setShopId] = useState('');
  const [start, setStart]   = useState(FLOOR);
  const [end, setEnd]       = useState(toYmd(new Date()));
  const [data, setData]     = useState(null);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const [sortKey, setSortKey] = useState('gmv');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [drillTab, setDrillTab] = useState('products'); // 'products' | 'videos'
  const [prodCache, setProdCache] = useState({});
  const [vidCache, setVidCache] = useState({});
  const [avatarMap, setAvatarMap] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}?action=koc_orders&list=1`);
        const j = await r.json();
        if (cancelled || !j.ok || !Array.isArray(j.shops)) return;
        setShops(j.shops);
        const body = j.shops.find(s => (s.seller_name || '').toLowerCase().includes('body')) || j.shops[0];
        if (body) setShopId(body.shop_id || '');
      } catch { /* keep default */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Tên shop đang chọn (để truyền kèm cho các action dùng seller). shop_id mới là khoá chính (duy nhất).
  const selSeller = shops.find(s => String(s.shop_id) === String(shopId))?.seller_name || '';

  const fetchSales = useCallback(async (force = false) => {
    const key = `${shopId}|${selSeller}|${start}|${end}`;
    setError(null); setExpanded(null); setProdCache({}); setVidCache({}); setDrillTab('products');
    // Cache hit → ra liền, khỏi gọi server
    if (!force && SALES_CACHE.has(key)) { setData(SALES_CACHE.get(key)); setFromCache(true); setLoading(false); return; }
    setLoading(true); setFromCache(false);
    try {
      // "Tất cả" (FLOOR → hôm nay) → cast cộng hết (không lọc theo ngày air); khoảng khác → cast theo ngày air trong khoảng
      const isAll = start === FLOOR && end === toYmd(new Date());
      const qs = new URLSearchParams({ action: 'koc_orders', shop_id: shopId, seller: selSeller, start_date: start, end_date: end, cast_all: isAll ? '1' : '0' });
      if (force) qs.set('force', '1'); // Tải lại → server bỏ qua cache chung, tính mới + cập nhật cache
      const r = await fetch(`${API}?${qs}`);
      const j = await r.json();
      if (!j.ok) { setError(j.error || 'Lỗi tải dữ liệu'); setData(null); return; }
      SALES_CACHE.set(key, j);
      setData(j);
    } catch (e) { setError(e.message); setData(null); } finally { setLoading(false); }
  }, [shopId, selSeller, start, end]);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  // ── Định danh KOC: nhân sự + brand (dùng chung bảng koc_brand_assignments) ──
  const { nhanSus } = useAppData();
  const currentUser = useMemo(() => { try { return JSON.parse(localStorage.getItem('sk_session')) || JSON.parse(sessionStorage.getItem('sk_session')); } catch { return null; } }, []);
  const staffNames = useMemo(() => [...new Set((nhanSus || []).map(i => i?.ten_nhansu || i?.name || '').filter(n => n && !HIDDEN_STAFF.includes(n)))].sort((a, b) => a.localeCompare(b, 'vi')), [nhanSus]);
  const brand = useMemo(() => brandOfShop(selSeller), [selSeller]);
  const [assignMap, setAssignMap] = useState({});
  const reloadAssignments = useCallback(async () => {
    if (!brand) { setAssignMap({}); return; }
    const { data } = await supabase.from(ASSIGN_TABLE)
      .select('koc_id, brand_name, staff_name, status, proposed_by, proposed_at, approved_by, approved_at, assigned_at')
      .eq('brand_name', brand);
    const m = {}; (data || []).forEach(a => { m[(a.koc_id || '').toLowerCase()] = a; });
    setAssignMap(m);
  }, [brand]);
  useEffect(() => { reloadAssignments(); }, [reloadAssignments]);

  // Lấy avatar thật (cache + fetch dần) cho top 60 KOC mỗi lần đổi data/shop
  useEffect(() => {
    const users = (data?.creators || []).slice(0, 60).map(r => r.username).filter(Boolean);
    if (!users.length) return;
    let cancelled = false;
    fetch(`${API}?action=koc_avatars&shop_id=${encodeURIComponent(shopId)}&seller=${encodeURIComponent(selSeller)}&users=${encodeURIComponent(users.join(','))}&max=8`)
      .then(r => r.json()).then(j => { if (!cancelled && j?.ok && j.avatars) setAvatarMap(prev => ({ ...prev, ...j.avatars })); }).catch(() => {});
    return () => { cancelled = true; };
  }, [data, shopId, selSeller]);

  // Drill-down dùng đúng khoảng ngày đang chọn (start/end). prodCache bị xoá mỗi lần
  // đổi ngày/shop (trong fetchSales) nên dữ liệu sản phẩm luôn khớp filter hiện tại.
  const loadProducts = (username) => {
    if (prodCache[username]) return;
    setProdCache(p => ({ ...p, [username]: { loading: true } }));
    const qs = new URLSearchParams({ action: 'koc_products', shop_id: shopId, seller: selSeller, creator: username, start_date: start, end_date: end });
    fetch(`${API}?${qs}`).then(r => r.json())
      .then(j => setProdCache(p => ({ ...p, [username]: j.ok ? { products: j.products || [] } : { error: j.error || 'Lỗi' } })))
      .catch(e => setProdCache(p => ({ ...p, [username]: { error: e.message } })));
  };
  const loadVideos = (username) => {
    if (vidCache[username]) return;
    setVidCache(p => ({ ...p, [username]: { loading: true } }));
    const qs = new URLSearchParams({ action: 'koc_videos', shop_id: shopId, seller: selSeller, creator: username, start_date: start, end_date: end });
    fetch(`${API}?${qs}`).then(r => r.json())
      .then(j => setVidCache(p => ({ ...p, [username]: j.ok ? { videos: j.videos || [], ym: j.ym_selected } : { error: j.error || 'Lỗi' } })))
      .catch(e => setVidCache(p => ({ ...p, [username]: { error: e.message } })));
  };
  const toggleExpand = (username) => {
    if (expanded === username) { setExpanded(null); return; }
    setExpanded(username); setDrillTab('products'); loadProducts(username);
  };
  const switchDrill = (username, tab) => {
    setDrillTab(tab);
    if (tab === 'products') loadProducts(username); else loadVideos(username);
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cs = (data?.creators || [])
      .filter(c => !q || (c.username || '').toLowerCase().includes(q))
      .map(c => ({ ...c, roas: roasOf(c.gmv, c.commission, c.cast) }));
    return [...cs].sort((a, b) => (Number(b[sortKey]) || 0) - (Number(a[sortKey]) || 0));
  }, [data, sortKey, search]);
  const totals = data?.totals || { gmv: 0, orders: 0, commission: 0, views: 0, cast: 0 };
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
  const drillTabBtn = (active) => ({ padding: '5px 12px', borderRadius: 8, border: `1px solid ${active ? ACCENT : '#e5e7eb'}`, background: active ? '#fff7ed' : '#fff', color: active ? ACCENT : '#64748b', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' });

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
          <select value={shopId} onChange={e => setShopId(e.target.value)} style={selectStyle}>
            {shops.map(s => <option key={s.shop_id || s.seller_name} value={s.shop_id || ''}>{s.seller_name}</option>)}
          </select>
        )}
        {presets.map(p => <button key={p.key} style={presetBtn(activePreset === p.key)} onClick={() => { setStart(p.s); setEnd(p.e); }}>{p.label}</button>)}
        <DateRangePicker start={start} end={end} min={FLOOR} onChange={(s, e) => { setStart(s); setEnd(e); }} />
        <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={selectStyle}>
          {SALES_SORTS.map(s => <option key={s.key} value={s.key}>Sắp xếp: {s.label}</option>)}
        </select>
        <SearchBox value={search} onChange={setSearch} />
        <button onClick={() => fetchSales(true)} disabled={loading} style={{ ...selectStyle, background: ACCENT, color: '#fff', border: 'none', opacity: loading ? 0.6 : 1 }}>{loading ? '⏳' : '🔄'} Tải lại</button>
        {fromCache && !loading && <span style={{ fontSize: '0.72rem', color: '#0891b2', fontWeight: 600 }} title="Hiển thị tức thì từ bộ nhớ phiên — bấm Tải lại để cập nhật mới nhất">⚡ tức thì (cache)</span>}
      </div>

      {sync && (
        <div style={{ fontSize: '0.74rem', color: '#64748b', margin: '0 0 14px' }}>
          🔄 Đồng bộ tới <b>{sync.newest_date || '—'}</b> · {fmtNum(sync.total_synced)} dòng đơn ·{' '}
          {sync.backfill_done ? <span style={{ color: '#16a34a', fontWeight: 700 }}>đã đủ từ 01/04/2026</span> : <span style={{ color: ACCENT, fontWeight: 700 }}>đang backfill về 01/04/2026…</span>}
          {sync.last_run_at && ` · lần cuối ${new Date(sync.last_run_at).toLocaleString('vi-VN')}`}
        </div>
      )}

      {!loading && data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
          {[
            { label: 'Tổng GMV', value: `${fmtVnd(totals.gmv)} đ`, icon: '💰' },
            { label: 'Tổng đơn', value: fmtNum(totals.orders), icon: '🛒' },
            { label: 'Tổng video', value: fmtNum(totals.vtotal || 0), icon: '🎬' },
            { label: 'Video kỳ này', value: fmtNum(totals.vperiod || 0), icon: '🎞️' },
            { label: 'Tổng view', value: fmtViews(totals.views), icon: '👁' },
            { label: 'Tổng hoa hồng', value: `${fmtVnd(totals.commission)} đ`, icon: '💸' },
            { label: 'Tổng cast', value: `${fmtVnd(totals.cast || 0)} đ`, icon: '💵' },
            { label: 'ROAS tổng', value: fmtRoas(roasOf(totals.gmv, totals.commission, totals.cast)), icon: '📊' },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', borderRadius: 14, padding: '15px 18px', border: '1px solid #eef1f5', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: '#fff4ec', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', flexShrink: 0 }}>{s.icon}</span>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{s.label}</span>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', marginTop: 8 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>⏳ Đang tải doanh số…</div>}
      {!loading && error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 20, color: '#b91c1c', fontSize: '0.86rem' }}>
          ❌ {error}<button onClick={() => fetchSales(true)} style={{ marginLeft: 12, padding: '4px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>Thử lại</button>
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
                  <th style={th} title="Tổng clip KOC đã đăng cho shop này (toàn thời gian)">🎬 Video tổng</th>
                  <th style={th} title="Clip đăng trong khoảng ngày đang chọn">🎬 Video kỳ</th>
                  <th style={th} title="View PHÁT SINH trong khoảng đang chọn (tăng thêm theo tháng, không phải tích luỹ)">👁 View</th>
                  <th style={th}>Hoa hồng</th>
                  <th style={th}>💵 Cast</th>
                  <th style={th} title="ROAS = GMV / (Hoa hồng + Cast) — doanh thu trên mỗi đồng chi phí">📊 ROAS</th>
                  <th style={th}>Gần nhất</th>
                  <th style={{ ...th, textAlign: 'left' }}>👤 Nhân sự</th>
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
                            <KocAvatar username={c.username} url={avatarMap[c.username]?.avatar} size={30} />
                            <a href={`https://www.tiktok.com/@${c.username}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: ACCENT, textDecoration: 'none', fontWeight: 700 }}>@{c.username}</a>
                          </div>
                        </td>
                        <td style={{ ...td, fontWeight: 800 }}>{fmtVnd(c.gmv)} đ</td>
                        <td style={td}>{fmtNum(c.orders)}</td>
                        <td style={{ ...td, color: '#7c3aed', fontWeight: 700 }}>{fmtNum(c.vtotal)}</td>
                        <td style={{ ...td, color: '#a855f7', fontWeight: 700 }}>{c.vperiod > 0 ? fmtNum(c.vperiod) : '—'}</td>
                        <td style={{ ...td, color: '#0891b2', fontWeight: 700 }}>{fmtViews(c.views)}</td>
                        <td style={td}>{fmtVnd(c.commission)} đ</td>
                        <td style={{ ...td, color: c.cast > 0 ? '#16a34a' : '#cbd5e1', fontWeight: c.cast > 0 ? 700 : 400 }}>{c.cast > 0 ? `${fmtVnd(c.cast)} đ` : '—'}</td>
                        <td style={{ ...td, fontWeight: 800, color: roasColor(c.roas) }} title={c.roas != null ? `${fmtVnd(c.gmv)} / (${fmtVnd(c.commission)} + ${fmtVnd(c.cast)})` : 'Chưa có chi phí'}>{fmtRoas(c.roas)}</td>
                        <td style={{ ...td, color: '#94a3b8', fontSize: '0.78rem' }}>{fromUnix(c.last_order)}</td>
                        <td style={{ ...td, textAlign: 'left' }} onClick={e => e.stopPropagation()}>
                          <KocAssignCell username={(c.username || '').toLowerCase().replace(/^@/, '')} brand={brand} assignment={assignMap[(c.username || '').toLowerCase().replace(/^@/, '')]} staffNames={staffNames} currentUser={currentUser} onChanged={reloadAssignments} />
                        </td>
                      </tr>
                      {open && (
                        <tr><td colSpan={12} style={{ padding: 0, borderTop: `2px solid ${ACCENT}`, background: '#fafafa' }}>
                          <div style={{ display: 'flex', gap: 6, padding: '10px 16px 4px' }}>
                            <button onClick={() => switchDrill(c.username, 'products')} style={drillTabBtn(drillTab === 'products')}>📦 Sản phẩm</button>
                            <button onClick={() => switchDrill(c.username, 'videos')} style={drillTabBtn(drillTab === 'videos')}>🎬 Video</button>
                          </div>
                          {drillTab === 'products'
                            ? <ProductBreakdown state={prodCache[c.username]} />
                            : <VideoBreakdown state={vidCache[c.username]} username={c.username} />}
                        </td></tr>
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
