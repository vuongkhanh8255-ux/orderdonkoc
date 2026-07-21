// src/components/DefectTab.jsx
//
// Module 4 — Quản lý dữ liệu sản phẩm lỗi (nhóm CSKH).
// Hồ sơ lỗi SP (do CS/khách gửi): SP, loại lỗi, mức độ, lot sản xuất, mô tả, ảnh/video.
// Dashboard: tổng lỗi + top SP lỗi + top loại lỗi + theo lot. Bảng: defect_products.
// AI đọc ảnh gợi ý loại lỗi = pha sau (giờ phân loại bằng dropdown).

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { useAppData } from '../context/AppDataContext';

const ACCENT = '#ff6a2c';
const DEFECT_TYPES = ['Rò rỉ', 'Móp méo', 'Hư hỏng bao bì', 'Thiếu sản phẩm', 'Sai sản phẩm', 'Lỗi chất lượng', 'Hết hạn/cận date', 'Khác'];
const SEVERITY = { nhe: { label: 'Nhẹ', color: '#16a34a', bg: '#dcfce7' }, trung_binh: { label: 'Trung bình', color: '#b45309', bg: '#fef3c7' }, nang: { label: 'Nặng', color: '#dc2626', bg: '#fee2e2' } };
const STATUS = { new: { label: 'Mới', color: '#b45309', bg: '#fef3c7' }, reviewing: { label: 'Đang xử lý', color: '#1d4ed8', bg: '#dbeafe' }, resolved: { label: 'Đã xử lý', color: '#15803d', bg: '#dcfce7' } };

const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const daysSince = (s) => { if (!s) return 999; return Math.floor((Date.now() - new Date(s).getTime()) / 86400000); };
const fmtDate = (s) => { if (!s) return ''; const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s; };
const inputStyle = { padding: '8px 11px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', color: '#1f2937', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
const labelStyle = { fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4, display: 'block' };
const th = { padding: '9px 10px', fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'left', whiteSpace: 'nowrap', background: '#f8fafc', borderBottom: '2px solid #e5e7eb' };
const td = { padding: '8px 10px', fontSize: '0.82rem', color: '#0f172a', whiteSpace: 'nowrap', borderTop: '1px solid #f1f5f9' };
const card = { background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const EMPTY = { report_date: todayYmd(), product_name: '', platform: 'shopee', order_sn: '', defect_type: 'Lỗi chất lượng', severity: 'trung_binh', lot_code: '', production_date: '', description: '', media_links: '', status: 'new', staff: '', note: '' };

export default function DefectTab({ currentUser }) {
  const { nhanSus } = useAppData();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeF, setTypeF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

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
      report_date: r.report_date || todayYmd(), product_name: r.product_name.trim(), platform: r.platform || null, order_sn: r.order_sn || null,
      defect_type: r.defect_type || null, severity: r.severity || 'trung_binh', lot_code: r.lot_code || null, production_date: r.production_date || null,
      description: r.description || null, media_links: r.media_links || null, status: r.status || 'new', staff: r.staff || (currentUser?.username || ''), note: r.note || null,
    };
    const { error } = r.id ? await supabase.from('defect_products').update(payload).eq('id', r.id) : await supabase.from('defect_products').insert(payload);
    if (error) { alert('Lưu không được: ' + error.message); return; }
    setEditing(null); load();
  };
  const del = async (r) => { if (!confirm(`Xoá hồ sơ lỗi "${r.product_name}"?`)) return; await supabase.from('defect_products').delete().eq('id', r.id); load(); };
  const patch = async (r, p) => { setRows(prev => prev.map(x => x.id === r.id ? { ...x, ...p } : x)); await supabase.from('defect_products').update(p).eq('id', r.id); };

  const filtered = useMemo(() => rows.filter(r => {
    if (typeF !== 'all' && r.defect_type !== typeF) return false;
    if (statusF !== 'all' && r.status !== statusF) return false;
    if (search) { const q = search.toLowerCase(); if (![r.product_name, r.lot_code, r.order_sn, r.description, r.note].some(v => v && String(v).toLowerCase().includes(q))) return false; }
    return true;
  }), [rows, typeF, statusF, search]);

  const kpi = useMemo(() => ({
    total: rows.length,
    fresh: rows.filter(r => daysSince(r.report_date) <= 30).length,
    unresolved: rows.filter(r => r.status !== 'resolved').length,
    nang: rows.filter(r => r.severity === 'nang').length,
  }), [rows]);

  const topBy = (key) => { const m = {}; rows.forEach(r => { const k = r[key] || '—'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8); };
  const topProducts = useMemo(() => topBy('product_name'), [rows]);
  const topLots = useMemo(() => topBy('lot_code').filter(([k]) => k && k !== '—'), [rows]);

  const exportXlsx = () => {
    const data = filtered.map((r, i) => ({ STT: i + 1, Ngày: fmtDate(r.report_date), 'Sản phẩm': r.product_name, 'Loại lỗi': r.defect_type, 'Mức độ': SEVERITY[r.severity]?.label, 'Lot': r.lot_code, 'Mã đơn': r.order_sn, 'Mô tả': r.description, 'Trạng thái': STATUS[r.status]?.label, 'NV': r.staff }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'SP loi'); XLSX.writeFile(wb, `SanPhamLoi_${todayYmd()}.xlsx`);
  };

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1400 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div><h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>🔧 Sản phẩm lỗi</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Hồ sơ lỗi sản phẩm · theo loại lỗi + lot sản xuất · đính kèm ảnh/video</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={exportXlsx} style={{ padding: '9px 16px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>📥 Xuất Excel</button>
          <button onClick={() => setEditing({ ...EMPTY, staff: currentUser?.username || '' })} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>+ Tạo hồ sơ lỗi</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[{ label: 'Tổng SP lỗi', v: kpi.total, color: '#6366f1' }, { label: 'Lỗi mới (30N)', v: kpi.fresh, color: '#b45309' }, { label: 'Chưa xử lý', v: kpi.unresolved, color: '#dc2626' }, { label: 'Mức độ nặng', v: kpi.nang, color: '#991b1b' }].map((c, i) => (
          <div key={i} style={{ ...card, borderTop: `3px solid ${c.color}` }}><div style={{ fontSize: '1.5rem', fontWeight: 900, color: c.color }}>{c.v}</div><div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{c.label}</div></div>
        ))}
      </div>

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

      <div style={{ ...card, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" placeholder="🔍 Tìm SP, lot, đơn, mô tả..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: 240 }} />
        <select value={typeF} onChange={e => setTypeF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}><option value="all">Loại lỗi: Tất cả</option>{DEFECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}><option value="all">Trạng thái: Tất cả</option>{Object.keys(STATUS).map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}</select>
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{filtered.length} hồ sơ</span>
      </div>

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Ngày</th><th style={{ ...th, minWidth: 180 }}>Sản phẩm</th><th style={th}>Loại lỗi</th><th style={{ ...th, textAlign: 'center' }}>Mức độ</th>
              <th style={th}>Lot</th><th style={{ ...th, textAlign: 'center' }}>Ảnh</th><th style={{ ...th, textAlign: 'center' }}>Trạng thái</th><th style={th}>NV</th><th style={{ ...th, textAlign: 'center', width: 130 }}>Hành động</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={9} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Đang tải...</td></tr>
                : filtered.length === 0 ? <tr><td colSpan={9} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chưa có hồ sơ lỗi — bấm "+ Tạo hồ sơ lỗi"</td></tr>
                : filtered.map(r => { const sv = SEVERITY[r.severity] || SEVERITY.trung_binh; const media = (r.media_links || '').split('\n').map(s => s.trim()).filter(Boolean); return (
                  <tr key={r.id}>
                    <td style={td}>{fmtDate(r.report_date)}</td>
                    <td style={{ ...td, fontWeight: 600, whiteSpace: 'normal', maxWidth: 260 }}>{r.product_name}</td>
                    <td style={td}>{r.defect_type || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}><span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: sv.bg, color: sv.color }}>{sv.label}</span></td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.76rem' }}>{r.lot_code || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{media.length ? <a href={media[0]} target="_blank" rel="noreferrer" title={`${media.length} ảnh/video`}>🖼️{media.length > 1 ? media.length : ''}</a> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <select value={r.status} onChange={e => patch(r, { status: e.target.value })} style={{ padding: '3px 6px', borderRadius: 6, border: 'none', fontSize: '0.72rem', fontWeight: 700, background: (STATUS[r.status] || STATUS.new).bg, color: (STATUS[r.status] || STATUS.new).color, cursor: 'pointer' }}>{Object.keys(STATUS).map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}</select>
                    </td>
                    <td style={{ ...td, fontSize: '0.76rem' }}>{r.staff || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}><div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}><button onClick={() => setEditing(r)} style={miniBtn('#64748b')}>Sửa</button><button onClick={() => del(r)} style={miniBtn('#dc2626')}>Xoá</button></div></td>
                  </tr>); })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 620 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 900 }}>{editing.id ? '✏️ Sửa hồ sơ lỗi' : '🔧 Tạo hồ sơ lỗi'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Tên sản phẩm *</label><input value={editing.product_name || ''} onChange={e => setEditing({ ...editing, product_name: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Ngày ghi nhận</label><input type="date" value={editing.report_date || ''} onChange={e => setEditing({ ...editing, report_date: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Sàn</label><select value={editing.platform || ''} onChange={e => setEditing({ ...editing, platform: e.target.value })} style={inputStyle}><option value="">—</option><option value="shopee">Shopee</option><option value="tiktok">TikTok</option></select></div>
              <div><label style={labelStyle}>Loại lỗi</label><select value={editing.defect_type || ''} onChange={e => setEditing({ ...editing, defect_type: e.target.value })} style={inputStyle}>{DEFECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label style={labelStyle}>Mức độ</label><select value={editing.severity} onChange={e => setEditing({ ...editing, severity: e.target.value })} style={inputStyle}>{Object.keys(SEVERITY).map(s => <option key={s} value={s}>{SEVERITY[s].label}</option>)}</select></div>
              <div><label style={labelStyle}>Lot sản xuất</label><input value={editing.lot_code || ''} onChange={e => setEditing({ ...editing, lot_code: e.target.value })} style={inputStyle} placeholder="VD: A250601" /></div>
              <div><label style={labelStyle}>Ngày sản xuất</label><input type="date" value={editing.production_date || ''} onChange={e => setEditing({ ...editing, production_date: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Mã đơn</label><input value={editing.order_sn || ''} onChange={e => setEditing({ ...editing, order_sn: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Nhân viên</label><select value={editing.staff || ''} onChange={e => setEditing({ ...editing, staff: e.target.value })} style={inputStyle}><option value="">— chọn —</option>{(nhanSus || []).map(n => <option key={n.id} value={n.ten_nhansu}>{n.ten_nhansu}</option>)}</select></div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Mô tả lỗi</label><textarea value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} style={{ ...inputStyle, minHeight: 52, resize: 'vertical' }} /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={labelStyle}>Link ảnh/video (mỗi dòng 1)</label><textarea value={editing.media_links || ''} onChange={e => setEditing({ ...editing, media_links: e.target.value })} style={{ ...inputStyle, minHeight: 52, resize: 'vertical' }} placeholder="https://..." /></div>
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
