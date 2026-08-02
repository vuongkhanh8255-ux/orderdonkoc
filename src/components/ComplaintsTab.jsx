// src/components/ComplaintsTab.jsx
//
// MODULE 3 — KHIẾU NẠI KHÁCH HÀNG.
// Theo feedback CS: khiếu nại thì "lên đơn trên web và lưu data ở đó luôn giống của booking".
// CS tạo hồ sơ tay → vòng đời theo brief (Mới tiếp nhận → Xác minh → Đang xử lý → Chờ gửi bù
// → Chờ phản hồi khách → Hoàn tất → Đóng hồ sơ) + đơn gửi bù + bằng chứng.
// Bảng: cs_cases (case_type='complaint'). Trả hàng tách sang Module 2 (ReturnsTab).

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { SHOPS, shopKey, findShopByKey, sanLabel } from '../constants/shops';
import AddressPicker from './AddressPicker';
import EvidenceUploader from './EvidenceUploader';
import SearchableDropdown from './SearchableDropdown';

const ACCENT = '#ff6a2c';
const TABLE = 'cs_cases';
const OVERDUE_DAYS = 3;

// Vòng đời — CS 1/8 BỎ 3 trạng thái (Chờ xác minh / Chờ khách phản hồi / Đã đóng hồ sơ),
// hồ sơ cũ đã remap trong DB (verifying+awaiting_customer→processing, closed→done).
const STATUS = {
  new:                { label: 'Mới tiếp nhận',     color: '#b45309', bg: '#fef3c7' },
  processing:         { label: 'Đang xử lý',        color: '#1d4ed8', bg: '#dbeafe' },
  awaiting_gift:      { label: 'Chờ gửi bù',        color: '#7c3aed', bg: '#ede9fe' },
  done:               { label: 'Đã hoàn tất',       color: '#15803d', bg: '#dcfce7' },
};
const FLOW = ['new', 'processing', 'awaiting_gift', 'done'];
// Phân loại nguyên nhân theo brief + 5 lý do CS bổ sung 27/7
const REASONS = ['Thiếu hàng', 'Hư hỏng', 'Sai sản phẩm', 'Chất lượng sản phẩm', 'Vận chuyển',
  'Dịch vụ khách hàng', 'Không nhận được hàng',
  'Lỗi hệ thống không hiện quà', 'Lỗi vòi', 'Hết hàng', 'Hiểu nhầm chương trình', 'ĐVVC', 'Khác'];

const fmtDate = (s) => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
const daysSince = (s) => (s ? Math.floor((Date.now() - new Date(s).getTime()) / 86400000) : 0);
const fmtN = (n) => new Intl.NumberFormat('vi-VN').format(Number(n) || 0);

const inputStyle = { padding: '8px 11px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', color: '#1f2937', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
const labelStyle = { fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4, display: 'block' };
const th = { padding: '9px 10px', fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'left', whiteSpace: 'nowrap', background: '#f8fafc', borderBottom: '2px solid #e5e7eb' };
const td = { padding: '8px 10px', fontSize: '0.82rem', color: '#0f172a', borderTop: '1px solid #f1f5f9', verticalAlign: 'top' };
const card = { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const miniBtn = (color) => ({ padding: '4px 9px', borderRadius: 7, border: 'none', background: color + '18', color, fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' });

const EMPTY = {
  case_type: 'complaint', platform: 'shopee', order_sn: '', shop_name: '', buyer_name: '', buyer_phone: '', buyer_address: '',
  product_summary: '', reason_category: '', reason: '', status: 'new', assigned_to: '',
  evidence_links: '', compensation_items: '', compensation_tracking: '', note: '', source: 'manual',
};
const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgoYmd = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymdOf(d); };
const isImg = (u) => /\.(jpe?g|png|gif|webp|bmp|heic)(\?|$)/i.test(u);
const isVid = (u) => /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(u) || /(youtube|youtu\.be|tiktok\.com|drive\.google\.com\/file)/i.test(u);

// ── ĐƠN GỬI BÙ (CS 30/7) ─────────────────────────────────────────────────────
// Kho cần BARCODE + SỐ LƯỢNG tách bạch mới lên đơn được, nên giờ CS chọn SP từ danh mục
// và lưu vào cột `compensation_json` = [{barcode, ten, sl}].
// `compensation_items` (chữ) vẫn ghi bản tóm tắt để bảng danh sách + hồ sơ cũ không đổi gì.
const compLines = (r) => {
  const j = r?.compensation_json;
  if (Array.isArray(j) && j.length) return j.map(x => ({ barcode: x.barcode || '', ten: x.ten || '', sl: Number(x.sl) || 1 }));
  // Hồ sơ CŨ chỉ có chữ tay ("Gel nha đam 250ml x1") → vẫn xuất được, barcode để trống cho kho tra tay.
  const txt = String(r?.compensation_items || '').trim();
  if (!txt) return [];
  return txt.split('|').map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(.*?)\s*[x×]\s*(\d+)\s*$/i);
    return m ? { barcode: '', ten: m[1].trim(), sl: Number(m[2]) || 1 } : { barcode: '', ten: s, sl: 1 };
  });
};
const compText = (lines) => (lines || []).map(l => `${l.ten} x${l.sl}`).join(' | ');

export default function ComplaintsTab({ currentUser }) {
  const isAdmin = currentUser?.role === 'admin';   // CS 1/8: nút XÓA chỉ admin
  const isKho = currentUser?.role === 'kho';       // CS 1/8: ô "Kho xác nhận" chỉ tài khoản kho
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [statusF, setStatusF] = useState('open');
  const [platF, setPlatF] = useState('all');
  const [reasonF, setReasonF] = useState('all');
  const [shopF, setShopF] = useState('all');
  const [fromF, setFromF] = useState(daysAgoYmd(90));
  const [toF, setToF] = useState(ymdOf(new Date()));
  const [search, setSearch] = useState('');
  const [view, setView] = useState('list');    // list | library
  const [lightbox, setLightbox] = useState(null);

  const [prods, setProds] = useState([]);      // danh mục SP (có barcode) để chọn đồ gửi bù

  // Phân trang 1000 — Supabase cắt cụt 1000 dòng dù đặt .limit() cao hơn (bẫy đã dính ở Module 2).
  const load = useCallback(async () => {
    setLoading(true);
    const all = [];
    for (let pg = 0; pg < 10; pg++) {
      const { data, error } = await supabase.from(TABLE).select('*')
        .eq('case_type', 'complaint').order('created_at', { ascending: false })
        .range(pg * 1000, pg * 1000 + 999);
      if (error) { alert('Lỗi tải: ' + error.message); break; }
      all.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    setRows(all); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Danh mục SP dùng chung với Order (bảng sanphams) — lấy cả barcode để xuất cho kho
  useEffect(() => {
    supabase.from('sanphams').select('id, ten_sanpham, barcode').not('an', 'is', true)
      .order('ten_sanpham').limit(1000)
      .then(({ data }) => setProds(data || []), () => setProds([]));
  }, []);
  const prodOptions = useMemo(() => prods.map(p => ({
    value: p.id, label: p.barcode ? `${p.ten_sanpham} · ${p.barcode}` : p.ten_sanpham,
  })), [prods]);

  const save = async () => {
    const r = editing;
    if (!r.order_sn?.trim() && !r.buyer_name?.trim()) { alert('Cần ít nhất Mã đơn hoặc Tên khách'); return; }
    const payload = {
      case_type: 'complaint', platform: r.platform || null, order_sn: r.order_sn?.trim() || null,
      shop_name: r.shop_name || null, buyer_name: r.buyer_name || null, buyer_phone: r.buyer_phone || null,
      buyer_address: r.buyer_address || null,
      product_summary: r.product_summary || null, reason: r.reason || null, reason_category: r.reason_category || null,
      status: r.status || 'new', assigned_to: r.assigned_to || null, evidence_links: r.evidence_links || null,
      compensation_items: r.compensation_items || null, compensation_tracking: r.compensation_tracking || null,
      compensation_json: (Array.isArray(r.compensation_json) && r.compensation_json.length) ? r.compensation_json : null,
      compensation_at: r.compensation_items ? (r.compensation_at || new Date().toISOString()) : null,
      note: r.note || null, updated_at: new Date().toISOString(),
      done_at: (r.status === 'done' || r.status === 'closed') ? new Date().toISOString() : null,
    };
    let error;
    if (r.id) ({ error } = await supabase.from(TABLE).update(payload).eq('id', r.id));
    else ({ error } = await supabase.from(TABLE).insert({ ...payload, source: 'manual', order_key: null }));
    if (error) { alert('Lưu không được: ' + error.message); return; }
    setEditing(null); load();
  };

  const quickStatus = async (row, status) => {
    setRows(prev => prev.map(x => (x.id === row.id ? { ...x, status } : x)));
    await supabase.from(TABLE).update({
      status, updated_at: new Date().toISOString(),
      done_at: (status === 'done' || status === 'closed') ? new Date().toISOString() : null,
    }).eq('id', row.id);
  };
  const del = async (row) => { if (!confirm('Xoá hồ sơ khiếu nại này?')) return; await supabase.from(TABLE).delete().eq('id', row.id); load(); };
  // Sửa nhanh 1 dòng ngay trên bảng (dùng cho ô Kho xác nhận)
  const patchRow = async (row, p) => {
    setRows(prev => prev.map(x => (x.id === row.id ? { ...x, ...p } : x)));
    await supabase.from(TABLE).update({ ...p, updated_at: new Date().toISOString() }).eq('id', row.id);
  };

  const filtered = useMemo(() => rows.filter(r => {
    const d = (r.created_at || '').slice(0, 10);
    if (fromF && d && d < fromF) return false;
    if (toF && d && d > toF) return false;
    if (statusF === 'open' && (r.status === 'done' || r.status === 'closed')) return false;
    if (statusF !== 'all' && statusF !== 'open' && r.status !== statusF) return false;
    if (platF !== 'all' && r.platform !== platF) return false;
    if (shopF !== 'all' && r.shop_name !== shopF) return false;
    if (reasonF !== 'all' && r.reason_category !== reasonF) return false;
    if (search) {
      const q = search.toLowerCase();
      if (![r.order_sn, r.buyer_name, r.buyer_phone, r.product_summary, r.reason, r.note].some(v => v && String(v).toLowerCase().includes(q))) return false;
    }
    return true;
  }), [rows, statusF, platF, shopF, reasonF, search, fromF, toF]);

  // Thư viện ảnh/video từ bằng chứng khiếu nại
  const library = useMemo(() => {
    const out = [];
    filtered.forEach(r => (r.evidence_links || '').split('\n').map(s => s.trim()).filter(Boolean).forEach(u => out.push({ url: u, row: r })));
    return out;
  }, [filtered]);

  const kpi = useMemo(() => {
    const c = { new: 0, processing: 0, awaiting_gift: 0, done: 0, overdue: 0 };
    rows.forEach(r => {
      if (r.status === 'new') c.new++;
      if (['verifying', 'processing'].includes(r.status)) c.processing++;
      if (r.status === 'awaiting_gift') c.awaiting_gift++;
      if (r.status === 'done' || r.status === 'closed') c.done++;
      if (!['done', 'closed'].includes(r.status) && daysSince(r.created_at) >= OVERDUE_DAYS) c.overdue++;
    });
    return c;
  }, [rows]);

  // Thống kê nguyên nhân + top SP bị khiếu nại (brief M3 mục 7)
  const byReason = useMemo(() => {
    const m = {};
    rows.forEach(r => { const k = r.reason_category || 'Chưa phân loại'; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const topProducts = useMemo(() => {
    const m = {};
    rows.forEach(r => { const k = (r.product_summary || '').trim(); if (k) m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [rows]);

  const openNew = () => setEditing({ ...EMPTY, assigned_to: currentUser?.name || currentUser?.username || '' });

  // ── XUẤT EXCEL ĐƠN GỬI BÙ (CS 30/7) — file giao thẳng cho kho lên đơn ──
  // Mỗi SP gửi bù 1 DÒNG (hồ sơ gửi bù 2 món → 2 dòng, thông tin khách lặp lại) để kho copy thẳng.
  // Chỉ lấy hồ sơ CÓ đồ gửi bù, trong đúng bộ lọc đang xem.
  const xuatExcel = () => {
    const out = [];
    filtered.forEach(r => compLines(r).forEach(l => out.push({
      'BARCODE': l.barcode || '',
      'TÊN SÀN': [sanLabel(r.platform), r.shop_name].filter(Boolean).join(' · '),
      'MÃ ĐƠN HÀNG': r.order_sn || '',                       // CS 1/8
      'SẢN PHẨM GỬI BÙ': l.ten,
      'SỐ LƯỢNG': l.sl,
      'TÊN KHÁCH HÀNG': r.buyer_name || '',
      'SỐ ĐIỆN THOẠI KHÁCH HÀNG': r.buyer_phone || '',
      'ĐỊA CHỈ KHÁCH HÀNG': r.buyer_address || '',
      'NỘI DUNG KHIẾU NẠI': r.reason || r.reason_category || '',   // CS 1/8
    })));
    if (!out.length) { alert('Không có hồ sơ nào có sản phẩm gửi bù trong bộ lọc đang xem.\nMở hồ sơ → mục "🎁 Đơn gửi bù" chọn sản phẩm rồi xuất lại.'); return; }
    const thieuBarcode = out.filter(x => !x.BARCODE).length;
    const ws = XLSX.utils.json_to_sheet(out);
    ws['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 20 }, { wch: 44 }, { wch: 10 }, { wch: 22 }, { wch: 15 }, { wch: 50 }, { wch: 46 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Don gui bu');
    XLSX.writeFile(wb, `KhieuNai_GuiBu_${fromF}_${toF}.xlsx`);
    if (thieuBarcode) alert(`✅ Đã xuất ${out.length} dòng.\n⚠️ ${thieuBarcode} dòng CHƯA CÓ BARCODE (hồ sơ cũ ghi tay) — mở hồ sơ chọn lại sản phẩm từ danh mục là có barcode.`);
  };

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1400 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>⚠️ Module 3: Khiếu nại khách hàng</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>CS lên đơn khiếu nại trên web — lưu hồ sơ, bằng chứng, đơn gửi bù &amp; vòng đời xử lý.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={xuatExcel} title="Xuất danh sách đồ gửi bù (barcode · số lượng · địa chỉ khách) để kho lên đơn"
            style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>📥 Xuất Excel</button>
          <button onClick={openNew} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 12px rgba(255,106,44,0.25)' }}>+ Lên đơn khiếu nại</button>
        </div>
      </div>

      {/* KPI theo brief */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { k: 'new', label: 'Khiếu nại mới', v: kpi.new, color: STATUS.new.color },
          { k: 'processing', label: 'Đang xử lý', v: kpi.processing, color: STATUS.processing.color },
          { k: 'awaiting_gift', label: 'Chờ gửi bù', v: kpi.awaiting_gift, color: STATUS.awaiting_gift.color },
          { k: 'done', label: 'Đã hoàn tất', v: kpi.done, color: STATUS.done.color },
          { k: 'overdue', label: `Quá ${OVERDUE_DAYS} ngày`, v: kpi.overdue, color: '#dc2626' },
        ].map(c => (
          <div key={c.k} onClick={() => setStatusF(c.k === 'overdue' ? 'open' : c.k === 'processing' ? 'processing' : c.k)}
            style={{ ...card, borderTop: `3px solid ${c.color}`, cursor: 'pointer' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: c.color }}>{c.v}</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* PHÂN TÍCH */}
      {rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div style={card}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 10, fontSize: '0.9rem' }}>📊 Theo nguyên nhân</div>
            {byReason.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: '0.8rem', color: '#475569', width: 160, flexShrink: 0 }}>{k}</span>
                <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(100 * v / rows.length)}%`, height: '100%', background: ACCENT }} />
                </div>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a', width: 56, textAlign: 'right' }}>{v} ({Math.round(100 * v / rows.length)}%)</span>
              </div>
            ))}
          </div>
          <div style={card}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 10, fontSize: '0.9rem' }}>📦 Top SP bị khiếu nại</div>
            {topProducts.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Chưa có dữ liệu.</div>
              : topProducts.map(([k, v], i) => (
                <div key={k} style={{ display: 'flex', gap: 8, fontSize: '0.8rem', padding: '4px 0', borderTop: i ? '1px solid #f8fafc' : 'none' }}>
                  <span style={{ color: i < 3 ? ACCENT : '#94a3b8', fontWeight: 800, width: 18 }}>{i + 1}</span>
                  <span style={{ flex: 1, color: '#475569' }}>{k.length > 70 ? k.slice(0, 70) + '…' : k}</span>
                  <span style={{ fontWeight: 800, color: '#dc2626' }}>{v}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* FILTER — có thời gian + gian hàng */}
      <div style={{ ...card, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={fromF} onChange={e => setFromF(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
        <span style={{ color: '#94a3b8' }}>→</span>
        <input type="date" value={toF} onChange={e => setToF(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
        {[[7, '7N'], [30, '30N'], [90, '90N'], [365, '1 năm']].map(([n, l]) => (
          <button key={n} onClick={() => { setFromF(daysAgoYmd(n)); setToF(ymdOf(new Date())); }} style={{ padding: '6px 11px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer' }}>{l}</button>
        ))}
        <input type="text" placeholder="🔍 Tìm mã đơn, khách, SĐT, SP..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: 230 }} />
        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="open">Chưa hoàn tất</option><option value="all">Tất cả trạng thái</option>
          {FLOW.map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </select>
        <select value={reasonF} onChange={e => setReasonF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Nguyên nhân: Tất cả</option>{REASONS.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={platF} onChange={e => { setPlatF(e.target.value); setShopF('all'); }} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Sàn: Tất cả</option><option value="shopee">Shopee</option><option value="tiktok">TikTok</option>
        </select>
        <select value={shopF} onChange={e => setShopF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Gian: Tất cả</option>
          {SHOPS.filter(s => platF === 'all' || s.san === platF).map(s => <option key={s.san + s.name} value={s.name}>{s.name}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{fmtN(filtered.length)} hồ sơ</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[['list', '📋 Danh sách'], ['library', `🖼️ Thư viện ảnh/video (${library.length})`]].map(([v, l]) => (
          <button key={v} onClick={() => setView(v)} style={{ padding: '8px 16px', borderRadius: 9, border: `1.5px solid ${view === v ? ACCENT : '#e5e7eb'}`, background: view === v ? '#fff7ed' : '#fff', color: view === v ? '#e85518' : '#64748b', fontWeight: 800, fontSize: '0.83rem', cursor: 'pointer' }}>{l}</button>
        ))}
      </div>

      {/* THƯ VIỆN ẢNH/VIDEO */}
      {view === 'library' && (
        <div style={card}>
          {library.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: 20, textAlign: 'center' }}>Chưa có ảnh/video bằng chứng nào trong kỳ.</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
              {library.map((m, i) => (
                <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: '#f8fafc' }}>
                  <div onClick={() => setLightbox(m)} style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#0f172a08' }}>
                    {isImg(m.url)
                      ? <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.parentNode.innerHTML = '<span style="font-size:2rem">🖼️</span>'; }} />
                      : <span style={{ fontSize: '2rem' }}>{isVid(m.url) ? '🎬' : '📎'}</span>}
                  </div>
                  <div style={{ padding: '7px 9px', fontSize: '0.72rem' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.row.product_summary}>{m.row.buyer_name || m.row.order_sn || '—'}</div>
                    <div style={{ color: '#94a3b8' }}>{fmtDate(m.row.created_at)} · {m.row.reason_category || '—'}</div>
                    <a href={m.url} target="_blank" rel="noreferrer" style={{ color: '#0891b2', fontWeight: 700 }}>Mở gốc ↗</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            {isImg(lightbox.url)
              ? <img src={lightbox.url} alt="" style={{ maxWidth: '86vw', maxHeight: '76vh', borderRadius: 12, background: '#fff' }} />
              : <div style={{ background: '#fff', borderRadius: 12, padding: 40 }}><div style={{ fontSize: '3rem', marginBottom: 12 }}>{isVid(lightbox.url) ? '🎬' : '📎'}</div><a href={lightbox.url} target="_blank" rel="noreferrer" style={{ color: '#0891b2', fontWeight: 800 }}>Mở link ↗</a></div>}
            <div style={{ color: '#fff', marginTop: 12, fontSize: '0.85rem' }}><b>{lightbox.row?.buyer_name}</b> · {lightbox.row?.reason_category} · {fmtDate(lightbox.row?.created_at)}</div>
          </div>
        </div>
      )}

      {/* TABLE */}
      {view === 'list' && (
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {/* CS 30/7: bỏ cột Sản phẩm, thay bằng MÃ VẬN ĐƠN + NHÂN VIÊN XỬ LÝ
                  → theo dõi được ngay trên danh sách, khỏi bấm vào từng đơn. */}
              <th style={th}>Sàn</th><th style={th}>Mã đơn</th><th style={th}>Khách</th>
              <th style={th}>Mã vận đơn</th><th style={th}>NV xử lý</th><th style={th}>Nguyên nhân</th>
              <th style={th}>Gửi bù</th><th style={{ ...th, textAlign: 'center' }}>Ngày</th>
              <th style={{ ...th, textAlign: 'center' }}>Trạng thái</th>
              <th style={{ ...th, textAlign: 'center' }} title="Kho tick khi đã xác nhận — chỉ tài khoản KHO thao tác được">🏭 Kho xác nhận</th>
              <th style={{ ...th, textAlign: 'center', width: 210 }}>Hành động</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={11} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Đang tải...</td></tr>
                : filtered.length === 0 ? <tr><td colSpan={11} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chưa có khiếu nại nào — bấm “+ Lên đơn khiếu nại”.</td></tr>
                  : filtered.map(r => {
                    const st = STATUS[r.status] || STATUS.new;
                    const over = !['done', 'closed'].includes(r.status) && daysSince(r.created_at) >= OVERDUE_DAYS;
                    const idx = FLOW.indexOf(r.status);
                    const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;
                    return (
                      <tr key={r.id} style={{ background: over ? '#fff7f7' : 'transparent' }}>
                        <td style={td}>{r.platform === 'shopee' ? '🟠' : r.platform === 'tiktok' ? '⬛' : '—'}</td>
                        <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.74rem' }}>{r.order_sn || '—'}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{r.buyer_name || '—'}{r.buyer_phone && <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{r.buyer_phone}</div>}</td>
                        <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.74rem', color: r.compensation_tracking ? '#7c3aed' : '#cbd5e1' }}>
                          {r.compensation_tracking || 'chưa có'}
                        </td>
                        <td style={{ ...td, fontSize: '0.78rem' }}>{r.assigned_to || <span style={{ color: '#cbd5e1' }}>chưa giao</span>}</td>
                        <td style={td}>{r.reason_category || <span style={{ color: '#cbd5e1' }}>chưa phân loại</span>}</td>
                        <td style={{ ...td, fontSize: '0.74rem' }}>{r.compensation_items ? <span style={{ color: '#7c3aed', fontWeight: 700 }}>🎁 {r.compensation_items}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                        <td style={{ ...td, textAlign: 'center', fontSize: '0.76rem', color: over ? '#dc2626' : '#64748b' }}>{fmtDate(r.created_at)}{over && <div style={{ fontSize: '0.66rem', fontWeight: 700 }}>{daysSince(r.created_at)}n</div>}</td>
                        <td style={{ ...td, textAlign: 'center' }}><span style={{ padding: '3px 9px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>{st.label}</span></td>
                        {/* CS 1/8: ô "Kho xác nhận" — CHỈ tài khoản KHO tick được, người khác chỉ xem */}
                        <td style={{ ...td, textAlign: 'center' }}>
                          <input type="checkbox" checked={!!r.kho_confirmed} disabled={!isKho}
                            title={isKho ? 'Kho xác nhận đơn này' : (r.kho_confirmed ? `Kho đã xác nhận${r.kho_confirmed_at ? ' ' + fmtDate(r.kho_confirmed_at) : ''}` : 'Chỉ tài khoản KHO tick được')}
                            onChange={e => patchRow(r, { kho_confirmed: e.target.checked, kho_confirmed_at: e.target.checked ? new Date().toISOString() : null, kho_confirmed_by: e.target.checked ? (currentUser?.name || currentUser?.username || 'kho') : null })}
                            style={{ width: 17, height: 17, cursor: isKho ? 'pointer' : 'not-allowed', accentColor: '#15803d' }} />
                        </td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
                            {next && <button onClick={() => quickStatus(r, next)} style={miniBtn('#2563eb')} title={`Chuyển sang: ${STATUS[next].label}`}>→ {STATUS[next].label}</button>}
                            <button onClick={() => setEditing(r)} style={miniBtn('#64748b')}>Chi tiết</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* FORM — CS 27/7: TRƯỚC bấm trúng nền là form đóng cái rụp, mất sạch đồ đang nhập ("di chuột là
          out, điền lại từ đầu"). Giờ bấm nền KHÔNG đóng, muốn thoát phải bấm nút Đóng và xác nhận. */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 680 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 900 }}>{editing.id ? '⚠️ Hồ sơ khiếu nại' : '➕ Lên đơn khiếu nại'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div><label style={labelStyle}>Sàn</label><select value={editing.platform || ''} onChange={e => setEditing({ ...editing, platform: e.target.value })} style={inputStyle}><option value="">—</option><option value="shopee">Shopee</option><option value="tiktok">TikTok</option></select></div>
              <div><label style={labelStyle}>Gian hàng</label>
                {/* value = shopKey (sàn|tên): "eHerb Hồ Chí Minh" có ở CẢ 2 sàn, tra theo mỗi tên
                    sẽ luôn ra Shopee → chọn gian TikTok bị nhảy sàn (CS 28/7). */}
                <select value={editing.shop_name ? `${editing.platform}|${editing.shop_name}` : ''}
                  onChange={e => { const sh = findShopByKey(e.target.value); setEditing({ ...editing, shop_name: sh ? sh.name : '', platform: sh ? sh.san : editing.platform }); }} style={inputStyle}>
                  <option value="">— chọn gian —</option>
                  <optgroup label="Shopee">{SHOPS.filter(s => s.san === 'shopee').map(s => <option key={shopKey(s)} value={shopKey(s)}>Shopee · {s.name}</option>)}</optgroup>
                  <optgroup label="TikTok">{SHOPS.filter(s => s.san === 'tiktok').map(s => <option key={shopKey(s)} value={shopKey(s)}>TikTok · {s.name}</option>)}</optgroup>
                </select>
              </div>
              <div><label style={labelStyle}>Mã đơn hàng</label><input value={editing.order_sn || ''} onChange={e => setEditing({ ...editing, order_sn: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Tên khách</label><input value={editing.buyer_name || ''} onChange={e => setEditing({ ...editing, buyer_name: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>SĐT khách</label><input value={editing.buyer_phone || ''} onChange={e => setEditing({ ...editing, buyer_phone: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Người xử lý (CS)</label><input value={editing.assigned_to || ''} onChange={e => setEditing({ ...editing, assigned_to: e.target.value })} style={inputStyle} /></div>
              {/* CS 27/7: chọn dropdown thay vì gõ tay, dùng CHUNG list phân loại với Đánh giá sàn
                  → thống kê khiếu nại theo mùi/loại SP khớp được với bên đánh giá. */}
              {/* Ô "Sản phẩm liên quan" ĐÃ BỎ theo CS 30/7 — khiếu nại bám theo ĐƠN, không theo SP.
                  Dữ liệu cũ vẫn nằm trong cột product_summary, không xoá. */}
              <div><label style={labelStyle}>Phân loại nguyên nhân</label><select value={editing.reason_category || ''} onChange={e => setEditing({ ...editing, reason_category: e.target.value })} style={inputStyle}><option value="">— chọn —</option>{REASONS.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
              <div><label style={labelStyle}>Trạng thái</label><select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })} style={inputStyle}>{FLOW.map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}</select></div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Nội dung khiếu nại</label><textarea value={editing.reason || ''} onChange={e => setEditing({ ...editing, reason: e.target.value })} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="Khách phản ánh cụ thể điều gì..." /></div>
              <div style={{ gridColumn: 'span 2', borderTop: '1px dashed #e5e7eb', paddingTop: 12 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#7c3aed', marginBottom: 8 }}>🎁 Đơn gửi bù (nếu có)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {/* CS 30/7: chọn SP từ DANH MỤC (có barcode) + số lượng riêng → nút "Xuất Excel" đưa
                      thẳng cho kho lên đơn. Trước chỉ gõ chữ tự do nên kho phải tra barcode tay. */}
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={labelStyle}>🎁 Sản phẩm gửi bù (chọn từ danh mục — có barcode)</label>
                    {(() => {
                      const lines = Array.isArray(editing.compensation_json) ? editing.compensation_json : [];
                      const setLines = (arr) => setEditing(p => ({ ...p, compensation_json: arr, compensation_items: compText(arr) || null }));
                      const addProd = (id) => {
                        const sp = prods.find(x => x.id === id);
                        if (!sp) return;
                        const i = lines.findIndex(l => l.barcode === sp.barcode && l.ten === sp.ten_sanpham);
                        if (i >= 0) setLines(lines.map((l, j) => (j === i ? { ...l, sl: (Number(l.sl) || 1) + 1 } : l)));  // chọn lại = cộng thêm 1
                        else setLines([...lines, { barcode: sp.barcode || '', ten: sp.ten_sanpham, sl: 1 }]);
                      };
                      return (
                        <>
                          {lines.map((l, i) => (
                            <div key={`${l.barcode}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 9, padding: '6px 10px' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>{l.ten}</div>
                                <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: l.barcode ? '#94a3b8' : '#dc2626' }}>{l.barcode || '⚠ chưa có barcode — chọn lại từ danh mục'}</div>
                              </div>
                              <input type="number" min={1} value={l.sl} title="Số lượng gửi bù"
                                onChange={e => setLines(lines.map((x, j) => (j === i ? { ...x, sl: Math.max(1, Number(e.target.value) || 1) } : x)))}
                                style={{ ...inputStyle, width: 66, textAlign: 'center', padding: '5px 6px' }} />
                              <button onClick={() => setLines(lines.filter((_, j) => j !== i))} title="Bỏ sản phẩm này"
                                style={{ border: 'none', background: 'transparent', color: '#dc2626', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', padding: '0 4px' }}>✕</button>
                            </div>
                          ))}
                          <SearchableDropdown options={prodOptions} value="" onChange={addProd}
                            placeholder={lines.length ? '+ Thêm sản phẩm gửi bù nữa...' : '+ Chọn sản phẩm gửi bù...'} />
                          {/* Hồ sơ CŨ ghi tay: giữ nguyên chữ, nhắc CS chọn lại để có barcode */}
                          {!lines.length && editing.compensation_items && (
                            <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 10px' }}>
                              Hồ sơ cũ ghi tay: <b>{editing.compensation_items}</b><br />
                              Chọn lại sản phẩm ở ô trên để file Excel có barcode cho kho.
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Mã vận đơn gửi bù</label><input value={editing.compensation_tracking || ''} onChange={e => setEditing({ ...editing, compensation_tracking: e.target.value })} style={inputStyle} /></div>
                  {/* CS 27/7: địa chỉ chọn dropdown giống Booking/Order (34 tỉnh + phường mới 2025) */}
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={labelStyle}>📍 Địa chỉ nhận hàng gửi bù</label>
                    <AddressPicker value={editing.buyer_address || ''} label={null} compact
                      onChange={v => setEditing(p => ({ ...p, buyer_address: v }))} />
                  </div>
                </div>
              </div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Ảnh / video bằng chứng</label>
                <EvidenceUploader folder="khieu-nai" value={editing.evidence_links || ''}
                  onChange={v => setEditing(p => ({ ...p, evidence_links: v }))} />
              </div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Ghi chú / lịch sử xử lý</label><textarea value={editing.note || ''} onChange={e => setEditing({ ...editing, note: e.target.value })} style={{ ...inputStyle, minHeight: 52, resize: 'vertical' }} /></div>
              {editing.id && <div style={{ gridColumn: 'span 2', fontSize: '0.74rem', color: '#94a3b8' }}>Tạo: {fmtDate(editing.created_at)} · Cập nhật: {fmtDate(editing.updated_at)}</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 20 }}>
              {editing.id && isAdmin ? <button onClick={() => { del(editing); setEditing(null); }} style={{ padding: '9px 16px', borderRadius: 9, border: '1.5px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: 700, cursor: 'pointer' }}>Xoá</button> : <span />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { if (window.confirm('Đóng mà chưa Lưu thì mất phần đang nhập. Đóng luôn?')) setEditing(null); }} style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer' }}>Đóng</button>
                <button onClick={save} style={{ padding: '9px 24px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>💾 Lưu</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
