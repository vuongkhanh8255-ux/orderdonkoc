// src/components/NhanhProductsTab.jsx
// "File Nhanh" — upload sản phẩm export từ Nhanh.vn, chỉ lưu 3 cột: Mã SP / Tên SP / Giá bán + VAT.
import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';

const fmt = (v) => new Intl.NumberFormat('vi-VN').format(Number(v) || 0);

// Parse giá an toàn: raw:true cho ra SỐ (giá ×1.08 VAT có phần thập phân) → làm tròn.
// Nếu lỡ là chuỗi định dạng VN thì xử lý dấu phẩy/chấm cho đúng.
const parsePrice = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Math.round(v);
  let s = String(v).trim().replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  if (s.includes('.') && s.includes(',')) {
    if (s.lastIndexOf('.') > s.lastIndexOf(',')) s = s.replace(/,/g, '');
    else { s = s.replace(/\./g, ''); s = s.replace(',', '.'); }
  } else if (s.includes(',')) {
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

export default function NhanhProductsTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const PAGE = 50;
  const fileRef = useRef(null);

  const load = async () => {
    try {
      let all = [];
      let from = 0;
      const step = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('nhanh_products')
          .select('*')
          .order('ten_san_pham', { ascending: true })
          .range(from, from + step - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < step) break;
        from += step;
      }
      setRows(all);
    } catch (e) {
      console.error('load nhanh_products', e);
    }
  };

  useEffect(() => { load(); }, []);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setStatus('⏳ Đang đọc file...');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // raw:false giữ Mã/Tên dạng text (mã dài 19 số không mất chính xác); raw:true cho Giá dạng số.
      const gF = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
      const gR = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
      if (!gF.length) throw new Error('File rỗng');

      const H = (gF[0] || []).map(h => String(h).trim().toLowerCase());
      const find = (...preds) => {
        for (const p of preds) { const i = H.findIndex(p); if (i !== -1) return i; }
        return -1;
      };
      let iMa  = find(h => h === 'mã sản phẩm', h => h.includes('mã sản phẩm'));      if (iMa  < 0) iMa  = 0;
      let iTen = find(h => h === 'tên sản phẩm', h => h.includes('tên sản phẩm'));     if (iTen < 0) iTen = 1;
      let iGia = find(h => h.includes('giá bán') && h.includes('vat'), h => h.includes('giá bán')); if (iGia < 0) iGia = 2;

      const map = new Map();
      for (let i = 1; i < gF.length; i++) {
        const rf = gF[i], rr = gR[i] || [];
        if (!rf) continue;
        const ma = String(rf[iMa] ?? '').replace(/^'+/, '').trim();
        if (!ma) continue;
        map.set(ma, {
          ma_san_pham: ma,
          ten_san_pham: String(rf[iTen] ?? '').trim(),
          gia_ban_vat: parsePrice(rr[iGia]),
        });
      }
      const list = [...map.values()];
      if (!list.length) throw new Error('Không thấy dòng sản phẩm nào — kiểm tra cột "Mã sản phẩm".');

      setStatus(`💾 Đang lưu ${fmt(list.length)} sản phẩm...`);
      const BATCH = 1000;
      for (let i = 0; i < list.length; i += BATCH) {
        const { error } = await supabase
          .from('nhanh_products')
          .upsert(list.slice(i, i + BATCH), { onConflict: 'ma_san_pham' });
        if (error) throw error;
      }
      setStatus(`✅ Đã lưu ${fmt(list.length)} sản phẩm từ file Nhanh.`);
      setPage(1);
      await load();
    } catch (err) {
      setStatus(`❌ Lỗi: ${err.message}`);
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const clearAll = async () => {
    if (!window.confirm('Xóa HẾT dữ liệu file Nhanh đã lưu?')) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('nhanh_products').delete().gt('id', 0);
      if (error) throw error;
      setRows([]);
      setStatus('🗑️ Đã xóa hết dữ liệu file Nhanh.');
    } catch (err) {
      setStatus(`❌ Lỗi xóa: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      String(r.ma_san_pham || '').toLowerCase().includes(s) ||
      String(r.ten_san_pham || '').toLowerCase().includes(s));
  }, [rows, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageRows = filtered.slice((page - 1) * PAGE, page * PAGE);

  const card = { background: '#fff', borderRadius: 16, border: '1px solid #eee', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', padding: 24, marginBottom: 24 };
  const th = { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #eee', color: '#ea580c', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', background: '#f9fafb', position: 'sticky', top: 0 };
  const td = { padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '0.86rem', color: '#374151' };

  return (
    <div style={{ padding: '20px', maxWidth: 1200, margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>
      <h1 className="page-header">📦 FILE NHANH (Sản phẩm)</h1>

      <div style={card}>
        <p style={{ fontSize: '0.88rem', color: '#666', margin: '0 0 14px' }}>
          Upload file export sản phẩm từ <b>Nhanh.vn</b> (.xlsx). Chỉ lưu <b>3 cột</b>: Mã sản phẩm · Tên sản phẩm · Giá bán + VAT. Upload lại → cập nhật theo Mã SP.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="btn-primary" style={{ padding: '12px 24px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'ĐANG XỬ LÝ...' : '📥 UPLOAD FILE NHANH'}
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} disabled={loading} style={{ display: 'none' }} />
          </label>
          <button onClick={clearAll} disabled={loading} className="btn-secondary" style={{ padding: '12px 24px', color: '#ef4444', borderColor: '#ef4444', background: '#fff' }}>
            🗑️ XÓA HẾT
          </button>
          <span style={{ fontSize: '0.9rem', color: '#666' }}>Đang lưu: <b style={{ color: '#ea580c' }}>{fmt(rows.length)}</b> sản phẩm</span>
        </div>
        {status && <div style={{ marginTop: 12, fontSize: '0.88rem', fontWeight: 600, color: status.startsWith('❌') ? '#ef4444' : status.startsWith('✅') ? '#10b981' : '#ea580c' }}>{status}</div>}
      </div>

      {rows.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <input type="text" placeholder="🔍 Tìm theo mã hoặc tên sản phẩm..." value={q}
              onChange={e => { setQ(e.target.value); setPage(1); }}
              style={{ flex: '1 1 280px', maxWidth: 420, padding: '10px 14px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.85rem' }} />
            <span style={{ fontSize: '0.82rem', color: '#666' }}>{fmt(filtered.length)} kết quả · Trang {page}/{totalPages}</span>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 600, border: '1px solid #eee', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Mã sản phẩm</th>
                  <th style={th}>Tên sản phẩm</th>
                  <th style={{ ...th, textAlign: 'right' }}>Giá bán + VAT</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => (
                  <tr key={r.id ?? i} style={{ background: i % 2 === 0 ? '#f9fafb' : '#fff' }}>
                    <td style={{ ...td, fontWeight: 600, color: '#111' }}>{r.ma_san_pham}</td>
                    <td style={td}>{r.ten_san_pham}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#ea580c' }}>{fmt(r.gia_ban_vat)} đ</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 14 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', color: page === 1 ? '#bbb' : '#ea580c', fontWeight: 700, cursor: page === 1 ? 'default' : 'pointer' }}>◀ Trước</button>
              <span style={{ padding: '6px 4px', fontSize: '0.85rem', color: '#666' }}>{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #ddd', background: page === totalPages ? '#fff' : '#ea580c', color: page === totalPages ? '#bbb' : '#fff', fontWeight: 700, cursor: page === totalPages ? 'default' : 'pointer' }}>Sau ▶</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
