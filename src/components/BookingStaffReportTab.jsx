// src/components/BookingStaffReportTab.jsx
// Báo cáo Booking theo nhân sự: gộp Module 1 (đơn gửi) + Hiệu suất KOC (affiliate qua phần gắn KOC).
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
const fmtVnd = (n) => {
  const v = Number(n || 0);
  if (v >= 1e9) return (v / 1e9).toFixed(2) + ' tỷ';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return Math.round(v / 1e3) + 'K';
  return fmt(v);
};
const fmtViews = (n) => {
  const v = Number(n || 0);
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return fmt(v);
};

const BRAND_COLOR = { BODYMISS: '#3b82f6', EHERB: '#f59e0b', 'EHERB HCM': '#d97706', MILAGANICS: '#ec4899', 'MOAW MOAWS': '#10b981', 'REAL STEEL': '#8b5cf6', HEALMI: '#06b6d4', MASUBE: '#64748b' };

const cellTd = { padding: '12px 10px', borderBottom: '1px solid #f1f5f9', fontSize: '0.88rem', color: '#334155' };
const headTh = { padding: '12px 10px', textAlign: 'left', fontSize: '0.74rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' };

function BookingStaffReportTab() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    setLoading(true); setErr(''); setExpanded(null);
    const { data, error } = await supabase.rpc('staff_booking_report', { p_month: month, p_year: year });
    if (error) setErr(error.message); else setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month, year]);

  const totals = useMemo(() => rows.reduce((a, r) => ({
    don: a.don + Number(r.so_don || 0), mau: a.mau + Number(r.so_mau || 0),
    koc: a.koc + Number(r.koc_count || 0), gmv: a.gmv + Number(r.aff_gmv || 0),
    video: a.video + Number(r.aff_videos || 0), view: a.view + Number(r.aff_views || 0),
  }), { don: 0, mau: 0, koc: 0, gmv: 0, video: 0, view: 0 }), [rows]);

  const exportExcel = async () => {
    const XLSX = await import('xlsx').then(m => m.default || m);
    const aoa = [['Nhân sự', 'Đơn gửi', 'Mẫu', 'Ngày gửi', 'TS/ngày', 'SP chính', 'KOC gắn', 'GMV (KOC)', 'Video kỳ', 'View']];
    rows.forEach(r => aoa.push([r.ten_nhansu, r.so_don, r.so_mau, r.so_ngay, r.tan_suat, r.top_product || '', r.koc_count, Math.round(r.aff_gmv || 0), r.aff_videos, r.aff_views]));
    const ws = XLSX.utils.aoa_to_sheet(aoa); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BaoCaoNhanSu');
    XLSX.writeFile(wb, `bao-cao-nhan-su-T${month}-${year}.xlsx`);
  };

  const sel = { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.9rem', fontWeight: 600, color: '#334155', background: '#fff' };

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif" }}>
      <h2 className="section-title" style={{ fontSize: '1.5rem', color: '#FF6600', marginBottom: 4 }}>📑 Báo Cáo Nhân Sự (Booking)</h2>
      <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 0, marginBottom: 18 }}>Đơn gửi (Module 1) + hiệu suất KOC đã gắn — theo từng nhân sự, lọc theo tháng.</p>

      {/* Bộ lọc */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
        <select value={month} onChange={e => setMonth(Number(e.target.value))} style={sel}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>Tháng {m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))} style={sel}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={load} className="btn-primary" style={{ padding: '8px 18px' }}>{loading ? '⏳ Đang tải...' : '🔄 Tải lại'}</button>
        {rows.length > 0 && <button onClick={exportExcel} className="btn-secondary" style={{ padding: '8px 18px' }}>📊 Xuất Excel</button>}
      </div>

      {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '12px 16px', borderRadius: 10, marginBottom: 16 }}>❌ {err}</div>}

      {/* KPI tổng */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'Tổng đơn gửi', value: fmt(totals.don), icon: '📦' },
          { label: 'Tổng mẫu', value: fmt(totals.mau), icon: '🎁' },
          { label: 'KOC đã gắn', value: fmt(totals.koc), icon: '🏷️' },
          { label: 'GMV (KOC gắn)', value: fmtVnd(totals.gmv) + ' đ', icon: '💰' },
          { label: 'Video kỳ', value: fmt(totals.video), icon: '🎬' },
          { label: 'View', value: fmtViews(totals.view), icon: '👁️' },
        ].map((k, i) => (
          <div key={i} className="mirinda-card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{k.icon} {k.label}</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Bảng nhân sự */}
      <div className="mirinda-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
            <thead style={{ background: '#fff7ed' }}>
              <tr>
                <th style={headTh}>#</th>
                <th style={headTh}>Nhân sự</th>
                <th style={{ ...headTh, textAlign: 'right' }}>Đơn gửi</th>
                <th style={{ ...headTh, textAlign: 'right' }}>Mẫu</th>
                <th style={{ ...headTh, textAlign: 'right' }}>TS/ngày</th>
                <th style={headTh}>SP chính</th>
                <th style={{ ...headTh, textAlign: 'right' }}>KOC gắn</th>
                <th style={{ ...headTh, textAlign: 'right' }}>GMV (KOC)</th>
                <th style={{ ...headTh, textAlign: 'right' }}>Video kỳ</th>
                <th style={{ ...headTh, textAlign: 'right' }}>View</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10} style={{ ...cellTd, textAlign: 'center', color: '#94a3b8', padding: 30 }}>⏳ Đang tải...</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={10} style={{ ...cellTd, textAlign: 'center', color: '#94a3b8', padding: 30 }}>Không có dữ liệu cho tháng này.</td></tr>}
              {!loading && rows.map((r, i) => {
                const isOpen = expanded === r.nhansu_id;
                const kocList = Array.isArray(r.koc_list) ? r.koc_list : [];
                const bd = r.brand_dist && typeof r.brand_dist === 'object' ? r.brand_dist : {};
                const bdEntries = Object.entries(bd).sort((a, b) => b[1] - a[1]);
                const bdTotal = bdEntries.reduce((s, [, v]) => s + Number(v), 0) || 1;
                return (
                  <React.Fragment key={r.nhansu_id}>
                    <tr onClick={() => setExpanded(isOpen ? null : r.nhansu_id)}
                        style={{ cursor: 'pointer', background: isOpen ? '#fff7ed' : '#fff' }}
                        onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = '#fafafa'; }}
                        onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = '#fff'; }}>
                      <td style={{ ...cellTd, color: '#94a3b8', fontWeight: 700 }}>{isOpen ? '▼' : '▸'} {i + 1}</td>
                      <td style={{ ...cellTd, fontWeight: 700, color: '#0f172a' }}>{r.ten_nhansu}</td>
                      <td style={{ ...cellTd, textAlign: 'right', fontWeight: 700 }}>{fmt(r.so_don)}</td>
                      <td style={{ ...cellTd, textAlign: 'right' }}>{fmt(r.so_mau)}</td>
                      <td style={{ ...cellTd, textAlign: 'right', color: '#0ea5e9', fontWeight: 700 }}>{r.tan_suat}</td>
                      <td style={{ ...cellTd, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.top_product || ''}>{r.top_product || '—'}</td>
                      <td style={{ ...cellTd, textAlign: 'right', fontWeight: 700, color: '#9333ea' }}>{fmt(r.koc_count)}</td>
                      <td style={{ ...cellTd, textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>{fmtVnd(r.aff_gmv)}</td>
                      <td style={{ ...cellTd, textAlign: 'right', fontWeight: 700, color: '#7c3aed' }}>{fmt(r.aff_videos)}</td>
                      <td style={{ ...cellTd, textAlign: 'right', color: '#0891b2' }}>{fmtViews(r.aff_views)}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={10} style={{ padding: '16px 20px', background: '#fffaf5', borderBottom: '1px solid #f1f5f9' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                            {/* Phân bổ brand */}
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#475569', marginBottom: 10 }}>📊 Phân bổ brand gửi (theo số mẫu)</div>
                              {bdEntries.length === 0 ? <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Không có</span> : bdEntries.map(([b, v]) => (
                                <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                  <span style={{ width: 110, fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>{b}</span>
                                  <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 6, height: 18, overflow: 'hidden' }}>
                                    <div style={{ width: `${(Number(v) / bdTotal * 100).toFixed(0)}%`, background: BRAND_COLOR[b] || '#fb923c', height: '100%' }} />
                                  </div>
                                  <span style={{ width: 70, fontSize: '0.8rem', fontWeight: 700, color: '#334155', textAlign: 'right' }}>{fmt(v)} ({(Number(v) / bdTotal * 100).toFixed(0)}%)</span>
                                </div>
                              ))}
                            </div>
                            {/* Danh sách KOC gắn */}
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#475569', marginBottom: 10 }}>🏷️ KOC đã gắn ({kocList.length})</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                                {kocList.length === 0 ? <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Chưa gắn KOC nào</span> : kocList.map(u => (
                                  <a key={u} href={`https://www.tiktok.com/@${u}`} target="_blank" rel="noreferrer"
                                     style={{ fontSize: '0.78rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: '3px 10px', color: '#475569', textDecoration: 'none' }}>@{u}</a>
                                ))}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: 10 }}>* Video kỳ = video KOC gắn ĐĂNG trong tháng đã chọn. GMV = doanh số affiliate của KOC gắn (đúng shop của brand) trong tháng. Bấm 1 dòng để xem brand + danh sách KOC.</p>
    </div>
  );
}

export default BookingStaffReportTab;
