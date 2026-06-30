// src/components/ReportTab.jsx
//
// 📈 Báo cáo tổng quan (Ecom) — chọn Brand + ngày → tổng hợp doanh thu các gian hàng,
// xếp hạng sản phẩm (kèm ảnh), và hiệu suất gửi đơn booking theo nhân sự. Xuất PDF/Excel.
//
// Map cứng (brand → shop_ids + nhân sự) — set 1 lần, chuẩn 100%. Cập nhật ở BRANDS bên dưới.

import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { utils, writeFile } from 'xlsx';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, LabelList,
} from 'recharts';

// ── Map brand ↔ gian hàng + nhân sự ────────────────────────────────────────────
const BRANDS = [
  { key: 'bodymiss', name: 'Bodymiss', brandIds: ['cd3b3c68-d339-4650-9a85-d1fef705b7d6'], shops: [
      { platform: 'tiktok', id: '7495107349171898427', name: 'Body Miss Việt Nam' },
      { platform: 'shopee', id: '1031859035', name: 'Bodymiss Việt Nam' },
    ], staff: [
      { id: 'cb0d16f4-4f84-4c2f-b337-9061d1042098', name: 'Hoàng Vy' },
      { id: '82ead434-8627-45d3-9783-f98ea750b8f3', name: 'Thu Thảo' },
      { id: '0f880376-b2f8-497b-9298-9e9736421c4e', name: 'Minh Thảo' },
    ] },
  { key: 'moaw', name: 'Moaw Moaws', brandIds: ['8a8641a8-9dad-4a87-8dd4-9e15dbac460b'], shops: [
      { platform: 'tiktok', id: '7495831977917385095', name: 'Moaw Moaws Việt Nam' },
      { platform: 'shopee', id: '1017289279', name: 'Moaw Moaws' },
    ], staff: [
      { id: '8588bf31-317f-4bb1-bb0a-0a51f72a023d', name: 'Trúc Quỳnh' },
      { id: 'b8948774-a283-48f4-b0ed-1532dd36f55d', name: 'Nguyên Bảo' },
    ] },
  { key: 'mila', name: 'Milaganics', brandIds: ['31826e73-2688-44e6-bc56-4c31477a7b59'], shops: [
      { platform: 'tiktok', id: '7494813818973817115', name: 'Milaganics Việt Nam' },
      { platform: 'shopee', id: '1243148826', name: 'Milaganics' },
    ], staff: [
      { id: '099cdf9e-a729-4e41-b2d4-2b54233360fb', name: 'Anh Nhi' },
      { id: '9eb572cd-e4a5-4dab-bb78-4b16a8bcf85b', name: 'Tường Vi' },
      { id: 'd6b54949-8e05-42dc-865c-3c9f6bfbef78', name: 'Ngọc Mai' },
    ] },
  { key: 'eherb', name: 'eHerb', brandIds: ['1d7af825-e6e0-4a5e-b2d3-2965141441ee', '43c2c06c-b55b-498a-b93c-0d5eb7c09c32'], shops: [
      { platform: 'tiktok', id: '7495838925500090511', name: 'eHerb Hồ Chí Minh' },
      { platform: 'tiktok', id: '7494529979361168222', name: 'eHerb Việt Nam' },
      { platform: 'shopee', id: '831509831', name: 'eHerb Hồ Chí Minh' },
      { platform: 'shopee', id: '341325550', name: 'eHerb Việt Nam' },
    ], staff: [
      { id: '26399d30-6a62-4181-8ab6-72bf5c9d8b3b', name: 'Tú Trần' },
      { id: '55e44ceb-b81a-4c09-97a9-040bd1a9b4d4', name: 'Lưu Hằng' },
      { id: '240ed700-d1e0-4d75-b6ab-60a29cfdbdcd', name: 'Hoàng Vũ' },
    ] },
  { key: 'healmi', name: 'Healmi', brandIds: ['0de3c90e-1a9d-44fa-b667-396122cf6e88'], shops: [], staff: [
      { id: 'dd7061dd-871f-4d11-89e4-6b3c1e217511', name: 'Hữu Đan' },
    ] },
];

const ACCENT = '#ff6a2c';
const PIE_COLORS = ['#ff6a2c', '#3b82f6', '#16a34a', '#8b5cf6', '#0891b2', '#d97706'];

// ── Helpers ─────────────────────────────────────────────────────────────────────
const fmtVnd = (v) => { const n = Number(v) || 0; if (n >= 1e9) return `${(n / 1e9).toFixed(2)} tỷ`; if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`; if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`; return n.toLocaleString('vi-VN'); };
const fmtNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('vi-VN') : '0'; };
const toYmd = (d) => { const dt = d instanceof Date ? d : new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`; };
const daysBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
const pct = (cur, prev) => { if (!prev) return null; return ((cur - prev) / prev) * 100; };
const PlatformBadge = ({ p }) => (
  <span style={{ fontSize: '0.6rem', fontWeight: 800, padding: '2px 6px', borderRadius: 5, color: '#fff', background: p === 'tiktok' ? '#111' : '#ee4d2d' }}>{p === 'tiktok' ? 'TikTok' : 'Shopee'}</span>
);
const Change = ({ v }) => {
  if (v == null || !Number.isFinite(v)) return null;
  const up = v >= 0;
  return <span style={{ fontSize: '0.72rem', fontWeight: 700, color: up ? '#16a34a' : '#dc2626' }}>{up ? '▲' : '▼'} {Math.abs(v).toFixed(1)}%</span>;
};

// ── Product list (best / slow) ──────────────────────────────────────────────────
const ProductRows = ({ items }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    {items.map((it, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
        <span style={{ width: 16, color: '#94a3b8', fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
        {it.image
          ? <img src={it.image} alt="" referrerPolicy="no-referrer" loading="lazy" style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
          : <span style={{ width: 34, height: 34, borderRadius: 6, background: '#f1f5f9', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>📦</span>}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0f172a' }} title={it.name}>{it.name}</span>
        <span style={{ flexShrink: 0, fontWeight: 800, color: ACCENT, minWidth: 50, textAlign: 'right' }}>{fmtNum(it.qty)}</span>
        <span style={{ flexShrink: 0, color: '#16a34a', fontWeight: 700, minWidth: 64, textAlign: 'right' }}>{fmtVnd(it.gmv)}đ</span>
      </div>
    ))}
    {!items.length && <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Không có dữ liệu.</div>}
  </div>
);

const Card = ({ children, style }) => <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 14, padding: 18, boxShadow: '0 1px 4px rgba(15,23,42,0.05)', ...style }}>{children}</div>;

// brand.key → brand chuẩn hóa của RPC report_booking_cast (cast booking đã chi, theo ngày air; eHerb/Healmi đã gộp)
const CAST_CANON = { bodymiss: 'BODYMISS', moaw: 'MOAW', mila: 'MILAGANICS', eherb: 'EHERB', healmi: 'HEALMI' };
const SectionTitle = ({ children }) => <h2 style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a', margin: '28px 0 12px' }}>{children}</h2>;

// ════════════════════════════════════════════════════════════════════════════════
export default function ReportTab() {
  const today = toYmd(new Date());
  const monthAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 29); return toYmd(d); })();
  const [brandKey, setBrandKey] = useState('bodymiss');
  const [start, setStart] = useState(monthAgo);
  const [end, setEnd] = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);

  const generate = async () => {
    setLoading(true); setError(null); setReport(null);
    try {
      const brand = BRANDS.find(b => b.key === brandKey);
      const days = daysBetween(start, end) + 1;
      const ps = new Date(start); ps.setDate(ps.getDate() - days);
      const pe = new Date(start); pe.setDate(pe.getDate() - 1);
      const prevStart = toYmd(ps), prevEnd = toYmd(pe);
      const ttIds = brand.shops.filter(s => s.platform === 'tiktok').map(s => s.id);
      const spIds = brand.shops.filter(s => s.platform === 'shopee').map(s => s.id);

      // 1) DOANH THU
      const rev = async (s, e) => {
        const out = {};
        const add = (rows) => (rows || []).forEach(r => { const k = String(r.shop_id); out[k] = out[k] || { gmv: 0, orders: 0 }; out[k].gmv += Number(r.payment_amount) || 0; out[k].orders += Number(r.order_count) || 0; });
        if (ttIds.length) { const { data } = await supabase.from('tiktok_shop_analytics_daily').select('shop_id,payment_amount,order_count').gte('date', s).lte('date', e).in('shop_id', ttIds); add(data); }
        if (spIds.length) { const { data } = await supabase.from('shopee_daily_stats').select('shop_id,payment_amount,order_count').gte('date', s).lte('date', e).in('shop_id', spIds); add(data); }
        return out;
      };
      const [curRev, prevRev] = await Promise.all([rev(start, end), rev(prevStart, prevEnd)]);
      const shopRows = brand.shops.map(s => { const d = curRev[String(s.id)] || { gmv: 0, orders: 0 }; const pd = prevRev[String(s.id)] || { gmv: 0, orders: 0 }; return { ...s, gmv: d.gmv, orders: d.orders, aov: d.orders > 0 ? d.gmv / d.orders : 0, prevGmv: pd.gmv }; });
      const totGmv = shopRows.reduce((a, r) => a + r.gmv, 0);
      const totOrders = shopRows.reduce((a, r) => a + r.orders, 0);
      const totAov = totOrders > 0 ? totGmv / totOrders : 0;
      const pTot = Object.values(prevRev).reduce((a, d) => ({ gmv: a.gmv + d.gmv, orders: a.orders + d.orders }), { gmv: 0, orders: 0 });
      const prevAov = pTot.orders > 0 ? pTot.gmv / pTot.orders : 0;

      // 2) SẢN PHẨM (theo từng shop)
      const productSections = [];
      for (const s of brand.shops.filter(x => x.platform === 'tiktok')) {
        try {
          const j = await (await fetch(`/api/tiktok-shop/analytics?action=products&shop_id=${s.id}&start_date=${start}&end_date=${end}&sort_field=units_sold&sort_order=DESC&page_size=20`)).json();
          productSections.push({ shop: s, items: (j.products || []).map(p => ({ name: p.product_name, image: p.image, qty: Number(p.units_sold) || 0, gmv: Number(p.gmv) || 0 })) });
        } catch { productSections.push({ shop: s, items: [] }); }
      }
      if (spIds.length) {
        try {
          const j = await (await fetch(`/api/shopee/top-picks?action=top_sellers&start_date=${start}&end_date=${end}&limit=20`)).json();
          const shops = j.data?.shops || [];
          for (const s of brand.shops.filter(x => x.platform === 'shopee')) {
            const sd = shops.find(x => String(x.shop_id) === String(s.id));
            productSections.push({ shop: s, items: (sd?.items || []).map(it => ({ name: it.item_name, image: it.image, qty: Number(it.qty) || 0, gmv: Number(it.revenue) || 0 })) });
          }
        } catch { /* shopee optional */ }
      }

      // 3) BOOKING — theo BRAND của sản phẩm (đầy đủ nhân sự, kể cả ngoài team) + danh sách SP
      let booking = { total: 0, totalQty: 0, byStaff: [], products: [], prevTotal: 0 };
      if (brand.brandIds?.length) {
        const [staffR, prodR, prevR] = await Promise.all([
          supabase.rpc('brand_booking_staff', { p_brand_ids: brand.brandIds, p_start: start, p_end: end }),
          supabase.rpc('brand_booking_products', { p_brand_ids: brand.brandIds, p_start: start, p_end: end }),
          supabase.rpc('brand_booking_staff', { p_brand_ids: brand.brandIds, p_start: prevStart, p_end: prevEnd }),
        ]);
        booking.byStaff = (staffR.data || []).map(r => ({ name: r.ten_nhansu, count: Number(r.so_don) || 0, qty: Number(r.so_luong) || 0 }));
        booking.products = (prodR.data || []).map(r => ({ name: r.sanpham, qty: Number(r.so_luong) || 0, orders: Number(r.so_don) || 0 }));
        booking.total = booking.byStaff.reduce((a, s) => a + s.count, 0);
        booking.totalQty = booking.byStaff.reduce((a, s) => a + s.qty, 0);
        booking.prevTotal = (prevR.data || []).reduce((a, r) => a + (Number(r.so_don) || 0), 0);
      }

      // 4) NGÂN SÁCH ĐÃ CHI (cast booking) theo brand — ngày AIR (khớp Module 7 / Tạm đối chiếu). eHerb/Healmi gộp.
      let bookingCast = { cur: 0, prev: 0 };
      const canon = CAST_CANON[brand.key];
      if (canon) {
        const [cR, pR] = await Promise.all([
          supabase.rpc('report_booking_cast', { p_from: start, p_to: end }),
          supabase.rpc('report_booking_cast', { p_from: prevStart, p_to: prevEnd }),
        ]);
        bookingCast.cur = (cR.data || []).filter(r => r.brand_canon === canon).reduce((a, r) => a + (Number(r.cast_net) || 0), 0);
        bookingCast.prev = (pR.data || []).filter(r => r.brand_canon === canon).reduce((a, r) => a + (Number(r.cast_net) || 0), 0);
      }

      // 5) CHI PHÍ GỬI MẪU (cost AMIS×1.08×SL +5k +ship) + DANH SÁCH KOC đã book cast
      let sampleCost = { cur: 0, prev: 0 };
      let castKocs = [];
      if (brand.brandIds?.length) {
        const [scR, scP] = await Promise.all([
          supabase.rpc('report_sample_cost', { p_brand_ids: brand.brandIds, p_from: start, p_to: end }),
          supabase.rpc('report_sample_cost', { p_brand_ids: brand.brandIds, p_from: prevStart, p_to: prevEnd }),
        ]);
        sampleCost.cur = Number(scR.data) || 0;
        sampleCost.prev = Number(scP.data) || 0;
      }
      if (canon) {
        const kR = await supabase.rpc('report_booking_cast_kocs', { p_from: start, p_to: end });
        castKocs = (kR.data || []).filter(r => r.brand_canon === canon)
          .map(r => ({ koc: r.koc, name: r.full_name, cast: Number(r.cast_net) || 0, n: Number(r.n) || 0 }));
      }

      setReport({ brand, start, end, prevStart, prevEnd, shopRows, totGmv, totOrders, totAov, prevAov, pTot, productSections, booking, bookingCast, sampleCost, castKocs });
    } catch (e) { setError(e.message || 'Lỗi tạo báo cáo'); }
    finally { setLoading(false); }
  };

  const exportExcel = () => {
    if (!report) return;
    const wb = utils.book_new();
    utils.book_append_sheet(wb, utils.json_to_sheet(report.shopRows.map(s => ({ 'Gian hàng': s.name, 'Sàn': s.platform, 'GMV': Math.round(s.gmv), 'Đơn': s.orders, 'AOV': Math.round(s.aov) }))), 'Doanh thu');
    if (report.booking.byStaff.length) utils.book_append_sheet(wb, utils.json_to_sheet(report.booking.byStaff.map(s => ({ 'Nhân sự': s.name, 'Đơn đã gửi': s.count, 'SL sản phẩm': s.qty }))), 'Booking-Nhân sự');
    if (report.booking.products.length) utils.book_append_sheet(wb, utils.json_to_sheet(report.booking.products.map(p => ({ 'Sản phẩm': p.name, 'SL gửi': p.qty, 'Số đơn': p.orders }))), 'Booking-Sản phẩm');
    if (report.castKocs?.length) utils.book_append_sheet(wb, utils.json_to_sheet(report.castKocs.map(k => ({ 'KOC': '@' + k.koc, 'Tên': k.name || '', 'Cast (đ)': Math.round(k.cast), 'Số video': k.n }))), 'KOC-Cast');
    const prodRows = [];
    report.productSections.forEach(ps => ps.items.forEach((it, i) => prodRows.push({ 'Gian hàng': ps.shop.name, 'Hạng': i + 1, 'Sản phẩm': it.name, 'SL bán': it.qty, 'Doanh thu': Math.round(it.gmv) })));
    if (prodRows.length) utils.book_append_sheet(wb, utils.json_to_sheet(prodRows), 'Sản phẩm');
    writeFile(wb, `BaoCao_${report.brand.name}_${report.start}_${report.end}.xlsx`);
  };

  const selStyle = { padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', fontWeight: 600, color: '#334155', cursor: 'pointer' };
  const presetBtn = (active) => ({ padding: '7px 13px', borderRadius: 9, border: `1px solid ${active ? ACCENT : '#e5e7eb'}`, background: active ? ACCENT : '#fff', color: active ? '#fff' : '#475569', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' });
  const thL = { padding: '9px 12px', textAlign: 'left', fontWeight: 800, color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase' };
  const thR = { ...thL, textAlign: 'right' };

  // Preset nhanh + chọn tháng
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return toYmd(d); };
  const now0 = new Date();
  const presets = [
    { label: 'Hôm qua', s: daysAgo(1), e: daysAgo(1) },
    { label: '7 ngày', s: daysAgo(6), e: today },
    { label: '30 ngày', s: daysAgo(29), e: today },
    { label: 'Tháng này', s: toYmd(new Date(now0.getFullYear(), now0.getMonth(), 1)), e: today },
    { label: 'Tháng trước', s: toYmd(new Date(now0.getFullYear(), now0.getMonth() - 1, 1)), e: toYmd(new Date(now0.getFullYear(), now0.getMonth(), 0)) },
  ];
  const monthOpts = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now0.getFullYear(), now0.getMonth() - i, 1);
    const y = d.getFullYear(), m = d.getMonth();
    monthOpts.push({ key: `${y}-${m + 1}`, label: `Tháng ${m + 1}/${y}`, s: toYmd(new Date(y, m, 1)), e: i === 0 ? today : toYmd(new Date(y, m + 1, 0)) });
  }
  const activeMonth = monthOpts.find(o => o.s === start && o.e === end)?.key || '';

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <style>{`@media print { body * { visibility: hidden !important; } #sk-report, #sk-report * { visibility: visible !important; } #sk-report { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; } .no-print { display: none !important; } }`}</style>

      <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', margin: '0 0 4px' }}>📈 Báo cáo tổng quan</h1>
      <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 16px' }}>Chọn brand + khoảng ngày → tổng hợp doanh thu, sản phẩm, booking. Xuất PDF/Excel cho sếp.</p>

      {/* Toolbar */}
      <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        {/* Hàng 1: brand + preset nhanh + chọn tháng */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={brandKey} onChange={e => setBrandKey(e.target.value)} style={{ ...selStyle, fontWeight: 800 }}>
            {BRANDS.map(b => <option key={b.key} value={b.key}>{b.name}</option>)}
          </select>
          <span style={{ width: 1, height: 22, background: '#e5e7eb' }} />
          {presets.map(p => <button key={p.label} onClick={() => { setStart(p.s); setEnd(p.e); }} style={presetBtn(start === p.s && end === p.e)}>{p.label}</button>)}
          <select value={activeMonth} onChange={e => { const o = monthOpts.find(x => x.key === e.target.value); if (o) { setStart(o.s); setEnd(o.e); } }} style={selStyle}>
            <option value="">📅 Chọn tháng…</option>
            {monthOpts.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        {/* Hàng 2: khoảng ngày tùy chọn + nút */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} style={selStyle} />
          <span style={{ color: '#94a3b8' }}>→</span>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={selStyle} />
          <button onClick={generate} disabled={loading} style={{ ...selStyle, background: ACCENT, color: '#fff', border: 'none', fontWeight: 800, opacity: loading ? 0.6 : 1 }}>{loading ? '⏳ Đang tạo…' : '📊 Tạo báo cáo'}</button>
          {report && <>
            <button onClick={() => window.print()} style={{ ...selStyle, fontWeight: 700 }}>🖨️ Xuất PDF</button>
            <button onClick={exportExcel} style={{ ...selStyle, fontWeight: 700 }}>📥 Xuất Excel</button>
          </>}
        </div>
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 16, color: '#b91c1c', fontSize: '0.86rem' }}>❌ {error}</div>}
      {loading && <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>⏳ Đang tổng hợp dữ liệu… (sản phẩm có thể mất chút)</div>}

      {report && !loading && (
        <div id="sk-report">
          {/* Header báo cáo */}
          <div style={{ borderBottom: `3px solid ${ACCENT}`, paddingBottom: 14, marginBottom: 8 }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a' }}>Báo cáo tổng quan — {report.brand.name}</div>
            <div style={{ fontSize: '0.88rem', color: '#64748b', marginTop: 2 }}>
              Kỳ: <b>{report.start}</b> → <b>{report.end}</b> · Xuất ngày {new Date().toLocaleString('vi-VN')}
            </div>
          </div>

          {/* KPI tổng */}
          <SectionTitle>Tổng quan</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
            {[
              { l: 'Tổng GMV', v: `${fmtVnd(report.totGmv)} đ`, c: pct(report.totGmv, report.pTot.gmv) },
              { l: 'Tổng đơn', v: fmtNum(report.totOrders), c: pct(report.totOrders, report.pTot.orders) },
              { l: 'AOV', v: `${fmtVnd(report.totAov)} đ`, c: pct(report.totAov, report.prevAov) },
              { l: 'Ngân sách đã chi', v: `${fmtVnd(report.bookingCast?.cur || 0)} đ`, c: pct(report.bookingCast?.cur || 0, report.bookingCast?.prev || 0) },
              { l: 'Chi phí gửi mẫu', v: `${fmtVnd(report.sampleCost?.cur || 0)} đ`, c: pct(report.sampleCost?.cur || 0, report.sampleCost?.prev || 0) },
              { l: 'Số gian hàng', v: fmtNum(report.shopRows.length), c: null },
            ].map(k => (
              <Card key={k.l} style={{ borderLeft: `4px solid ${ACCENT}` }}>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{k.l}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', margin: '4px 0 2px' }}>{k.v}</div>
                {k.c != null && <div>so kỳ trước <Change v={k.c} /></div>}
              </Card>
            ))}
          </div>

          {/* So sánh kỳ trước */}
          <Card style={{ marginTop: 14, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '0.84rem', fontWeight: 800, color: '#475569' }}>
              📊 So sánh với kỳ trước <span style={{ fontWeight: 500, color: '#94a3b8' }}>({report.prevStart} → {report.prevEnd})</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <thead><tr style={{ background: '#f8fafc' }}>{['Chỉ số', 'Kỳ này', 'Kỳ trước', 'Thay đổi'].map((h, i) => <th key={h} style={{ padding: '8px 16px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 800, color: '#64748b', fontSize: '0.7rem', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>
                {[
                  { l: 'GMV', cur: `${fmtVnd(report.totGmv)} đ`, prev: `${fmtVnd(report.pTot.gmv)} đ`, c: pct(report.totGmv, report.pTot.gmv) },
                  { l: 'Đơn hàng', cur: fmtNum(report.totOrders), prev: fmtNum(report.pTot.orders), c: pct(report.totOrders, report.pTot.orders) },
                  { l: 'AOV', cur: `${fmtVnd(report.totAov)} đ`, prev: `${fmtVnd(report.prevAov)} đ`, c: pct(report.totAov, report.prevAov) },
                  ...(report.brand.brandIds?.length ? [{ l: 'Đơn booking gửi', cur: fmtNum(report.booking.total), prev: fmtNum(report.booking.prevTotal || 0), c: pct(report.booking.total, report.booking.prevTotal || 0) }] : []),
                  ...(CAST_CANON[report.brand.key] ? [{ l: 'Ngân sách đã chi (cast)', cur: `${fmtVnd(report.bookingCast?.cur || 0)} đ`, prev: `${fmtVnd(report.bookingCast?.prev || 0)} đ`, c: pct(report.bookingCast?.cur || 0, report.bookingCast?.prev || 0) }] : []),
                  ...(report.brand.brandIds?.length ? [{ l: 'Chi phí gửi mẫu', cur: `${fmtVnd(report.sampleCost?.cur || 0)} đ`, prev: `${fmtVnd(report.sampleCost?.prev || 0)} đ`, c: pct(report.sampleCost?.cur || 0, report.sampleCost?.prev || 0) }] : []),
                ].map(r => (
                  <tr key={r.l} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '9px 16px', fontWeight: 600 }}>{r.l}</td>
                    <td style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 800 }}>{r.cur}</td>
                    <td style={{ padding: '9px 16px', textAlign: 'right', color: '#94a3b8' }}>{r.prev}</td>
                    <td style={{ padding: '9px 16px', textAlign: 'right' }}><Change v={r.c} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* KOC đã book cast */}
          {report.castKocs?.length > 0 && (<>
            <SectionTitle>🎤 KOC đã book cast ({report.castKocs.length})</SectionTitle>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead><tr style={{ background: '#f8fafc' }}>
                    <th style={thL}>#</th><th style={thL}>KOC</th><th style={thL}>Tên</th>
                    <th style={thR}>Cast</th><th style={thR}>Số video</th>
                  </tr></thead>
                  <tbody>
                    {report.castKocs.map((k, i) => (
                      <tr key={k.koc} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '9px 12px', color: '#94a3b8', fontWeight: 700 }}>{i + 1}</td>
                        <td style={{ padding: '9px 12px' }}><a href={`https://www.tiktok.com/@${k.koc}`} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontWeight: 700, textDecoration: 'none' }}>@{k.koc}</a></td>
                        <td style={{ padding: '9px 12px', color: '#334155' }}>{k.name || '—'}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, color: '#ea580c' }}>{fmtVnd(k.cast)} đ</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' }}>{fmtNum(k.n)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid #e2e8f0', background: '#fff7ed' }}>
                      <td colSpan={3} style={{ padding: '9px 12px', fontWeight: 800 }}>Tổng ({report.castKocs.length} KOC)</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 900, color: '#ea580c' }}>{fmtVnd(report.castKocs.reduce((a, k) => a + k.cast, 0))} đ</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800 }}>{fmtNum(report.castKocs.reduce((a, k) => a + k.n, 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          </>)}

          {/* Doanh thu theo gian hàng */}
          {report.shopRows.length > 0 && (<>
            <SectionTitle>Doanh thu theo gian hàng</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: report.shopRows.length > 1 ? '1.4fr 1fr' : '1fr', gap: 16, alignItems: 'start' }}>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead><tr style={{ background: '#f8fafc' }}>
                    {['Gian hàng', 'GMV', 'vs trước', 'Đơn', 'AOV'].map(h => <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Gian hàng' ? 'left' : 'right', fontWeight: 800, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {report.shopRows.map((s, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 12px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><PlatformBadge p={s.platform} /><span style={{ fontWeight: 600 }}>{s.name}</span></div></td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: ACCENT }}>{fmtVnd(s.gmv)} đ</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}><Change v={pct(s.gmv, s.prevGmv)} /></td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmtNum(s.orders)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569' }}>{fmtVnd(s.aov)} đ</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid #e5e7eb', background: '#fff7ed' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 900 }}>TỔNG</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, color: ACCENT }}>{fmtVnd(report.totGmv)} đ</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}><Change v={pct(report.totGmv, report.pTot.gmv)} /></td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900 }}>{fmtNum(report.totOrders)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>{fmtVnd(report.totAov)} đ</td>
                    </tr>
                  </tbody>
                </table>
              </Card>
              {report.shopRows.length > 1 && (
                <Card>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Tỷ trọng GMV theo gian hàng</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={report.shopRows.filter(s => s.gmv > 0).map(s => ({ name: s.name, value: s.gmv }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}>
                        {report.shopRows.filter(s => s.gmv > 0).map((s, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => `${fmtVnd(v)} đ`} />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              )}
            </div>
            {/* Bar GMV theo gian hàng */}
            <Card style={{ marginTop: 16 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginBottom: 6 }}>GMV theo gian hàng</div>
              <ResponsiveContainer width="100%" height={Math.max(200, report.shopRows.length * 46)}>
                <BarChart data={report.shopRows.map(s => ({ name: s.name, GMV: Math.round(s.gmv) }))} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" tickFormatter={fmtVnd} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `${fmtVnd(v)} đ`} />
                  <Bar dataKey="GMV" fill={ACCENT} radius={[0, 6, 6, 0]}><LabelList dataKey="GMV" position="right" formatter={fmtVnd} style={{ fontSize: 11, fontWeight: 700 }} /></Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </>)}

          {/* Xếp hạng sản phẩm */}
          {report.productSections.some(p => p.items.length) && (<>
            <SectionTitle>Xếp hạng sản phẩm</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(440px,1fr))', gap: 16 }}>
              {report.productSections.filter(p => p.items.length).map((ps, idx) => {
                const best = ps.items.slice(0, 8);
                const slow = ps.items.filter(i => i.qty > 0).slice(-5).reverse();
                return (
                  <Card key={idx}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <PlatformBadge p={ps.shop.platform} />
                      <span style={{ fontWeight: 800 }}>{ps.shop.name}</span>
                    </div>
                    <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#16a34a', margin: '6px 0' }}>🔥 BÁN CHẠY</div>
                    <ProductRows items={best} />
                    <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#dc2626', margin: '14px 0 6px' }}>🐌 BÁN CHẬM</div>
                    <ProductRows items={slow} />
                  </Card>
                );
              })}
            </div>
          </>)}

          {/* Booking — theo brand của sản phẩm (đầy đủ nhân sự + danh sách SP) */}
          {report.brand.brandIds?.length > 0 && (<>
            <SectionTitle>Booking — sản phẩm brand được gửi</SectionTitle>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
              <Card style={{ flex: '1 1 200px', borderLeft: `4px solid ${ACCENT}` }}>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Tổng đơn đã gửi</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a' }}>{fmtNum(report.booking.total)}</div>
                <div style={{ fontSize: '0.74rem' }}>so kỳ trước <Change v={pct(report.booking.total, report.booking.prevTotal)} /></div>
              </Card>
              <Card style={{ flex: '1 1 200px', borderLeft: '4px solid #3b82f6' }}>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Tổng SL sản phẩm gửi</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a' }}>{fmtNum(report.booking.totalQty)}</div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>{report.booking.products.length} loại SP · {report.booking.byStaff.length} nhân sự gửi</div>
              </Card>
            </div>

            {/* Nhân sự gửi — ĐẦY ĐỦ */}
            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#475569', margin: '4px 0 8px' }}>👥 Nhân sự đã gửi sản phẩm brand này <span style={{ fontWeight: 500, color: '#94a3b8' }}>(đầy đủ, kể cả ngoài team)</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16, alignItems: 'start', marginBottom: 20 }}>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead><tr style={{ background: '#f8fafc' }}><th style={thL}>Nhân sự</th><th style={thR}>Đơn</th><th style={thR}>SL</th></tr></thead>
                  <tbody>
                    {report.booking.byStaff.map((s, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '9px 12px', fontWeight: 600 }}>{i < 3 && <span style={{ color: ACCENT, fontWeight: 900 }}>#{i + 1} </span>}{s.name}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, color: ACCENT }}>{fmtNum(s.count)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: '#475569' }}>{fmtNum(s.qty)}</td>
                      </tr>
                    ))}
                    {!report.booking.byStaff.length && <tr><td colSpan={3} style={{ padding: 14, color: '#94a3b8' }}>Không có dữ liệu.</td></tr>}
                  </tbody>
                </table>
              </Card>
              <Card>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Đơn gửi theo nhân sự</div>
                <ResponsiveContainer width="100%" height={Math.max(180, report.booking.byStaff.length * 38)}>
                  <BarChart data={report.booking.byStaff.map(s => ({ name: s.name, 'Đơn': s.count }))} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="Đơn" fill="#3b82f6" radius={[0, 6, 6, 0]}><LabelList dataKey="Đơn" position="right" style={{ fontSize: 11, fontWeight: 700 }} /></Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* Sản phẩm được gửi */}
            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#475569', margin: '4px 0 8px' }}>📦 Sản phẩm của brand được gửi</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16, alignItems: 'start' }}>
              <Card style={{ padding: 0, overflow: 'hidden', maxHeight: 380, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead><tr style={{ background: '#f8fafc' }}><th style={thL}>Sản phẩm</th><th style={thR}>SL gửi</th><th style={thR}>Đơn</th></tr></thead>
                  <tbody>
                    {report.booking.products.map((p, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px' }} title={p.name}>{p.name}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: ACCENT }}>{fmtNum(p.qty)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#475569' }}>{fmtNum(p.orders)}</td>
                      </tr>
                    ))}
                    {!report.booking.products.length && <tr><td colSpan={3} style={{ padding: 14, color: '#94a3b8' }}>Không có sản phẩm gửi trong kỳ.</td></tr>}
                  </tbody>
                </table>
              </Card>
              <Card>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Top sản phẩm gửi nhiều (số lượng)</div>
                <ResponsiveContainer width="100%" height={Math.max(180, Math.min(report.booking.products.length, 12) * 34)}>
                  <BarChart data={report.booking.products.slice(0, 12).map(p => ({ name: p.name.length > 24 ? p.name.slice(0, 24) + '…' : p.name, 'SL': p.qty }))} layout="vertical" margin={{ left: 10, right: 34 }}>
                    <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="SL" fill={ACCENT} radius={[0, 6, 6, 0]}><LabelList dataKey="SL" position="right" style={{ fontSize: 11, fontWeight: 700 }} /></Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </>)}

          <div style={{ marginTop: 30, paddingTop: 14, borderTop: '1px solid #f1f5f9', fontSize: '0.74rem', color: '#94a3b8', textAlign: 'center' }}>
            Báo cáo tạo tự động bởi hệ thống Stella Kinetics · {new Date().toLocaleDateString('vi-VN')}
          </div>
        </div>
      )}
    </div>
  );
}
