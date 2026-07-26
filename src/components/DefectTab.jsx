// src/components/DefectTab.jsx
//
// MODULE 4 — Quản lý dữ liệu sản phẩm lỗi (nhóm CSKH).
// Cập nhật theo feedback CS (26/7):
//  1. Thư viện ảnh/video (xem trực tiếp, không chỉ dán link).
//  2. Chọn ĐÚNG TÊN GIAN (Shopee Milaganics, TikTok Moaw Moaws…) thay vì chỉ Shopee/TikTok.
//  3. Thêm BRAND + lọc theo brand.
//  4. Bộ lọc thời gian.
//  5. Báo cáo chất lượng sản phẩm theo tuần/tháng (phục vụ báo cáo tuần/tháng).
// Bảng: defect_products. AI đọc ảnh gợi ý loại lỗi = pha sau.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { SHOPS, BRANDS, sanLabel, brandOfShop } from '../constants/shops';

const ACCENT = '#ff6a2c';
const DEFECT_TYPES = ['Rò rỉ', 'Móp méo', 'Hư hỏng bao bì', 'Thiếu sản phẩm', 'Sai sản phẩm', 'Lỗi chất lượng', 'Hết hạn/cận date', 'Khác'];
const SEVERITY = { nhe: { label: 'Nhẹ', color: '#16a34a', bg: '#dcfce7' }, trung_binh: { label: 'Trung bình', color: '#b45309', bg: '#fef3c7' }, nang: { label: 'Nặng', color: '#dc2626', bg: '#fee2e2' } };
const STATUS = { new: { label: 'Mới', color: '#b45309', bg: '#fef3c7' }, reviewing: { label: 'Đang xử lý', color: '#1d4ed8', bg: '#dbeafe' }, resolved: { label: 'Đã xử lý', color: '#15803d', bg: '#dcfce7' } };

const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const daysAgoYmd = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const daysSince = (s) => { if (!s) return 999; return Math.floor((Date.now() - new Date(s).getTime()) / 86400000); };
const fmtDate = (s) => { if (!s) return ''; const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s; };
// Kỳ báo cáo: tuần ISO hoặc tháng
const periodOf = (ymd, mode) => {
  if (!ymd) return '—';
  const s = String(ymd).slice(0, 10);
  if (mode === 'month') return s.slice(0, 7);
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d)) return '—';
  const t = new Date(d); t.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const y0 = new Date(t.getFullYear(), 0, 1);
  const wk = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return `${t.getFullYear()}-T${String(wk).padStart(2, '0')}`;
};
const isVideo = (u) => /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(u) || /(youtube|youtu\.be|tiktok\.com|drive\.google\.com\/file)/i.test(u);
const isImage = (u) => /\.(jpe?g|png|gif|webp|bmp|heic)(\?|$)/i.test(u);
const mediaOf = (r) => (r.media_links || '').split('\n').map(s => s.trim()).filter(Boolean);

const inputStyle = { padding: '8px 11px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', color: '#1f2937', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
const labelStyle = { fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4, display: 'block' };
const th = { padding: '9px 10px', fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'left', whiteSpace: 'nowrap', background: '#f8fafc', borderBottom: '2px solid #e5e7eb' };
const td = { padding: '8px 10px', fontSize: '0.82rem', color: '#0f172a', whiteSpace: 'nowrap', borderTop: '1px solid #f1f5f9' };
const card = { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const EMPTY = { report_date: todayYmd(), product_name: '', platform: 'shopee', shop_name: '', brand: '', order_sn: '', defect_type: 'Lỗi chất lượng', severity: 'trung_binh', lot_code: '', production_date: '', description: '', media_links: '', status: 'new', staff: '', note: '' };

export default function DefectTab({ currentUser }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('list');          // list | library | report
  const [typeF, setTypeF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [brandF, setBrandF] = useState('all');
  const [shopF, setShopF] = useState('all');
  const [fromF, setFromF] = useState(daysAgoYmd(90));
  const [toF, setToF] = useState(todayYmd());
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [periodMode, setPeriodMode] = useState('week'); // week | month

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('defect_products').select('*').order('report_date', { ascending: false }).order('created_at', { ascending: false }).limit(2000);
    if (error) alert('Lỗi tải: ' + error.message);
    setRows(data || []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const r = editing;
    if (!r.product_name?.trim()) { alert('Thiếu Tên sản phẩm'); return; }
    const payload = {
      report_date: r.report_date || todayYmd(), product_name: r.product_name.trim(),
      platform: r.platform || null, shop_name: r.shop_name || null, brand: r.brand || brandOfShop(r.shop_name) || null,
      order_sn: r.order_sn || null, defect_type: r.defect_type || null, severity: r.severity || 'trung_binh',
      lot_code: r.lot_code || null, production_date: r.production_date || null,
      description: r.description || null, media_links: r.media_links || null,
      status: r.status || 'new', staff: r.staff || (currentUser?.name || currentUser?.username || ''), note: r.note || null,
    };
    const { error } = r.id ? await supabase.from('defect_products').update(payload).eq('id', r.id) : await supabase.from('defect_products').insert(payload);
    if (error) { alert('Lưu không được: ' + error.message); return; }
    setEditing(null); load();
  };
  const del = async (r) => { if (!confirm(`Xoá hồ sơ lỗi "${r.product_name}"?`)) return; await supabase.from('defect_products').delete().eq('id', r.id); load(); };
  const patch = async (r, p) => { setRows(prev => prev.map(x => (x.id === r.id ? { ...x, ...p } : x))); await supabase.from('defect_products').update(p).eq('id', r.id); };

  // Chọn gian → tự điền sàn + brand
  const pickShop = (name) => {
    const sh = SHOPS.find(s => s.name === name);
    setEditing(e => ({ ...e, shop_name: name, platform: sh ? sh.san : e.platform, brand: sh ? sh.brand : e.brand }));
  };

  const filtered = useMemo(() => rows.filter(r => {
    const d = (r.report_date || '').slice(0, 10);
    if (fromF && d && d < fromF) return false;
    if (toF && d && d > toF) return false;
    if (typeF !== 'all' && r.defect_type !== typeF) return false;
    if (statusF !== 'all' && r.status !== statusF) return false;
    if (shopF !== 'all' && r.shop_name !== shopF) return false;
    if (brandF !== 'all' && (r.brand || brandOfShop(r.shop_name)) !== brandF) return false;
    if (search) { const q = search.toLowerCase(); if (![r.product_name, r.lot_code, r.order_sn, r.description, r.note, r.shop_name].some(v => v && String(v).toLowerCase().includes(q))) return false; }
    return true;
  }), [rows, typeF, statusF, brandF, shopF, fromF, toF, search]);

  const kpi = useMemo(() => ({
    total: filtered.length,
    fresh: filtered.filter(r => daysSince(r.report_date) <= 30).length,
    unresolved: filtered.filter(r => r.status !== 'resolved').length,
    nang: filtered.filter(r => r.severity === 'nang').length,
  }), [filtered]);

  const topBy = (key) => { const m = {}; filtered.forEach(r => { const k = (key === 'brand' ? (r.brand || brandOfShop(r.shop_name)) : r[key]) || '—'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8); };
  const topProducts = useMemo(() => topBy('product_name'), [filtered]);
  const topLots = useMemo(() => topBy('lot_code').filter(([k]) => k && k !== '—'), [filtered]);

  // ── BÁO CÁO CHẤT LƯỢNG theo kỳ (tuần/tháng) ──
  const report = useMemo(() => {
    const m = {};
    filtered.forEach(r => {
      const p = periodOf(r.report_date, periodMode);
      const b = (r.brand || brandOfShop(r.shop_name)) || '—';
      const key = p + '||' + b;
      if (!m[key]) m[key] = { period: p, brand: b, total: 0, nang: 0, unresolved: 0, types: {} };
      const it = m[key];
      it.total++;
      if (r.severity === 'nang') it.nang++;
      if (r.status !== 'resolved') it.unresolved++;
      const t = r.defect_type || '—'; it.types[t] = (it.types[t] || 0) + 1;
    });
    return Object.values(m)
      .map(x => ({ ...x, topType: Object.entries(x.types).sort((a, b) => b[1] - a[1])[0]?.[0] || '—' }))
      .sort((a, b) => (b.period.localeCompare(a.period)) || (b.total - a.total));
  }, [filtered, periodMode]);

  // ── THƯ VIỆN ảnh/video ──
  const library = useMemo(() => {
    const out = [];
    filtered.forEach(r => mediaOf(r).forEach(u => out.push({ url: u, row: r })));
    return out;
  }, [filtered]);

  const exportXlsx = () => {
    const data = filtered.map((r, i) => ({
      STT: i + 1, Ngày: fmtDate(r.report_date), 'Sàn': sanLabel(r.platform), 'Gian hàng': r.shop_name || '', 'Brand': r.brand || brandOfShop(r.shop_name) || '',
      'Sản phẩm': r.product_name, 'Loại lỗi': r.defect_type, 'Mức độ': SEVERITY[r.severity]?.label, 'Lot': r.lot_code, 'Mã đơn': r.order_sn,
      'Mô tả': r.description, 'Trạng thái': STATUS[r.status]?.label, 'NV': r.staff,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'SP loi');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(report.map(x => ({
      'KỲ': x.period, 'BRAND': x.brand, 'SỐ LỖI': x.total, 'LỖI NẶNG': x.nang, 'CHƯA XỬ LÝ': x.unresolved, 'LỖI PHỔ BIẾN': x.topType,
    }))), periodMode === 'week' ? 'Bao cao tuan' : 'Bao cao thang');
    XLSX.writeFile(wb, `SanPhamLoi_${fromF}_${toF}.xlsx`);
  };

  const TabBtn = ({ id, children }) => (
    <button onClick={() => setTab(id)} style={{ padding: '8px 16px', borderRadius: 9, border: `1.5px solid ${tab === id ? ACCENT : '#e5e7eb'}`, background: tab === id ? '#fff7ed' : '#fff', color: tab === id ? '#e85518' : '#64748b', fontWeight: 800, fontSize: '0.83rem', cursor: 'pointer' }}>{children}</button>
  );

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1400 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>🔧 Module 4: Sản phẩm lỗi</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Hồ sơ lỗi theo gian hàng + brand · thư viện ảnh/video · báo cáo chất lượng tuần/tháng</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={exportXlsx} style={{ padding: '9px 16px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>📥 Xuất Excel</button>
          <button onClick={() => setEditing({ ...EMPTY, staff: currentUser?.name || currentUser?.username || '' })} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>+ Tạo hồ sơ lỗi</button>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 14 }}>
        {[{ label: 'Tổng SP lỗi', v: kpi.total, color: '#6366f1' }, { label: 'Lỗi mới (30N)', v: kpi.fresh, color: '#b45309' }, { label: 'Chưa xử lý', v: kpi.unresolved, color: '#dc2626' }, { label: 'Mức độ nặng', v: kpi.nang, color: '#991b1b' }].map((c, i) => (
          <div key={i} style={{ ...card, borderTop: `3px solid ${c.color}` }}><div style={{ fontSize: '1.5rem', fontWeight: 900, color: c.color }}>{c.v}</div><div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{c.label}</div></div>
        ))}
      </div>

      {/* BỘ LỌC — có thời gian, gian hàng, brand */}
      <div style={{ ...card, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={fromF} onChange={e => setFromF(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
        <span style={{ color: '#94a3b8' }}>→</span>
        <input type="date" value={toF} onChange={e => setToF(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
        {[[7, '7N'], [30, '30N'], [90, '90N'], [365, '1 năm']].map(([n, l]) => (
          <button key={n} onClick={() => { setFromF(daysAgoYmd(n)); setToF(todayYmd()); }} style={{ padding: '6px 11px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer' }}>{l}</button>
        ))}
        <select value={shopF} onChange={e => setShopF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Gian hàng: Tất cả</option>
          <optgroup label="Shopee">{SHOPS.filter(s => s.san === 'shopee').map(s => <option key={'sp' + s.name} value={s.name}>{s.name}</option>)}</optgroup>
          <optgroup label="TikTok">{SHOPS.filter(s => s.san === 'tiktok').map(s => <option key={'tt' + s.name} value={s.name}>{s.name}</option>)}</optgroup>
        </select>
        <select value={brandF} onChange={e => setBrandF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Brand: Tất cả</option>{BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={typeF} onChange={e => setTypeF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}><option value="all">Loại lỗi: Tất cả</option>{DEFECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}><option value="all">Trạng thái: Tất cả</option>{Object.keys(STATUS).map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}</select>
        <input type="text" placeholder="🔍 Tìm SP, lot, đơn..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: 200 }} />
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{filtered.length} hồ sơ</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <TabBtn id="list">📋 Danh sách</TabBtn>
        <TabBtn id="library">🖼️ Thư viện ảnh/video ({library.length})</TabBtn>
        <TabBtn id="report">📊 Báo cáo chất lượng</TabBtn>
      </div>

      {tab === 'list' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div style={card}><div style={{ ...labelStyle, marginBottom: 10 }}>🏆 Top sản phẩm lỗi</div>
              {topProducts.length === 0 ? <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Chưa có data</div> : topProducts.map(([n, c]) => (
                <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.82rem', borderBottom: '1px solid #f8fafc' }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }} title={n}>{n}</span><b style={{ color: ACCENT }}>{c}</b></div>))}
            </div>
            <div style={card}><div style={{ ...labelStyle, marginBottom: 10 }}>📦 Theo lot sản xuất</div>
              {topLots.length === 0 ? <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Chưa nhập lot nào</div> : topLots.map(([n, c]) => (
                <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.82rem', borderBottom: '1px solid #f8fafc' }}><span style={{ fontFamily: 'monospace' }}>{n}</span><b style={{ color: '#dc2626' }}>{c} lỗi</b></div>))}
            </div>
          </div>

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>Ngày</th><th style={th}>Gian hàng</th><th style={th}>Brand</th><th style={{ ...th, minWidth: 180 }}>Sản phẩm</th>
                  <th style={th}>Loại lỗi</th><th style={{ ...th, textAlign: 'center' }}>Mức độ</th><th style={th}>Lot</th>
                  <th style={{ ...th, textAlign: 'center' }}>Ảnh</th><th style={{ ...th, textAlign: 'center' }}>Trạng thái</th><th style={{ ...th, textAlign: 'center', width: 130 }}>Hành động</th>
                </tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={10} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Đang tải...</td></tr>
                    : filtered.length === 0 ? <tr><td colSpan={10} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>Không có hồ sơ trong kỳ — đổi bộ lọc hoặc bấm “+ Tạo hồ sơ lỗi”</td></tr>
                      : filtered.map(r => { const sv = SEVERITY[r.severity] || SEVERITY.trung_binh; const media = mediaOf(r); return (
                        <tr key={r.id}>
                          <td style={td}>{fmtDate(r.report_date)}</td>
                          <td style={{ ...td, fontSize: '0.78rem' }}>{r.shop_name ? <>{r.platform === 'shopee' ? '🟠' : '⬛'} {r.shop_name}</> : <span style={{ color: '#cbd5e1' }}>{sanLabel(r.platform) || '—'}</span>}</td>
                          <td style={{ ...td, fontSize: '0.76rem', fontWeight: 700, color: '#7c3aed' }}>{r.brand || brandOfShop(r.shop_name) || '—'}</td>
                          <td style={{ ...td, fontWeight: 600, whiteSpace: 'normal', maxWidth: 240 }}>{r.product_name}</td>
                          <td style={td}>{r.defect_type || '—'}</td>
                          <td style={{ ...td, textAlign: 'center' }}><span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: sv.bg, color: sv.color }}>{sv.label}</span></td>
                          <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.76rem' }}>{r.lot_code || '—'}</td>
                          <td style={{ ...td, textAlign: 'center' }}>{media.length ? <button onClick={() => setLightbox({ list: media, i: 0, row: r })} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.95rem' }} title={`${media.length} ảnh/video`}>🖼️{media.length > 1 ? media.length : ''}</button> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                          <td style={{ ...td, textAlign: 'center' }}>
                            <select value={r.status} onChange={e => patch(r, { status: e.target.value })} style={{ padding: '3px 6px', borderRadius: 6, border: 'none', fontSize: '0.72rem', fontWeight: 700, background: (STATUS[r.status] || STATUS.new).bg, color: (STATUS[r.status] || STATUS.new).color, cursor: 'pointer' }}>{Object.keys(STATUS).map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}</select>
                          </td>
                          <td style={{ ...td, textAlign: 'center' }}><div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}><button onClick={() => setEditing(r)} style={miniBtn('#64748b')}>Sửa</button><button onClick={() => del(r)} style={miniBtn('#dc2626')}>Xoá</button></div></td>
                        </tr>); })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* THƯ VIỆN ẢNH/VIDEO */}
      {tab === 'library' && (
        <div style={card}>
          {library.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: 20, textAlign: 'center' }}>Chưa có ảnh/video nào trong kỳ. Thêm link ảnh/video khi tạo hồ sơ lỗi.</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
              {library.map((m, i) => (
                <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: '#f8fafc' }}>
                  <div onClick={() => setLightbox({ list: [m.url], i: 0, row: m.row })} style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#0f172a08' }}>
                    {isImage(m.url)
                      ? <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.parentNode.innerHTML = '<span style="font-size:2rem">🖼️</span>'; }} />
                      : <span style={{ fontSize: '2rem' }}>{isVideo(m.url) ? '🎬' : '📎'}</span>}
                  </div>
                  <div style={{ padding: '7px 9px', fontSize: '0.72rem' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.row.product_name}>{m.row.product_name}</div>
                    <div style={{ color: '#94a3b8' }}>{fmtDate(m.row.report_date)} · {m.row.defect_type || '—'}</div>
                    {m.row.lot_code && <div style={{ color: '#94a3b8', fontFamily: 'monospace' }}>Lot {m.row.lot_code}</div>}
                    <a href={m.url} target="_blank" rel="noreferrer" style={{ color: '#0891b2', fontWeight: 700 }}>Mở gốc ↗</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* BÁO CÁO CHẤT LƯỢNG THEO TUẦN/THÁNG */}
      {tab === 'report' && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
            <b style={{ fontSize: '0.92rem', color: '#0f172a' }}>📊 Báo cáo chất lượng sản phẩm</b>
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              {[['week', 'Theo tuần'], ['month', 'Theo tháng']].map(([v, l]) => (
                <button key={v} onClick={() => setPeriodMode(v)} style={{ padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${periodMode === v ? ACCENT : '#e5e7eb'}`, background: periodMode === v ? '#fff7ed' : '#fff', color: periodMode === v ? '#e85518' : '#64748b', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Kỳ</th><th style={th}>Brand</th>
                <th style={{ ...th, textAlign: 'right' }}>Số lỗi</th><th style={{ ...th, textAlign: 'right' }}>Lỗi nặng</th>
                <th style={{ ...th, textAlign: 'right' }}>Chưa xử lý</th><th style={th}>Lỗi phổ biến nhất</th>
              </tr></thead>
              <tbody>
                {report.length === 0 ? <tr><td colSpan={6} style={{ ...td, textAlign: 'center', padding: 36, color: '#94a3b8' }}>Không có dữ liệu trong kỳ đã lọc.</td></tr>
                  : report.map((x, i) => (
                    <tr key={i}>
                      <td style={{ ...td, fontWeight: 800 }}>{x.period}</td>
                      <td style={{ ...td, color: '#7c3aed', fontWeight: 700 }}>{x.brand}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{x.total}</td>
                      <td style={{ ...td, textAlign: 'right', color: x.nang ? '#dc2626' : '#94a3b8', fontWeight: 700 }}>{x.nang}</td>
                      <td style={{ ...td, textAlign: 'right', color: x.unresolved ? '#b45309' : '#94a3b8', fontWeight: 700 }}>{x.unresolved}</td>
                      <td style={td}>{x.topType}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px', fontSize: '0.74rem', color: '#94a3b8' }}>* Bấm “📥 Xuất Excel” để lấy cả sheet báo cáo {periodMode === 'week' ? 'tuần' : 'tháng'} này.</div>
        </div>
      )}

      {/* LIGHTBOX */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', textAlign: 'center' }}>
            {isImage(lightbox.list[lightbox.i])
              ? <img src={lightbox.list[lightbox.i]} alt="" style={{ maxWidth: '86vw', maxHeight: '74vh', borderRadius: 12, background: '#fff' }} />
              : <div style={{ background: '#fff', borderRadius: 12, padding: 40 }}><div style={{ fontSize: '3rem', marginBottom: 12 }}>{isVideo(lightbox.list[lightbox.i]) ? '🎬' : '📎'}</div><a href={lightbox.list[lightbox.i]} target="_blank" rel="noreferrer" style={{ color: '#0891b2', fontWeight: 800 }}>Mở link ↗</a></div>}
            <div style={{ color: '#fff', marginTop: 12, fontSize: '0.85rem' }}>
              <b>{lightbox.row?.product_name}</b> · {lightbox.row?.defect_type} · {fmtDate(lightbox.row?.report_date)}
              {lightbox.list.length > 1 && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button onClick={() => setLightbox(l => ({ ...l, i: (l.i - 1 + l.list.length) % l.list.length }))} style={miniBtn('#e5e7eb')}>← Trước</button>
                  <span>{lightbox.i + 1}/{lightbox.list.length}</span>
                  <button onClick={() => setLightbox(l => ({ ...l, i: (l.i + 1) % l.list.length }))} style={miniBtn('#e5e7eb')}>Sau →</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FORM */}
      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 640 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 900 }}>{editing.id ? '✏️ Sửa hồ sơ lỗi' : '🔧 Tạo hồ sơ lỗi'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Tên sản phẩm *</label><input value={editing.product_name || ''} onChange={e => setEditing({ ...editing, product_name: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Ngày ghi nhận</label><input type="date" value={editing.report_date || ''} onChange={e => setEditing({ ...editing, report_date: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Gian hàng (sàn cụ thể)</label>
                <select value={editing.shop_name || ''} onChange={e => pickShop(e.target.value)} style={inputStyle}>
                  <option value="">— chọn gian —</option>
                  <optgroup label="Shopee">{SHOPS.filter(s => s.san === 'shopee').map(s => <option key={'f-sp' + s.name} value={s.name}>Shopee · {s.name}</option>)}</optgroup>
                  <optgroup label="TikTok">{SHOPS.filter(s => s.san === 'tiktok').map(s => <option key={'f-tt' + s.name} value={s.name}>TikTok · {s.name}</option>)}</optgroup>
                </select>
              </div>
              <div><label style={labelStyle}>Brand</label>
                <select value={editing.brand || ''} onChange={e => setEditing({ ...editing, brand: e.target.value })} style={inputStyle}>
                  <option value="">— chọn —</option>{BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div><label style={labelStyle}>Loại lỗi</label><select value={editing.defect_type || ''} onChange={e => setEditing({ ...editing, defect_type: e.target.value })} style={inputStyle}>{DEFECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label style={labelStyle}>Mức độ</label><select value={editing.severity} onChange={e => setEditing({ ...editing, severity: e.target.value })} style={inputStyle}>{Object.keys(SEVERITY).map(s => <option key={s} value={s}>{SEVERITY[s].label}</option>)}</select></div>
              <div><label style={labelStyle}>Lot sản xuất</label><input value={editing.lot_code || ''} onChange={e => setEditing({ ...editing, lot_code: e.target.value })} style={inputStyle} placeholder="VD: A250601" /></div>
              <div><label style={labelStyle}>Ngày sản xuất</label><input type="date" value={editing.production_date || ''} onChange={e => setEditing({ ...editing, production_date: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Mã đơn</label><input value={editing.order_sn || ''} onChange={e => setEditing({ ...editing, order_sn: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Nhân viên (CS)</label><input value={editing.staff || ''} onChange={e => setEditing({ ...editing, staff: e.target.value })} style={inputStyle} placeholder="Tên CS ghi nhận" /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Mô tả lỗi</label><textarea value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} style={{ ...inputStyle, minHeight: 52, resize: 'vertical' }} /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Link ảnh/video (mỗi dòng 1 link — hiện ở tab Thư viện)</label><textarea value={editing.media_links || ''} onChange={e => setEditing({ ...editing, media_links: e.target.value })} style={{ ...inputStyle, minHeight: 52, resize: 'vertical' }} placeholder="https://..." /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setEditing(null)} style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>Huỷ</button>
              <button onClick={save} style={{ padding: '9px 24px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>💾 Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function miniBtn(color) { return { padding: '4px 9px', borderRadius: 7, border: 'none', background: color + '18', color, fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }; }
