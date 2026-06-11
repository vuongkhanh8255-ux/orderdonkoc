// src/components/KocPaymentTab.jsx
//
// Thanh toán KOC — thay cho file Excel "THANH TOÁN STELLA/OPTIMAX 2026".
// Nhân sự booking điền trực tiếp 1 bản ghi/lần thanh toán; kế toán lọc theo
// tháng/công ty, tick "đã duyệt", và xuất Excel để chuyển khoản.
//   PIT (thuế TNCN) gợi ý = Cast(net)/9 ; Tổng = Cast + PIT (sửa tay được).
// Bảng Supabase: koc_payments (RLS allow-all anon, gate bằng login frontend).

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';

const ACCENT = '#ff6a2c';
const COMPANIES = ['STELLA', 'OPTIMAX'];
const BRANDS = ['BODYMISS', 'MILAGANICS', 'MOAWMOAWS', 'EHERB VN', 'HEALMI', 'MASUBE', 'REALSTEEL'];

const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const fmtMoney = (v) => (Number(v) || 0).toLocaleString('vi-VN');
const round = (v) => Math.round(Number(v) || 0);
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const curYm = () => todayYmd().slice(0, 7);
const monthRange = (ym) => { const [y, m] = ym.split('-').map(Number); const start = `${ym}-01`; const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`; return { start, end }; };
const fmtDate = (s) => { if (!s) return ''; const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s; };

const EMPTY = {
  pay_date: todayYmd(), staff: '', company: 'STELLA', brand: '', channel_link: '',
  cast_net: 0, pit: 0, total: 0, bank_account: '', bank_name: '', beneficiary: '',
  full_name: '', cccd: '', tax_code: '', cccd_image: '', contract_link: '', air_link: '',
  accountant_approved: false, note: '',
};

const inputStyle = { padding: '8px 11px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.85rem', color: '#1f2937', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
const labelStyle = { fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4, display: 'block' };
const th = { padding: '9px 10px', fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'left', whiteSpace: 'nowrap', background: '#f8fafc', position: 'sticky', top: 0 };
const td = { padding: '8px 10px', fontSize: '0.82rem', color: '#0f172a', whiteSpace: 'nowrap', borderTop: '1px solid #f1f5f9' };

const Field = ({ label, children }) => (<div><label style={labelStyle}>{label}</label>{children}</div>);

const KocPaymentTab = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ym, setYm] = useState(curYm());
  const [fCompany, setFCompany] = useState('');
  const [fBrand, setFBrand] = useState('');
  const [fApproved, setFApproved] = useState('');   // '', 'yes', 'no'
  const [q, setQ] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('koc_payments').select('*');
      if (ym !== 'all') { const { start, end } = monthRange(ym); query = query.gte('pay_date', start).lt('pay_date', end); }
      const { data, error } = await query.order('pay_date', { ascending: false }).order('created_at', { ascending: false }).limit(3000);
      if (error) throw error;
      setRows(data || []);
    } catch (e) { console.error('load payments failed', e); alert('Không tải được dữ liệu: ' + (e.message || e)); }
    finally { setLoading(false); }
  }, [ym]);
  useEffect(() => { load(); }, [load]);

  // Cast/PIT/Tổng liên động
  const setCast = (v) => { const c = num(v); setForm(f => ({ ...f, cast_net: c, pit: round(c / 9), total: c + round(c / 9) })); };
  const setPit = (v) => { const p = num(v); setForm(f => ({ ...f, pit: p, total: num(f.cast_net) + p })); };

  const startAdd = () => { setForm({ ...EMPTY, pay_date: todayYmd(), company: fCompany || 'STELLA' }); setEditingId(null); setShowForm(true); };
  const startEdit = (r) => { setForm({ ...EMPTY, ...r, pay_date: (r.pay_date || '').slice(0, 10) }); setEditingId(r.id); setShowForm(true); };
  const cancel = () => { setShowForm(false); setEditingId(null); setForm(EMPTY); };

  const save = async () => {
    if (!form.channel_link && !form.full_name && !form.beneficiary) { alert('Cần ít nhất Link kênh hoặc Họ tên / Người thụ hưởng.'); return; }
    if (!form.air_link || !form.air_link.trim()) { alert('⚠️ Bắt buộc phải có LINK AIR mới tạo được lệnh thanh toán.'); return; }
    setSaving(true);
    const payload = {
      pay_date: form.pay_date || null, staff: form.staff || null, company: form.company || null,
      brand: form.brand || null, channel_link: form.channel_link || null,
      cast_net: num(form.cast_net), pit: num(form.pit), total: num(form.total),
      bank_account: form.bank_account || null, bank_name: form.bank_name || null,
      beneficiary: form.beneficiary || null, full_name: form.full_name || null,
      cccd: form.cccd || null, tax_code: form.tax_code || null, cccd_image: form.cccd_image || null,
      contract_link: form.contract_link || null, air_link: form.air_link || null,
      accountant_approved: !!form.accountant_approved, note: form.note || null,
    };
    try {
      if (editingId) { const { error } = await supabase.from('koc_payments').update(payload).eq('id', editingId); if (error) throw error; }
      else { const { error } = await supabase.from('koc_payments').insert(payload); if (error) throw error; }
      cancel(); load();
    } catch (e) { alert('Lỗi khi lưu: ' + (e.message || e)); }
    finally { setSaving(false); }
  };

  // Upload NHIỀU ảnh 1 lúc lên Supabase Storage → nối thêm URL vào field (mỗi URL 1 dòng)
  const uploadImages = async (files, key) => {
    const list = [...(files || [])];
    if (!list.length) return;
    setUploading(key);
    try {
      const urls = [];
      for (const file of list) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `koc_payment/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from('expense-files').upload(path, file, { upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from('expense-files').getPublicUrl(path);
        urls.push(data.publicUrl);
      }
      setForm((f) => {
        const existing = (f[key] || '').split('\n').map((s) => s.trim()).filter(Boolean);
        return { ...f, [key]: [...existing, ...urls].join('\n') };
      });
    } catch (e) { alert('Lỗi upload ảnh: ' + (e.message || e)); }
    finally { setUploading(''); }
  };
  // Gallery nhiều ảnh: mỗi ảnh 1 thumbnail (xoá từng cái), ô "＋" thêm ảnh (chọn nhiều cùng lúc)
  const renderImgField = (label, fkey) => {
    const imgs = (form[fkey] || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const removeImg = (url) => setForm((f) => ({ ...f, [fkey]: (f[fkey] || '').split('\n').map((s) => s.trim()).filter((u) => u && u !== url).join('\n') }));
    return (
      <Field label={`${label}${imgs.length ? ` (${imgs.length})` : ''}`}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {imgs.map((url, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <a href={url} target="_blank" rel="noreferrer">
                <img src={url} alt="" referrerPolicy="no-referrer"
                  onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'inline-flex'; }}
                  style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb', display: 'block' }} />
                <span style={{ display: 'none', width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f8fafc', fontSize: '0.7rem', color: '#0891b2' }}>📎 Xem</span>
              </a>
              <button type="button" onClick={() => removeImg(url)} title="Xoá ảnh này"
                style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', border: 'none', background: '#dc2626', color: '#fff', fontSize: '0.66rem', cursor: 'pointer', lineHeight: '18px', padding: 0 }}>✕</button>
            </div>
          ))}
          <label title="Thêm ảnh — chọn nhiều cùng lúc được"
            style={{ width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1.5px dashed #cbd5e1', cursor: uploading === fkey ? 'wait' : 'pointer', color: '#94a3b8', fontSize: '1.2rem', flexShrink: 0 }}>
            {uploading === fkey ? '⏳' : '＋'}
            <input type="file" accept="image/*" multiple disabled={uploading === fkey} onChange={(e) => { const fs = [...e.target.files]; e.target.value = ''; uploadImages(fs, fkey); }} style={{ display: 'none' }} />
          </label>
        </div>
      </Field>
    );
  };

  const del = async (r) => {
    if (!window.confirm(`Xoá bản ghi thanh toán của "${r.full_name || r.beneficiary || r.channel_link || ''}"?`)) return;
    const { error } = await supabase.from('koc_payments').delete().eq('id', r.id);
    if (error) { alert('Lỗi khi xoá: ' + error.message); return; }
    setRows(prev => prev.filter(x => x.id !== r.id));
  };

  const toggleApproved = async (r) => {
    const next = !r.accountant_approved;
    setRows(prev => prev.map(x => x.id === r.id ? { ...x, accountant_approved: next } : x));   // optimistic
    const { error } = await supabase.from('koc_payments').update({ accountant_approved: next }).eq('id', r.id);
    if (error) { alert('Lỗi cập nhật duyệt: ' + error.message); load(); }
  };

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return rows.filter(r =>
      (!fCompany || r.company === fCompany) &&
      (!fBrand || r.brand === fBrand) &&
      (!fApproved || (fApproved === 'yes' ? r.accountant_approved : !r.accountant_approved)) &&
      (!kw || [r.full_name, r.beneficiary, r.channel_link, r.bank_account, r.staff].some(v => (v || '').toLowerCase().includes(kw)))
    );
  }, [rows, fCompany, fBrand, fApproved, q]);

  const sum = useMemo(() => filtered.reduce((a, r) => ({ cast: a.cast + num(r.cast_net), pit: a.pit + num(r.pit), total: a.total + num(r.total) }), { cast: 0, pit: 0, total: 0 }), [filtered]);

  const exportExcel = () => {
    const data = filtered.map(r => ({
      'NGÀY': fmtDate(r.pay_date), 'NHÂN SỰ': r.staff || '', 'CÔNG TY': r.company || '', 'BRAND': r.brand || '',
      'LINK KÊNH': r.channel_link || '', 'CAST (NET)': num(r.cast_net), 'PIT': num(r.pit), 'TỔNG': num(r.total),
      'SỐ TÀI KHOẢN': r.bank_account || '', 'NGÂN HÀNG': r.bank_name || '', 'NGƯỜI THỤ HƯỞNG': r.beneficiary || '',
      'HỌ VÀ TÊN': r.full_name || '', 'SỐ CCCD': r.cccd || '', 'MÃ SỐ THUẾ': r.tax_code || '',
      'HÌNH ẢNH CCCD': r.cccd_image || '', 'HỢP ĐỒNG/ TIN NHẮN': r.contract_link || '', 'LINK AIR': r.air_link || '',
      'KẾ TOÁN DUYỆT': r.accountant_approved ? 'x' : '', 'GHI CHÚ': r.note || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'THANH TOÁN KOC');
    XLSX.writeFile(wb, `thanh-toan-koc-${ym === 'all' ? 'tatca' : ym}.xlsx`);
  };

  // tháng gần đây cho dropdown
  const monthOptions = useMemo(() => {
    const out = [{ v: 'all', l: 'Tất cả' }]; const [yy, mm] = curYm().split('-').map(Number);
    for (let i = 0; i < 14; i++) { let m = mm - i, y = yy; while (m <= 0) { m += 12; y -= 1; } const v = `${y}-${String(m).padStart(2, '0')}`; out.push({ v, l: `Tháng ${m}/${y}` }); }
    return out;
  }, []);

  return (
    <div style={{ padding: '4px 2px' }}>
      <h2 style={{ margin: '0 0 2px', fontSize: '1.6rem', fontWeight: 900, color: '#0f172a' }}>💸 Thanh toán KOC</h2>
      <p style={{ margin: '0 0 16px', color: '#94a3b8', fontSize: '0.9rem' }}>Điền trực tiếp ở đây thay cho file Excel. PIT gợi ý = Cast/9 · Tổng = Cast + PIT (sửa tay được). Kế toán lọc theo tháng → tick duyệt → xuất Excel.</p>

      {/* Form thêm/sửa — modal popup (luôn hiện giữa màn hình, không lệ thuộc cuộn trang) */}
      {showForm && (
        <div onClick={cancel} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '4vh 16px' }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderTop: `4px solid ${ACCENT}`, borderRadius: 14, padding: 20, boxShadow: '0 24px 60px rgba(15,23,42,0.35)', width: 'min(940px, 96vw)', margin: 'auto' }}>
          <div style={{ fontWeight: 900, color: ACCENT, marginBottom: 14, fontSize: '1.05rem' }}>{editingId ? `✏️ Sửa thanh toán${form.full_name || form.beneficiary ? ' — ' + (form.full_name || form.beneficiary) : ''}` : '➕ Thêm thanh toán'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <Field label="Ngày"><input type="date" value={form.pay_date} onChange={e => setForm(f => ({ ...f, pay_date: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Nhân sự booking"><input value={form.staff} onChange={e => setForm(f => ({ ...f, staff: e.target.value }))} placeholder="Tên người book" style={inputStyle} /></Field>
            <Field label="Công ty"><select value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} style={inputStyle}>{COMPANIES.map(c => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Brand"><input list="koc-brands" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} placeholder="Chọn / gõ brand" style={inputStyle} /><datalist id="koc-brands">{BRANDS.map(b => <option key={b} value={b} />)}</datalist></Field>

            <Field label="Link kênh"><input value={form.channel_link} onChange={e => setForm(f => ({ ...f, channel_link: e.target.value }))} placeholder="https://tiktok.com/@..." style={inputStyle} /></Field>
            <div style={{ gridColumn: 'span 3' }}><Field label="Link air (*) — BẮT BUỘC · mỗi video 1 dòng"><textarea value={form.air_link} onChange={e => setForm(f => ({ ...f, air_link: e.target.value }))} rows={1} placeholder="https://tiktok.com/@.../video/..." style={{ ...inputStyle, resize: 'vertical' }} /></Field></div>

            <Field label="Cast (net)"><input value={form.cast_net ? fmtMoney(form.cast_net) : ''} onChange={e => setCast(e.target.value)} inputMode="numeric" placeholder="vd 2.000.000" style={inputStyle} /></Field>
            <Field label="PIT (thuế TNCN)"><input value={form.pit ? fmtMoney(form.pit) : '0'} onChange={e => setPit(e.target.value)} inputMode="numeric" style={inputStyle} /></Field>
            <Field label="Tổng (Cast + PIT)"><input value={fmtMoney(form.total)} readOnly style={{ ...inputStyle, background: '#f8fafc', fontWeight: 800, color: ACCENT }} /></Field>
            <Field label="Kế toán duyệt"><label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, cursor: 'pointer' }}><input type="checkbox" checked={!!form.accountant_approved} onChange={e => setForm(f => ({ ...f, accountant_approved: e.target.checked }))} style={{ width: 18, height: 18, accentColor: '#16a34a' }} /><span style={{ fontSize: '0.85rem', color: '#475569' }}>Đã duyệt / đã chi</span></label></Field>

            <Field label="Số tài khoản"><input value={form.bank_account} onChange={e => setForm(f => ({ ...f, bank_account: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Ngân hàng"><input value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} placeholder="vd MB BANK" style={inputStyle} /></Field>
            <Field label="Người thụ hưởng (không dấu)"><input value={form.beneficiary} onChange={e => setForm(f => ({ ...f, beneficiary: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Họ và tên (có dấu)"><input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} style={inputStyle} /></Field>

            <Field label="Số CCCD"><input value={form.cccd} onChange={e => setForm(f => ({ ...f, cccd: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Mã số thuế"><input value={form.tax_code} onChange={e => setForm(f => ({ ...f, tax_code: e.target.value }))} style={inputStyle} /></Field>
            {renderImgField('📷 Ảnh CCCD (tải từ máy)', 'cccd_image')}
            {renderImgField('📷 Hợp đồng / tin nhắn (ảnh)', 'contract_link')}

            <div style={{ gridColumn: 'span 4' }}><Field label="Ghi chú"><input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={inputStyle} /></Field></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={save} disabled={saving} style={{ padding: '9px 22px', background: saving ? '#cbd5e1' : ACCENT, color: '#fff', border: 'none', borderRadius: 9, fontWeight: 800, cursor: saving ? 'default' : 'pointer' }}>{saving ? '⏳ Đang lưu…' : (editingId ? '💾 Cập nhật' : '➕ Lưu thanh toán')}</button>
            <button onClick={cancel} style={{ padding: '9px 18px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 9, fontWeight: 700, cursor: 'pointer' }}>Huỷ</button>
          </div>
        </div>
        </div>
      )}

      {/* Thanh lọc */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        {!showForm && <button onClick={startAdd} style={{ padding: '9px 18px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 9, fontWeight: 800, cursor: 'pointer' }}>➕ Thêm thanh toán</button>}
        <select value={ym} onChange={e => setYm(e.target.value)} style={inputStyle.width ? { ...inputStyle, width: 'auto' } : inputStyle}>{monthOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
        <select value={fCompany} onChange={e => setFCompany(e.target.value)} style={{ ...inputStyle, width: 'auto' }}><option value="">Tất cả công ty</option>{COMPANIES.map(c => <option key={c}>{c}</option>)}</select>
        <select value={fBrand} onChange={e => setFBrand(e.target.value)} style={{ ...inputStyle, width: 'auto' }}><option value="">Tất cả brand</option>{BRANDS.map(b => <option key={b}>{b}</option>)}</select>
        <select value={fApproved} onChange={e => setFApproved(e.target.value)} style={{ ...inputStyle, width: 'auto' }}><option value="">Tất cả duyệt</option><option value="no">Chưa duyệt</option><option value="yes">Đã duyệt</option></select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Tìm tên / kênh / STK…" style={{ ...inputStyle, width: 220 }} />
        <button onClick={exportExcel} disabled={!filtered.length} style={{ padding: '9px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, cursor: filtered.length ? 'pointer' : 'default', opacity: filtered.length ? 1 : 0.5 }}>📥 Xuất Excel</button>
        <button onClick={load} style={{ padding: '9px 14px', background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}55`, borderRadius: 9, fontWeight: 700, cursor: 'pointer' }}>🔄</button>
      </div>

      {/* Tổng kết */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {[{ l: 'Số bản ghi', v: fmtMoney(filtered.length) }, { l: 'Tổng Cast', v: fmtMoney(sum.cast) + ' đ' }, { l: 'Tổng PIT', v: fmtMoney(sum.pit) + ' đ' }, { l: 'Tổng chi (Cast+PIT)', v: fmtMoney(sum.total) + ' đ' }].map(s => (
          <div key={s.l} style={{ flex: '1 1 160px', background: '#fff', borderRadius: 12, padding: '12px 16px', border: '1px solid #f1f5f9', borderLeft: `4px solid ${ACCENT}` }}>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{s.l}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', marginTop: 2 }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Bảng */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: '64vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={th}>Ngày</th><th style={th}>Nhân sự</th><th style={th}>Cty</th><th style={th}>Brand</th>
                <th style={th}>Họ tên</th><th style={th}>Số TK</th><th style={th}>Ngân hàng</th>
                <th style={{ ...th, textAlign: 'right' }}>Cast</th><th style={{ ...th, textAlign: 'right' }}>PIT</th><th style={{ ...th, textAlign: 'right' }}>Tổng</th>
                <th style={{ ...th, textAlign: 'center' }}>Link</th><th style={{ ...th, textAlign: 'center' }}>Duyệt</th><th style={{ ...th, textAlign: 'center' }}>⚙️</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (<tr><td colSpan={13} style={{ ...td, textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Đang tải…</td></tr>)
                : filtered.length === 0 ? (<tr><td colSpan={13} style={{ ...td, textAlign: 'center', padding: 36, color: '#9ca3af' }}>Chưa có thanh toán nào. Bấm “➕ Thêm thanh toán”.</td></tr>)
                : filtered.map((r, i) => (
                  <tr key={r.id} style={{ background: r.accountant_approved ? '#f0fdf4' : (i % 2 ? '#fcfcfd' : '#fff') }}>
                    <td style={td}>{fmtDate(r.pay_date)}</td>
                    <td style={td}>{r.staff || '—'}</td>
                    <td style={td}><span style={{ fontSize: '0.72rem', fontWeight: 700, color: r.company === 'OPTIMAX' ? '#7c3aed' : '#0891b2' }}>{r.company || '—'}</span></td>
                    <td style={td}>{r.brand || '—'}</td>
                    <td style={{ ...td, fontWeight: 600 }} title={r.beneficiary || ''}>{r.full_name || r.beneficiary || '—'}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.78rem' }}>{r.bank_account || '—'}</td>
                    <td style={td}>{r.bank_name || '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(r.cast_net)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#94a3b8' }}>{fmtMoney(r.pit)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: ACCENT }}>{fmtMoney(r.total)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.air_link ? <a href={r.air_link.split('\n')[0]} target="_blank" rel="noreferrer" style={{ color: '#7c3aed', textDecoration: 'none' }}>🎬</a> : '—'}{r.contract_link ? <a href={r.contract_link.split('\n')[0]} target="_blank" rel="noreferrer" style={{ color: '#0891b2', textDecoration: 'none', marginLeft: 6 }}>📄</a> : ''}{r.cccd_image ? <a href={r.cccd_image.split('\n')[0]} target="_blank" rel="noreferrer" style={{ color: '#16a34a', textDecoration: 'none', marginLeft: 6 }}>🪪{(() => { const n = r.cccd_image.split('\n').filter(Boolean).length; return n > 1 ? n : ''; })()}</a> : ''}</td>
                    <td style={{ ...td, textAlign: 'center' }}><input type="checkbox" checked={!!r.accountant_approved} onChange={() => toggleApproved(r)} style={{ width: 17, height: 17, accentColor: '#16a34a', cursor: 'pointer' }} /></td>
                    <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button onClick={() => startEdit(r)} title="Sửa" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.95rem' }}>✏️</button>
                      <button onClick={() => del(r)} title="Xoá" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.95rem', marginLeft: 4 }}>🗑️</button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default KocPaymentTab;
