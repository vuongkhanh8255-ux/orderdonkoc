// src/components/BookingStaffReportTab.jsx
// Báo cáo Booking theo nhân sự — dashboard hiện đại. Lọc theo KHOẢNG NGÀY (như Dashboard Ecom).
// Drawer chi tiết chia 3 mục: 📦 Gửi hàng · 🎯 Hiệu suất · 🔥 Cast. Mỗi mục kèm biểu đồ phù hợp.
// Chi phí mẫu = giống Module 1 Order (cost cột AMIS V2 ×1.08×SL + 5k + ship). CAST ngân sách = max(15tr, GMV×2.2%).
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ScatterChart, Scatter, ZAxis, Cell, LabelList } from 'recharts';
import { supabase } from '../supabaseClient';
import { budgetRemainingByStaff, BUDGET_START } from '../lib/bookingBudget';

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

function BookingStaffReportTab({ currentUser } = {}) {
  // Lọc theo THÁNG (khớp module Tạm đối chiếu) — mặc định tháng hiện tại.
  const [range, setRange] = useState(() => {
    const d = new Date();
    return { start: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, end: toYmd(d) };
  });
  const [rows, setRows] = useState([]);
  const [prevRows, setPrevRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [selStaff, setSelStaff] = useState('');
  const [fProduct, setFProduct] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  // NGÂN SÁCH (carryover + cộng tay) — DÙNG CHUNG hàm với Tạm đối chiếu → cột "Ngân sách còn lại" KHỚP 100%.
  // Lấy ngân sách của THÁNG cuối kỳ (range.end).
  const [budgetByStaff, setBudgetByStaff] = useState({});
  useEffect(() => {
    let alive = true;
    budgetRemainingByStaff(String(range.end).slice(0, 7)).then(b => { if (alive) setBudgetByStaff(b); }, () => {});
    return () => { alive = false; };
  }, [range.end]);

  // Danh sách THÁNG (từ T3/2026 → nay) + chọn 1 tháng = lọc trọn tháng đó (khớp Tạm đối chiếu).
  const MONTHS = useMemo(() => {
    const out = []; let y = BUDGET_START.y, m = BUDGET_START.m;
    const now = new Date(); const ey = now.getFullYear(), em = now.getMonth() + 1;
    while (y < ey || (y === ey && m <= em)) { out.push({ ym: `${y}-${String(m).padStart(2, '0')}`, label: `T${m}` }); m++; if (m > 12) { m = 1; y++; } }
    return out;
  }, []);
  const pickMonth = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    const last = new Date(y, m, 0).getDate(); const today = toYmd(new Date());
    let end = `${ym}-${String(last).padStart(2, '0')}`; if (end > today) end = today;
    setRange({ start: `${ym}-01`, end });
  };
  const curYm = String(range.end).slice(0, 7);

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
  // Tổng ngân sách (theo hàm chung) — cho KPI "CAST còn lại" khớp Tạm đối chiếu.
  const budgetTot = useMemo(() => filtered.reduce((a, r) => {
    const b = budgetByStaff[r.ten_nhansu]; return { conLai: a.conLai + (b?.conLai || 0), dmThuc: a.dmThuc + (b?.dmThuc || 0) };
  }, { conLai: 0, dmThuc: 0 }), [filtered, budgetByStaff]);
  // CAST đã xài THEO THÁNG AIR (hàm chung) — để mọi số cast khớp Tạm đối chiếu (ko dùng cast theo pay_date nữa).
  const castTot = useMemo(() => filtered.reduce((a, r) => a + (budgetByStaff[r.ten_nhansu]?.xai || 0), 0), [filtered, budgetByStaff]);
  const delta = (cur, prev) => prev > 0 ? ((cur - prev) / prev * 100) : (cur > 0 ? 100 : 0);

  const resetFilters = () => { setSelStaff(''); setFProduct(''); };
  const exportExcel = async () => {
    const XLSX = await import('xlsx').then(m => m.default || m);
    const aoa = [['Nhân sự', 'Đơn gửi', 'Mẫu', 'Chi phí mẫu', 'TS/ngày', 'SP chính', 'KOC gắn', 'Video', 'View', 'GMV', 'CAST dùng', 'CAST còn lại', 'ROAS', 'Hiệu suất']];
    filtered.forEach(r => { const bg = budgetByStaff[r.ten_nhansu];
      const castM = bg ? bg.xai : num(r.cast_used);
      const remain = bg ? bg.conLai : (BUDGET(r.aff_gmv) - num(r.cast_used));
      const bd2 = perfBadge(r.aff_gmv, castM);
      aoa.push([r.ten_nhansu, r.so_don, r.so_mau, Math.round(r.chi_phi_mau), r.tan_suat, r.top_product || '', r.koc_count, r.aff_videos, r.aff_views, Math.round(r.aff_gmv), Math.round(castM), Math.round(remain), bd2.roas === Infinity ? '∞' : bd2.roas.toFixed(1), bd2.label]); });
    const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BaoCaoNhanSu'); XLSX.writeFile(wb, `bao-cao-nhan-su-${range.start}_${range.end}.xlsx`);
  };

  const KPIS = [
    { label: 'Tổng đơn gửi', val: fmt(T.don), d: delta(T.don, P.don), sub: `${fmt(T.mau)} mẫu`, icon: '📦', color: '#f97316' },
    { label: 'Chi phí mẫu', val: fmtVnd(T.chiphi) + ' đ', d: delta(T.chiphi, P.chiphi), sub: `${T.mau > 0 ? fmtVnd(T.chiphi / T.mau) : 0}/mẫu`, icon: '🧾', color: '#e11d48' },
    { label: 'KOC đã gắn', val: fmt(T.koc), d: delta(T.koc, P.koc), sub: `${rows.length} nhân sự`, icon: '🏷️', color: '#9333ea' },
    { label: 'GMV (KOC gắn)', val: fmtVnd(T.gmv) + ' đ', d: delta(T.gmv, P.gmv), sub: `ROAS ${castTot > 0 ? (T.gmv / castTot).toFixed(1) : '∞'}x`, icon: '💰', color: '#16a34a' },
    { label: 'Video', val: fmt(T.video), d: delta(T.video, P.video), sub: `${fmtView(T.view)} view`, icon: '🎬', color: '#7c3aed' },
    { label: 'View', val: fmtView(T.view), d: delta(T.view, P.view), sub: `${T.video > 0 ? fmtView(T.view / T.video) : 0}/video`, icon: '👁️', color: '#0891b2' },
    { label: 'CAST đã dùng', val: fmtVnd(castTot) + ' đ', d: null, sub: `${budgetTot.dmThuc > 0 ? (castTot / budgetTot.dmThuc * 100).toFixed(0) : 0}% ngân sách`, icon: '🔥', color: '#ea580c' },
    { label: 'Ngân sách còn lại', val: fmtVnd(budgetTot.conLai) + ' đ', d: null, sub: `ĐM thực ${fmtVnd(budgetTot.dmThuc)} · khớp Tạm đối chiếu`, icon: '💵', color: '#0ea5e9' },
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
          <div style={labelStyle}>Tháng (khớp Tạm đối chiếu)</div>
          <div style={{ display: 'flex', gap: 0, background: '#f1f5f9', borderRadius: 8, padding: 3, flexWrap: 'wrap' }}>
            {MONTHS.map(mo => {
              const active = curYm === mo.ym && range.start === `${mo.ym}-01`;
              return (
                <button key={mo.ym} onClick={() => pickMonth(mo.ym)} style={{ padding: '6px 14px', borderRadius: 6, fontSize: '0.76rem', fontWeight: 700, border: 'none', background: active ? 'linear-gradient(135deg,#ff8a4c,#ff6a2c)' : 'transparent', color: active ? '#fff' : '#64748b', cursor: 'pointer', boxShadow: active ? '0 4px 12px rgba(255,106,44,0.4)' : 'none' }}>{mo.label}</button>
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
          <div key={i} style={{
            background: `linear-gradient(145deg, ${k.color}12 0%, #ffffff 62%)`,
            borderRadius: 18, padding: '16px 18px', position: 'relative', overflow: 'hidden',
            border: `1px solid ${k.color}33`,
            boxShadow: `0 8px 22px -12px ${k.color}55, 0 1px 3px rgba(15,23,42,0.05)`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: `linear-gradient(135deg, ${k.color}, ${k.color}bb)`, boxShadow: `0 5px 12px ${k.color}66, inset 0 1px 1px rgba(255,255,255,0.45)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem' }}>{k.icon}</span>
                <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.label}</span>
              </div>
              {k.d !== null && Number.isFinite(k.d) && prevRows.length > 0 && (
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: k.d >= 0 ? '#16a34a' : '#dc2626', background: k.d >= 0 ? '#dcfce7' : '#fef2f2', padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>{k.d >= 0 ? '▲' : '▼'} {Math.abs(k.d).toFixed(0)}%</span>
              )}
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>{k.val}</div>
            <div style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600, marginTop: 2 }}>{k.sub}</div>
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
                <th style={{ ...th, textAlign: 'right' }}>CAST dùng</th><th style={{ ...th, textAlign: 'right' }} title="Ngân sách còn lại tháng cuối kỳ — khớp 100% với module Tạm đối chiếu (carryover + cộng tay)">Ngân sách còn</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={13} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: 40 }}>⏳ Đang tải...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={13} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: 40 }}>Không có dữ liệu.</td></tr>}
              {!loading && filtered.map((r, i) => {
                // Ngân sách còn lại = hàm chung (carryover + cộng tay) → KHỚP Tạm đối chiếu. Fallback số cũ khi chưa load.
                const bg = budgetByStaff[r.ten_nhansu];
                const remain = bg ? bg.conLai : (BUDGET(r.aff_gmv) - num(r.cast_used));
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
                    <td style={{ ...td, textAlign: 'right', color: '#ea580c', fontWeight: 700 }}>{fmtVnd(bg ? bg.xai : num(r.cast_used))}</td>
                    <td style={{ ...td, textAlign: 'right', color: remain < 0 ? '#dc2626' : '#0ea5e9', fontWeight: 700 }}
                        title={bg ? `Ngân sách còn lại tháng ${String(range.end).slice(5, 7)} (khớp 'Tạm đối chiếu'): ĐM thực ${fmtVnd(bg.dmThuc)}${bg.extra > 0 ? ' (gồm cộng tay ' + fmtVnd(bg.extra) + ')' : ''} − đã chi ${fmtVnd(bg.xai)}` : ''}>{fmtVnd(remain)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p style={{ color: '#94a3b8', fontSize: '0.76rem', marginTop: 10 }}>* Chi phí mẫu = cost (cột AMIS V2) ×1.08×SL + 5k + ship (giống Module 1). CAST đã dùng = koc_payments. Ngân sách = max(15tr, GMV×2.2%). Chi tiết hiện bên dưới — bấm dòng khác để đổi nhân sự.</p>

      {selectedRow && <StaffDetailPanel r={selectedRow} range={range} bg={budgetByStaff[selectedRow.ten_nhansu]} currentUser={currentUser} />}
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
const Mini = ({ label, val, color = '#475569', icon }) => (
  <div style={{
    background: `linear-gradient(145deg, ${color}16 0%, #ffffff 70%)`,
    borderRadius: 14, padding: '12px 14px', border: `1px solid ${color}2e`,
    boxShadow: `0 6px 16px -10px ${color}66, 0 1px 2px rgba(15,23,42,0.04)`,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
      {icon && <span style={{ width: 24, height: 24, borderRadius: 8, flexShrink: 0, background: `linear-gradient(135deg, ${color}, ${color}bb)`, boxShadow: `0 4px 9px ${color}55, inset 0 1px 1px rgba(255,255,255,0.45)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem' }}>{icon}</span>}
      <div style={{ fontSize: '0.64rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{label}</div>
    </div>
    <div style={{ fontSize: '1.2rem', fontWeight: 800, color }}>{val}</div>
  </div>
);

// ── Panel chi tiết nhân sự (hiện INLINE bên dưới bảng) ─────────────────────────
function StaffDetailPanel({ r, range, bg, currentUser }) {
  const [det, setDet] = useState(null);
  const [loadingDet, setLoadingDet] = useState(true);
  // ── TỰ GỠ TAG (Khánh 15/7): mỗi account chỉ được tự gỡ KOC của ĐÚNG tên mình (r.ten_nhansu === currentUser.staff).
  //    seeAll (Thu Thảo/Minh Thảo/Hoàng Vy) coi được panel người khác nhưng KHÔNG gỡ được — chỉ gỡ của chính mình.
  //    admin gỡ được mọi nơi. Video/GMV đã tính trước đó GIỮ NGUYÊN — gỡ chỉ ngưng theo dõi từ giờ về sau.
  const canRemove = currentUser?.role === 'admin' || (currentUser?.staff && currentUser.staff.trim() === (r.ten_nhansu || '').trim());
  const [removingKey, setRemovingKey] = useState(null);
  const doSelfRemove = useCallback(async (k) => {
    if (!canRemove) return;
    if (!window.confirm(`Tự gỡ tag @${k.uname} (${k.brand}) khỏi danh sách bạn quản lý?\n\nVideo/GMV đã ghi nhận trước đó vẫn giữ nguyên, chỉ ngưng theo dõi KOC này từ giờ.`)) return;
    const key = k.uname + '|' + (k.brand || '');
    setRemovingKey(key);
    const { data, error } = await supabase.rpc('koc_remove_assignment', { p_koc: k.uname, p_brand: k.brand, p_actor: currentUser?.username || r.ten_nhansu });
    setRemovingKey(null);
    if (error) { alert('Lỗi gỡ tag: ' + error.message); return; }
    setDet(d => d ? { ...d, kocs: (d.kocs || []).filter(x => !(x.uname === k.uname && x.brand === k.brand)) } : d);
  }, [canRemove, currentUser, r.ten_nhansu]);
  const [sendMetric, setSendMetric] = useState('mau');   // tần suất gửi: don | mau
  const [perfMetric, setPerfMetric] = useState('video'); // hiệu suất: video | views
  const [castVids, setCastVids] = useState(null);        // danh sách video booking cast (xài tiền cho video/brand/SP gì)
  useEffect(() => {
    let alive = true; setLoadingDet(true);
    supabase.rpc('staff_booking_detail', { p_nhansu_id: r.nhansu_id, p_from: range.start, p_to: range.end })
      .then(({ data }) => { if (alive) { setDet(data || { daily: [], kocs: [] }); setLoadingDet(false); } });
    return () => { alive = false; };
  }, [r.nhansu_id, range.start, range.end]);
  useEffect(() => {
    let alive = true; setCastVids(null);
    supabase.rpc('booking_cast_detail', { p_staff: r.ten_nhansu, p_from: range.start, p_to: range.end })
      .then(({ data }) => { if (alive) setCastVids(data || []); }, () => { if (alive) setCastVids([]); });
    return () => { alive = false; };
  }, [r.ten_nhansu, range.start, range.end]);
  // ── TAG ORDER: KOC nhân sự này được tự gắn tag khi order (chưa air) → theo dõi đã lên clip chưa ──
  // Trạng thái HIỆN TẠI (không theo kỳ) — RPC staff_order_tags.
  const [orderTags, setOrderTags] = useState(null);   // null = đang tải
  const [otFilter, setOtFilter] = useState('all'); // lọc panel tag order: all | wait | over | aired | old
  useEffect(() => {
    let alive = true; setOrderTags(null);
    supabase.rpc('staff_order_tags', { p_staff: r.ten_nhansu })
      .then(({ data }) => { if (alive) setOrderTags(data || []); }, () => { if (alive) setOrderTags([]); });
    return () => { alive = false; };
  }, [r.ten_nhansu]);
  // ── Link air của nhân sự (mấy bạn đã điền ở Quản lý link air) — HIỆN FULL từ trước tới giờ, KHÔNG theo kỳ ──
  // Phân trang + tìm kiếm PHÍA SERVER (né trần 1000 rows của Supabase; NS có thể có vài chục nghìn link)
  const [airRows, setAirRows] = useState(null);   // rows trang hiện tại (null = đang tải)
  const [airTotal, setAirTotal] = useState(0);
  const [airSearch, setAirSearch] = useState('');
  const [airQ, setAirQ] = useState('');            // từ khoá đã debounce
  const [airPage, setAirPage] = useState(1);
  const AIR_PER = 20;
  useEffect(() => { const t = setTimeout(() => { setAirQ(airSearch.trim()); setAirPage(1); }, 400); return () => clearTimeout(t); }, [airSearch]);
  useEffect(() => { setAirPage(1); setOtFilter('all'); }, [r.nhansu_id]);
  useEffect(() => {
    let alive = true; setAirRows(null);
    supabase.rpc('staff_air_links', { p_nhansu_id: r.nhansu_id, p_search: airQ || null, p_limit: AIR_PER, p_offset: (airPage - 1) * AIR_PER })
      .then(({ data }) => { if (!alive) return; setAirRows(data || []); setAirTotal(data && data.length ? Number(data[0].total) : 0); },
            () => { if (alive) { setAirRows([]); setAirTotal(0); } });
    return () => { alive = false; };
  }, [r.nhansu_id, airQ, airPage]);
  const airTotalPages = Math.max(1, Math.ceil(airTotal / AIR_PER));
  const airPageC = Math.min(airPage, airTotalPages);
  const daily = Array.isArray(det?.daily) ? det.daily : [];
  const kocs = Array.isArray(det?.kocs) ? det.kocs : [];

  // ── Định danh KOC theo BRAND — RPC staff_booking_detail đã tách sẵn (uname × brand) + last_air + since ──
  const [onlyWarn, setOnlyWarn] = useState(false);
  const dateLabel = (s) => s ? new Date(s).toLocaleDateString('vi-VN') : '—';
  // "Thời gian bị gỡ tag" — hợp nhất Rule 2 + Rule 3 (Khánh 15/7):
  //  • NỢ CLIP (có order gần đây mà CHƯA air clip mới sau order: last_order & (chưa air | air < last_order))
  //    → mốc = last_order + 30 ngày. Quá 30 ngày chưa clip = nghi ÔM MẪU (đỏ).
  //  • ĐÃ air (không nợ) → mốc = air gần nhất + 45 ngày (cứ air là gia hạn). Chưa air & chưa order → ngày gắn + 45.
  const tagInfo = (k) => {
    const lastAir = k.last_air ? new Date(k.last_air) : null;
    const lastOrder = k.last_order ? new Date(k.last_order) : null;
    const owes = lastOrder && (!lastAir || lastAir < lastOrder);   // đang nợ clip mới sau order
    const base = owes ? lastOrder : (lastAir || (k.since ? new Date(k.since) : null));
    if (!base) return { txt: '—', color: '#cbd5e1', warn: false };
    const days = owes ? 30 : 45;
    const deadline = new Date(base.getTime() + days * 86400000);
    const daysLeft = Math.ceil((deadline - Date.now()) / 86400000);
    if (daysLeft < 0) return { txt: owes ? `⚠️ Nợ clip quá ${-daysLeft}d · nghi ôm mẫu` : `⚠️ Quá hạn ${dateLabel(deadline)} · nên gỡ`, color: '#dc2626', warn: true };
    return { txt: owes ? `⏳ Chờ clip · còn ${daysLeft}d` : `${dateLabel(deadline)} · còn ${daysLeft}d`, color: owes ? '#d97706' : '#16a34a', warn: false };
  };
  const warnCount = kocs.filter(k => tagInfo(k).warn).length;
  // Trạng thái 1 tag order (đã lên clip / chờ / quá hạn)
  const otStatus = (t) => {
    if (t.aired) {
      const conv = t.first_air ? Math.max(0, Math.round((new Date(t.first_air) - new Date(t.tag_date)) / 86400000)) : null;
      return { group: 'aired', color: '#16a34a', bg: '#f0fdf4', txt: `✅ Đã lên clip${t.first_air ? ' ' + dateLabel(t.first_air) : ''}${conv != null ? ` · ${conv}d sau order` : ''}` };
    }
    const left = 30 - (t.days_since_tag ?? 0);
    if (left < 0) return { group: 'over', color: '#dc2626', bg: '#fef2f2', txt: `⚠️ Quá hạn ${-left}d · chưa lên clip` };
    return { group: 'wait', color: '#d97706', bg: '#fffbeb', txt: `⏳ Chờ lên clip · còn ${left}d` };
  };
  const otList = Array.isArray(orderTags) ? orderTags : [];
  const otCnt = { aired: 0, wait: 0, over: 0 };
  otList.forEach(t => { otCnt[otStatus(t).group]++; });
  const otOld = otList.filter(t => t.aired_before).length;
  const otShown = otList.filter(t => otFilter === 'all' ? true
    : otFilter === 'old' ? t.aired_before
    : otStatus(t).group === otFilter);
  // Phân trang bảng Top KOC (RPC trả đủ — chỉ chia trang ở UI)
  const [kocPage, setKocPage] = useState(1);
  useEffect(() => { setKocPage(1); }, [onlyWarn, r.nhansu_id, range.start, range.end]);
  const filteredKocs = onlyWarn ? kocs.filter(k => tagInfo(k).warn) : kocs;
  const KOC_PER_PAGE = 15;
  const kocTotalPages = Math.max(1, Math.ceil(filteredKocs.length / KOC_PER_PAGE));
  const kocPageC = Math.min(kocPage, kocTotalPages);
  const pagedKocs = filteredKocs.slice((kocPageC - 1) * KOC_PER_PAGE, kocPageC * KOC_PER_PAGE);

  // Ngân sách + cast THEO HÀM CHUNG (carryover + cộng tay, cast theo tháng air) → khớp Tạm đối chiếu.
  const budget = bg ? bg.dmThuc : BUDGET(r.aff_gmv);
  const cast = bg ? bg.xai : num(r.cast_used);
  const remain = bg ? bg.conLai : (budget - cast);
  const b = perfBadge(r.aff_gmv, cast);
  const len = rangeLen(range.start, range.end);
  const burn = len > 0 ? cast / len : 0;
  const avgKoc = num(r.koc_count) > 0 ? cast / num(r.koc_count) : 0;
  const vth = { padding: '6px 8px', textAlign: 'center', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap' };
  const vtd = { padding: '6px 8px', textAlign: 'center', color: '#334155' };
  const castVidTot = Array.isArray(castVids) ? castVids.reduce((a, v) => a + (num(v.cast_net) || 0), 0) : 0;

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
              <Mini icon="📦" label="Đơn gửi" val={fmt(r.so_don)} color="#f97316" />
              <Mini icon="🧪" label="Số mẫu" val={fmt(r.so_mau)} color="#fb923c" />
              <Mini icon="🧾" label="Chi phí mẫu" val={fmtVnd(r.chi_phi_mau) + 'đ'} color="#e11d48" />
              <Mini icon="⚡" label="TS / ngày" val={r.tan_suat} color="#0ea5e9" />
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
                  <div style={{ flex: '0 1 auto', minWidth: 220 }}>
                    {brandData.map((e, i) => (
                      <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: '0.8rem' }}>
                        <span style={{ width: 11, height: 11, borderRadius: 3, flexShrink: 0, background: BRAND_COLOR[e.name] || PIE_PALETTE[i % PIE_PALETTE.length] }} />
                        <span style={{ fontWeight: 600, color: '#334155', width: 124, flexShrink: 0 }}>{e.name}</span>
                        <span style={{ fontWeight: 700, color: '#64748b', flexShrink: 0 }}>{fmt(e.value)} <span style={{ color: '#94a3b8' }}>({(e.value / brandTot * 100).toFixed(0)}%)</span></span>
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
                    <Area type="monotone" dataKey={sendMetric} stroke={sendCfg.color} strokeWidth={2.2} fill="url(#sendGrad)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false}>
                      <LabelList dataKey={sendMetric} position="top" offset={8} formatter={(v) => v > 0 ? v : ''} fill={sendCfg.color} fontSize={9} fontWeight={700} />
                    </Area>
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Section>

          {/* ═══ 2. HIỆU SUẤT ═══ */}
          <Section icon="🎯" title="Hiệu suất" hint={`${fmt(r.koc_count)} KOC · ${fmt(r.aff_videos)} video`} accent={ACC.perf}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <Mini icon="🏷️" label="KOC gắn" val={fmt(r.koc_count)} color="#9333ea" />
              <Mini icon="🎬" label="Video" val={fmt(r.aff_videos)} color="#7c3aed" />
              <Mini icon="👁️" label="View" val={fmtView(r.aff_views)} color="#0891b2" />
              <Mini icon="💰" label="GMV" val={fmtVnd(r.aff_gmv) + 'đ'} color="#16a34a" />
            </div>
            {/* Giải thích cách tính video + view: KOC quản lý (từ ngày gắn tag) + link air tự thêm */}
            <div style={{ fontSize: '0.76rem', color: '#475569', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 9, padding: '9px 12px', lineHeight: 1.55 }}>
              📎 <b>{fmt(r.aff_videos)}</b> video kỳ này = <b style={{ color: '#7c3aed' }}>{fmt(Math.max(0, num(r.aff_videos) - num(det?.air_videos)))}</b> từ KOC quản lý <span style={{ color: '#94a3b8' }}>(chỉ tính video air TỪ ngày gắn tag trở đi)</span>{num(det?.air_videos) > 0 && <> + <b style={{ color: '#1d4ed8' }}>{fmt(det.air_videos)}</b> từ link air tự thêm</>}.
              <br />👁️ <b>{fmtView(r.aff_views)}</b> view = view <b>phát sinh trong kỳ</b> trên TOÀN BỘ pool video của nhân sự <span style={{ color: '#94a3b8' }}>(video từ ngày gắn tag + tất cả video ở Quản lý link air — kể cả video air tháng trước vẫn còn sinh view)</span>.
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
                    <Bar dataKey={perfMetric} fill={perfCfg.color} radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false}>
                      <LabelList dataKey={perfMetric} position="top" formatter={(v) => v > 0 ? perfCfg.fmt(v) : ''} fill={perfCfg.color} fontSize={9} fontWeight={700} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Top KOC table */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontWeight: 700, color: '#475569', fontSize: '0.85rem' }} title="Hiện ĐỦ mọi KOC quản lý, xếp theo GMV (KOC chưa air = GMV 0 nằm cuối). 1 KOC làm nhiều brand = nhiều dòng.">🏅 KOC quản lý — xếp theo GMV <span style={{ fontWeight: 500, color: '#94a3b8' }}>({kocs.length} dòng · {new Set(kocs.map(k => k.uname)).size} KOC)</span></div>
                {warnCount > 0 && (
                  <button onClick={() => setOnlyWarn(v => !v)} title="Brand đã quá 45 ngày kể từ lần air gần nhất (chưa air thì từ ngày gắn) → nên gỡ định danh"
                    style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${onlyWarn ? '#dc2626' : '#fecaca'}`, background: onlyWarn ? '#dc2626' : '#fff', color: onlyWarn ? '#fff' : '#dc2626', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer' }}>
                    ⚠️ Quá hạn – nên gỡ ({warnCount}){onlyWarn ? ' ✕' : ''}
                  </button>
                )}
              </div>
              {loadingDet ? <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>⏳ Đang tải...</div> : kocs.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Không có dữ liệu.</div> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={{ ...th, padding: '8px' }}>#</th><th style={{ ...th, padding: '8px', width: '100%' }}>KOC</th>
                      <th style={{ ...th, padding: '8px' }} title="1 KOC air nhiều brand = tách thành nhiều dòng, KHÔNG gộp">Brand</th>
                      <th style={{ ...th, padding: '8px', textAlign: 'center' }}>GMV</th><th style={{ ...th, padding: '8px', textAlign: 'center' }}>View</th>
                      <th style={{ ...th, padding: '8px', textAlign: 'center' }} title="Tổng video KOC đã đăng cho brand này (all-time)">Video tổng</th>
                      <th style={{ ...th, padding: '8px', textAlign: 'center' }} title="Video đăng cho brand này trong khung thời gian đang chọn">Video kỳ</th><th style={{ ...th, padding: '8px', textAlign: 'center' }} title="Cast trong tháng">CAST</th>
                      <th style={{ ...th, padding: '8px', textAlign: 'center' }} title="Ngày gắn định danh brand này">Ngày gắn</th>
                      <th style={{ ...th, padding: '8px', textAlign: 'center' }} title="Video mới nhất KOC đăng cho brand này (all-time)">📅 Ngày air gần nhất</th>
                      <th style={{ ...th, padding: '8px', textAlign: 'center' }} title="Mốc bị gỡ định danh = ngày air gần nhất + 45 ngày (cứ air là gia hạn); brand chưa air lần nào thì tính từ ngày gắn + 45. Quá hạn = nên gỡ.">⏳ Thời gian bị gỡ tag</th>
                      {canRemove && <th style={{ ...th, padding: '8px', textAlign: 'center' }} title="Không muốn chăm sóc KOC này nữa → tự gỡ tag. Video/GMV đã tính vẫn giữ nguyên.">Gỡ</th>}
                    </tr></thead>
                    <tbody>
                      {pagedKocs.map((k, i) => {
                        const ti = tagInfo(k);
                        return (
                          <tr key={k.uname + '|' + (k.brand || '')}>
                            <td style={{ ...td, padding: '9px 8px', color: '#94a3b8', fontWeight: 700 }}>{(kocPageC - 1) * KOC_PER_PAGE + i + 1}</td>
                            <td style={{ ...td, padding: '9px 8px', width: '100%' }}><a href={`https://www.tiktok.com/@${k.uname}`} target="_blank" rel="noreferrer" style={{ color: '#475569', textDecoration: 'none', fontWeight: 600 }}>@{k.uname}</a></td>
                            <td style={{ ...td, padding: '9px 8px', fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>{k.brand || '—'}</td>
                            <td style={{ ...td, padding: '9px 8px', textAlign: 'center', fontWeight: 800, color: '#16a34a' }}>{fmtVnd(k.gmv)}</td>
                            <td style={{ ...td, padding: '9px 8px', textAlign: 'center', color: '#0891b2' }}>{fmtView(k.views)}</td>
                            <td style={{ ...td, padding: '9px 8px', textAlign: 'center', color: '#7c3aed', fontWeight: 800 }}>{fmt(k.videos_total)}</td>
                            <td style={{ ...td, padding: '9px 8px', textAlign: 'center', color: '#a78bda', fontWeight: 600 }}>{fmt(k.videos)}</td>
                            <td style={{ ...td, padding: '9px 8px', textAlign: 'center', color: '#ea580c' }}>{num(k.cast) > 0 ? fmtVnd(k.cast) : '—'}</td>
                            <td style={{ ...td, padding: '9px 8px', textAlign: 'center', fontSize: '0.76rem', color: '#64748b' }}>{dateLabel(k.since)}</td>
                            <td style={{ ...td, padding: '9px 8px', textAlign: 'center', fontSize: '0.76rem', fontWeight: 600, color: k.last_air ? '#0891b2' : '#f59e0b' }}>{k.last_air ? dateLabel(k.last_air) : '— chưa air'}</td>
                            <td style={{ ...td, padding: '9px 8px', textAlign: 'center', fontSize: '0.74rem', fontWeight: 700, color: ti.color }}>{ti.txt}</td>
                            {canRemove && (
                              <td style={{ ...td, padding: '9px 8px', textAlign: 'center' }}>
                                <button onClick={() => doSelfRemove(k)} disabled={removingKey === (k.uname + '|' + (k.brand || ''))}
                                  title="Tự gỡ tag KOC này khỏi danh sách bạn quản lý"
                                  style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>
                                  {removingKey === (k.uname + '|' + (k.brand || '')) ? '⏳' : '🗑️ Gỡ'}
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {kocTotalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10 }}>
                      <button onClick={() => setKocPage(p => Math.max(1, p - 1))} disabled={kocPageC <= 1}
                        style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', color: kocPageC <= 1 ? '#cbd5e1' : '#475569', fontWeight: 600, fontSize: '0.78rem', cursor: kocPageC <= 1 ? 'default' : 'pointer' }}>‹ Trước</button>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Trang {kocPageC}/{kocTotalPages} · {filteredKocs.length} KOC</span>
                      <button onClick={() => setKocPage(p => Math.min(kocTotalPages, p + 1))} disabled={kocPageC >= kocTotalPages}
                        style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', color: kocPageC >= kocTotalPages ? '#cbd5e1' : '#475569', fontWeight: 600, fontSize: '0.78rem', cursor: kocPageC >= kocTotalPages ? 'default' : 'pointer' }}>Sau ›</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Section>

          {/* ═══ 2b. TAG ORDER — KOC order-tag tự động, theo dõi đã lên clip chưa ═══ */}
          <Section icon="🏷️" title="Tag order" hint={`${otList.length} KOC đã order · từ T7`} accent={{ bg: '#f5f3ff', fg: '#6d28d9' }}>
            <div style={{ fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5, marginTop: -4 }}>
              TẤT CẢ KOC bạn <b>{r.ten_nhansu}</b> đã <b>order từ tháng 7</b> — theo dõi ai <b>đã lên clip</b> ai <b>chưa</b> (hạn 30 ngày ra clip MỚI kể từ ngày order). Quá hạn chưa clip → <b style={{ color: '#dc2626' }}>nghi ôm mẫu</b>. Nhãn <b style={{ color: '#0891b2' }}>🔁 cũ</b> = KOC đã air brand này TRƯỚC khi order (KOC quen); không nhãn = KOC mới. <span style={{ color: '#94a3b8' }}>(mốc = ngày order gần nhất)</span>
            </div>
            {/* summary chips — BẤM để lọc bảng (bấm lại = bỏ lọc) */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(() => {
                const chip = (key, label, count, fg, bg, title) => {
                  const on = otFilter === key;
                  const clickable = key === 'all' || count > 0;
                  return (
                    <button key={key} onClick={() => clickable && setOtFilter(on ? 'all' : key)} title={title || 'Bấm để lọc'}
                      style={{ padding: '4px 12px', borderRadius: 999, border: on ? `2px solid ${fg}` : '2px solid transparent',
                        background: on ? fg : bg, color: on ? '#fff' : fg, fontWeight: 800, fontSize: '0.76rem',
                        cursor: clickable ? 'pointer' : 'default', opacity: clickable ? 1 : 0.5 }}>
                      {label} {count}{on ? ' ✕' : ''}
                    </button>
                  );
                };
                return <>
                  {chip('all', 'Tổng', otList.length, '#475569', '#f1f5f9')}
                  {chip('wait', '⏳ Chờ lên clip', otCnt.wait, '#d97706', '#fffbeb')}
                  {chip('over', '⚠️ Quá hạn', otCnt.over, '#dc2626', '#fef2f2')}
                  {chip('aired', '✅ Đã lên clip', otCnt.aired, '#16a34a', '#f0fdf4')}
                  {chip('old', '🔁 KOC cũ', otOld, '#0891b2', '#ecfeff', 'KOC đã air brand này trước khi order (KOC quen)')}
                </>;
              })()}
            </div>
            {orderTags === null ? <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>⏳ Đang tải...</div>
              : otList.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Bạn này chưa order KOC nào từ tháng 7.</div>
              : (
                <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ position: 'sticky', top: 0, background: '#faf5ff', zIndex: 1 }}>
                      <th style={{ ...th, padding: '8px' }}>#</th>
                      <th style={{ ...th, padding: '8px', width: '100%' }}>KOC</th>
                      <th style={{ ...th, padding: '8px' }}>Brand</th>
                      <th style={{ ...th, padding: '8px', textAlign: 'center' }} title="Ngày order gần nhất = mốc tính 30 ngày">📦 Ngày order</th>
                      <th style={{ ...th, padding: '8px', textAlign: 'center' }}>Trạng thái lên clip</th>
                    </tr></thead>
                    <tbody>
                      {otShown.map((t, i) => {
                        const st = otStatus(t);
                        return (
                          <tr key={t.koc_id + '|' + t.brand_name}>
                            <td style={{ ...td, padding: '9px 8px', color: '#94a3b8', fontWeight: 700 }}>{i + 1}</td>
                            <td style={{ ...td, padding: '9px 8px', width: '100%' }}><a href={`https://www.tiktok.com/@${t.koc_id}`} target="_blank" rel="noreferrer" style={{ color: '#475569', textDecoration: 'none', fontWeight: 600 }}>@{t.koc_id}</a>{t.aired_before && <span title="Đã air brand này trước khi order (KOC quen)" style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 999, background: '#ecfeff', color: '#0891b2', fontWeight: 800, fontSize: '0.66rem', verticalAlign: 'middle' }}>🔁 cũ</span>}</td>
                            <td style={{ ...td, padding: '9px 8px', fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>{t.brand_name}</td>
                            <td style={{ ...td, padding: '9px 8px', textAlign: 'center', fontSize: '0.76rem', color: '#64748b' }}>{dateLabel(t.tag_date)}</td>
                            <td style={{ ...td, padding: '9px 8px', textAlign: 'center' }}>
                              <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: st.bg, color: st.color, fontWeight: 700, fontSize: '0.74rem', whiteSpace: 'nowrap' }}>{st.txt}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
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
                <Mini icon="💰" label="Tổng ngân sách" val={fmtVnd(budget) + 'đ'} color="#475569" />
                <Mini icon="🔥" label="Đã xài" val={fmtVnd(cast) + 'đ'} color="#ea580c" />
                <Mini icon="💵" label="Còn lại" val={fmtVnd(remain) + 'đ'} color={remain < 0 ? '#dc2626' : '#16a34a'} />
                <Mini icon="👤" label="TB / 1 KOC" val={fmtVnd(avgKoc) + 'đ'} color="#9333ea" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <Mini icon="⏱️" label="Burn rate / ngày" val={fmtVnd(burn) + 'đ'} color="#475569" />
              <Mini icon="⚖️" label="CAST / GMV" val={num(r.aff_gmv) > 0 ? (cast / num(r.aff_gmv) * 100).toFixed(1) + '%' : '—'} color="#475569" />
            </div>

            {/* DANH SÁCH VIDEO BOOKING CAST — xài tiền cho video / brand / sản phẩm gì, khi nào (nguồn: Thanh toán KOC) */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 700, color: '#475569', fontSize: '0.85rem' }}>🎬 Video booking cast trong kỳ {Array.isArray(castVids) ? `· ${castVids.length} video` : ''}</div>
                {Array.isArray(castVids) && castVids.length > 0 && <span style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: 700 }}>Σ cast {fmtVnd(castVidTot)}đ</span>}
              </div>
              {!Array.isArray(castVids) ? chartLoading(120)
                : castVids.length === 0 ? <div style={{ fontSize: '0.78rem', color: '#94a3b8', padding: 12, textAlign: 'center', background: '#f8fafc', borderRadius: 10 }}>Chưa có video cast trong kỳ.</div>
                : (
                <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                        <th style={vth}>Ngày air</th><th style={vth}>Brand</th><th style={{ ...vth, textAlign: 'left' }}>Sản phẩm</th><th style={{ ...vth, textAlign: 'right' }}>Cast</th><th style={vth}>Link</th><th style={vth}>TT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {castVids.map((v, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={vtd}>{v.air_date ? new Date(v.air_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</td>
                          <td style={{ ...vtd, fontWeight: 700, color: BRAND_COLOR[(v.brand || '').toUpperCase()] || '#475569' }}>{v.brand || '—'}</td>
                          <td style={{ ...vtd, textAlign: 'left', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.product_name || v.video_title || ''}>{v.product_name || v.video_title || <span style={{ color: '#cbd5e1' }}>(chưa có)</span>}</td>
                          <td style={{ ...vtd, textAlign: 'right', fontWeight: 700, color: '#ea580c' }}>{fmtVnd(v.cast_net)}</td>
                          <td style={vtd}>{v.air_link ? <a href={v.air_link.split('\n')[0].trim()} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }} title="Mở video">🎬</a> : '—'}</td>
                          <td style={vtd} title={v.paid ? 'Đã thanh toán' : 'Chưa thanh toán'}>{v.paid ? '✅' : '⏳'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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

          {/* ═══ LINK AIR CỦA NHÂN SỰ ═══ (không có cột cast/cms/đã order) */}
          <Section icon="🔗" title="Link air của nhân sự" hint={airRows == null ? 'đang tải…' : `${fmt(airTotal)} link${airQ ? ' (khớp tìm kiếm)' : ' · toàn bộ từ trước tới nay'}`} accent={{ bg: '#eff6ff', fg: '#1d4ed8' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={airSearch} onChange={e => setAirSearch(e.target.value)} placeholder="🔎 Tìm ID kênh / video / SP / brand... (tìm trong TẤT CẢ link)" style={{ ...ctrl, flex: '1 1 260px' }} />
            </div>
            {airRows == null ? (
              <div style={{ color: '#94a3b8', fontSize: '0.86rem', padding: 10 }}>⏳ Đang tải link air...</div>
            ) : airTotal === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: '0.86rem', padding: 10 }}>{airQ ? 'Không tìm thấy link khớp.' : 'Nhân sự này chưa có link air nào.'}</div>
            ) : (
              <>
                <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #f1f5f9' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['STT', 'LINK AIR', 'ID KÊNH', 'ID VIDEO', 'BRAND', 'SẢN PHẨM', 'NGÀY AIR', 'TRẠNG THÁI'].map((h, i) => (
                          <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(airRows || []).map((a, i) => (
                        <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '9px 12px', fontSize: '0.8rem', color: '#94a3b8' }}>{(airPageC - 1) * AIR_PER + i + 1}</td>
                          <td style={{ padding: '9px 12px', fontSize: '0.82rem', maxWidth: 210 }}>
                            {a.link_air_koc ? <a href={a.link_air_koc} target="_blank" rel="noreferrer" style={{ color: '#f97316', fontWeight: 700, textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.link_air_koc}</a> : '—'}
                          </td>
                          <td style={{ padding: '9px 12px', fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>{a.id_kenh || '—'}</td>
                          <td style={{ padding: '9px 12px', fontSize: '0.78rem', color: '#64748b' }}>{a.id_video || '—'}</td>
                          <td style={{ padding: '9px 12px', fontSize: '0.8rem', color: '#334155' }}>{a.ten_brand || '—'}</td>
                          <td style={{ padding: '9px 12px', fontSize: '0.8rem', color: '#334155', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.san_pham || ''}>{a.san_pham || '—'}</td>
                          <td style={{ padding: '9px 12px', fontSize: '0.8rem', color: '#334155', whiteSpace: 'nowrap' }}>{a.ngay_air ? new Date(a.ngay_air).toLocaleDateString('vi-VN') : '—'}</td>
                          <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: '0.74rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: a.status === 'Đã On-air' ? '#dcfce7' : '#fef9c3', color: a.status === 'Đã On-air' ? '#166534' : '#a16207' }}>
                              {a.status === 'Đã On-air' ? '🟢 Đã On-air' : '🟡 Chưa air'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {airTotalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 6 }}>
                    <button onClick={() => setAirPage(p => Math.max(1, p - 1))} disabled={airPageC <= 1} style={{ ...ctrl, cursor: airPageC <= 1 ? 'default' : 'pointer', opacity: airPageC <= 1 ? 0.5 : 1 }}>‹ Trước</button>
                    <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 700 }}>Trang {airPageC}/{airTotalPages}</span>
                    <button onClick={() => setAirPage(p => Math.min(airTotalPages, p + 1))} disabled={airPageC >= airTotalPages} style={{ ...ctrl, cursor: airPageC >= airTotalPages ? 'default' : 'pointer', opacity: airPageC >= airTotalPages ? 0.5 : 1 }}>Sau ›</button>
                  </div>
                )}
              </>
            )}
          </Section>

        </div>
    </div>
  );
}

export default BookingStaffReportTab;
