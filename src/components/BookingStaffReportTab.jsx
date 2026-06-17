// src/components/BookingStaffReportTab.jsx
// Báo cáo Booking theo nhân sự — dashboard hiện đại. Gộp Module 1 (đơn gửi) + Hiệu suất KOC (affiliate)
// + CAST đã dùng (koc_payments). Ngân sách CAST = max(15tr, GMV×2.2%) (định mức cũ).
import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
const daysInMonth = (m, y) => new Date(y, m, 0).getDate();

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

// ── styles ───────────────────────────────────────────────────────────────────
const wrap = { background: '#f1f5f9', minHeight: '100vh', margin: '-20px', padding: '24px 28px', fontFamily: "'Outfit', sans-serif" };
const card = { background: '#fff', borderRadius: 16, boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)', border: '1px solid #f1f5f9' };
const sel = { padding: '9px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.88rem', fontWeight: 600, color: '#334155', background: '#fff', cursor: 'pointer' };
const td = { padding: '13px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '0.86rem', color: '#334155', whiteSpace: 'nowrap' };
const th = { padding: '12px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', background: '#f8fafc' };

function BookingStaffReportTab() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState([]);
  const [prevRows, setPrevRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [selStaff, setSelStaff] = useState([]); // multi-select nhân sự
  const [fProduct, setFProduct] = useState('');
  const [detail, setDetail] = useState(null); // nhân sự đang mở modal

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    const pm = month === 1 ? 12 : month - 1;
    const py = month === 1 ? year - 1 : year;
    const [cur, prev] = await Promise.all([
      supabase.rpc('staff_booking_report', { p_month: month, p_year: year }),
      supabase.rpc('staff_booking_report', { p_month: pm, p_year: py }),
    ]);
    if (cur.error) setErr(cur.error.message); else setRows(cur.data || []);
    setPrevRows(prev.data || []);
    setLoading(false);
  }, [month, year]);
  useEffect(() => { load(); }, [load]);

  const allStaff = useMemo(() => rows.map(r => r.ten_nhansu), [rows]);
  const filtered = useMemo(() => rows.filter(r =>
    (selStaff.length === 0 || selStaff.includes(r.ten_nhansu)) &&
    (!fProduct || (r.top_product || '').toLowerCase().includes(fProduct.toLowerCase()))
  ), [rows, selStaff, fProduct]);

  const sumRows = (rs) => rs.reduce((a, r) => ({
    don: a.don + num(r.so_don), mau: a.mau + num(r.so_mau), koc: a.koc + num(r.koc_count),
    gmv: a.gmv + num(r.aff_gmv), video: a.video + num(r.aff_videos), view: a.view + num(r.aff_views),
    cast: a.cast + num(r.cast_used), budget: a.budget + BUDGET(r.aff_gmv),
  }), { don: 0, mau: 0, koc: 0, gmv: 0, video: 0, view: 0, cast: 0, budget: 0 });
  const T = useMemo(() => sumRows(filtered), [filtered]);
  const P = useMemo(() => sumRows(prevRows), [prevRows]);
  const delta = (cur, prev) => prev > 0 ? ((cur - prev) / prev * 100) : (cur > 0 ? 100 : 0);

  const resetFilters = () => { setSelStaff([]); setFProduct(''); };
  const exportExcel = async () => {
    const XLSX = await import('xlsx').then(m => m.default || m);
    const aoa = [['Nhân sự', 'Đơn gửi', 'Mẫu', 'TS/ngày', 'SP chính', 'KOC gắn', 'Video kỳ', 'View', 'GMV', 'CAST dùng', 'CAST còn lại', 'ROAS', 'Hiệu suất']];
    filtered.forEach(r => { const b = perfBadge(r.aff_gmv, r.cast_used); const budget = BUDGET(r.aff_gmv);
      aoa.push([r.ten_nhansu, r.so_don, r.so_mau, r.tan_suat, r.top_product || '', r.koc_count, r.aff_videos, r.aff_views, Math.round(r.aff_gmv), Math.round(r.cast_used), Math.round(budget - r.cast_used), b.roas === Infinity ? '∞' : b.roas.toFixed(1), b.label]); });
    const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BaoCaoNhanSu'); XLSX.writeFile(wb, `bao-cao-nhan-su-T${month}-${year}.xlsx`);
  };

  const KPIS = [
    { label: 'Tổng đơn gửi', val: fmt(T.don), d: delta(T.don, P.don), sub: `${fmt(T.mau)} mẫu`, icon: '📦', color: '#f97316' },
    { label: 'KOC đã gắn', val: fmt(T.koc), d: delta(T.koc, P.koc), sub: `${rows.length} nhân sự`, icon: '🏷️', color: '#9333ea' },
    { label: 'GMV (KOC gắn)', val: fmtVnd(T.gmv) + ' đ', d: delta(T.gmv, P.gmv), sub: `ROAS ${T.cast > 0 ? (T.gmv / T.cast).toFixed(1) : '∞'}x`, icon: '💰', color: '#16a34a' },
    { label: 'Video kỳ', val: fmt(T.video), d: delta(T.video, P.video), sub: `${fmtView(T.view)} view`, icon: '🎬', color: '#7c3aed' },
    { label: 'View', val: fmtView(T.view), d: delta(T.view, P.view), sub: `${T.video > 0 ? fmtView(T.view / T.video) : 0}/video`, icon: '👁️', color: '#0891b2' },
    { label: 'CAST đã dùng', val: fmtVnd(T.cast) + ' đ', d: delta(T.cast, P.cast), sub: `${T.budget > 0 ? (T.cast / T.budget * 100).toFixed(0) : 0}% ngân sách`, icon: '🔥', color: '#ea580c' },
    { label: 'CAST còn lại', val: fmtVnd(T.budget - T.cast) + ' đ', d: null, sub: `Ngân sách ${fmtVnd(T.budget)}`, icon: '💵', color: '#0ea5e9' },
    { label: 'CAST / GMV', val: T.gmv > 0 ? (T.cast / T.gmv * 100).toFixed(1) + '%' : '—', d: null, sub: T.cast > 0 ? `ROAS ${(T.gmv / T.cast).toFixed(1)}x` : 'chưa chi', icon: '⚖️', color: '#475569' },
  ];

  return (
    <div style={wrap}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>📑 Báo Cáo Nhân Sự — Booking</h2>
      <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 18px' }}>Đơn gửi (Module 1) · KOC đã gắn · GMV / CAST / Video · so với kỳ trước.</p>

      {/* Filters */}
      <div style={{ ...card, padding: '14px 16px', marginBottom: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={month} onChange={e => setMonth(+e.target.value)} style={sel}>{Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>Tháng {m}</option>)}</select>
        <select value={year} onChange={e => setYear(+e.target.value)} style={sel}>{[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}</select>
        <select multiple={false} value={selStaff[0] || ''} onChange={e => setSelStaff(e.target.value ? [e.target.value] : [])} style={{ ...sel, minWidth: 150 }}>
          <option value="">Tất cả nhân sự</option>
          {allStaff.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input value={fProduct} onChange={e => setFProduct(e.target.value)} placeholder="🔍 Lọc sản phẩm chính..." style={{ ...sel, cursor: 'text', minWidth: 180 }} />
        <button onClick={resetFilters} style={{ ...sel, color: '#64748b' }}>↺ Reset</button>
        <div style={{ flex: 1 }} />
        <button onClick={load} style={{ ...sel, background: '#f97316', color: '#fff', border: 'none', fontWeight: 700 }}>{loading ? '⏳ Đang tải...' : '🔄 Tải lại'}</button>
        <button onClick={exportExcel} style={{ ...sel, background: '#16a34a', color: '#fff', border: 'none', fontWeight: 700 }}>📊 Xuất Excel</button>
      </div>

      {err && <div style={{ ...card, background: '#fef2f2', borderColor: '#fecaca', color: '#dc2626', padding: '12px 16px', marginBottom: 16 }}>❌ {err}</div>}

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 20 }}>
        {KPIS.map((k, i) => (
          <div key={i} style={{ ...card, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -10, right: -10, width: 56, height: 56, borderRadius: '50%', background: k.color, opacity: 0.08 }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{k.icon} {k.label}</span>
              {k.d !== null && Number.isFinite(k.d) && (
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
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1080 }}>
            <thead>
              <tr>
                <th style={th}>#</th><th style={th}>Nhân sự</th>
                <th style={{ ...th, textAlign: 'right' }}>Đơn</th><th style={{ ...th, textAlign: 'right' }}>Mẫu</th>
                <th style={{ ...th, textAlign: 'right' }}>TS/ngày</th><th style={th}>SP chính</th>
                <th style={{ ...th, textAlign: 'right' }}>KOC</th><th style={{ ...th, textAlign: 'right' }}>Video</th>
                <th style={{ ...th, textAlign: 'right' }}>View</th><th style={{ ...th, textAlign: 'right' }}>GMV</th>
                <th style={{ ...th, textAlign: 'right' }}>CAST dùng</th><th style={{ ...th, textAlign: 'right' }}>CAST còn</th>
                <th style={{ ...th, textAlign: 'center' }}>Hiệu suất</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={13} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: 40 }}>⏳ Đang tải...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={13} style={{ ...td, textAlign: 'center', color: '#94a3b8', padding: 40 }}>Không có dữ liệu.</td></tr>}
              {!loading && filtered.map((r, i) => {
                const b = perfBadge(r.aff_gmv, r.cast_used); const budget = BUDGET(r.aff_gmv); const remain = budget - num(r.cast_used);
                return (
                  <tr key={r.nhansu_id} onClick={() => setDetail(r)} style={{ cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                    <td style={{ ...td, color: '#94a3b8', fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ ...td, fontWeight: 700, color: '#0f172a' }}>{r.ten_nhansu}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmt(r.so_don)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmt(r.so_mau)}</td>
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
      <p style={{ color: '#94a3b8', fontSize: '0.76rem', marginTop: 10 }}>* CAST đã dùng = thanh toán KOC thực tế (koc_payments). Ngân sách CAST = max(15tr, GMV×2.2%). Hiệu suất theo ROAS = GMV/CAST. Bấm 1 dòng để xem chi tiết.</p>

      {detail && <StaffDetailModal r={detail} month={month} year={year} onClose={() => setDetail(null)} />}
    </div>
  );
}

// ── Modal chi tiết nhân sự ────────────────────────────────────────────────────
function StaffDetailModal({ r, month, year, onClose }) {
  const budget = BUDGET(r.aff_gmv);
  const cast = num(r.cast_used);
  const remain = budget - cast;
  const b = perfBadge(r.aff_gmv, r.cast_used);
  const today = new Date();
  const isCurMonth = today.getMonth() + 1 === month && today.getFullYear() === year;
  const daysPassed = isCurMonth ? today.getDate() : daysInMonth(month, year);
  const dim = daysInMonth(month, year);
  const burn = daysPassed > 0 ? cast / daysPassed : 0;
  const forecast = burn * dim;
  const kocList = Array.isArray(r.koc_list) ? r.koc_list : [];
  const bd = r.brand_dist && typeof r.brand_dist === 'object' ? r.brand_dist : {};
  const bdE = Object.entries(bd).sort((a, c) => c[1] - a[1]);
  const bdTot = bdE.reduce((s, [, v]) => s + num(v), 0) || 1;

  // Funnel: Đơn gửi → Mẫu → KOC gắn → Video kỳ
  const funnel = [
    { label: 'Đơn gửi', v: num(r.so_don), color: '#f97316' },
    { label: 'Mẫu gửi', v: num(r.so_mau), color: '#fb923c' },
    { label: 'KOC gắn', v: num(r.koc_count), color: '#9333ea' },
    { label: 'Video kỳ', v: num(r.aff_videos), color: '#7c3aed' },
  ];
  const fmax = Math.max(...funnel.map(f => f.v), 1);
  const ratios = [
    { label: 'Tỷ lệ KOC gắn / đơn', v: num(r.so_don) > 0 ? (num(r.koc_count) / num(r.so_don) * 100).toFixed(0) + '%' : '—' },
    { label: 'Video / KOC gắn', v: num(r.koc_count) > 0 ? (num(r.aff_videos) / num(r.koc_count)).toFixed(2) : '—' },
    { label: 'View / video', v: num(r.aff_videos) > 0 ? fmtView(num(r.aff_views) / num(r.aff_videos)) : '—' },
    { label: 'GMV / video', v: num(r.aff_videos) > 0 ? fmtVnd(num(r.aff_gmv) / num(r.aff_videos)) : '—' },
    { label: 'GMV / KOC', v: num(r.koc_count) > 0 ? fmtVnd(num(r.aff_gmv) / num(r.koc_count)) : '—' },
    { label: 'ROAS Booking', v: cast > 0 ? (num(r.aff_gmv) / cast).toFixed(1) + 'x' : '∞' },
  ];
  const castPct = budget > 0 ? Math.min(100, cast / budget * 100) : 0;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 9999, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 720, height: '100%', background: '#f8fafc', overflowY: 'auto', boxShadow: '-8px 0 40px rgba(0,0,0,0.2)', animation: 'fadeIn 0.2s' }}>
        {/* header */}
        <div style={{ background: 'linear-gradient(135deg, #ff8c42, #f5591a)', padding: '22px 26px', color: '#fff', position: 'sticky', top: 0, zIndex: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{r.ten_nhansu}</div>
              <div style={{ fontSize: '0.82rem', opacity: 0.9 }}>Báo cáo Tháng {month}/{year}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ background: '#fff', color: b.color, fontWeight: 800, fontSize: '0.8rem', padding: '5px 14px', borderRadius: 20 }}>{b.label}</span>
              <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.25)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', fontSize: '1.1rem', cursor: 'pointer' }}>✕</button>
            </div>
          </div>
        </div>

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* KPI riêng */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[['Đơn gửi', fmt(r.so_don)], ['KOC gắn', fmt(r.koc_count)], ['GMV', fmtVnd(r.aff_gmv)], ['CAST dùng', fmtVnd(cast)]].map(([l, v], i) => (
              <div key={i} style={{ ...card, padding: '12px 14px' }}>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{l}</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Funnel */}
          <div style={{ ...card, padding: '16px 18px' }}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12, fontSize: '0.9rem' }}>🔻 Funnel hoạt động</div>
            {funnel.map((f, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, color: '#475569' }}>{f.label}</span>
                  <span style={{ fontWeight: 800, color: f.color }}>{fmt(f.v)}{i > 0 && funnel[i - 1].v > 0 && <span style={{ color: '#94a3b8', fontWeight: 600 }}> ({(f.v / funnel[i - 1].v * 100).toFixed(0)}%)</span>}</span>
                </div>
                <div style={{ background: '#f1f5f9', borderRadius: 8, height: 22, overflow: 'hidden' }}>
                  <div style={{ width: `${(f.v / fmax * 100).toFixed(0)}%`, background: f.color, height: '100%', borderRadius: 8, transition: 'width 0.4s' }} />
                </div>
              </div>
            ))}
          </div>

          {/* CAST */}
          <div style={{ ...card, padding: '16px 18px' }}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12, fontSize: '0.9rem' }}>🔥 Ngân sách CAST</div>
            <div style={{ background: '#f1f5f9', borderRadius: 10, height: 26, overflow: 'hidden', marginBottom: 12, position: 'relative' }}>
              <div style={{ width: `${castPct}%`, background: castPct > 90 ? '#dc2626' : 'linear-gradient(90deg,#fb923c,#ea580c)', height: '100%' }} />
              <span style={{ position: 'absolute', left: 10, top: 3, fontSize: '0.78rem', fontWeight: 800, color: castPct > 50 ? '#fff' : '#334155' }}>{castPct.toFixed(0)}% đã dùng</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: '0.82rem' }}>
              {[['Ngân sách (định mức)', fmtVnd(budget) + ' đ', '#475569'], ['Đã dùng', fmtVnd(cast) + ' đ', '#ea580c'],
                ['Còn lại', fmtVnd(remain) + ' đ', remain < 0 ? '#dc2626' : '#16a34a'], ['Burn rate/ngày', fmtVnd(burn) + ' đ', '#475569'],
                ['Dự báo cuối tháng', fmtVnd(forecast) + ' đ', forecast > budget ? '#dc2626' : '#0ea5e9'], ['CAST / GMV', num(r.aff_gmv) > 0 ? (cast / num(r.aff_gmv) * 100).toFixed(1) + '%' : '—', '#475569']].map(([l, v, c], i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>{l}</span><span style={{ fontWeight: 800, color: c }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Ratios */}
          <div style={{ ...card, padding: '16px 18px' }}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12, fontSize: '0.9rem' }}>📐 Chỉ số hiệu quả</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {ratios.map((x, i) => (
                <div key={i} style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>{x.v}</div>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600 }}>{x.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Brand */}
          <div style={{ ...card, padding: '16px 18px' }}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12, fontSize: '0.9rem' }}>📊 Phân bổ brand gửi</div>
            {bdE.length === 0 ? <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Không có</span> : bdE.map(([brand, v]) => (
              <div key={brand} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                <span style={{ width: 105, fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>{brand}</span>
                <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 6, height: 16, overflow: 'hidden' }}>
                  <div style={{ width: `${(num(v) / bdTot * 100).toFixed(0)}%`, background: BRAND_COLOR[brand] || '#fb923c', height: '100%' }} />
                </div>
                <span style={{ width: 70, fontSize: '0.78rem', fontWeight: 700, textAlign: 'right' }}>{fmt(v)} ({(num(v) / bdTot * 100).toFixed(0)}%)</span>
              </div>
            ))}
          </div>

          {/* KOC list */}
          <div style={{ ...card, padding: '16px 18px' }}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12, fontSize: '0.9rem' }}>🏷️ KOC đã gắn ({kocList.length})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {kocList.length === 0 ? <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Chưa gắn KOC</span> : kocList.map(u => (
                <a key={u} href={`https://www.tiktok.com/@${u}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 20, padding: '4px 11px', color: '#475569', textDecoration: 'none' }}>@{u}</a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BookingStaffReportTab;
