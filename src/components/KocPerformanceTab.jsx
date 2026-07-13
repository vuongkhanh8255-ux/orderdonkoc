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
const FLOOR = '2026-01-01';

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
// ROAS = GMV / (Chi phí AFF + Chi phí CAST + CHI PHÍ MẪU). null khi tổng chi phí = 0.
// Chi phí mẫu = Σ(cost×1.08×SL) + 5k vận hành + ship (Thường 20k / Hỏa tốc 50k) cho đơn mẫu KOC TRONG KỲ đang chọn (backend RPC koc_sample_cost tính).
const roasOf = (gmv, commission, cast, sample) => { const cost = (Number(commission) || 0) + (Number(cast) || 0) + (Number(sample) || 0); return cost > 0 ? (Number(gmv) || 0) / cost : null; };
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
    <span style={{ position: 'absolute', left: 10, fontSize: '0.85rem', color: '#64748b' }}>🔍</span>
    <input value={value} onChange={e => onChange(e.target.value)} placeholder="Tìm tên KOC…" style={{ ...inputStyle, paddingLeft: 30, width: 180 }} />
    {value && <button onClick={() => onChange('')} style={{ position: 'absolute', right: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', fontSize: '0.9rem' }}>✕</button>}
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
  // { key: 'roas',       label: 'ROAS' }, // TẠM ẨN — ROAS chưa tính chính xác
];

// Cache kết quả koc_orders theo (shop|seller|từ|đến) trong phiên → chọn lại khoảng đã xem là ra liền.
// "Tải lại" ép lấy mới (bỏ qua cache). Module-level nên còn nguyên khi chuyển tab rồi quay lại.
const SALES_CACHE = new Map();

// ── Drill-down: sản phẩm 1 KOC kéo đơn (theo đúng khoảng ngày đang chọn) ─────────
const PROD_GRID = '22px 36px 1fr 62px 62px 72px 104px';
const ProductBreakdown = ({ state }) => {
  if (!state || state.loading) return <div style={{ padding: 14, color: '#64748b', fontSize: '0.82rem' }}>⏳ Đang tải sản phẩm…</div>;
  if (state.error) return <div style={{ padding: 14, color: '#b91c1c', fontSize: '0.82rem' }}>❌ {state.error}</div>;
  const ps = state.products || [];
  if (!ps.length) return <div style={{ padding: 14, color: '#64748b', fontSize: '0.82rem' }}>Không có sản phẩm trong khoảng này.</div>;
  const cell = { fontSize: '0.8rem', whiteSpace: 'nowrap' };
  return (
    <div style={{ padding: '10px 16px', background: '#fafafa' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>📦 Sản phẩm KOC làm video / kéo đơn ({ps.length})</div>
      <div style={{ display: 'grid', gridTemplateColumns: PROD_GRID, gap: 8, alignItems: 'center', padding: '0 10px 4px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
        <span></span><span></span><span>Sản phẩm</span><span style={{ textAlign: 'right' }} title="Tổng clip đã đăng (toàn thời gian)">V.tổng</span><span style={{ textAlign: 'right' }} title="Clip đăng trong khoảng ngày đang chọn">V.kỳ</span><span style={{ textAlign: 'right' }}>Đơn</span><span style={{ textAlign: 'right' }}>GMV</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ps.map((p, i) => (
          <div key={p.product_id || i} style={{ display: 'grid', gridTemplateColumns: PROD_GRID, gap: 8, alignItems: 'center', background: '#fff', borderRadius: 8, padding: '7px 10px', border: '1px solid #f1f5f9' }}>
            <span style={{ fontWeight: 800, color: '#64748b', fontSize: '0.78rem' }}>{i + 1}</span>
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
  if (!state || state.loading) return <div style={{ padding: 14, color: '#64748b', fontSize: '0.82rem' }}>⏳ Đang tải video…</div>;
  if (state.error) return <div style={{ padding: 14, color: '#b91c1c', fontSize: '0.82rem' }}>❌ {state.error}</div>;
  const vs = state.videos || [];
  if (!vs.length) return <div style={{ padding: 14, color: '#64748b', fontSize: '0.82rem' }}>Không có video kéo đơn trong khoảng này.</div>;
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
      style={{ cursor: 'pointer', userSelect: 'none', textAlign: align || 'left', color: sort.key === key ? ACCENT : '#64748b', fontWeight: sort.key === key ? 800 : 700 }}>
      {label}{arrow(key)}
    </span>
  );
  return (
    <div style={{ padding: '4px 16px 14px' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>🎬 Video KOC đã lên ({vs.length}) · bấm tiêu đề cột để sắp xếp · 👁 Tổng = view toàn bộ · 👁 {mlabel} = view trong tháng được chọn</div>
      <div style={{ display: 'grid', gridTemplateColumns: VID_GRID, gap: 8, alignItems: 'center', padding: '0 10px 4px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
        <span></span><span>Video</span><span>Sản phẩm</span>{sortTh('date', 'Ngày đăng')}{sortTh('views', '👁 Tổng', 'right')}{sortTh('month_views', `👁 ${mlabel}`, 'right')}{sortTh('orders', 'Đơn', 'right')}{sortTh('gmv', 'GMV', 'right')}{sortTh('cast', '💵 Cast', 'right')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sorted.map((v, i) => (
          <div key={v.content_id || i} style={{ display: 'grid', gridTemplateColumns: VID_GRID, gap: 8, alignItems: 'center', background: '#fff', borderRadius: 8, padding: '7px 10px', border: '1px solid #f1f5f9' }}>
            <span style={{ fontWeight: 800, color: '#64748b', fontSize: '0.76rem' }}>{i + 1}</span>
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
        <span style={{ color: '#64748b', fontSize: '0.7rem' }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 60, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 12px 32px rgba(15,23,42,0.16)', padding: 12, width: 258 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button type="button" onClick={() => shift(-1)} style={navBtn}>‹</button>
            <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#1e293b' }}>{MONTHS_VN[view.m]} {view.y}</span>
            <button type="button" onClick={() => shift(1)} style={navBtn}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {DOW_VN.map(d => <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>{d}</div>)}
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
const HIST_TABLE = 'koc_assignment_history';
const HIST_LABEL = { assign: '🟢 Gán', propose: '🟡 Đề xuất', approve: '✓ Duyệt', remove: '🗑️ Loại' };
const HIDDEN_STAFF = ['Anh Kiệt', 'Thiệu Huy'];
// Shop seller_name → brand_name (khớp convention bên Booking: EHERB / MILAGANICS / ...)
const brandOfShop = (sellerName) => {
  // BỎ DẤU tiếng Việt trước khi so (NFD + xoá dấu) → tránh lệch Unicode "Hồ" (NFC vs NFD)
  // làm "eHerb Hồ Chí Minh" không khớp 'HỒ CHÍ MINH' → cả 2 gian eHerb cùng ra 'EHERB' (BUG).
  const s = (sellerName || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toUpperCase();
  if (s.includes('BODY')) return 'BODYMISS';
  // eHerb có 2 gian RIÊNG: VN ("eHerb Viet Nam") và HCM ("eHerb Hồ Chí Minh"). Gian HCM tên đầy đủ
  // "Ho Chi Minh" chứ KHÔNG có "HCM" → phải bắt cả 2 cách viết (sau khi bỏ dấu là 'HO CHI MINH').
  if (s.includes('EHERB') && (s.includes('HCM') || s.includes('HO CHI MINH'))) return 'EHERB HCM';
  if (s.includes('EHERB')) return 'EHERB';
  if (s.includes('MILAGANIC')) return 'MILAGANICS';
  if (s.includes('MOAW')) return 'MOAW MOAWS';
  if (s.includes('HEALMII')) return 'HEALMII';
  return s.replace(/\s*VIET NAM\s*/g, '').trim() || '—';
};

const assignDate = (a) => { if (!a) return ''; const d = a.status === 'approved' ? (a.approved_at || a.assigned_at) : (a.proposed_at || a.assigned_at); return d ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : ''; };
function KocAssignCell({ username, brand, assignments, staffNames, currentUser, onChanged, allBrands = [] }) {
  const assignment = (assignments || []).find(a => a.brand_name === brand) || null;          // gán ở brand đang xem
  const others = (assignments || []).filter(a => a.brand_name !== brand && a.staff_name);     // đã định danh ở brand khác (đồng bộ)
  const assignedSet = new Set((assignments || []).filter(a => a.staff_name).map(a => a.brand_name));
  const unassigned = (allBrands || []).filter(b => b !== brand && !assignedSet.has(b));         // brand khác CHƯA gán → để biết mà gán
  const role = currentUser?.role || 'guest';
  const me = currentUser?.username || '';
  const isAdmin = role === 'admin';
  const isEcom = role === 'ecom';
  const canInteract = isAdmin || isEcom;
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState('');
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState(null); // lịch sử (null = chưa tải)

  const status = assignment?.status; // 'proposed' | 'approved' | undefined
  const color = status === 'approved' ? '#16a34a' : status === 'proposed' ? '#d97706' : '#64748b';
  const bg = status === 'approved' ? '#f0fdf4' : status === 'proposed' ? '#fffbeb' : '#f8fafc';
  const border = status === 'approved' ? '#bbf7d0' : status === 'proposed' ? '#fde68a' : '#e5e7eb';

  const openModal = (e) => { e.stopPropagation(); if (!canInteract) return; setStaff(assignment?.staff_name || staffNames[0] || ''); setHist(null); setOpen(true); };
  const close = (e) => { e?.stopPropagation?.(); setOpen(false); };
  const logHistory = (action, sn) => supabase.from(HIST_TABLE).insert({ koc_id: username, brand_name: brand, staff_name: sn || null, action, actor: me }).then(() => {}, () => {});
  const loadHist = async () => {
    const { data } = await supabase.from(HIST_TABLE).select('brand_name, staff_name, action, actor, created_at').eq('koc_id', username).order('created_at', { ascending: false }).limit(50);
    setHist(data || []);
  };

  const save = async () => {
    const sn = (staff || '').trim(); if (!sn) return;
    setBusy(true);
    // RULE cooldown 30 ngày: KOC bị GỠ khỏi NS này thì 30 ngày sau mới gắn lại cho NS đó được
    // (chống gỡ-rồi-gắn-lại để reset bộ đếm 45 ngày).
    try {
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: recentRm } = await supabase.from(HIST_TABLE)
        .select('created_at').eq('koc_id', username).eq('brand_name', brand)
        .eq('staff_name', sn).eq('action', 'remove').gte('created_at', cutoff)
        .order('created_at', { ascending: false }).limit(1);
      if (recentRm && recentRm.length) {
        const rmAt = new Date(recentRm[0].created_at);
        const canAt = new Date(rmAt.getTime() + 30 * 86400000);
        const daysLeft = Math.max(1, Math.ceil((canAt - Date.now()) / 86400000));
        setBusy(false);
        alert(`⛔ @${username} vừa bị gỡ khỏi ${sn} ngày ${rmAt.toLocaleDateString('vi-VN')}.\nPhải chờ đủ 30 ngày — còn ${daysLeft} ngày nữa (tới ${canAt.toLocaleDateString('vi-VN')}) mới gắn lại cho ${sn} được.`);
        return;
      }
    } catch { /* lỗi check thì cho gán (không chặn cứng) */ }
    const nowIso = new Date().toISOString();
    const record = isAdmin
      ? { koc_id: username, brand_name: brand, staff_name: sn, assigned_at: assignment?.assigned_at || nowIso, updated_at: nowIso, status: 'approved', approved_by: me, approved_at: nowIso, proposed_by: assignment?.proposed_by || null, proposed_at: assignment?.proposed_at || null }
      : { koc_id: username, brand_name: brand, staff_name: sn, assigned_at: nowIso, updated_at: nowIso, status: 'proposed', proposed_by: me, proposed_at: nowIso, approved_by: null, approved_at: null };
    await supabase.from(ASSIGN_TABLE).upsert(record, { onConflict: 'koc_id,brand_name' });
    logHistory(isAdmin ? 'assign' : 'propose', sn);
    setBusy(false); setOpen(false); onChanged?.();
  };
  const approve = async () => {
    if (!isAdmin || !assignment) return;
    setBusy(true);
    const nowIso = new Date().toISOString();
    await supabase.from(ASSIGN_TABLE).upsert({ ...assignment, status: 'approved', approved_by: me, approved_at: nowIso, updated_at: nowIso }, { onConflict: 'koc_id,brand_name' });
    logHistory('approve', assignment.staff_name);
    setBusy(false); setOpen(false); onChanged?.();
  };
  const remove = async () => {
    setBusy(true);
    await supabase.from(ASSIGN_TABLE).delete().eq('koc_id', username).eq('brand_name', brand);
    logHistory('remove', assignment?.staff_name);
    setBusy(false); setOpen(false); onChanged?.();
  };

  const canRemove = assignment && (isAdmin || (isEcom && status === 'proposed' && assignment.proposed_by === me));

  return (
    <>
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
        <button onClick={openModal} disabled={!canInteract}
          title={assignment ? `${status === 'proposed' ? 'Đề xuất' : 'Đang gán'}: ${assignment.staff_name}` : (canInteract ? 'Bấm để gán' : 'Chưa gán')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 11px', borderRadius: 14, fontSize: '0.78rem', fontWeight: 700, cursor: canInteract ? 'pointer' : 'default', color, background: bg, border: `1px solid ${border}`, maxWidth: 210, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {assignment ? <>{status === 'proposed' ? '🟡' : '🟢'} {assignment.staff_name}</> : (canInteract ? '+ Gán' : '—')}
        </button>
        {assignment && <span style={{ fontSize: '0.7rem', color: '#64748b', paddingLeft: 2 }}>📅 từ {assignDate(assignment)}</span>}
      </div>
      {open && (
        <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: 370, fontFamily: "'Outfit', sans-serif", boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{isAdmin ? 'Gán nhân sự' : 'Đề xuất nhân sự'}</div>
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
            <div style={{ marginBottom: 12 }}>
              <button onClick={loadHist} style={{ background: 'none', border: 'none', color: '#0891b2', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer', padding: 0 }}>🕘 {hist === null ? 'Xem lịch sử định danh' : 'Tải lại lịch sử'}</button>
              {hist !== null && (
                <div style={{ maxHeight: 150, overflowY: 'auto', marginTop: 6, border: '1px solid #f1f5f9', borderRadius: 8 }}>
                  {hist.length === 0
                    ? <div style={{ padding: 10, fontSize: '0.74rem', color: '#64748b' }}>Chưa có lịch sử</div>
                    : hist.map((h, i) => (
                      <div key={i} style={{ padding: '6px 10px', fontSize: '0.72rem', color: '#475569', borderTop: i ? '1px solid #f1f5f9' : 'none' }}>
                        <b>{HIST_LABEL[h.action] || h.action}</b>{h.staff_name ? ` ${h.staff_name}` : ''} · {h.brand_name || '—'} · <span style={{ color: '#64748b' }}>{h.actor || '?'} · {new Date(h.created_at).toLocaleString('vi-VN')}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
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

// ── Thẻ 1 KOC tìm được trên TikTok → dùng LUÔN KocAssignCell (hiện sẵn ai đang gán, bấm vào để
// gỡ / gán lại / xem lịch sử — y hệt thẻ ở lưới dưới, cùng luật approved/proposed + cooldown).
function NewKocResultCard({ c, brand, assignMap, staffNames, currentUser, onChanged, allBrands, blacklist }) {
  const uname = (c.username || '').toLowerCase().replace(/^@/, '');
  const isBlack = blacklist?.has?.(uname);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 9, padding: '9px 12px', border: isBlack ? '1.5px solid #ef4444' : '1px solid #e5e7eb', flexWrap: 'wrap' }}>
      {c.avatar ? <img src={c.avatar} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#f1f5f9' }} />}
      <div style={{ minWidth: 140 }}>
        <a href={`https://www.tiktok.com/@${uname}`} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontWeight: 700, textDecoration: 'none', fontSize: '0.84rem' }}>@{uname}</a>
        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{c.nickname && c.nickname !== c.username ? c.nickname + ' · ' : ''}{fmtNum(c.followers)} follower</div>
      </div>
      <span style={{ marginLeft: 'auto' }}>
        {isBlack
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 14, fontSize: '0.76rem', fontWeight: 800, color: '#fff', background: '#ef4444' }}>⛔ BLACKLIST — không gán</span>
          : <KocAssignCell username={uname} brand={brand} assignments={assignMap?.[uname]} staffNames={staffNames} currentUser={currentUser} onChanged={onChanged} allBrands={allBrands} />}
      </span>
    </div>
  );
}

export default function KocPerformanceTab() {
  const [shops, setShops]   = useState([]);
  const [shopId, setShopId] = useState('');
  const [start, setStart]   = useState(FLOOR);
  const [end, setEnd]       = useState(toYmd(new Date()));
  const [noteOpen, setNoteOpen] = useState(null); // KPI nào đang mở ghi chú (bấm ⓘ)
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
  const [serverHits, setServerHits] = useState([]);     // KOC tìm được phía server (ngoài top-1000 xếp hạng)
  const [serverSearching, setServerSearching] = useState(false);

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
      // Thử tối đa 2 lần — lỗi tạm thời (vd server đang deploy → "Missing env config") tự retry, staff khỏi thấy lỗi
      let j = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await fetch(`${API}?${qs}`);
        j = await r.json().catch(() => ({ ok: false, error: 'Phản hồi không hợp lệ' }));
        if (j.ok) break;
        if (attempt === 0) await new Promise(res => setTimeout(res, 1500));
      }
      if (!j.ok) { setError(j.error || 'Lỗi tải dữ liệu'); setData(null); return; }
      SALES_CACHE.set(key, j);
      setData(j);
    } catch (e) { setError(e.message); setData(null); } finally { setLoading(false); }
  }, [shopId, selSeller, start, end]);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  // Tìm KOC phía SERVER khi gõ tên mà danh sách tại chỗ (đã bị cắt top-1000) không có.
  // → KOC nhỏ (GMV thấp) vẫn tra ra được. Có khớp tại chỗ rồi thì khỏi gọi.
  useEffect(() => {
    const q = search.trim();
    const localHit = (data?.creators || []).some(c => (c.username || '').toLowerCase().includes(q.toLowerCase()));
    if (q.length < 2 || localHit) { setServerHits([]); setServerSearching(false); return; }
    let cancelled = false; setServerSearching(true);
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ action: 'koc_find', q, shop_id: shopId, seller: selSeller, start_date: start, end_date: end });
        const r = await fetch(`${API}?${qs}`);
        const j = await r.json().catch(() => ({ ok: false }));
        if (!cancelled) setServerHits(j.ok && Array.isArray(j.creators) ? j.creators : []);
      } catch { if (!cancelled) setServerHits([]); }
      finally { if (!cancelled) setServerSearching(false); }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, data, shopId, selSeller, start, end]);

  // ── Định danh KOC: nhân sự + brand (dùng chung bảng koc_brand_assignments) ──
  const { nhanSus } = useAppData();
  const currentUser = useMemo(() => { try { return JSON.parse(localStorage.getItem('sk_session')) || JSON.parse(sessionStorage.getItem('sk_session')); } catch { return null; } }, []);
  const staffNames = useMemo(() => [...new Set((nhanSus || []).map(i => i?.ten_nhansu || i?.name || '').filter(n => n && !HIDDEN_STAFF.includes(n)))].sort((a, b) => a.localeCompare(b, 'vi')), [nhanSus]);
  const brand = useMemo(() => brandOfShop(selSeller), [selSeller]);
  const allBrands = useMemo(() => [...new Set((shops || []).map(s => brandOfShop(s.seller_name)))].filter(b => b && b !== '—'), [shops]);
  const [assignMap, setAssignMap] = useState({});
  const [proposedRows, setProposedRows] = useState([]);   // nguồn độc lập cho chuông "đề xuất chờ duyệt"
  const [showAssignPanel, setShowAssignPanel] = useState(true);
  const [showPendingTop, setShowPendingTop] = useState(false);
  const [assignShow, setAssignShow] = useState(48);
  // ── Lịch sử gắn tag (koc_assignment_history): xem đã gắn cho ai, ai gắn, lúc nào ──
  const [histOpen, setHistOpen] = useState(false);
  const [histRows, setHistRows] = useState(null);   // null = chưa tải
  const [histLoading, setHistLoading] = useState(false);
  const [histAllBrands, setHistAllBrands] = useState(false); // false = chỉ brand đang xem
  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    let qb = supabase.from(HIST_TABLE)
      .select('koc_id, brand_name, staff_name, action, actor, created_at')
      .order('created_at', { ascending: false }).limit(300);
    if (!histAllBrands) qb = qb.eq('brand_name', brand);
    const { data } = await qb;
    setHistRows(data || []); setHistLoading(false);
  }, [brand, histAllBrands]);
  useEffect(() => { if (histOpen) loadHistory(); }, [histOpen, loadHistory]);
  const reloadAssignments = useCallback(async () => {
    // Load TẤT CẢ assignment (mọi brand) → mỗi KOC biết được gán ở brand hiện tại + brand khác.
    // Đọc theo trang (Supabase cắt 1000 dòng/lượt — đã 679 dòng, vượt là thẻ định danh "mất" ngẫu nhiên).
    let data = [];
    for (let pg = 0; pg < 10; pg++) {
      const { data: chunk } = await supabase.from(ASSIGN_TABLE)
        .select('koc_id, brand_name, staff_name, status, proposed_by, proposed_at, approved_by, approved_at, assigned_at')
        // BẮT BUỘC có ORDER BY ổn định: .range() không kèm order → phân trang KHÔNG ổn định,
        // >1000 dòng bị sót/nhân đôi ngẫu nhiên (đề xuất proposed từng biến mất khỏi chuông báo).
        .order('koc_id', { ascending: true }).order('brand_name', { ascending: true })
        .range(pg * 1000, (pg + 1) * 1000 - 1);
      data = data.concat(chunk || []);
      if (!chunk || chunk.length < 1000) break;
    }
    const m = {}; (data || []).forEach(a => { const k = (a.koc_id || '').toLowerCase(); (m[k] = m[k] || []).push(a); });
    setAssignMap(m);
    // Nguồn ĐỘC LẬP cho chuông "đề xuất chờ duyệt": query THẲNG status='proposed' (tập rất nhỏ,
    // luôn đủ, không dính bẫy 1000 dòng) → chuông không bao giờ sót đề xuất dù assignMap lớn.
    const { data: prop } = await supabase.from(ASSIGN_TABLE)
      .select('koc_id, brand_name, staff_name, proposed_by, proposed_at, approved_at, assigned_at')
      .eq('status', 'proposed');
    setProposedRows((prop || []).map(a => ({ koc: (a.koc_id || '').toLowerCase(), status: 'proposed', ...a })));
  }, []);
  useEffect(() => { reloadAssignments(); }, [reloadAssignments]);

  // ── Tìm KOC MỚI (chưa từng làm cho brand này → koc_find/koc_orders không tra ra) để gắn
  // tag TRƯỚC khi họ lên clip. Nếu đợi lên clip rồi mới gắn thì clip air trước đó không được
  // tính cho nhân sự (Khánh chốt 2/7). Tìm thẳng trên TikTok qua action=koc_search_creator.
  const [newKocQ, setNewKocQ] = useState('');
  const [newKocResults, setNewKocResults] = useState(null);
  const [newKocSearching, setNewKocSearching] = useState(false);
  const [newKocError, setNewKocError] = useState('');
  const searchNewKoc = useCallback(async () => {
    const q = newKocQ.trim();
    if (q.length < 2) { setNewKocError('Gõ ít nhất 2 ký tự'); return; }
    setNewKocSearching(true); setNewKocError(''); setNewKocResults(null);
    try {
      const qs = new URLSearchParams({ action: 'koc_search_creator', q, seller: selSeller });
      const r = await fetch(`${API}?${qs}`);
      const j = await r.json().catch(() => ({ ok: false }));
      if (!j.ok) { setNewKocError(j.error || 'Không tìm được'); setNewKocResults([]); }
      else { setNewKocResults(j.creators || []); if ((j.creators || []).length === 0 && j.note) setNewKocError(j.note); }
    } catch (e) { setNewKocError(e.message); setNewKocResults([]); }
    finally { setNewKocSearching(false); }
  }, [newKocQ, selSeller]);

  // Phase 3 — cảnh báo 45 ngày 0 video (RPC koc_assignment_warnings)
  const [warnMap, setWarnMap] = useState({});
  const reloadWarnings = useCallback(async () => {
    if (!brand || !shopId) { setWarnMap({}); return; }
    const { data } = await supabase.rpc('koc_assignment_warnings', { p_shop_id: String(shopId), p_brand: brand });
    const m = {}; (data || []).forEach(w => { m[(w.koc_id || '').toLowerCase()] = w; });
    setWarnMap(m);
  }, [brand, shopId]);
  useEffect(() => { reloadWarnings(); }, [reloadWarnings]);
  // Nạp lại cảnh báo mỗi khi số liệu shop tải xong → warnMap luôn khớp DB mới nhất (chống hiện cảnh báo cũ)
  useEffect(() => { if (data) reloadWarnings(); }, [data, reloadWarnings]);
  const refreshAssign = useCallback(() => { reloadAssignments(); reloadWarnings(); }, [reloadAssignments, reloadWarnings]);
  // ĐỀ XUẤT GỠ theo HẠN limit_days (RPC koc_assignment_warnings):
  //  · TAG ORDER (KOC chưa air clip nào) -> hạn 30 ngày kể từ gắn tag.
  //  · Tag thường (KOC đã có clip) -> hạn 45 ngày kể từ AIR GẦN NHẤT (air là gia hạn, bất kể ngày gắn tag).
  // days_since_air = số ngày kể từ air gần nhất (hoặc từ ngày gắn tag nếu chưa air).
  const overdueWarns = useMemo(() => Object.values(warnMap)
    .filter(w => (w.days_since_air ?? w.days_since ?? 0) >= (w.limit_days ?? 45))
    .sort((a, b) => (b.days_since_air ?? b.days_since ?? 0) - (a.days_since_air ?? a.days_since ?? 0)), [warnMap]);
  const removeAssign = async (kocId) => {
    if (!confirm(`Loại định danh @${kocId} khỏi brand ${brand}? (quá 45 ngày kể từ clip air gần nhất)`)) return;
    // Gỡ qua RPC server (chắc ăn + ghi lịch sử) thay vì delete client (bundle cũ từng xoá hụt)
    const { data, error } = await supabase.rpc('koc_remove_assignment', { p_koc: kocId, p_brand: brand, p_actor: currentUser?.username || 'admin' });
    if (error) { alert('Lỗi gỡ định danh: ' + error.message); return; }
    if (!data) { alert(`Không tìm thấy định danh @${kocId} ở brand ${brand} (có thể đã gỡ rồi).`); }
    refreshAssign();
  };

  // KOC blacklist → đỏ cảnh báo + (admin) tự gỡ TOÀN BỘ định danh của KOC đó
  const [blacklist, setBlacklist] = useState(() => new Set());
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  useEffect(() => {
    (async () => { // blacklist 888 kênh, sắp vượt trần 1000 dòng/lượt của Supabase → đọc theo trang
      let all = [];
      for (let pg = 0; pg < 10; pg++) {
        const { data } = await supabase.from('koc_blacklist').select('id_kenh').range(pg * 1000, (pg + 1) * 1000 - 1);
        all = all.concat(data || []);
        if (!data || data.length < 1000) break;
      }
      setBlacklist(new Set(all.map(r => (r.id_kenh || '').toLowerCase().replace(/^@/, ''))));
    })().catch(() => {});
  }, []);
  // Cast GẦN NHẤT mỗi KOC (đối chiếu file Thanh toán KOC) → thẻ định danh tô cam + ghi giá cast
  const [castMap, setCastMap] = useState({});
  useEffect(() => {
    supabase.rpc('koc_latest_cast').then(({ data }) => {
      const m = {};
      for (const r of (data || [])) { const u = (r.uname || '').toLowerCase().replace(/^@/, ''); if (u) m[u] = { cast: Number(r.last_cast) || 0, date: r.last_date }; }
      setCastMap(m);
    }, () => {});
  }, []);
  // ── ƯU TIÊN KOC: quản lý sàn bấm "Ưu tiên" -> gia hạn 10 ngày kể từ lúc bấm (KOC rời list gỡ 10 ngày). ──
  const PRIO_DAYS = 10;
  const [prioMap, setPrioMap] = useState({});   // { koc_id(lower): prioritized_at ISO }
  const loadPrio = useCallback(async () => {
    if (!brand) { setPrioMap({}); return; }
    const { data } = await supabase.from('koc_tag_priority').select('koc_id, prioritized_at').eq('brand_name', brand);
    const m = {}; (data || []).forEach(r => { const u = (r.koc_id || '').toLowerCase().replace(/^@/, ''); if (u) m[u] = r.prioritized_at; });
    setPrioMap(m);
  }, [brand]);
  useEffect(() => { loadPrio(); }, [loadPrio]);
  const prioLeft = useCallback((kocId) => {   // số ngày ưu tiên còn lại (0 = không/đã hết)
    const at = prioMap[(kocId || '').toLowerCase().replace(/^@/, '')];
    if (!at) return 0;
    const left = PRIO_DAYS - Math.floor((Date.now() - new Date(at).getTime()) / 86400000);
    return left > 0 ? left : 0;
  }, [prioMap]);
  const requestPriority = async (kocId) => {
    if (!confirm(`⭐ Xin ưu tiên @${kocId}? Gia hạn thêm ${PRIO_DAYS} ngày kể từ bây giờ (KOC rời danh sách đề xuất gỡ ${PRIO_DAYS} ngày).`)) return;
    const { error } = await supabase.from('koc_tag_priority').upsert(
      { koc_id: kocId, brand_name: brand, prioritized_at: new Date().toISOString(), prioritized_by: currentUser?.username || '' },
      { onConflict: 'koc_id,brand_name' });
    if (error) { alert('Lỗi xin ưu tiên: ' + error.message); return; }
    loadPrio();
  };
  // Bỏ khỏi đề xuất gỡ: KOC đã book cast (đã trả tiền) HOẶC đang trong hạn ưu tiên (quản lý sàn xin thêm 10 ngày).
  const overdueWarnsCast = useMemo(
    () => overdueWarns.filter(w => !castMap[(w.koc_id || '').toLowerCase().replace(/^@/, '')] && prioLeft(w.koc_id) === 0),
    [overdueWarns, castMap, prioLeft]
  );
  // ── Admin chờ duyệt: đề xuất GÁN (ecom) + đề xuất GỠ (hệ thống: blacklist / 45 ngày) ──
  // Dùng nguồn proposedRows (query thẳng status='proposed') — KHÔNG lọc từ assignMap (dính bẫy 1000 dòng).
  const pendingProposals = useMemo(() => {
    if (currentUser?.role !== 'admin') return [];
    return proposedRows.filter(a => a.brand_name === brand);
  }, [proposedRows, brand, currentUser]);
  // ── TẤT CẢ đề xuất GÁN chờ duyệt (MỌI brand) → chuông thông báo đầu trang cho admin ──
  const allPendingProposals = useMemo(() => {
    if (currentUser?.role !== 'admin') return [];
    return [...proposedRows].sort((x, y) => new Date(y.proposed_at || 0) - new Date(x.proposed_at || 0));
  }, [proposedRows, currentUser]);
  // KOC vào blacklist → TỰ ĐỘNG gỡ hết định danh (mọi brand), khỏi cần bấm "Duyệt gỡ" thủ công.
  const purgedRef = useRef(false);
  useEffect(() => {
    if (currentUser?.role !== 'admin') return; // CHỈ admin tự-gỡ; booking/ecom chỉ XEM (kẻo churn assignMap → lắc panel)
    if (!blacklist.size || !Object.keys(assignMap).length || purgedRef.current) return;
    if (!Object.keys(assignMap).some(k => blacklist.has(k))) return;   // không có KOC blacklist nào còn định danh
    purgedRef.current = true;
    supabase.rpc('koc_purge_blacklist_assignments', { p_actor: currentUser?.username || 'auto' })
      .then(({ data }) => { if (data) reloadAssignments(); }, () => { purgedRef.current = false; });
  }, [assignMap, blacklist, currentUser, reloadAssignments]);
  // Sau khi auto-gỡ ở trên, danh sách này còn rỗng — giữ lại phòng trường hợp purge chưa chạy xong.
  const blacklistAssigned = useMemo(() => {
    if (!['admin', 'ecom', 'booking'].includes(currentUser?.role) || !blacklist.size) return [];
    return Object.entries(assignMap)
      .filter(([koc, arr]) => blacklist.has(koc) && (arr || []).some(a => a.brand_name === brand))
      .map(([koc, arr]) => ({ koc, staff_name: (arr.find(a => a.brand_name === brand) || {}).staff_name || '' }));
  }, [assignMap, blacklist, brand, currentUser]);
  const approveProposal = async (p) => {
    const nowIso = new Date().toISOString();
    await supabase.from(ASSIGN_TABLE).upsert({ koc_id: p.koc, brand_name: brand, staff_name: p.staff_name, status: 'approved', approved_by: currentUser?.username || '', approved_at: nowIso, updated_at: nowIso, assigned_at: p.assigned_at, proposed_by: p.proposed_by, proposed_at: p.proposed_at }, { onConflict: 'koc_id,brand_name' });
    supabase.from(HIST_TABLE).insert({ koc_id: p.koc, brand_name: brand, staff_name: p.staff_name, action: 'approve', actor: currentUser?.username || '' }).then(() => {}, () => {});
    refreshAssign();
  };
  const rejectProposal = async (p) => {
    await supabase.from(ASSIGN_TABLE).delete().eq('koc_id', p.koc).eq('brand_name', brand);
    supabase.from(HIST_TABLE).insert({ koc_id: p.koc, brand_name: brand, staff_name: p.staff_name, action: 'remove', actor: (currentUser?.username || '') + ' (từ chối)' }).then(() => {}, () => {});
    refreshAssign();
  };
  // Duyệt / từ chối theo ĐÚNG brand của đề xuất (dùng cho bảng thông báo đầu trang — gom mọi brand)
  const approveProposalAny = async (p) => {
    const nowIso = new Date().toISOString();
    await supabase.from(ASSIGN_TABLE).upsert({ koc_id: p.koc, brand_name: p.brand_name, staff_name: p.staff_name, status: 'approved', approved_by: currentUser?.username || '', approved_at: nowIso, updated_at: nowIso, assigned_at: p.assigned_at, proposed_by: p.proposed_by, proposed_at: p.proposed_at }, { onConflict: 'koc_id,brand_name' });
    supabase.from(HIST_TABLE).insert({ koc_id: p.koc, brand_name: p.brand_name, staff_name: p.staff_name, action: 'approve', actor: currentUser?.username || '' }).then(() => {}, () => {});
    refreshAssign();
  };
  const rejectProposalAny = async (p) => {
    await supabase.from(ASSIGN_TABLE).delete().eq('koc_id', p.koc).eq('brand_name', p.brand_name);
    supabase.from(HIST_TABLE).insert({ koc_id: p.koc, brand_name: p.brand_name, staff_name: p.staff_name, action: 'remove', actor: (currentUser?.username || '') + ' (từ chối)' }).then(() => {}, () => {});
    refreshAssign();
  };

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
    let base = (data?.creators || []).filter(c => !q || (c.username || '').toLowerCase().includes(q));
    if (q && base.length === 0 && serverHits.length) base = serverHits;   // dùng kết quả server cho KOC ngoài top-1000
    const cs = base.map(c => ({ ...c, roas: roasOf(c.gmv, c.commission, c.cast, c.sample_cost) }));
    return [...cs].sort((a, b) => (Number(b[sortKey]) || 0) - (Number(a[sortKey]) || 0));
  }, [data, sortKey, search, serverHits]);
  // Phân trang bảng KOC (mặc định 20 dòng/trang) — khỏi kéo dài cả 1000 dòng
  const [kocPage, setKocPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  useEffect(() => { setKocPage(1); }, [rows, pageSize]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageOffset = (kocPage - 1) * pageSize;
  const pagedRows = rows.slice(pageOffset, pageOffset + pageSize);
  // Panel định danh: lọc "chỉ KOC chưa định danh (brand này) + không blacklist" để gán nhanh
  const assignRows = useMemo(() => {
    const q = search.trim();
    if (onlyUnassigned) {
      return rows.filter(c => {
        const u = (c.username || '').toLowerCase().replace(/^@/, '');
        if (blacklist.has(u)) return false;
        return !((assignMap[u] || []).some(a => a.brand_name === brand));
      });
    }
    if (q) return rows; // đang search: giữ nguyên kết quả search
    // KHÔNG search: LUÔN kèm KOC đã định danh brand này dù GMV kỳ = 0 (không có trong data.creators của kỳ) →
    // gỡ/quản tag không bị "mất thẻ". Xếp GMV kỳ: KOC 0đ nằm cuối, KOC có doanh số vẫn đúng thứ hạng.
    const present = new Set(rows.map(c => (c.username || '').toLowerCase().replace(/^@/, '')));
    const extra = [];
    for (const [u, arr] of Object.entries(assignMap)) {
      if (present.has(u) || blacklist.has(u)) continue;
      if ((arr || []).some(a => a.brand_name === brand && a.staff_name)) extra.push({ username: u, gmv: 0, vperiod: 0 });
    }
    return extra.length ? [...rows, ...extra] : rows;
  }, [rows, onlyUnassigned, assignMap, brand, blacklist, search]);
  const totals = data?.totals || { gmv: 0, orders: 0, commission: 0, views: 0, cast: 0 };
  const sync = data?.sync;
  const countSync = data?.count_sync;
  const fillSub = countSync?.filling
    ? `⏳ đang cào · cập nhật lúc ${countSync.last_run_at ? new Date(countSync.last_run_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—'}`
    : null;

  // ĐÈN BÁO TỰ KIỂM view: data view-tháng đang xem còn tươi (cron sống) hay đứng (nghi thiếu)
  const vh = data?.view_health;
  const viewHealth = (!vh || !vh.watching) ? null : (() => {
    const h = vh.hours;
    const when = h == null ? 'chưa có data' : h < 1 ? 'vừa xong' : h < 24 ? `${h}h trước` : `${Math.round(h / 24)} ngày trước`;
    return vh.level === 'warn'
      ? { ok: false, text: `⚠️ View tháng này ${when} chưa cập nhật — nghi sync đứng, số có thể thiếu. Bấm "Tải lại" / kiểm cron.`, color: '#b45309', bg: '#fffbeb', border: '#fde68a' }
      : { ok: true, text: `✅ View tháng này cập nhật ${when} — cron đang chạy, số đang đủ dần.`, color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' };
  })();

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
  const pgBtn = (active, disabled) => ({ padding: '6px 11px', borderRadius: 8, border: `1px solid ${active ? ACCENT : '#e5e7eb'}`, background: active ? ACCENT : '#fff', color: active ? '#fff' : (disabled ? '#cbd5e1' : '#64748b'), fontSize: '0.78rem', fontWeight: 700, cursor: disabled ? 'default' : 'pointer', minWidth: 34 });

  const th = { padding: '10px 12px', fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'right', whiteSpace: 'nowrap' };
  const td = { padding: '9px 12px', fontSize: '0.86rem', color: '#0f172a', textAlign: 'right', whiteSpace: 'nowrap', borderTop: '1px solid #f1f5f9' };

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', margin: '0 0 4px' }}>🌟 Hiệu suất KOC</h1>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 14px' }}>
            Doanh số thật KOC mang về cho shop (đơn affiliate) {data?.shop && <b style={{ color: ACCENT }}>· {data.shop}</b>}
          </p>
        </div>
        {/* 🔔 Nút chuông thông báo — đề xuất gắn KOC chờ duyệt (chỉ admin) */}
        {currentUser?.role === 'admin' && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => { setShowPendingTop(v => !v); reloadAssignments(); }} title="Đề xuất gắn KOC chờ duyệt (bấm để tải mới)"
              style={{ position: 'relative', width: 46, height: 46, borderRadius: 12, border: `1px solid ${allPendingProposals.length > 0 ? '#fcd34d' : '#e5e7eb'}`, background: allPendingProposals.length > 0 ? '#fffbeb' : '#fff', cursor: 'pointer', fontSize: '1.35rem', lineHeight: 1, boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
              🔔
              {allPendingProposals.length > 0 && (
                <span style={{ position: 'absolute', top: -7, right: -7, background: '#dc2626', color: '#fff', fontSize: '0.7rem', fontWeight: 800, borderRadius: 999, minWidth: 21, height: 21, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', border: '2px solid #fff' }}>{allPendingProposals.length}</span>
              )}
            </button>
            {showPendingTop && (
              <div style={{ position: 'absolute', right: 0, top: 54, width: 460, maxWidth: '92vw', background: '#fff', border: '1px solid #fcd34d', borderRadius: 14, boxShadow: '0 12px 34px rgba(15,23,42,0.20)', zIndex: 60, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #fef3c7', background: '#fffbeb' }}>
                  <span style={{ fontWeight: 800, color: '#b45309', fontSize: '0.9rem' }}>🔔 {allPendingProposals.length} đề xuất gắn KOC chờ duyệt</span>
                  <span onClick={() => setShowPendingTop(false)} style={{ cursor: 'pointer', color: '#b45309', fontWeight: 800, fontSize: '1rem', lineHeight: 1 }}>✕</span>
                </div>
                <div style={{ maxHeight: 420, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {allPendingProposals.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.82rem', padding: '18px 0' }}>🎉 Không có đề xuất nào chờ duyệt.</div>
                  ) : allPendingProposals.map(p => (
                    <div key={'topp-' + p.brand_name + '-' + p.koc} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.79rem', background: '#fffdf7', borderRadius: 9, padding: '9px 11px', border: '1px solid #fde68a', flexWrap: 'wrap' }}>
                      <a href={`https://www.tiktok.com/@${p.koc}`} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontWeight: 800, textDecoration: 'none' }}>@{p.koc}</a>
                      <span style={{ background: '#fff7ed', color: '#e85518', fontWeight: 700, fontSize: '0.7rem', borderRadius: 7, padding: '2px 8px', border: '1px solid #fed7aa' }}>{p.brand_name}</span>
                      <span style={{ width: '100%', color: '#475569', fontSize: '0.74rem' }}>Gắn cho NS <b style={{ color: '#0f172a' }}>{p.staff_name}</b> · đề xuất bởi <b style={{ color: '#64748b' }}>{p.proposed_by || '?'}</b>{p.proposed_at ? ` · ${new Date(p.proposed_at).toLocaleString('vi-VN')}` : ''}</span>
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button onClick={() => approveProposalAny(p)} style={{ padding: '5px 14px', borderRadius: 7, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a', fontWeight: 800, fontSize: '0.76rem', cursor: 'pointer' }}>✓ Duyệt</button>
                        <button onClick={() => rejectProposalAny(p)} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer' }}>✕ Từ chối</button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter bar — nằm ngang */}
      <div style={{ display: 'flex', gap: 10, rowGap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
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

      {/* Tìm & GẮN KOC MỚI — CHỈ admin (gán = duyệt) + ecom (chỉ đề xuất). Role khác không thấy/không đụng. */}
      {['admin', 'ecom'].includes(currentUser?.role) && (
        <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 12, padding: '16px 18px', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>🔎 Tìm & gắn KOC MỚI</div>
            <span style={{ background: '#7c3aed', color: '#fff', fontWeight: 800, fontSize: '0.72rem', padding: '3px 11px', borderRadius: 999, letterSpacing: '0.3px' }}>🏷️ TAG ORDER · hạn 30 ngày</span>
            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>chưa từng làm cho <b style={{ color: ACCENT }}>{brand}</b></div>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>
            KOC đã <b>nhận order / mẫu</b> nhưng <b>chưa air clip nào</b> (nên không có trong lưới, phải tìm tay) — gắn tag ở đây để clip air sau này được tính cho nhân sự. Nhập <b>đúng @kênh TikTok</b> (dán link kênh cũng được).
            <br /><b style={{ color: '#7c3aed' }}>⏱️ Tag order có hạn 30 NGÀY phải lên clip</b> (khác 45 ngày của KOC đã có clip) — quá hạn mà chưa air sẽ vào danh sách đề xuất gỡ.
            {currentUser?.role === 'admin' ? ' Bạn gán là duyệt luôn 🟢.' : ' Bạn gửi đề xuất 🟡, admin duyệt sau.'}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={newKocQ} onChange={e => setNewKocQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchNewKoc()}
              placeholder="@kênh TikTok (vd: heomoi1707) hoặc dán link kênh…" style={{ ...inputStyle, flex: '1 1 340px', minWidth: 260, padding: '11px 14px', fontSize: '0.9rem' }} />
            <button onClick={searchNewKoc} disabled={newKocSearching}
              style={{ padding: '11px 26px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', opacity: newKocSearching ? 0.6 : 1 }}>
              {newKocSearching ? 'Đang tìm…' : '🔎 Tìm'}
            </button>
          </div>
          {newKocError && <div style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: 10 }}>⚠️ {newKocError}</div>}
          {newKocResults && newKocResults.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {newKocResults.map(c => (
                <NewKocResultCard key={c.username || c.open_id} c={c} brand={brand} assignMap={assignMap} staffNames={staffNames} currentUser={currentUser} onChanged={() => { refreshAssign(); if (histOpen) loadHistory(); }} allBrands={allBrands} blacklist={blacklist} />
              ))}
            </div>
          )}
          {/* ── Lịch sử gắn tag ── */}
          <div style={{ marginTop: 14, borderTop: '1px dashed #fed7aa', paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={() => setHistOpen(v => !v)} style={{ background: 'none', border: 'none', color: '#0891b2', fontWeight: 800, fontSize: '0.86rem', cursor: 'pointer', padding: 0 }}>
                🕘 {histOpen ? '▲ Ẩn lịch sử gắn tag' : '▼ Xem lịch sử gắn tag'}
              </button>
              {histOpen && (
                <label style={{ fontSize: '0.76rem', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={histAllBrands} onChange={e => setHistAllBrands(e.target.checked)} /> Xem tất cả brand (bỏ chọn = chỉ {brand})
                </label>
              )}
            </div>
            {histOpen && (
              <div style={{ marginTop: 10 }}>
                {histLoading && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Đang tải…</div>}
                {!histLoading && histRows && (() => {
                  const assignCnt = histRows.filter(h => h.action === 'assign' || h.action === 'approve').length;
                  const removeCnt = histRows.filter(h => h.action === 'remove').length;
                  return (
                    <>
                      <div style={{ fontSize: '0.78rem', color: '#334155', marginBottom: 8 }}>
                        📊 {histRows.length} thao tác gần nhất{histAllBrands ? ' (mọi brand)' : ` (brand ${brand})`} · <b style={{ color: '#16a34a' }}>{assignCnt} lượt gán/duyệt</b> · <b style={{ color: '#dc2626' }}>{removeCnt} lượt gỡ</b>
                      </div>
                      {histRows.length === 0
                        ? <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Chưa có lịch sử.</div>
                        : (
                        <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #fed7aa', borderRadius: 10, background: '#fff' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                            <thead>
                              <tr style={{ position: 'sticky', top: 0, background: '#fff7ed', zIndex: 1 }}>
                                <th style={{ textAlign: 'left', padding: '8px 10px', color: '#92400e', fontWeight: 700, whiteSpace: 'nowrap' }}>Thời gian</th>
                                <th style={{ textAlign: 'left', padding: '8px 10px', color: '#92400e', fontWeight: 700 }}>@KOC</th>
                                {histAllBrands && <th style={{ textAlign: 'left', padding: '8px 10px', color: '#92400e', fontWeight: 700 }}>Brand</th>}
                                <th style={{ textAlign: 'left', padding: '8px 10px', color: '#92400e', fontWeight: 700 }}>Nhân sự</th>
                                <th style={{ textAlign: 'left', padding: '8px 10px', color: '#92400e', fontWeight: 700 }}>Hành động</th>
                                <th style={{ textAlign: 'left', padding: '8px 10px', color: '#92400e', fontWeight: 700 }}>Người thao tác</th>
                              </tr>
                            </thead>
                            <tbody>
                              {histRows.map((h, i) => (
                                <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '7px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>{h.created_at ? new Date(h.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                  <td style={{ padding: '7px 10px' }}><a href={`https://www.tiktok.com/@${h.koc_id}`} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontWeight: 700, textDecoration: 'none' }}>@{h.koc_id}</a></td>
                                  {histAllBrands && <td style={{ padding: '7px 10px', color: '#475569', fontWeight: 600 }}>{h.brand_name}</td>}
                                  <td style={{ padding: '7px 10px', color: '#0f172a', fontWeight: 600 }}>{h.staff_name || '—'}</td>
                                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{HIST_LABEL[h.action] || h.action}</td>
                                  <td style={{ padding: '7px 10px', color: '#64748b' }}>{h.actor || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {sync && (
        <div style={{ fontSize: '0.74rem', color: '#64748b', margin: '0 0 14px' }}>
          🔄 Đồng bộ tới <b>{sync.newest_date || '—'}</b> · {fmtNum(sync.total_synced)} dòng đơn ·{' '}
          {sync.backfill_done ? <span style={{ color: '#16a34a', fontWeight: 700 }}>đã đủ từ 01/04/2026</span> : <span style={{ color: ACCENT, fontWeight: 700 }}>đang backfill về 01/04/2026…</span>}
          {sync.last_run_at && ` · lần cuối ${new Date(sync.last_run_at).toLocaleString('vi-VN')}`}
        </div>
      )}

      {!loading && data && (
        (() => {
          const __cards = [
            { label: 'Tổng GMV', value: `${fmtVnd(totals.gmv)} đ`, icon: '💰' },
            { label: 'GMV Video', value: `${fmtVnd(totals.gmv_video || 0)} đ`, icon: '🎬' },
            { label: 'GMV Live', value: `${fmtVnd(totals.gmv_live || 0)} đ`, icon: '📺' },
            { label: 'GMV thẻ SP', value: `${fmtVnd((totals.gmv_linkshare || 0) + (totals.gmv_shop || 0))} đ`, icon: '🔗', note: 'GMV thẻ sản phẩm của liên kết = GMV LinkShare + GMV Shop (gộp như TikTok). LinkShare = mua qua link giỏ hàng/thẻ SP; Shop = mua từ tab cửa hàng. Trên TikTok hiện chung 1 ô "GMV thẻ sản phẩm của liên kết".' },
            { label: 'Số món bán ra', value: fmtNum(totals.qty), icon: '🛒', note: `Tổng SỐ MÓN (số lượng) bán ra qua đơn affiliate — giống "Số món bán ra" của TikTok. 1 đơn có thể nhiều món. (Số đơn riêng: ${fmtNum(totals.orders)}.)` },
            { label: 'Tổng video', value: fmtNum(totals.vtotal_all || totals.vtotal || 0), icon: '🎬', sub: fillSub, note: 'Tổng video shop-wide CÓ TRACTION (view≥100 hoặc có đơn) — đã loại video rác. Đang cào dần theo sync, số sẽ leo tới khi đủ.' },
            { label: 'Video kỳ này', value: fmtNum(totals.vperiod_all || totals.vperiod || 0), icon: '🎞️', sub: fillSub, note: 'Video ĐĂNG trong kỳ, chỉ tính view≥100 hoặc có đơn (loại đuôi rác 0-view-0-đơn). Đang cào dần — "đang cào · giờ" = mới cập nhật tới đó, số chưa đủ 100% sẽ leo lên.' },
            { label: 'Tổng view', value: fmtViews(totals.views), icon: '👁', sub: fillSub, health: viewHealth, note: 'Tổng lượt xem video PHÁT SINH trong kỳ (view-tháng, KHÔNG cộng dồn lũy kế). Mỗi video mỗi tháng 1 dòng "view đẻ trong tháng đó"; chọn kỳ nào thì cộng các tháng trong kỳ. Đèn báo bên dưới cho biết data tháng đang xem còn tươi (cron sống) hay đứng.' },
            { label: 'Tổng cast', value: `${fmtVnd(totals.cast || 0)} đ`, icon: '💵' },
            { label: 'Tổng chi phí mẫu', value: `${fmtVnd(totals.sample_cost || 0)} đ`, icon: '🎁' },
            // { label: 'ROAS tổng', value: fmtRoas(roasOf(totals.gmv, totals.commission, totals.cast, totals.sample_cost)), icon: '📊' }, // TẠM ẨN — ROAS chưa tính chính xác
          ].filter(Boolean);
          const kpiCard = (s) => (
            <div key={s.label} style={{ position: 'relative', height: '100%', minHeight: 150, boxSizing: 'border-box', background: '#fff', borderRadius: 14, padding: '15px 18px', border: '1px solid #eef1f5', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: '#fff4ec', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', flexShrink: 0 }}>{s.icon}</span>
                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{s.label}</span>
                {s.note && (
                  <button onClick={() => setNoteOpen(noteOpen === s.label ? null : s.label)} title="Bấm xem giải thích"
                    style={{ marginLeft: 'auto', width: 18, height: 18, borderRadius: '50%', border: 'none', background: noteOpen === s.label ? ACCENT : '#eef1f5', color: noteOpen === s.label ? '#fff' : '#64748b', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', lineHeight: '18px', padding: 0, flexShrink: 0 }}>i</button>
                )}
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', marginTop: 8 }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: '0.7rem', color: ACCENT, fontWeight: 700, marginTop: 3 }}>{s.sub}</div>}
              {s.health && (
                <div style={{ marginTop: 6, fontSize: '0.7rem', fontWeight: 700, lineHeight: 1.4, color: s.health.color, background: s.health.bg, border: `1px solid ${s.health.border}`, borderRadius: 7, padding: '5px 7px' }}>{s.health.text}</div>
              )}
              {s.note && noteOpen === s.label && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 6, background: '#0f172a', color: '#f1f5f9', fontSize: '0.74rem', lineHeight: 1.55, padding: '11px 13px', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.28)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
                  {s.note}
                  <div onClick={() => setNoteOpen(null)} style={{ marginTop: 8, color: '#fb923c', fontWeight: 700, cursor: 'pointer', fontSize: '0.72rem' }}>✕ Đóng</div>
                </div>
              )}
            </div>
          );
          const zone = (slice, label) => (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 7 }}>{label}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gridAutoRows: '1fr', gap: 12 }}>{slice.map(kpiCard)}</div>
            </div>
          );
          return (<>
            {zone(__cards.slice(0, 5), '💰 Doanh thu (GMV)')}
            {zone(__cards.slice(5, 8), '🎬 Video & lượt xem')}
            {zone(__cards.slice(8), '💸 Chi phí')}
          </>);
        })())}

      {loading && <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>⏳ Đang tải doanh số…</div>}
      {!loading && error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 20, color: '#b91c1c', fontSize: '0.86rem' }}>
          ❌ {error}<button onClick={() => fetchSales(true)} style={{ marginLeft: 12, padding: '4px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>Thử lại</button>
        </div>
      )}
      {!loading && !error && data && rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: 50, color: '#64748b', fontSize: '0.88rem' }}>
          {serverSearching ? `🔎 Đang tìm KOC "${search}"…`
            : search ? <>Không tìm thấy KOC "{search}" trong khoảng ngày / shop này.<br /><span style={{ fontSize: '0.8rem' }}>Thử đổi sang khoảng "Tất cả" hoặc bỏ chọn shop cụ thể.</span></>
            : <>Chưa có đơn affiliate trong khoảng này.<br /><span style={{ fontSize: '0.8rem' }}>Nếu shop vừa kết nối, dữ liệu đang được đồng bộ — quay lại sau vài phút.</span></>}
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
                  <th style={th} title="Chi phí hàng mẫu gửi KOC trong kỳ đang chọn: cost×1.08 + 5k vận hành + ship (Thường 20k/Hỏa tốc 50k)">🎁 Chi phí mẫu</th>
                  {/* TẠM ẨN ROAS — chưa tính chính xác: <th style={th}>📊 ROAS</th> */}
                  <th style={th}>Gần nhất</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((c, i) => {
                  const rank = pageOffset + i;
                  const open = expanded === c.username;
                  return (
                    <React.Fragment key={c.username || i}>
                      <tr onClick={() => toggleExpand(c.username)} style={{ background: open ? '#fff7ed' : (rank % 2 ? '#fcfcfd' : '#fff'), cursor: 'pointer' }}>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: rank < 3 ? ACCENT : '#64748b' }}>{rank + 1}</td>
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
                        <td style={{ ...td, color: c.sample_cost > 0 ? '#d97706' : '#cbd5e1', fontWeight: c.sample_cost > 0 ? 700 : 400 }}>{c.sample_cost > 0 ? `${fmtVnd(c.sample_cost)} đ` : '—'}</td>
                        {/* TẠM ẨN ROAS — chưa tính chính xác */}
                        <td style={{ ...td, color: '#64748b', fontSize: '0.78rem' }}>{fromUnix(c.last_order)}</td>
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
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '12px 16px', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
              <button onClick={() => setKocPage(p => Math.max(1, p - 1))} disabled={kocPage === 1} style={pgBtn(false, kocPage === 1)}>‹ Trước</button>
              {(() => {
                const pages = []; const show = 7;
                let s = Math.max(1, kocPage - 3); let e = Math.min(totalPages, s + show - 1);
                if (e - s < show - 1) s = Math.max(1, e - show + 1);
                if (s > 1) { pages.push(1); if (s > 2) pages.push('…'); }
                for (let p = s; p <= e; p++) pages.push(p);
                if (e < totalPages) { if (e < totalPages - 1) pages.push('…'); pages.push(totalPages); }
                return pages.map((p, idx) => p === '…'
                  ? <span key={`e${idx}`} style={{ padding: '0 4px', color: '#64748b' }}>…</span>
                  : <button key={p} onClick={() => setKocPage(p)} style={pgBtn(p === kocPage, false)}>{p}</button>);
              })()}
              <button onClick={() => setKocPage(p => Math.min(totalPages, p + 1))} disabled={kocPage === totalPages} style={pgBtn(false, kocPage === totalPages)}>Sau ›</button>
              <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{ marginLeft: 8, padding: '6px 8px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.78rem', color: '#334155', cursor: 'pointer' }}>
                {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}/trang</option>)}
              </select>
            </div>
          )}
          <div style={{ padding: '8px 14px', fontSize: '0.72rem', color: '#64748b', borderTop: '1px solid #f1f5f9' }}>
            💡 Bấm vào 1 KOC để xem sản phẩm họ làm video / kéo đơn (theo đúng khoảng ngày đang chọn).
            {data && data.count > (data.shown || 0) && <span> · Bảng hiển thị top {fmtNum(data.shown)}/{fmtNum(data.count)} KOC theo GMV (tổng phía trên vẫn tính đủ).</span>}
          </div>
        </div>
      )}

      {/* 🏷️ ĐỊNH DANH KOC — panel riêng, dạng thẻ cho rộng rãi / trực quan */}
      {!loading && data && rows.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #eef1f5', marginTop: 18, overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
          <div onClick={() => setShowAssignPanel(v => !v)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', cursor: 'pointer', borderBottom: showAssignPanel ? '1px solid #f1f5f9' : 'none' }}>
            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
              🏷️ Định danh KOC <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.8rem' }}>· {data.shop} → brand <b style={{ color: ACCENT }}>{brand}</b></span>
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>{showAssignPanel ? '▲ Thu gọn' : '▼ Mở'}</span>
          </div>
          {showAssignPanel && (
            <div style={{ padding: 16 }}>
              <p style={{ margin: '0 0 12px', fontSize: '0.74rem', color: '#64748b' }}>
                Gán nhân sự quản lý KOC cho brand này. {currentUser?.role === 'admin' ? 'Bạn gán là duyệt luôn 🟢.' : currentUser?.role === 'ecom' ? 'Bạn gửi đề xuất 🟡, admin duyệt sau.' : 'Chỉ admin/ecom thao tác được.'} Chip viền đứt = đã định danh ở brand khác.
              </p>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                <button onClick={() => { setOnlyUnassigned(v => !v); setAssignShow(48); }}
                  style={{ padding: '6px 14px', borderRadius: 9, border: `1.5px solid ${onlyUnassigned ? ACCENT : '#e5e7eb'}`, background: onlyUnassigned ? '#fff7ed' : '#fff', color: onlyUnassigned ? '#e85518' : '#64748b', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                  🔎 {onlyUnassigned ? `Chỉ chưa định danh (${fmtNum(assignRows.length)})` : 'Chỉ KOC chưa định danh'}
                </button>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>⛔ viền đỏ = KOC blacklist (không gán được)</span>
              </div>
              {['admin', 'ecom', 'booking'].includes(currentUser?.role) && (pendingProposals.length > 0 || blacklistAssigned.length > 0 || overdueWarnsCast.length > 0) && (
                <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {pendingProposals.length > 0 && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontWeight: 800, color: '#b45309', fontSize: '0.86rem', marginBottom: 8 }}>🔔 {pendingProposals.length} đề xuất GÁN chờ duyệt <span style={{ color: '#64748b', fontWeight: 600 }}>(brand {brand})</span></div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {pendingProposals.map(p => (
                          <div key={'pp-' + p.koc} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.78rem', background: '#fff', borderRadius: 8, padding: '7px 10px', border: '1px solid #fde68a', flexWrap: 'wrap' }}>
                            <a href={`https://www.tiktok.com/@${p.koc}`} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontWeight: 700, textDecoration: 'none' }}>@{p.koc}</a>
                            <span style={{ color: '#64748b' }}>NS: <b>{p.staff_name}</b> · đề xuất bởi <b>{p.proposed_by || '?'}</b></span>
                            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                              <button onClick={() => approveProposal(p)} style={{ padding: '5px 14px', borderRadius: 7, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer' }}>✓ Duyệt</button>
                              <button onClick={() => rejectProposal(p)} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer' }}>✕ Từ chối</button>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(blacklistAssigned.length > 0 || overdueWarnsCast.length > 0) && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontWeight: 800, color: '#dc2626', fontSize: '0.86rem', marginBottom: 8 }}>🗑️ Đề xuất GỠ chờ duyệt — {blacklistAssigned.length + overdueWarnsCast.length} KOC <span style={{ color: '#64748b', fontWeight: 600 }}>(brand {brand})</span></div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {blacklistAssigned.map(b => (
                          <div key={'bl-' + b.koc} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.78rem', background: '#fff', borderRadius: 8, padding: '7px 10px', border: '1px solid #fee2e2', flexWrap: 'wrap' }}>
                            <a href={`https://www.tiktok.com/@${b.koc}`} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontWeight: 700, textDecoration: 'none' }}>@{b.koc}</a>
                            <span style={{ color: '#dc2626', fontWeight: 700 }}>⛔ BLACKLIST</span><span style={{ color: '#64748b' }}>· NS: <b>{b.staff_name}</b></span>
                            {currentUser?.role === 'admin'
                              ? <button onClick={() => removeAssign(b.koc)} style={{ marginLeft: 'auto', padding: '5px 14px', borderRadius: 7, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer' }}>Duyệt gỡ</button>
                              : <span style={{ marginLeft: 'auto', color: '#64748b', fontWeight: 600, fontSize: '0.72rem' }}>⏳ chờ admin gỡ</span>}
                          </div>
                        ))}
                        {overdueWarnsCast.map(w => (
                          <div key={'od-' + w.koc_id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.78rem', background: '#fff', borderRadius: 8, padding: '7px 10px', border: '1px solid #fee2e2', flexWrap: 'wrap' }}>
                            <a href={`https://www.tiktok.com/@${w.koc_id}`} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontWeight: 700, textDecoration: 'none' }}>@{w.koc_id}</a>
                            <span style={{ color: '#64748b' }}>NS: <b>{w.staff_name}</b> · {w.last_air
                              ? <>air gần nhất <b>{new Date(w.last_air).toLocaleDateString('vi-VN')}</b> ({w.days_since_air ?? w.days_since} ngày trước · hạn 45)</>
                              : <><b style={{ color: '#7c3aed' }}>🏷️ tag order</b> · chưa air · gán {w.days_since_air ?? w.days_since} ngày (hạn 30)</>}</span>
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                              <button onClick={() => requestPriority(w.koc_id)} title={`Xin ưu tiên — gia hạn thêm ${PRIO_DAYS} ngày`} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #ddd6fe', background: '#f5f3ff', color: '#7c3aed', fontWeight: 800, fontSize: '0.76rem', cursor: 'pointer' }}>⭐ Ưu tiên (+{PRIO_DAYS}n)</button>
                              {currentUser?.role === 'admin'
                                ? <button onClick={() => removeAssign(w.koc_id)} style={{ padding: '5px 14px', borderRadius: 7, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer' }}>Duyệt gỡ</button>
                                : <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.72rem' }}>⏳ chờ admin gỡ</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))', gap: 12 }}>
                {assignRows.slice(0, assignShow).map((c, i) => {
                  const uname = (c.username || '').toLowerCase().replace(/^@/, '');
                  const isBlack = blacklist.has(uname);
                  const cast = !isBlack ? castMap[uname] : null;
                  return (
                    <div key={c.username || i} style={{ border: isBlack ? '2px solid #ef4444' : cast ? '2.5px solid #7c3aed' : '1.5px solid #fed7aa', borderRadius: 12, padding: 12, background: isBlack ? '#fef2f2' : cast ? '#f5f3ff' : '#fffdfb', boxShadow: isBlack ? '0 1px 4px rgba(239,68,68,0.14)' : cast ? '0 3px 14px rgba(124,58,237,0.30)' : '0 1px 3px rgba(255,106,44,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: i < 3 ? ACCENT : '#94a3b8', width: 18, flexShrink: 0 }}>{i + 1}</span>
                        <KocAvatar username={c.username} url={avatarMap[c.username]?.avatar} size={34} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <a href={`https://www.tiktok.com/@${uname}`} target="_blank" rel="noreferrer" style={{ display: 'block', fontWeight: 700, color: ACCENT, fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>@{uname}</a>
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{fmtVnd(c.gmv)}đ · {c.vperiod > 0 ? `${fmtNum(c.vperiod)} video kỳ` : '0 video kỳ'}</div>
                        </div>
                      </div>
                      {cast && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '5px 10px', borderRadius: 9, background: '#ede9fe', border: '1px solid #c4b5fd', fontSize: '0.72rem', fontWeight: 800, color: '#6d28d9' }}>
                          💸 Cast gần nhất: {fmtVnd(cast.cast)}đ{cast.date ? <span style={{ fontWeight: 600, color: '#7c3aed' }}> · {new Date(cast.date).toLocaleDateString('vi-VN')}</span> : null}
                        </div>
                      )}
                      {isBlack
                        ? <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 14, fontSize: '0.76rem', fontWeight: 800, color: '#fff', background: '#ef4444' }}>⛔ BLACKLIST — không gán</div>
                        : cast
                        ? <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 14, fontSize: '0.76rem', fontWeight: 800, color: '#fff', background: '#7c3aed' }} title="KOC đã book cast → không gán nhân sự quản lý">💸 Đã book cast — không gán</div>
                        : <KocAssignCell username={uname} brand={brand} assignments={assignMap[uname]} staffNames={staffNames} currentUser={currentUser} onChanged={refreshAssign} allBrands={allBrands} />}
                      {(() => {
                        if (cast) return null; // KOC đã book cast → không cảnh báo gỡ
                        const w = warnMap[uname];
                        if (!w) return null;
                        const dsa = w.days_since_air ?? w.days_since ?? 0;
                        const lim = w.limit_days ?? 45;                    // 30 = tag order (chưa air) · 45 = tag thường
                        if (dsa < lim - 7 && prioLeft(uname) === 0) return null;   // chưa gần hạn + không ưu tiên → khỏi hiện
                        const pl = prioLeft(uname);
                        if (pl > 0) return <div style={{ marginTop: 7, fontSize: '0.7rem', fontWeight: 700, color: '#6d28d9', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '4px 8px' }}>⭐ Ưu tiên — còn {pl} ngày gia hạn</div>;
                        const cause = w.last_air ? 'kể từ air gần nhất' : '· tag order chưa air';
                        if (dsa >= lim) return <div style={{ marginTop: 7, fontSize: '0.7rem', fontWeight: 700, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '4px 8px' }}>⚠️ {dsa}/{lim} ngày {cause} — đề xuất gỡ</div>;
                        if (dsa >= lim - 7) return <div style={{ marginTop: 7, fontSize: '0.7rem', fontWeight: 700, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '4px 8px' }}>⏳ sắp hết hạn — còn {lim - dsa} ngày ({cause})</div>;
                        return null;
                      })()}
                    </div>
                  );
                })}
              </div>
              {assignRows.length > assignShow && (
                <div style={{ textAlign: 'center', marginTop: 14 }}>
                  <button onClick={() => setAssignShow(n => n + 48)} style={{ padding: '8px 22px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}>
                    Xem thêm ({fmtNum(assignRows.length - assignShow)} KOC)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
