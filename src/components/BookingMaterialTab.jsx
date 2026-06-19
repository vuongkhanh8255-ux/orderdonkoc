// src/components/BookingMaterialTab.jsx
// Module 6 — Material bán hàng: kho lưu trữ theo brand cho KOC.
//  • Nội dung brief cho KOC (text)
//  • Top 5 SKU để fill thiệp KOC (name + note)
//  • Ảnh: file nén .zip (up lên Supabase Storage)
//  • Giấy kiểm định: file .pdf
// File lưu ở bucket public 'booking-materials', metadata trong cột files (jsonb).
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';

const BUCKET = 'booking-materials';
const ORANGE = '#ff6a2c';
const MAX_BYTES = 50 * 1024 * 1024; // 50MB / file

const card = { background: '#fff', border: '1px solid #eef0f3', borderRadius: 14, padding: 20, boxShadow: '0 1px 3px rgba(15,23,42,0.05)' };
const btn = (bg, c = '#fff') => ({ background: bg, color: c, border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit' });
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1.5px solid #e5e7eb', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };

const fmtSize = (b) => !b ? '' : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
const safe = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');

export default function BookingMaterialTab() {
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState('');
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ brief: '', skus: [] });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');   // '' | 'image_zip' | 'cert_pdf'

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('booking_materials').select('*').order('brand');
    if (!error && data) {
      setRows(data);
      setSel(prev => prev || data[0]?.brand || '');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const cur = useMemo(() => rows.find(r => r.brand === sel) || null, [rows, sel]);

  // Nạp draft khi đổi brand
  useEffect(() => {
    if (cur) setDraft({ brief: cur.brief || '', skus: Array.isArray(cur.skus) ? cur.skus : [] });
  }, [sel, cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchRow = (brand, patch) => setRows(rs => rs.map(r => r.brand === brand ? { ...r, ...patch } : r));

  const addBrand = async () => {
    const name = (prompt('Tên brand mới:') || '').trim();
    if (!name) return;
    if (rows.some(r => r.brand.toLowerCase() === name.toLowerCase())) { alert('Brand đã tồn tại.'); return; }
    const { data, error } = await supabase.from('booking_materials').insert({ brand: name }).select().single();
    if (error) { alert('Lỗi tạo brand: ' + error.message); return; }
    setRows(rs => [...rs, data].sort((a, b) => a.brand.localeCompare(b.brand)));
    setSel(name);
  };

  const deleteBrand = async () => {
    if (!cur) return;
    if (!confirm(`Xoá brand "${cur.brand}" và toàn bộ material? (không xoá file đã up)`)) return;
    const { error } = await supabase.from('booking_materials').delete().eq('id', cur.id);
    if (error) { alert('Lỗi xoá: ' + error.message); return; }
    const rest = rows.filter(r => r.id !== cur.id);
    setRows(rest); setSel(rest[0]?.brand || '');
  };

  const saveInfo = async () => {
    if (!cur) return;
    setSaving(true);
    const { error } = await supabase.from('booking_materials')
      .update({ brief: draft.brief, skus: draft.skus, updated_at: new Date().toISOString() })
      .eq('id', cur.id);
    setSaving(false);
    if (error) { alert('Lỗi lưu: ' + error.message); return; }
    patchRow(cur.brand, { brief: draft.brief, skus: draft.skus });
    alert('✅ Đã lưu brief + SKU.');
  };

  // SKU helpers (thao tác trên draft)
  const setSku = (i, key, val) => setDraft(d => ({ ...d, skus: d.skus.map((s, idx) => idx === i ? { ...s, [key]: val } : s) }));
  const addSku = () => setDraft(d => ({ ...d, skus: [...d.skus, { name: '', note: '' }] }));
  const delSku = (i) => setDraft(d => ({ ...d, skus: d.skus.filter((_, idx) => idx !== i) }));

  // Upload file
  const uploadFile = async (kind, file) => {
    if (!file || !cur) return;
    if (file.size > MAX_BYTES) { alert(`File quá lớn (>${fmtSize(MAX_BYTES)}). Hãy chia nhỏ hoặc nén lại.`); return; }
    setBusy(kind);
    try {
      const path = `${safe(cur.brand)}/${kind}/${Date.now()}_${safe(file.name)}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const entry = { kind, name: file.name, url: pub.publicUrl, path, size: file.size, uploaded_at: new Date().toISOString() };
      const files = [...(Array.isArray(cur.files) ? cur.files : []), entry];
      const { error } = await supabase.from('booking_materials').update({ files, updated_at: new Date().toISOString() }).eq('id', cur.id);
      if (error) throw error;
      patchRow(cur.brand, { files });
    } catch (e) { alert('Lỗi upload: ' + e.message); }
    finally { setBusy(''); }
  };

  const deleteFile = async (entry) => {
    if (!cur || !confirm(`Xoá file "${entry.name}"?`)) return;
    try {
      if (entry.path) await supabase.storage.from(BUCKET).remove([entry.path]);
      const files = (cur.files || []).filter(f => (f.path || f.url) !== (entry.path || entry.url));
      const { error } = await supabase.from('booking_materials').update({ files, updated_at: new Date().toISOString() }).eq('id', cur.id);
      if (error) throw error;
      patchRow(cur.brand, { files });
    } catch (e) { alert('Lỗi xoá file: ' + e.message); }
  };

  const filesOf = (kind) => (cur?.files || []).filter(f => f.kind === kind);

  if (loading) return <div style={{ padding: 30, color: '#94a3b8' }}>⏳ Đang tải material…</div>;

  return (
    <div style={{ padding: '8px 4px 40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#1e293b' }}>🎁 Module 6: Material bán hàng</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>Kho brief KOC · top 5 SKU fill thiệp · ảnh (.zip) · giấy kiểm định (.pdf) theo từng brand.</p>
        </div>
        <button style={btn(ORANGE)} onClick={addBrand}>➕ Thêm brand</button>
      </div>

      {/* Brand selector */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {rows.map(r => (
          <button key={r.id} onClick={() => setSel(r.brand)}
            style={{ ...btn(r.brand === sel ? ORANGE : '#fff', r.brand === sel ? '#fff' : '#475569'), border: r.brand === sel ? 'none' : '1.5px solid #e5e7eb' }}>
            {r.brand}
          </button>
        ))}
        {!rows.length && <span style={{ color: '#94a3b8' }}>Chưa có brand nào — bấm "Thêm brand".</span>}
      </div>

      {cur && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
          {/* Brief + SKU */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: ORANGE }}>📋 {cur.brand} — Brief & SKU</h3>
              <button style={{ ...btn('#fff', '#ef4444'), border: '1.5px solid #fecaca', padding: '6px 12px', fontSize: '0.78rem' }} onClick={deleteBrand}>🗑 Xoá brand</button>
            </div>

            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151' }}>Nội dung brief cho KOC</label>
            <textarea value={draft.brief} onChange={e => setDraft(d => ({ ...d, brief: e.target.value }))}
              rows={5} placeholder="Dán nội dung brief gửi KOC…" style={{ ...inputStyle, marginTop: 6, resize: 'vertical' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 8px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151' }}>🏷️ Top 5 SKU (fill thiệp KOC)</label>
              <button style={{ ...btn('#fff7ed', ORANGE), border: `1.5px solid ${ORANGE}`, padding: '5px 12px', fontSize: '0.78rem' }} onClick={addSku}>+ SKU</button>
            </div>
            {draft.skus.length === 0 && <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 8 }}>Chưa có SKU. Bấm "+ SKU" để thêm.</div>}
            {draft.skus.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: ORANGE, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, flex: 'none' }}>{i + 1}</span>
                <input value={s.name || ''} onChange={e => setSku(i, 'name', e.target.value)} placeholder="Tên SKU" style={{ ...inputStyle, flex: 2 }} />
                <input value={s.note || ''} onChange={e => setSku(i, 'note', e.target.value)} placeholder="Ghi chú (mã, giá, ưu đãi…)" style={{ ...inputStyle, flex: 3 }} />
                <button style={{ ...btn('#fff', '#ef4444'), border: '1.5px solid #fecaca', padding: '7px 10px' }} onClick={() => delSku(i)}>✕</button>
              </div>
            ))}

            <button style={{ ...btn(ORANGE), marginTop: 12, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={saveInfo}>
              {saving ? '⏳ Đang lưu…' : '💾 Lưu brief + SKU'}
            </button>
          </div>

          {/* Files: zip ảnh + pdf kiểm định */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
            <FileBox title="🖼️ Ảnh sản phẩm (.zip)" hint="Nén ảnh thành file .zip rồi up lên" accept=".zip,application/zip,application/x-zip-compressed"
              files={filesOf('image_zip')} busy={busy === 'image_zip'} onUpload={f => uploadFile('image_zip', f)} onDelete={deleteFile} />
            <FileBox title="📄 Giấy kiểm định (.pdf)" hint="Up file PDF kiểm định" accept=".pdf,application/pdf"
              files={filesOf('cert_pdf')} busy={busy === 'cert_pdf'} onUpload={f => uploadFile('cert_pdf', f)} onDelete={deleteFile} />
          </div>
        </div>
      )}
    </div>
  );
}

function FileBox({ title, hint, accept, files, busy, onUpload, onDelete }) {
  return (
    <div style={card}>
      <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>{title}</h3>
      <p style={{ margin: '0 0 12px', color: '#94a3b8', fontSize: '0.8rem' }}>{hint}</p>
      <label style={{ ...btn(busy ? '#cbd5e1' : '#1e293b'), display: 'inline-block', cursor: busy ? 'default' : 'pointer' }}>
        {busy ? '⏳ Đang up…' : '⬆️ Chọn file'}
        <input type="file" accept={accept} disabled={busy} style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
      </label>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {files.length === 0 && <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>Chưa có file.</span>}
        {files.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#f8fafc', borderRadius: 9, border: '1px solid #eef0f3' }}>
            <a href={f.url} target="_blank" rel="noreferrer" style={{ flex: 1, color: '#2563eb', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600, wordBreak: 'break-all' }}>
              {f.name}
            </a>
            <span style={{ color: '#94a3b8', fontSize: '0.75rem', flex: 'none' }}>{fmtSize(f.size)}</span>
            <button style={{ ...btn('#fff', '#ef4444'), border: '1.5px solid #fecaca', padding: '5px 9px', flex: 'none' }} onClick={() => onDelete(f)}>🗑</button>
          </div>
        ))}
      </div>
    </div>
  );
}
