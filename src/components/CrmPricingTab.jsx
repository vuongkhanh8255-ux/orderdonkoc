// src/components/CrmPricingTab.jsx — CRM Module 4: Chính sách giá + Material
// Bảng giá tải lên từ Excel (crm_price_list) + kho material hình ảnh/catalog (crm_materials).
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';

const FONT = "'Be Vietnam Pro','Inter',system-ui,-apple-system,sans-serif";
const ORANGE = '#ff6a2c';
const card = { background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' };
const input = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e2e8f0', fontSize: '0.85rem', fontFamily: FONT, boxSizing: 'border-box', outline: 'none' };
const btn = { padding: '9px 18px', borderRadius: 9, border: 'none', background: ORANGE, color: '#fff', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer', fontFamily: FONT };
const btnGhost = { ...btn, background: '#fff', color: ORANGE, border: `1.5px solid ${ORANGE}` };
const th = { padding: '11px 12px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: '0.71rem', letterSpacing: '0.4px', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' };
const td = { padding: '10px 12px', color: '#334155', fontSize: '0.82rem', verticalAlign: 'top' };

const fmtVnd = (v) => Number(v || 0).toLocaleString('vi-VN');
const _norm = (s) => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

/* Đọc sheet bảng giá: tự dò dòng tiêu đề rồi map cột theo TÊN (không phụ thuộc thứ tự). */
const parsePriceSheet = (rows2d) => {
  let h = -1;
  for (let i = 0; i < Math.min(rows2d.length, 25); i++) {
    const cells = (rows2d[i] || []).map(_norm);
    if (cells.some(c => c.includes('ten san pham') || c === 'ten sp') &&
        cells.some(c => c.includes('gia') || c.includes('don gia'))) { h = i; break; }
  }
  if (h === -1) return { headerRow: -1, rows: [] };
  const header = (rows2d[h] || []).map(_norm);
  const find = (...keys) => header.findIndex(c => keys.some(k => c.includes(k)));
  const idx = {
    ma:    find('ma san pham', 'ma sp', 'barcode', 'ma hang'),
    ten:   find('ten san pham', 'ten sp', 'ten hang'),
    dvt:   find('dvt', 'don vi'),
    gia:   find('don gia le', 'gia ban', 'don gia', 'gia le'),
    combo: find('combo'),
    cs:    find('chinh sach', 'linh hoat', 'uu dai'),
    dm:    find('danh muc', 'nhom'),
    gc:    find('ghi chu'),
  };
  const rows = [];
  for (let i = h + 1; i < rows2d.length; i++) {
    const r = rows2d[i]; if (!r) continue;
    const get = (k) => (idx[k] >= 0 ? String(r[idx[k]] ?? '').trim() : '');
    const ten = get('ten'); if (!ten) continue;
    const giaRaw = get('gia').replace(/[^\d]/g, '');
    rows.push({
      ma_san_pham: get('ma'), ten_san_pham: ten, dvt: get('dvt'),
      don_gia_le: giaRaw ? Number(giaRaw) : null,
      combo_tieu_chuan: get('combo'), chinh_sach_gia: get('cs'),
      danh_muc: get('dm'), ghi_chu: get('gc'),
      trang_thai: 'Đang bán', sort_order: rows.length,
    });
  }
  return { headerRow: h, rows };
};

const EMPTY_ROW = { ma_san_pham: '', ten_san_pham: '', danh_muc: '', dvt: '', don_gia_le: '', combo_tieu_chuan: '', chinh_sach_gia: '', ghi_chu: '', trang_thai: 'Đang bán' };
const EMPTY_MAT = { ten: '', loai: 'Hình ảnh', url: '', ma_san_pham: '', ghi_chu: '' };

export default function CrmPricingTab() {
  const [rows, setRows] = useState([]);
  const [mats, setMats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [fDm, setFDm] = useState('');
  const [fTt, setFTt] = useState('');
  const [editRow, setEditRow] = useState(null);      // object đang sửa/thêm (null = đóng)
  const [showImport, setShowImport] = useState(false);
  const [impRows, setImpRows] = useState([]);
  const [impMsg, setImpMsg] = useState('');
  const [impFile, setImpFile] = useState('');
  const [showMat, setShowMat] = useState(false);
  const [newMat, setNewMat] = useState(EMPTY_MAT);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, m] = await Promise.all([
      supabase.from('crm_price_list').select('*').order('sort_order').order('id'),
      supabase.from('crm_materials').select('*').order('created_at', { ascending: false }),
    ]);
    setRows(p.data || []); setMats(m.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const danhMucs = useMemo(
    () => [...new Set(rows.map(r => r.danh_muc).filter(Boolean))].sort(),
    [rows]);

  const shown = useMemo(() => {
    const s = _norm(q);
    return rows.filter(r => {
      if (fDm && r.danh_muc !== fDm) return false;
      if (fTt && r.trang_thai !== fTt) return false;
      if (s && !(_norm(r.ten_san_pham).includes(s) || _norm(r.ma_san_pham).includes(s))) return false;
      return true;
    });
  }, [rows, q, fDm, fTt]);

  const matsOf = useCallback(
    (maSp) => mats.filter(m => maSp && m.ma_san_pham && m.ma_san_pham === maSp),
    [mats]);

  /* ── Excel bảng giá ─────────────────────────────────────────────── */
  const onPickFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setImpFile(f.name); setImpMsg('');
    const rd = new FileReader();
    rd.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const a2d = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
        const { headerRow, rows: parsed } = parsePriceSheet(a2d);
        if (headerRow === -1) { setImpMsg('⚠️ Không tìm thấy dòng tiêu đề. File cần có cột "Tên sản phẩm" và "Đơn giá".'); setImpRows([]); return; }
        setImpRows(parsed);
        setImpMsg(parsed.length ? `✅ Đọc được ${parsed.length} sản phẩm.` : '⚠️ Không đọc được dòng nào.');
      } catch (err) { setImpMsg('⚠️ Lỗi đọc file: ' + err.message); setImpRows([]); }
    };
    rd.readAsArrayBuffer(f);
  };
  const doImport = async () => {
    if (!impRows.length) return;
    setSaving(true);
    // Thay TOÀN BỘ bảng giá bằng file mới (bảng giá là 1 bản duy nhất, tránh lẫn giá cũ/mới)
    await supabase.from('crm_price_list').delete().gt('id', 0);
    const { error } = await supabase.from('crm_price_list').insert(impRows);
    setSaving(false);
    if (error) { setImpMsg('⚠️ Lỗi lưu: ' + error.message); return; }
    setShowImport(false); setImpRows([]); setImpFile(''); setImpMsg('');
    load();
  };
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Mã sản phẩm', 'Tên sản phẩm', 'Danh mục', 'ĐVT', 'Đơn giá lẻ', 'Combo tiêu chuẩn', 'Chính sách giá (CRM)', 'Ghi chú'],
      ['8936089070219', 'Gel Nha Đam 250gr', 'Gel nha đam', 'Hũ', 48800, 'Combo 10 hũ: 488.000đ (mua 10 tặng 1)', 'Mua từ 40 hũ trở lên: 44.000đ/hũ', 'Sản phẩm chủ lực'],
    ]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'BangGia');
    XLSX.writeFile(wb, 'MAU_BANG_GIA_CRM.xlsx');
  };

  /* ── CRUD 1 dòng ────────────────────────────────────────────────── */
  const saveRow = async () => {
    const r = editRow; if (!r?.ten_san_pham?.trim()) { alert('Cần nhập Tên sản phẩm'); return; }
    setSaving(true);
    const payload = {
      ma_san_pham: r.ma_san_pham || null, ten_san_pham: r.ten_san_pham.trim(),
      danh_muc: r.danh_muc || null, dvt: r.dvt || null,
      don_gia_le: r.don_gia_le === '' || r.don_gia_le == null ? null : Number(String(r.don_gia_le).replace(/[^\d]/g, '')),
      combo_tieu_chuan: r.combo_tieu_chuan || null, chinh_sach_gia: r.chinh_sach_gia || null,
      ghi_chu: r.ghi_chu || null, trang_thai: r.trang_thai || 'Đang bán', updated_at: new Date().toISOString(),
    };
    const { error } = r.id
      ? await supabase.from('crm_price_list').update(payload).eq('id', r.id)
      : await supabase.from('crm_price_list').insert({ ...payload, sort_order: rows.length });
    setSaving(false);
    if (error) { alert('Lỗi lưu: ' + error.message); return; }
    setEditRow(null); load();
  };
  const delRow = async (r) => {
    if (!confirm(`Xoá "${r.ten_san_pham}" khỏi bảng giá?`)) return;
    await supabase.from('crm_price_list').delete().eq('id', r.id); load();
  };

  /* ── Material ───────────────────────────────────────────────────── */
  const saveMat = async () => {
    if (!newMat.ten.trim() || !newMat.url.trim()) { alert('Cần nhập Tên và Link'); return; }
    setSaving(true);
    const { error } = await supabase.from('crm_materials').insert({
      ten: newMat.ten.trim(), loai: newMat.loai, url: newMat.url.trim(),
      ma_san_pham: newMat.ma_san_pham || null, ghi_chu: newMat.ghi_chu || null,
    });
    setSaving(false);
    if (error) { alert('Lỗi lưu: ' + error.message); return; }
    setShowMat(false); setNewMat(EMPTY_MAT); load();
  };
  const delMat = async (m) => {
    if (!confirm(`Xoá material "${m.ten}"?`)) return;
    await supabase.from('crm_materials').delete().eq('id', m.id); load();
  };

  const F = ({ label, children }) => (
    <div><div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: 5 }}>{label}</div>{children}</div>
  );

  return (
    <div style={{ fontFamily: FONT }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>💰 Chính sách giá + Material</h3>
          <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 4 }}>
            Bảng giá, chính sách chiết khấu và tài liệu (hình ảnh, catalog) áp dụng cho kênh CRM.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setShowMat(true)} style={btnGhost}>🖼️ + Material</button>
          <button onClick={() => setShowImport(true)} style={btnGhost}>📥 Tải bảng giá (Excel)</button>
          <button onClick={() => setEditRow({ ...EMPTY_ROW })} style={btn}>+ Thêm sản phẩm</button>
        </div>
      </div>

      {/* Lưu ý chung */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ ...card, padding: '13px 16px', background: '#fffbeb', borderColor: '#fde68a' }}>
          <div style={{ fontWeight: 800, color: '#b45309', fontSize: '0.84rem', marginBottom: 6 }}>📌 Lưu ý chung</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#78350f', fontSize: '0.78rem', lineHeight: 1.7 }}>
            <li>Giá áp dụng cho <b>kênh CRM</b> (không áp dụng cho sàn).</li>
            <li>Đơn giá có thể thay đổi theo chương trình từng thời điểm.</li>
            <li>Liên hệ quản lý để nhận bảng giá mới nhất.</li>
          </ul>
        </div>
        <div style={{ ...card, padding: '13px 16px', background: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <div style={{ fontWeight: 800, color: '#15803d', fontSize: '0.84rem', marginBottom: 6 }}>🎁 Kênh áp dụng bảng giá CRM</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['Zalo Sỉ', 'Website', 'Zalo Group', 'Khách sỉ (offline)'].map(k => (
              <span key={k} style={{ padding: '3px 11px', borderRadius: 999, background: '#fff', border: '1px solid #bbf7d0', color: '#15803d', fontWeight: 700, fontSize: '0.74rem' }}>{k}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Bộ lọc */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Tìm tên hoặc mã sản phẩm..."
          style={{ ...input, width: 280, flex: '0 1 280px' }} />
        <select value={fDm} onChange={e => setFDm(e.target.value)} style={{ ...input, width: 180, flex: '0 0 180px' }}>
          <option value="">Tất cả danh mục</option>
          {danhMucs.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={fTt} onChange={e => setFTt(e.target.value)} style={{ ...input, width: 150, flex: '0 0 150px' }}>
          <option value="">Tất cả trạng thái</option>
          <option value="Đang bán">Đang bán</option>
          <option value="Ngừng bán">Ngừng bán</option>
        </select>
        <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
          {shown.length}/{rows.length} sản phẩm
        </div>
      </div>

      {/* Bảng giá */}
      <div style={{ ...card, overflow: 'hidden', marginBottom: 22 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#fff7ed' }}>
              {['STT', 'MÃ SP', 'TÊN SẢN PHẨM', 'ĐVT', 'ĐƠN GIÁ LẺ', 'COMBO TIÊU CHUẨN', 'CHÍNH SÁCH GIÁ (CRM)', 'MATERIAL', 'GHI CHÚ', ''].map(h => (
                <th key={h} style={{ ...th, color: '#9a3412', borderBottom: '1px solid #fed7aa' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>⏳ Đang tải…</td></tr>}
              {!loading && shown.length === 0 && (
                <tr><td colSpan={10} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>💰</div>
                  {rows.length === 0 ? 'Chưa có bảng giá — bấm “Tải bảng giá (Excel)” để nhập.' : 'Không có sản phẩm khớp bộ lọc.'}
                </td></tr>
              )}
              {!loading && shown.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 ? '#fafbfc' : '#fff' }}>
                  <td style={{ ...td, color: '#94a3b8', fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.76rem', color: '#64748b' }}>{r.ma_san_pham || '—'}</td>
                  <td style={{ ...td, fontWeight: 700, color: '#0f172a', minWidth: 170 }}>
                    {r.ten_san_pham}
                    {r.danh_muc && <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 500 }}>{r.danh_muc}</div>}
                    {r.trang_thai === 'Ngừng bán' && <span style={{ fontSize: '0.68rem', color: '#dc2626', fontWeight: 700 }}>· Ngừng bán</span>}
                  </td>
                  <td style={td}>{r.dvt || '—'}</td>
                  <td style={{ ...td, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>
                    {r.don_gia_le != null ? fmtVnd(r.don_gia_le) + 'đ' : '—'}
                  </td>
                  <td style={{ ...td, maxWidth: 210, whiteSpace: 'pre-wrap' }}>{r.combo_tieu_chuan || '—'}</td>
                  <td style={{ ...td, maxWidth: 240, whiteSpace: 'pre-wrap' }}>
                    {r.chinh_sach_gia
                      ? <span style={{ display: 'inline-block', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '5px 9px', color: '#15803d', fontSize: '0.78rem' }}>{r.chinh_sach_gia}</span>
                      : '—'}
                  </td>
                  <td style={td}>
                    {matsOf(r.ma_san_pham).length === 0 ? <span style={{ color: '#cbd5e1' }}>—</span> : (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {matsOf(r.ma_san_pham).map(m => (
                          <a key={m.id} href={m.url} target="_blank" rel="noreferrer"
                            style={{ fontSize: '0.72rem', fontWeight: 700, textDecoration: 'none', padding: '3px 8px', borderRadius: 6, background: m.loai === 'Catalog' ? '#fef2f2' : '#eff6ff', color: m.loai === 'Catalog' ? '#dc2626' : '#2563eb' }}>
                            {m.loai === 'Catalog' ? '📕' : '🖼️'} {m.loai}
                          </a>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{ ...td, color: '#dc2626', fontWeight: 700, fontSize: '0.76rem' }}>{r.ghi_chu || '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button onClick={() => setEditRow({ ...r })} title="Sửa"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.9rem' }}>✏️</button>
                    <button onClick={() => delRow(r)} title="Xoá"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.9rem' }}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Material chung (không gắn mã SP) */}
      <div style={{ ...card, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>🖼️ Kho material ({mats.length})</div>
          <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>Gắn “Mã SP” để material hiện luôn ở dòng sản phẩm tương ứng.</div>
        </div>
        {mats.length === 0
          ? <div style={{ padding: 26, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Chưa có material — bấm “+ Material” để thêm link hình ảnh / catalog.</div>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
              {mats.map(m => (
                <div key={m.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: m.loai === 'Catalog' ? '#fef2f2' : '#eff6ff', color: m.loai === 'Catalog' ? '#dc2626' : '#2563eb' }}>{m.loai}</span>
                    <button onClick={() => delMat(m)} title="Xoá"
                      style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.82rem' }}>🗑️</button>
                  </div>
                  <a href={m.url} target="_blank" rel="noreferrer"
                    style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.84rem', textDecoration: 'none', display: 'block', wordBreak: 'break-word' }}>{m.ten}</a>
                  {m.ma_san_pham && <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>{m.ma_san_pham}</div>}
                  {m.ghi_chu && <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 3 }}>{m.ghi_chu}</div>}
                </div>
              ))}
            </div>
          )}
      </div>

      {/* ── Modal: sửa/thêm 1 sản phẩm ── */}
      {editRow && (
        <div onClick={() => setEditRow(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: 560, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', fontFamily: FONT }}>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a', marginBottom: 14 }}>
              {editRow.id ? '✏️ Sửa sản phẩm' : '+ Thêm sản phẩm vào bảng giá'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <F label="Mã sản phẩm"><input style={input} value={editRow.ma_san_pham || ''} onChange={e => setEditRow(p => ({ ...p, ma_san_pham: e.target.value }))} /></F>
              <F label="Danh mục"><input style={input} value={editRow.danh_muc || ''} onChange={e => setEditRow(p => ({ ...p, danh_muc: e.target.value }))} /></F>
              <div style={{ gridColumn: '1 / -1' }}>
                <F label="Tên sản phẩm *"><input style={input} value={editRow.ten_san_pham || ''} onChange={e => setEditRow(p => ({ ...p, ten_san_pham: e.target.value }))} /></F>
              </div>
              <F label="ĐVT"><input style={input} value={editRow.dvt || ''} onChange={e => setEditRow(p => ({ ...p, dvt: e.target.value }))} /></F>
              <F label="Đơn giá lẻ (đ)"><input style={input} value={editRow.don_gia_le ?? ''} onChange={e => setEditRow(p => ({ ...p, don_gia_le: e.target.value }))} /></F>
              <div style={{ gridColumn: '1 / -1' }}>
                <F label="Combo tiêu chuẩn"><textarea style={{ ...input, minHeight: 56, resize: 'vertical' }} value={editRow.combo_tieu_chuan || ''} onChange={e => setEditRow(p => ({ ...p, combo_tieu_chuan: e.target.value }))} /></F>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <F label="Chính sách giá linh hoạt (CRM)"><textarea style={{ ...input, minHeight: 56, resize: 'vertical' }} value={editRow.chinh_sach_gia || ''} onChange={e => setEditRow(p => ({ ...p, chinh_sach_gia: e.target.value }))} /></F>
              </div>
              <F label="Ghi chú"><input style={input} value={editRow.ghi_chu || ''} onChange={e => setEditRow(p => ({ ...p, ghi_chu: e.target.value }))} /></F>
              <F label="Trạng thái">
                <select style={input} value={editRow.trang_thai || 'Đang bán'} onChange={e => setEditRow(p => ({ ...p, trang_thai: e.target.value }))}>
                  <option>Đang bán</option><option>Ngừng bán</option>
                </select>
              </F>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button onClick={saveRow} disabled={saving} style={{ ...btn, flex: 1, opacity: saving ? 0.6 : 1 }}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
              <button onClick={() => setEditRow(null)} style={{ ...btn, background: '#fff', color: '#64748b', border: '1.5px solid #e2e8f0' }}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: tải bảng giá Excel ── */}
      {showImport && (
        <div onClick={() => setShowImport(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: 560, maxWidth: '100%', fontFamily: FONT }}>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a', marginBottom: 12 }}>📥 Tải bảng giá từ Excel</div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.6, marginBottom: 12 }}>
              Tao tự dò dòng tiêu đề và đọc các cột: <b>Mã SP · Tên sản phẩm · Danh mục · ĐVT · Đơn giá lẻ · Combo · Chính sách giá · Ghi chú</b>.
              <br /><b style={{ color: '#dc2626' }}>Lưu ý:</b> tải lên sẽ <b>thay toàn bộ</b> bảng giá cũ (bảng giá chỉ có 1 bản đang hiệu lực).
            </div>
            <button onClick={downloadTemplate} style={{ ...btnGhost, marginBottom: 12 }}>📄 Tải file mẫu (.xlsx)</button>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={onPickFile} style={{ ...input, padding: 8 }} />
            {impFile && <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 8 }}>📎 {impFile}</div>}
            {impMsg && <div style={{ fontSize: '0.82rem', fontWeight: 700, marginTop: 8, color: impMsg.startsWith('⚠️') ? '#dc2626' : '#059669' }}>{impMsg}</div>}
            {impRows.length > 0 && (
              <div style={{ marginTop: 10, maxHeight: 190, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 9 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                  <thead><tr style={{ background: '#f8fafc' }}>
                    <th style={{ ...th, fontSize: '0.68rem' }}>TÊN SP</th><th style={{ ...th, fontSize: '0.68rem' }}>ĐVT</th><th style={{ ...th, fontSize: '0.68rem' }}>GIÁ</th>
                  </tr></thead>
                  <tbody>{impRows.slice(0, 40).map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ ...td, fontSize: '0.76rem' }}>{r.ten_san_pham}</td>
                      <td style={{ ...td, fontSize: '0.76rem' }}>{r.dvt || '—'}</td>
                      <td style={{ ...td, fontSize: '0.76rem' }}>{r.don_gia_le != null ? fmtVnd(r.don_gia_le) + 'đ' : '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={doImport} disabled={saving || !impRows.length} style={{ ...btn, flex: 1, opacity: (saving || !impRows.length) ? 0.5 : 1 }}>
                {saving ? 'Đang lưu…' : `Nhập ${impRows.length} sản phẩm`}
              </button>
              <button onClick={() => setShowImport(false)} style={{ ...btn, background: '#fff', color: '#64748b', border: '1.5px solid #e2e8f0' }}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: thêm material ── */}
      {showMat && (
        <div onClick={() => setShowMat(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: 480, maxWidth: '100%', fontFamily: FONT }}>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a', marginBottom: 4 }}>🖼️ Thêm material</div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 14 }}>Dán link Google Drive / Dropbox / ảnh. Gắn “Mã SP” để hiện ngay ở dòng sản phẩm đó.</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <F label="Tên material *"><input style={input} value={newMat.ten} onChange={e => setNewMat(p => ({ ...p, ten: e.target.value }))} placeholder="VD: Catalog Gel Nha Đam 2026" /></F>
              <F label="Loại">
                <select style={input} value={newMat.loai} onChange={e => setNewMat(p => ({ ...p, loai: e.target.value }))}>
                  <option>Hình ảnh</option><option>Catalog</option><option>Khác</option>
                </select>
              </F>
              <F label="Link *"><input style={input} value={newMat.url} onChange={e => setNewMat(p => ({ ...p, url: e.target.value }))} placeholder="https://..." /></F>
              <F label="Mã SP (tuỳ chọn)"><input style={input} value={newMat.ma_san_pham} onChange={e => setNewMat(p => ({ ...p, ma_san_pham: e.target.value }))} placeholder="8936089070219" /></F>
              <F label="Ghi chú"><input style={input} value={newMat.ghi_chu} onChange={e => setNewMat(p => ({ ...p, ghi_chu: e.target.value }))} /></F>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button onClick={saveMat} disabled={saving} style={{ ...btn, flex: 1, opacity: saving ? 0.6 : 1 }}>{saving ? 'Đang lưu…' : 'Lưu material'}</button>
              <button onClick={() => setShowMat(false)} style={{ ...btn, background: '#fff', color: '#64748b', border: '1.5px solid #e2e8f0' }}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
