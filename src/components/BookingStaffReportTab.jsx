// src/components/BookingStaffReportTab.jsx
// Báo cáo Booking theo nhân sự — dashboard hiện đại. Lọc theo KHOẢNG NGÀY (như Dashboard Ecom).
// Drawer chi tiết chia 3 mục: 📦 Gửi hàng · 🎯 Hiệu suất · 🔥 Cast. Mỗi mục kèm biểu đồ phù hợp.
// Chi phí mẫu = giống Module 1 Order (cost cột AMIS V2 ×1.08×SL + 5k + ship). CAST ngân sách = max(15tr, GMV×2.2%).
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ScatterChart, Scatter, ZAxis, Cell } from 'recharts';
import { supabase } from '../supabaseClient';

// ── helpers ──────────────────────────────────────────────────────────────────
const num = (n) => Number(n || 0);
const fmt = (n) => num(n).toLocaleString('vi-VN');
const fmtVnd = (n) => {
  const v = num(n);
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + ' tỷ';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + 'K';
  return fmt(v);
};
const fmtView = (n) => {
  const v = num(n);
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return fmt(v);
};
const BUDGET = (gmv) => Math.max(15_000_000, num(gmv) * 0.022); // định mức CAST: max(15tr, GMV×2.2%)
const toYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const rangeLen = (s, e) => Math.max(1, Math.round((new Date(e) - new Date(s)) / 86400000) + 1);

// badge hiệu suất theo ROAS Booking = GMV / CAST đã dùng
function perfBadge(gmv, cast) {
  const g = num(gmv), c = num(cast);
  if (c === 0) return g > 0 ? { label: 'Xuất sắc', color: '#16a34a', bg: '#f0fdf4', roas: Infinity } : { label: '—', color: '#94a3b8', bg: '#f8fafc', roas: 0 };
  const r = g / c;
  if (r >= 15) return { label: 'Xuất sắc', color: '#16a34a', bg: '#f0fdf4', roas: r };
  if (r >= 7) return { label: 'Tốt', color: '#2563eb', bg: '#eff6ff', roas: r };
  if (r >= 3) return { label: 'Trung bình', color: '#d97706', bg: '#fffbeb', roas: r };
  if (r >= 1) return { label: 'Cần tối ưu', color: '#ea580c', bg: '#fff7ed', roas: r };
  return { label: 'Đốt CAST', color: '#dc2626', bg: '#fef2f2', roas: r };
}

const BRAND_COLOR = { BODYMISS: '#3b82f6', EHERB: '#f59e0b', 'EHERB HCM': '#d97706', MILAGANICS: '#ec4899', 'MOAW MOAWS': '#10b981', 'REAL STEEL': '#8b5cf6', HEALMI: '#06b6d4', MASUBE: '#64748b' };
const PIE_PALETTE = ['#3b82f6', '#f59e0b', '#ec4899', '#10b981', '#8b5cf6', '#06b6d4', '#f97316', '#64748b', '#ef4444', '#14b8a6'];

// ── styles ───────────────────────────────────────────────────────────────────
const wrap = { background: '#f1f5f9', minHeight: '100vh', margin: '-20px', padding: '24px 28px', fontFamily: "'Outfit', sans-serif" };
const card = { background: '#fff', borderRadius: 16, boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)', border: '1px solid #f1f5f9' };
// ctrl: width cố định để ghi đè rule global `input,select{width:100%}` (App.css) làm ô lọc bị kéo dài.
const ctrl = { padding: '8px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.84rem', fontWeight: 600, color: '#334155', background: '#fff', boxSizing: 'border-box', fontFamily: "'Outfit', sans-serif" };
const td = { padding: '13px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '0.86rem', color: '#334155', whiteSpace: 'nowrap' };
const th = { padding: '12px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', background: '#f8fafc' };
const labelStyle = { fontSize: '0.66rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 };

const PRESETS = [{ label: 'Hôm qua', days: 1, single: true }, { label: '7 ngày', days: 7 }, { label: '30 ngày', days: 30 }, { label: '90 ngày', days: 90 }];

function BookingStaffReportTab() {
  const [range, setRange] = useState(() => {
    const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 30);
    return { start: toYmd(start), end: toYmd(end) };
  });
  const [rows, setRows] = useState([]);
  const [prevRows, setPrevRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [selStaff, setSelStaff] = useState('');
  const [fProduct, setFProduct] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const setQuick = (p) => {
    if (p.single) { const d = new Date(); d.setDate(d.getDate() - p.days); setRange({ start: toYmd(d), end: toYmd(d) }); }
    else { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - p.days); setRange({ start: toYmd(start), end: toYmd(end) }); }
  };

  const load = useCallback(async () => {
    setLoading(true); setErr(''); setPrevRows([]);
    const len = rangeLen(range.start, range.end);
    const prevEnd = new Date(range.start); prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - (len - 1));
    // 1) Kỳ hiện tại trước → hiện bảng ngay (không chờ kỳ trước).
    const cur = await supabase.rpc('staff_booking_report', { p_from: range.start, p_to: range.end });
    if (cur.error) { setErr(cur.error.message); setRows([]); } else setRows(cur.data || []);
    setLoading(false);
    // 2) Kỳ trước (để tính ▲▼ delta) — gọi tuần tự sau, không chặn UI.
    const prev = await supabase.rpc('staff_booking_report', { p_from: toYmd(prevStart), p_to: toYmd(prevEnd) });
    setPrevRows(prev.error ? [] : (prev.data || []));
  }, [range]);
  useEffect(() => { load(); }, [load]);

  const allStaff = useMemo(() => rows.map(r => r.ten_nhansu), [rows]);
  const filtered = useMemo(() => rows.filter(r =>
    (!selStaff || r.ten_nhansu === selStaff) &&
    (!fProduct || (r.top_product || '').toLowerCase().includes(fProduct.toLowerCase()))
  ), [rows, selStaff, fProduct]);
  // Nhân sự đang xem chi tiết: theo dòng đã bấm, mặc định dòng đầu (GMV cao nhất) → luôn hiện chi tiết bên dưới.
  const selectedRow = useMemo(() => filtered.find(r => r.nhansu_id === selectedId) || filtered[0] || null, [filtered, selectedId]);

  const sumRows = (rs) => rs.reduce((a, r) => ({
    don: a.don + num(r.so_don), mau: a.mau + num(r.so_mau), koc: a.koc + num(r.koc_count),
    gmv: a.gmv + num(r.aff_gmv), video: a.video + num(r.aff_videos), view: a.view + num(r.aff_views),
    cast: a.cast + num(r.cast_used), budget: a.budget + BUDGET(r.aff_gmv), chiphi: a.chiphi + num(r.chi_phi_mau),
  }), { don: 0, mau: 0, koc: 0, gmv: 0, video: 0, view: 0, cast: 0, budget: 0, chiphi: 0 });
  const T = useMemo(() => sumRows(filtered), [filtered]);
  const P = useMemo(() => sumRows(prevRows), [prevRows]);
  const delta = (cur, prev) => prev > 0 ? ((cur - prev) / prev * 100) : (cur > 0 ? 100 : 0);

  const resetFilters = () => { setSelStaff(''); setFProduct(''); };
  const exportExcel = async () => {
    const XLSX = await import('xlsx').then(m => m.default || m);
    const aoa = [['Nhân sự', 'Đơn gửi', 'Mẫu', 'Chi phí mẫu', 'TS/ngày', 'SP chính', 'KOC gắn', 'Video', 'View', 'GMV', 'CAST dùng', 'CAST còn lại', 'ROAS', 'Hiệu suất']];
    filtered.forEach(r => { const b = perfBadge(r.aff_gmv, r.cast_used); const budget = BUDGET(r.aff_gmv);
      aoa.push([r.ten_nhansu, r.so_don, r.so_mau, Math.round(r.chi_phi_mau), r.tan_suat, r.top_product || '', r.koc_count, r.aff_videos, r.aff_views, Math.round(r.aff_gmv), Math.round(r.cast_used), Math.round(budget - r.cast_used), b.roas === Infinity ? '∞' : b.roas.toFixed(1), b.label]); });
    const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BaoCaoNhanSu'); XLSX.writeFile(wb, `bao-cao-nhan-su-${range.start}_${range.end}.xlsx`);
  };

  const KPIS = [
    { label: 'Tổng đơn gửi', val: fmt(T.don), d: delta(T.don, P.don), sub: `${fmt(T.mau)} mẫu`, icon: '📦', color: '#f97316' },
    { label: 'Chi phí mẫu', val: fmtVnd(T.chiphi) + ' đ', d: delta(T.chiphi, P.chiphi), sub: `${T.mau > 0 ? fmtVnd(T.chiphi / T.mau) : 0}/mẫu`, icon: '🧾', color: '#e11d48' },
    { label: 'KOC đã gắn', val: fmt(T.koc), d: delta(T.koc, P.koc), sub: `${rows.length} nhân sự`, icon: '🏷️', color: '#9333ea' },
    { label: 'GMV (KOC gắn)', val: fmtVnd(T.gmv) + ' đ', d: delta(T.gmv, P.gmv), sub: `ROAS ${T.cast > 0 ? (T.gmv / T.cast).toFixed(1) : '∞'}x`, icon: '💰', color: '#16a34a' },
    { label: 'Video', val: fmt(T.video), d: delta(T.video, P.video), sub: `${fmtView(T.view)} view`, icon: '🎬', color: '#7c3aed' },
    { label: 'View', val: fmtView(T.view), d: delta(T.view, P.view), sub: `${T.video > 0 ? fmtView(T.view / T.video) : 0}/video`, icon: '👁️', color: '#0891b2' },
    { label: 'CAST đã dùng', val: fmtVnd(T.cast) + ' đ', d: delta(T.cast, P.cast), sub: `${T.budget > 0 ? (T.cast / T.budget * 100).toFixed(0) : 0}% ngân sách`, icon: '🔥', color: '#ea580c' },
    { label: 'CAST còn lại', val: fmtVnd(T.budget - T.cast) + ' đ', d: null, sub: `Ngân sách ${fmtVnd(T.budget)}`, icon: '💵', color: '#0ea5e9' },
  ];

  return (
    <div style={wrap}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>📑 Báo Cáo Nhân Sự — Booking</h2>
      <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 18px' }}>Gửi hàng · Hiệu suất KOC · CAST — lọc theo khoảng ngày, so với kỳ trước cùng độ dài.</p>

      {/* Filters */}
      <div style={{ ...card, padding: '14px 16px', marginBottom: 18, display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={labelStyle}>Nhân sự</div>
          <select value={selStaff} onChange={e => setSelStaff(e.target.value)} style={{ ...ctrl, width: 170, cursor: 'pointer' }}>
            <option value="">Tất cả nhân sự</option>
            {allStaff.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Sản phẩm chính</div>
          <input value={fProduct} onChange={e => setFProduct(e.target.value)} placeholder="🔍 Lọc..." style={{ ...ctrl, width: 180 }} />
        </div>
        <div style={{ width: 1, height: 38, background: '#e5e7eb', alignSelf: 'center' }} />
        <div>
          <div style={labelStyle}>Khung thời gian</div>
          <div style={{ display: 'flex', gap: 0, background: '#f1f5f9', borderRadius: 8, padding: 3 }}>
            {PRESETS.map(p => {
              let eS, eE;
              if (p.single) { const d = new Date(); d.setDate(d.getDate() - p.days); eS = toYmd(d); eE = toYmd(d); }
              else { eE = toYmd(new Date()); const s = new Date(); s.setDate(s.getDate() - p.days); eS = toYmd(s); }
              const active = range.start === eS && range.end === eE;
              return (
                <button key={p.label} onClick={() => setQuick(p)} style={{ padding: '6px 14px', borderRadius: 6, fontSize: '0.76rem', fontWeight: 700, border: 'none', background: active ? 'linear-gradient(135deg,#ff8a4c,#ff6a2c)' : 'transparent', color: active ? '#fff' : '#64748b', cursor: 'pointer', boxShadow: active ? '0 4px 12px rgba(255,106,44,0.4)' : 'none' }}>{p.label}</button>
              );
            })}
          </div>
        </div>
        <div>
          <div style={labelStyle}>Tùy chọn ngày</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="date" value={range.start} onChange={e => setRange(p => ({ ...p, start: e.target.value }))} style={{ ...ctrl, width: 140 }} />
            <span style={{ color: '#cbd5e1' }}>→</span>
            <input type="date" value={range.end} onChange={e => setRange(p => ({ ...p, end: e.target.value }))} style={{ ...ctrl, width: 140 }} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={resetFilters} style={{ ...ctrl, color: '#64748b', cursor: 'pointer' }}>↺ Reset</button>
        <button onClick={load} style={{ ...ctrl, background: '#f97316', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>{loading ? '⏳ Đang tải...' : '🔄 Tải lại'}</button>
        <button onClick={exportExcel} style={{ ...ctrl, background: '#16a34a', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>📊 Excel</button>
      </div>

      {err && <div style={{ ...card, background: '#fef2f2', borderColor: '#fecaca', color: '#dc2626', padding: '12px 16px', marginBottom: 16 }}>❌ {err}</div>}

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 20 }}>
        {KPIS.map((k, i) => (
          <div key={i} style={{ ...card, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -10, right: -10, width: 56, height: 56, borderRadius: '50%', background: k.color, opacity: 0.08 }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{k.icon} {k.label}</span>
              {k.d !== null && Number.isFinite(k.d) && prevRows.length > 0 && (
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: k.d >= 0 ? '#16a34a' : '#dc2626' }}>{k.d >= 0 ? '▲' : '▼'} {Math.abs(k.d).toFixed(0)}%</span>
              )}
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '6px 0 2px' }}>{k.val}</div>
            <div style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Bảng nhân sự */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>👥 Chi tiết theo nhân sự ({filtered.length})</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1120 }}>
            <thead>
              <tr>
                <th style={th}>#</th><th style={th}>Nhân sự</th>
                <th style={{ ...th, textAlign: 'right' }}>Đơn</th><th style={{ ...th, textAlign: 'right' }}>Mẫu</th>
                <th style={{ ...th, textAlign: 'right' }}>Chi phí mẫu</th>
                <th style={{ ...th, textAlign: 'right' }}>TS/ngày</th><th style={th}>SP chính</th>
                <th style={{ ...th, textAlign: 'right' }}>KOC</th><th style={{ ...th, textAlign: 'right' }}>Video</th>
                <th style={{ ...th, textAlign: 'right' }}>View</th><th style={{ ...th, textAlign: 'right' }}>GMV</th>
                <th style={{ ...th, textAlign: 'right' }}>CAST dùng</th><th style={{ ...th, textAlign: 'right' }}>CAST còn</th>
                <th style={{ ...th, textAlign: 'center' }}>Hiệu suất</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={14} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: 40 }}>⏳ Đang tải...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={14} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: 40 }}>Không có dữ liệu.</td></tr>}
              {!loading && filtered.map((r, i) => {
                const b = perfBadge(r.aff_gmv, r.cast_used); const budget = BUDGET(r.aff_gmv); const remain = budget - num(r.cast_used);
                const isSel = selectedRow && r.nhansu_id === selectedRow.nhansu_id;
                return (
                  <tr key={r.nhansu_id} onClick={() => setSelectedId(r.nhansu_id)} style={{ cursor: 'pointer', background: isSel ? '#fff7ed' : '#fff', boxShadow: isSel ? 'inset 3px 0 0 #f97316' : 'none' }}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#f8fafc'; }} onMouseLeave={e => { e.currentTarget.style.background = isSel ? '#fff7ed' : '#fff'; }}>
                    <td style={{ ...td, color: '#94a3b8', fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ ...td, fontWeight: 700, color: '#0f172a' }}>{r.ten_nhansu}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmt(r.so_don)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmt(r.so_mau)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#e11d48', fontWeight: 700 }}>{fmtVnd(r.chi_phi_mau)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#0ea5e9', fontWeight: 700 }}>{r.tan_suat}</td>
                    <td style={{ ...td, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.top_product || ''}>{r.top_product || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#9333ea' }}>{fmt(r.koc_count)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#7c3aed', fontWeight: 700 }}>{fmt(r.aff_videos)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#0891b2' }}>{fmtView(r.aff_views)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>{fmtVnd(r.aff_gmv)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#ea580c', fontWeight: 700 }}>{fmtVnd(r.cast_used)}</td>
                    <td style={{ ...td, textAlign: 'right', color: remain < 0 ? '#dc2626' : '#0ea5e9', fontWeight: 700 }}>{fmtVnd(remain)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ background: b.bg, color: b.color, fontWeight: 800, fontSize: '0.72rem', padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>{b.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p style={{ color: '#94a3b8', fontSize: '0.76rem', marginTop: 10 }}>* Chi phí mẫu = cost (cột AMIS V2) ×1.08×SL + 5k + ship (giống Module 1). CAST đã dùng = koc_payments. Ngân sách = max(15tr, GMV×2.2%). Chi tiết hiện bên dưới — bấm dòng khác để đổi nhân sự.</p>

      {selectedRow && <StaffDetailPanel r={selectedRow} range={range} />}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
const Section = ({ icon, title, hint, accent, children }) => (
  <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
    <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 9, background: accent.bg }}>
      <span style={{ fontSize: '1.15rem' }}>{icon}</span>
      <span style={{ fontWeight: 800, color: accent.fg, fontSize: '1rem' }}>{title}</span>
      {hint && <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, marginLeft: 'auto' }}>{hint}</span>}
    </div>
    <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
  </div>
);
const Mini = ({ label, val, color }) => (
  <div style={{ background: '#f8fafc', borderRadius: 10, padding: '11px 13px', border: '1px solid #f1f5f9' }}>
    <div style={{ fontSize: '0.66rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{label}</div>
    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: color || '#0f172a', marginTop: 2 }}>{val}</div>
  </div>
);

// ── Panel chi tiết nhân sự (hiện INLINE bên dưới bảng) ─────────────────────────
function StaffDetailPanel({ r, range }) {
  const [det, setDet] = useState(null);
  const [loadingDet, setLoadingDet] = useState(true);
  const [sendMetric, setSendMetric] = useState('mau');   // tần suất gửi: don | mau
  const [perfMetric, setPerfMetric] = useState('video'); // hiệu suất: video | views
  useEffect(() => {
    let alive = true; setLoadingDet(true);
    supabase.rpc('staff_booking_detail', { p_nhansu_id: r.nhansu_id, p_from: range.start, p_to: range.end })
      .then(({ data }) => { if (alive) { setDet(data || { daily: [], kocs: [] }); setLoadingDet(false); } });
    return () => { alive = false; };
  }, [r.nhansu_id, range.start, range.end]);
  const daily = Array.isArray(det?.daily) ? det.daily : [];
  const kocs = Array.isArray(det?.kocs) ? det.kocs : [];

  const budget = BUDGET(r.aff_gmv);
  const cast = num(r.cast_used);
  const remain = budget - cast;
  const b = perfBadge(r.aff_gmv, r.cast_used);
  const len = rangeLen(range.start, range.end);
  const burn = len > 0 ? cast / len : 0;
  const avgKoc = num(r.koc_count) > 0 ? cast / num(r.koc_count) : 0;

  // brand distribution (donut)
  const bd = r.brand_dist && typeof r.brand_dist === 'object' ? r.brand_dist : {};
  const brandData = Object.entries(bd).map(([name, v]) => ({ name, value: num(v) })).sort((a, c) => c.value - a.value);
  const brandTot = brandData.reduce((s, x) => s + x.value, 0) || 1;

  const castData = [
    { name: 'Đã dùng', value: Math.max(0, cast) },
    { name: 'Còn lại', value: Math.max(0, remain) },
  ];

  const sendCfg = sendMetric === 'don' ? { color: '#f97316', label: 'Đơn gửi' } : { color: '#fb923c', label: 'Mẫu gửi' };
  const perfCfg = perfMetric === 'video' ? { color: '#7c3aed', label: 'Video', fmt } : { color: '#0891b2', label: 'View', fmt: fmtView };

  const ACC = { send: { bg: '#fff7ed', fg: '#c2410c' }, perf: { bg: '#faf5ff', fg: '#7e22ce' }, cast: { bg: '#fff1f2', fg: '#be123c' } };
  const chartLoading = (h) => <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>⏳ Đang tải biểu đồ...</div>;
  const chartEmpty = (h, msg) => <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>{msg}</div>;

  return (
    <div style={{ ...card, marginTop: 18, overflow: 'hidden' }}>
        {/* header */}
        <div style={{ background: 'linear-gradient(135deg, #ff8c42, #f5591a)', padding: '18px 24px', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>📊 Chi tiết: {r.ten_nhansu}</div>
              <div style={{ fontSize: '0.82rem', opacity: 0.9 }}>{range.start} → {range.end} ({len} ngày)</div>
            </div>
            <span style={{ background: '#fff', color: b.color, fontWeight: 800, fontSize: '0.8rem', padding: '5px 14px', borderRadius: 20 }}>{b.label}</span>
          </div>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 18, background: '#f8fafc' }}>

          {/* ═══ 1. GỬI HÀNG ═══ */}
          <Section icon="📦" title="Gửi hàng" hint={`${fmt(r.so_don)} đơn · ${fmt(r.so_mau)} mẫu`} accent={ACC.send}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <Mini label="Đơn gửi" val={fmt(r.so_don)} color="#f97316" />
              <Mini label="Số mẫu" val={fmt(r.so_mau)} color="#fb923c" />
              <Mini label="Chi phí mẫu" val={fmtVnd(r.chi_phi_mau) + 'đ'} color="#e11d48" />
              <Mini label="TS / ngày" val={r.tan_suat} color="#0ea5e9" />
            </div>

            {/* Tỷ trọng brand (donut) */}
            <div>
              <div style={{ fontWeight: 700, color: '#475569', marginBottom: 8, fontSize: '0.85rem' }}>📊 Tỷ trọng brand gửi</div>
              {brandData.length === 0 ? <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Không có</span> : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <ResponsiveContainer width={170} height={170}>
                    <PieChart>
                      <Pie data={brandData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={72} paddingAngle={2} stroke="none" isAnimationActive={false}>
                        {brandData.map((e, i) => <Cell key={i} fill={BRAND_COLOR[e.name] || PIE_PALETTE[i % PIE_PALETTE.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [`${fmt(v)} mẫu`, n]} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.8rem' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    {brandData.map((e, i) => (
                      <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: '0.8rem' }}>
                        <span style={{ width: 11, height: 11, borderRadius: 3, background: BRAND_COLOR[e.name] || PIE_PALETTE[i % PIE_PALETTE.length] }} />
                        <span style={{ fontWeight: 600, color: '#334155', flex: 1 }}>{e.name}</span>
                        <span style={{ fontWeight: 700, color: '#64748b' }}>{fmt(e.value)} ({(e.value / brandTot * 100).toFixed(0)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Tần suất gửi theo ngày (area) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ fontWeight: 700, color: '#475569', fontSize: '0.85rem' }}>📈 Tần suất gửi theo ngày</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[['mau', 'Mẫu'], ['don', 'Đơn']].map(([k, l]) => (
                    <button key={k} onClick={() => setSendMetric(k)} style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 11px', borderRadius: 20, cursor: 'pointer', border: `1.5px solid ${sendMetric === k ? sendCfg.color : '#e2e8f0'}`, background: sendMetric === k ? sendCfg.color : '#fff', color: sendMetric === k ? '#fff' : '#64748b' }}>{l}</button>
                  ))}
                </div>
              </div>
              {loadingDet ? chartLoading(200) : daily.length === 0 ? chartEmpty(200, 'Không có dữ liệu.') : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={daily} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <defs><linearGradient id="sendGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={sendCfg.color} stopOpacity={0.35} /><stop offset="100%" stopColor={sendCfg.color} stopOpacity={0.02} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="d" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={Math.max(0, Math.floor(daily.length / 12))} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} tickLine={false} axisLine={false} width={34} />
                    <Tooltip formatter={(v) => [fmt(v), sendCfg.label]} labelFormatter={(l) => `Ngày ${l}`} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.8rem' }} />
                    <Area type="monotone" dataKey={sendMetric} stroke={sendCfg.color} strokeWidth={2.2} fill="url(#sendGrad)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Section>

          {/* ═══ 2. HIỆU SUẤT ═══ */}
          <Section icon="🎯" title="Hiệu suất" hint={`${fmt(r.koc_count)} KOC · ${fmt(r.aff_videos)} video`} accent={ACC.perf}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <Mini label="KOC gắn" val={fmt(r.koc_count)} color="#9333ea" />
              <Mini label="Video" val={fmt(r.aff_videos)} color="#7c3aed" />
              <Mini label="View" val={fmtView(r.aff_views)} color="#0891b2" />
              <Mini label="GMV" val={fmtVnd(r.aff_gmv) + 'đ'} color="#16a34a" />
            </div>

            {/* Video / View theo ngày (bar) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ fontWeight: 700, color: '#475569', fontSize: '0.85rem' }}>📊 {perfCfg.label} của KOC gắn theo ngày</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[['video', 'Video'], ['views', 'View']].map(([k, l]) => (
                    <button key={k} onClick={() => setPerfMetric(k)} style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 11px', borderRadius: 20, cursor: 'pointer', border: `1.5px solid ${perfMetric === k ? perfCfg.color : '#e2e8f0'}`, background: perfMetric === k ? perfCfg.color : '#fff', color: perfMetric === k ? '#fff' : '#64748b' }}>{l}</button>
                  ))}
                </div>
              </div>
              {loadingDet ? chartLoading(200) : daily.length === 0 ? chartEmpty(200, 'Không có dữ liệu.') : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={daily} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="d" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={Math.max(0, Math.floor(daily.length / 12))} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={perfCfg.fmt} tickLine={false} axisLine={false} width={40} />
                    <Tooltip formatter={(v) => [perfCfg.fmt(v), perfCfg.label]} labelFormatter={(l) => `Ngày ${l}`} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.8rem' }} />
                    <Bar dataKey={perfMetric} fill={perfCfg.color} radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Top KOC table */}
            <div>
              <div style={{ fontWeight: 700, color: '#475569', marginBottom: 8, fontSize: '0.85rem' }}>🏅 Top KOC theo GMV ({kocs.length})</div>
              {loadingDet ? <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>⏳ Đang tải...</div> : kocs.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Không có dữ liệu.</div> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={{ ...th, padding: '8px' }}>#</th><th style={{ ...th, padding: '8px' }}>KOC</th>
                      <th style={{ ...th, padding: '8px', textAlign: 'right' }}>GMV</th><th style={{ ...th, padding: '8px', textAlign: 'right' }}>View</th>
                      <th style={{ ...th, padding: '8px', textAlign: 'right' }}>Video</th><th style={{ ...th, padding: '8px', textAlign: 'right' }}>CAST</th>
                      <th style={{ ...th, padding: '8px', textAlign: 'right' }}>ROAS</th>
                    </tr></thead>
                    <tbody>
                      {kocs.slice(0, 20).map((k, i) => {
                        const kb = perfBadge(k.gmv, k.cast);
                        return (
                          <tr key={k.uname}>
                            <td style={{ ...td, padding: '9px 8px', color: '#94a3b8', fontWeight: 700 }}>{i + 1}</td>
                            <td style={{ ...td, padding: '9px 8px' }}><a href={`https://www.tiktok.com/@${k.uname}`} target="_blank" rel="noreferrer" style={{ color: '#475569', textDecoration: 'none', fontWeight: 600 }}>@{k.uname}</a></td>
                            <td style={{ ...td, padding: '9px 8px', textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>{fmtVnd(k.gmv)}</td>
                            <td style={{ ...td, padding: '9px 8px', textAlign: 'right', color: '#0891b2' }}>{fmtView(k.views)}</td>
                            <td style={{ ...td, padding: '9px 8px', textAlign: 'right', color: '#7c3aed', fontWeight: 700 }}>{fmt(k.videos)}</td>
                            <td style={{ ...td, padding: '9px 8px', textAlign: 'right', color: '#ea580c' }}>{num(k.cast) > 0 ? fmtVnd(k.cast) : '—'}</td>
                            <td style={{ ...td, padding: '9px 8px', textAlign: 'right' }}><span style={{ color: kb.color, fontWeight: 800 }}>{kb.roas === Infinity ? '∞' : kb.roas.toFixed(1) + 'x'}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Section>

          {/* ═══ 3. CAST ═══ */}
          <Section icon="🔥" title="Cast" hint={`ROAS ${cast > 0 ? (num(r.aff_gmv) / cast).toFixed(1) + 'x' : '∞'}`} accent={ACC.cast}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              {/* Donut đã dùng vs còn lại */}
              <div style={{ position: 'relative', width: 170, height: 170 }}>
                <ResponsiveContainer width={170} height={170}>
                  <PieChart>
                    <Pie data={castData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={75} startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
                      <Cell fill="#ea580c" /><Cell fill="#bbf7d0" />
                    </Pie>
                    <Tooltip formatter={(v, n) => [fmtVnd(v) + ' đ', n]} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.8rem' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: remain < 0 ? '#dc2626' : '#ea580c' }}>{budget > 0 ? (cast / budget * 100).toFixed(0) : 0}%</div>
                  <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>đã dùng</div>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 220, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <Mini label="Tổng ngân sách" val={fmtVnd(budget) + 'đ'} color="#475569" />
                <Mini label="Đã xài" val={fmtVnd(cast) + 'đ'} color="#ea580c" />
                <Mini label="Còn lại" val={fmtVnd(remain) + 'đ'} color={remain < 0 ? '#dc2626' : '#16a34a'} />
                <Mini label="TB / 1 KOC" val={fmtVnd(avgKoc) + 'đ'} color="#9333ea" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <Mini label="Burn rate / ngày" val={fmtVnd(burn) + 'đ'} color="#475569" />
              <Mini label="CAST / GMV" val={num(r.aff_gmv) > 0 ? (cast / num(r.aff_gmv) * 100).toFixed(1) + '%' : '—'} color="#475569" />
            </div>

            {/* Scatter GMV vs CAST theo KOC */}
            <div>
              <div style={{ fontWeight: 700, color: '#475569', marginBottom: 2, fontSize: '0.85rem' }}>🎯 GMV vs CAST theo KOC</div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: 8 }}>Mỗi chấm = 1 KOC · X = CAST chi · Y = GMV · to nhỏ = view · màu = hiệu suất</div>
              {loadingDet ? chartLoading(230) : kocs.length === 0 ? chartEmpty(230, 'Không có dữ liệu KOC.') : (
                <ResponsiveContainer width="100%" height={230}>
                  <ScatterChart margin={{ top: 6, right: 12, left: 6, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" dataKey="cast" name="CAST" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={fmtVnd} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                    <YAxis type="number" dataKey="gmv" name="GMV" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={fmtVnd} tickLine={false} axisLine={false} width={48} />
                    <ZAxis type="number" dataKey="views" range={[50, 420]} name="View" />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const k = payload[0].payload;
                      return (
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px', fontSize: '0.78rem', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
                          <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>@{k.uname}</div>
                          <div style={{ color: '#16a34a' }}>GMV: {fmtVnd(k.gmv)} đ</div>
                          <div style={{ color: '#ea580c' }}>CAST: {fmtVnd(k.cast)} đ</div>
                          <div style={{ color: '#0891b2' }}>View: {fmtView(k.views)} · {fmt(k.videos)} video</div>
                        </div>
                      );
                    }} />
                    <Scatter data={kocs} fillOpacity={0.75} isAnimationActive={false}>
                      {kocs.map((k, i) => <Cell key={i} fill={perfBadge(k.gmv, k.cast).color} />)}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </div>
          </Section>

        </div>
    </div>
  );
}

export default BookingStaffReportTab;
