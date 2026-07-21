// src/components/DailyReportTab.jsx
//
// Module 8 — Daily Report (nhóm CSKH). Bố cục theo brief, màu cam chủ đạo web.
// 1) Đồng bộ số (chọn ngày) → 2) Tổng hợp KPI (gom từ các module) →
// 3) AI/CS Summary (tự gợi ý + CS sửa, lưu) → 4) Xuất Excel / In PDF.
// Bảng: daily_reports. RPC: daily_report_kpi(p_date).

import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';

const ACCENT = '#ff6a2c';
const ACCENT2 = '#ff7a30';
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtMoney = (v) => (Number(v) || 0).toLocaleString('vi-VN');
const fmtDateVN = (s) => { const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s; };

const card = { background: '#fff', borderRadius: 12, border: '1px solid #ffe2d1', padding: '14px 16px', boxShadow: '0 1px 3px rgba(255,106,44,0.08)' };
const labelStyle = { fontSize: '0.7rem', fontWeight: 800, color: '#9a7a68', textTransform: 'uppercase', letterSpacing: '0.3px' };

// Nhóm KPI để render (key khớp RPC daily_report_kpi)
const GROUPS = [
  {
    title: '🛒 Vận hành đơn hàng', items: [
      { k: 'shopee_orders', label: 'Đơn Shopee' },
      { k: 'shopee_gmv', label: 'GMV Shopee', money: true },
      { k: 'tiktok_orders', label: 'Đơn TikTok' },
      { k: 'tiktok_gmv', label: 'GMV TikTok', money: true },
      { k: 'shopee_cancel', label: 'Đơn hủy Shopee', warn: true },
    ],
  },
  {
    title: '↩️ Trả hàng & Khiếu nại', items: [
      { k: 'return_open', label: 'Trả hàng đang mở' },
      { k: 'complaint_open', label: 'Khiếu nại đang mở', warn: true },
      { k: 'cases_open', label: 'Tổng đang xử lý' },
      { k: 'cases_overdue', label: 'Quá hạn (>3N)', warn: true },
    ],
  },
  {
    title: '🎫 CSKH khác', items: [
      { k: 'voucher_new', label: 'Voucher cấp' },
      { k: 'voucher_value', label: 'Giá trị voucher', money: true },
      { k: 'defect_new', label: 'SP lỗi mới', warn: true },
      { k: 'seeding_spend', label: 'Chi Seeding', money: true },
    ],
  },
];

const suggestSummary = (date, k) => {
  const L = [];
  L.push(`📅 BÁO CÁO NGÀY ${fmtDateVN(date)}`);
  L.push('');
  L.push(`• Đơn hàng: Shopee ${k.shopee_orders || 0} đơn (GMV ${fmtMoney(k.shopee_gmv)}đ), TikTok ${k.tiktok_orders || 0} đơn (GMV ${fmtMoney(k.tiktok_gmv)}đ). Đơn hủy Shopee: ${k.shopee_cancel || 0}.`);
  L.push(`• Trả hàng/Khiếu nại: ${k.return_open || 0} hồ sơ trả hàng đang mở, ${k.complaint_open || 0} khiếu nại đang mở. Tổng ${k.cases_open || 0} hồ sơ chưa xử lý${(k.cases_overdue || 0) > 0 ? ` (⚠️ ${k.cases_overdue} quá hạn)` : ''}.`);
  L.push(`• Voucher hỗ trợ: cấp ${k.voucher_new || 0} voucher (giá trị ${fmtMoney(k.voucher_value)}đ).`);
  L.push(`• Sản phẩm lỗi mới: ${k.defect_new || 0}.`);
  L.push(`• Chi Seeding: ${fmtMoney(k.seeding_spend)}đ.`);
  L.push('');
  L.push('👉 Điểm nổi bật / cần lưu ý: (CS bổ sung...)');
  return L.join('\n');
};

export default function DailyReportTab({ currentUser }) {
  const [date, setDate] = useState(todayYmd());
  const [kpi, setKpi] = useState(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState('');
  const [saved, setSaved] = useState(false);

  const loadDay = useCallback(async (d) => {
    setLoading(true); setSaved(false);
    const [{ data: k }, { data: rep }] = await Promise.all([
      supabase.rpc('daily_report_kpi', { p_date: d }),
      supabase.from('daily_reports').select('summary').eq('report_date', d).maybeSingle(),
    ]);
    setKpi(k || {});
    setSummary(rep?.summary || suggestSummary(d, k || {}));
    setLoading(false);
  }, []);
  useEffect(() => { loadDay(date); }, [date, loadDay]);

  const saveSummary = async () => {
    const { error } = await supabase.from('daily_reports').upsert(
      { report_date: date, kpi_snapshot: kpi, summary, edited_by: currentUser?.username || '', updated_at: new Date().toISOString() },
      { onConflict: 'report_date' });
    if (error) { alert('Lưu không được: ' + error.message); return; }
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };
  const regen = () => setSummary(suggestSummary(date, kpi || {}));

  const exportXlsx = () => {
    const rows = GROUPS.flatMap(g => g.items.map(it => ({ 'Nhóm': g.title, 'Chỉ số': it.label, 'Giá trị': Number(kpi?.[it.k] || 0) })));
    rows.push({ Nhóm: '', 'Chỉ số': '', 'Giá trị': '' }, { Nhóm: 'TÓM TẮT', 'Chỉ số': summary, 'Giá trị': '' });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'DailyReport'); XLSX.writeFile(wb, `DailyReport_${date}.xlsx`);
  };
  const printPdf = () => window.print();

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1100 }}>
      <style>{`@media print { .no-print { display:none !important; } body { background:#fff; } }`}</style>

      {/* 1) Header — đồng bộ số theo ngày */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>📊 Daily Report</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#b08160' }}>Tổng hợp chỉ số CSKH &amp; vận hành trong ngày — tự gom từ các module</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: '9px 12px', borderRadius: 9, border: `1.5px solid #ffd4bd`, fontSize: 14, fontWeight: 700, color: '#0f172a', fontFamily: 'inherit' }} />
          <button onClick={() => loadDay(date)} style={{ padding: '9px 16px', borderRadius: 9, border: '1.5px solid #ffd4bd', background: '#fff7f3', color: ACCENT, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>🔄 Đồng bộ</button>
          <button onClick={exportXlsx} style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>📥 Excel</button>
          <button onClick={printPdf} style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>🖨️ In PDF</button>
        </div>
      </div>

      {/* Tiêu đề bản in */}
      <div style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`, borderRadius: 14, padding: '18px 22px', marginBottom: 18, color: '#fff' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Báo cáo vận hành &amp; CSKH</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 900, marginTop: 2 }}>Ngày {fmtDateVN(date)}</div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 50, color: '#b08160' }}>⏳ Đang tổng hợp số...</div>
      ) : (
        <>
          {/* 2) Tổng hợp KPI */}
          {GROUPS.map(g => (
            <div key={g.title} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>{g.title}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                {g.items.map(it => {
                  const v = Number(kpi?.[it.k] || 0);
                  const color = it.warn && v > 0 ? '#dc2626' : ACCENT;
                  return (
                    <div key={it.k} style={{ ...card, borderTop: `3px solid ${color}` }}>
                      <div style={{ fontSize: it.money ? '1.15rem' : '1.5rem', fontWeight: 900, color, fontVariantNumeric: 'tabular-nums' }}>
                        {it.money ? fmtMoney(v) : v}{it.money && <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#b08160' }}> đ</span>}
                      </div>
                      <div style={{ ...labelStyle, marginTop: 2 }}>{it.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* 3) AI / CS Summary */}
          <div style={{ ...card, marginBottom: 18, borderTop: `3px solid ${ACCENT}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>📝 Tóm tắt trong ngày <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#b08160' }}>· tự gợi ý từ số, CS chỉnh được</span></div>
              <div className="no-print" style={{ display: 'flex', gap: 8 }}>
                <button onClick={regen} style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #ffd4bd', background: '#fff7f3', color: ACCENT, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>↻ Gợi ý lại từ số</button>
                <button onClick={saveSummary} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: saved ? '#16a34a' : ACCENT, color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>{saved ? '✓ Đã lưu' : '💾 Lưu tóm tắt'}</button>
              </div>
            </div>
            <textarea value={summary} onChange={e => setSummary(e.target.value)}
              style={{ width: '100%', minHeight: 200, boxSizing: 'border-box', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #ffe2d1', fontSize: '0.88rem', lineHeight: 1.6, fontFamily: 'inherit', color: '#1f2937', resize: 'vertical', background: '#fffdfb' }} />
          </div>
        </>
      )}
    </div>
  );
}
