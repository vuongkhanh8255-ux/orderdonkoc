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
const API = '/api/tiktok-shop/analytics';
// Chuẩn hoá tên để map brand ↔ gian hàng (bỏ dấu, "Việt Nam", "Hồ Chí Minh", khoảng trắng)
const normName = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/VIETNAM/g, '').replace(/HOCHIMINH/g, '');

const card = { background: '#fff', border: '1px solid #eef0f3', borderRadius: 14, padding: 20, boxShadow: '0 1px 3px rgba(15,23,42,0.05)' };
const btn = (bg, c = '#fff') => ({ background: bg, color: c, border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit' });
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1.5px solid #e5e7eb', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };

const fmtSize = (b) => !b ? '' : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
const safe = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');

export default function BookingMaterialTab() {
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState('');
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ brief: '', skus: [], products: [] });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');   // '' | 'image_zip' | 'cert_pdf'
  const [products, setProducts] = useState([]); // SP của brand (từ dashboard booking: bảng sanphams)
  const [picker, setPicker] = useState({ open: false, shops: [], shop: '', items: [], loading: false, err: '' }); // chọn SP từ gian TikTok (có ảnh)

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
    if (cur) setDraft({ brief: cur.brief || '', skus: Array.isArray(cur.skus) ? cur.skus : [], products: Array.isArray(cur.products) ? cur.products : [] });
  }, [sel, cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lấy danh sách SP của brand đang chọn (từ dashboard booking: brands → sanphams)
  // để autocomplete ô Tên SKU. Khớp brand theo tên (vd "eHerb" ↔ "EHERB" + "EHERB HCM").
  useEffect(() => {
    if (!sel) { setProducts([]); return; }
    let cancelled = false;
    (async () => {
      const { data: brs } = await supabase.from('brands').select('id, ten_brand');
      const key = sel.trim().toUpperCase();
      const ids = (brs || []).filter(b => (b.ten_brand || '').trim().toUpperCase().startsWith(key)).map(b => b.id);
      if (!ids.length) { if (!cancelled) setProducts([]); return; }
      const { data: sps } = await supabase.from('sanphams')
        .select('ten_sanpham, barcode, gia_tien').in('brand_id', ids).order('ten_sanpham');
      if (!cancelled) setProducts(sps || []);
    })();
    return () => { cancelled = true; };
  }, [sel]);

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
  // Chọn tên SKU: nếu khớp 1 SP trong danh sách → tự điền mã/giá vào ghi chú (nếu ghi chú đang trống).
  const onSkuName = (i, val) => {
    const p = products.find(pp => pp.ten_sanpham === val);
    setDraft(d => ({ ...d, skus: d.skus.map((s, idx) => {
      if (idx !== i) return s;
      const next = { ...s, name: val };
      if (p && !(s.note || '').trim()) {
        next.note = [p.barcode && `Mã: ${p.barcode}`, p.gia_tien && `Giá: ${Number(p.gia_tien).toLocaleString('vi-VN')}đ`].filter(Boolean).join(' · ');
      }
      return next;
    }) }));
  };
  const addSku = () => setDraft(d => ({ ...d, skus: [...d.skus, { name: '', note: '' }] }));
  const delSku = (i) => setDraft(d => ({ ...d, skus: d.skus.filter((_, idx) => idx !== i) }));

  // Upload chung 1 file lên bucket → trả {url, path, size}
  const putFile = async (subdir, file) => {
    const path = `${safe(cur.brand)}/${subdir}/${Date.now()}_${safe(file.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path, size: file.size };
  };

  // Avatar/logo brand
  const uploadAvatar = async (file) => {
    if (!file || !cur) return;
    if (!file.type.startsWith('image/')) { alert('Hãy chọn file ảnh.'); return; }
    if (file.size > MAX_BYTES) { alert('Ảnh quá lớn.'); return; }
    setBusy('avatar');
    try {
      const { url } = await putFile('avatar', file);
      const { error } = await supabase.from('booking_materials').update({ avatar_url: url, updated_at: new Date().toISOString() }).eq('id', cur.id);
      if (error) throw error;
      patchRow(cur.brand, { avatar_url: url });
    } catch (e) { alert('Lỗi upload avatar: ' + e.message); }
    finally { setBusy(''); }
  };

  // Ảnh cho 1 SKU (lưu ngay vào skus để khỏi mất link)
  const uploadSkuImage = async (i, file) => {
    if (!file || !cur) return;
    if (!file.type.startsWith('image/')) { alert('Hãy chọn file ảnh.'); return; }
    if (file.size > MAX_BYTES) { alert('Ảnh quá lớn.'); return; }
    setBusy(`sku-${i}`);
    try {
      const { url } = await putFile('sku', file);
      const skus = draft.skus.map((s, idx) => idx === i ? { ...s, image: url } : s);
      setDraft(d => ({ ...d, skus }));
      const { error } = await supabase.from('booking_materials').update({ skus, updated_at: new Date().toISOString() }).eq('id', cur.id);
      if (error) throw error;
      patchRow(cur.brand, { skus });
    } catch (e) { alert('Lỗi upload ảnh SKU: ' + e.message); }
    finally { setBusy(''); }
  };

  // ── Chọn SP từ gian hàng TikTok (có ảnh thật) ──────────────────────────
  const fetchPicker = async (shopId) => {
    setPicker(p => ({ ...p, loading: true, err: '', items: [], shop: shopId }));
    try {
      const ymd = d => d.toISOString().slice(0, 10);
      const now = new Date();
      const qs = new URLSearchParams({ action: 'products', shop_id: shopId, start_date: ymd(new Date(now - 30 * 86400000)), end_date: ymd(now), sort_field: 'units_sold', page_size: '50' });
      const r = await fetch(`${API}?${qs}`); const j = await r.json();
      if (!j.ok) { setPicker(p => ({ ...p, loading: false, err: j.error || 'Lỗi tải SP gian hàng' })); return; }
      setPicker(p => ({ ...p, loading: false, items: j.products || [] }));
    } catch (e) { setPicker(p => ({ ...p, loading: false, err: e.message })); }
  };
  const openPicker = async () => {
    setPicker({ open: true, shops: [], shop: '', items: [], loading: true, err: '' });
    try {
      const r = await fetch(`${API}?action=shops`); const j = await r.json();
      const shops = (j.ok && Array.isArray(j.data)) ? j.data : [];
      const key = normName(sel);
      const match = shops.find(s => normName(s.seller_name).startsWith(key)) || shops.find(s => normName(s.seller_name).includes(key));
      const shopId = match?.shop_id || shops[0]?.shop_id || '';
      setPicker(p => ({ ...p, shops, shop: shopId }));
      if (shopId) fetchPicker(shopId);
      else setPicker(p => ({ ...p, loading: false, err: 'Không tìm thấy gian hàng kết nối.' }));
    } catch (e) { setPicker(p => ({ ...p, loading: false, err: e.message })); }
  };
  const addProductAsSku = async (p) => {
    if (!cur) return;
    const name = p.product_name || '';
    if (draft.skus.some(s => (s.name || '').trim() === name.trim())) return;
    const skus = [...draft.skus, { name, note: '', image: p.image || '' }];
    setDraft(d => ({ ...d, skus }));
    patchRow(cur.brand, { skus });
    await supabase.from('booking_materials').update({ skus, updated_at: new Date().toISOString() }).eq('id', cur.id);
  };

  // ── SẢN PHẨM (mỗi SP 1 khung: ảnh .zip + giấy kiểm định .pdf riêng) ──
  const persistProducts = async (next) => {
    setDraft(d => ({ ...d, products: next }));
    patchRow(cur.brand, { products: next });
    const { error } = await supabase.from('booking_materials').update({ products: next, updated_at: new Date().toISOString() }).eq('id', cur.id);
    if (error) alert('Lỗi lưu sản phẩm: ' + error.message);
  };
  const addProduct = () => {
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `p${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    persistProducts([...(draft.products || []), { id, name: '', files: [] }]);
  };
  const renameProduct = (id, name) => setDraft(d => ({ ...d, products: (d.products || []).map(p => p.id === id ? { ...p, name } : p) }));
  const commitProducts = () => persistProducts(draft.products || []); // lưu tên khi rời ô
  const removeProduct = (id) => {
    const p = (draft.products || []).find(x => x.id === id);
    if (!confirm(`Xoá sản phẩm "${p?.name || ''}"? (file đã up trên storage không bị xoá)`)) return;
    persistProducts((draft.products || []).filter(x => x.id !== id));
  };
  const uploadProductFile = async (pid, kind, file) => {
    if (!file || !cur) return;
    if (file.size > MAX_BYTES) { alert(`File quá lớn (>${fmtSize(MAX_BYTES)}). Hãy chia nhỏ hoặc nén lại.`); return; }
    setBusy(`${pid}:${kind}`);
    try {
      const { url, path, size } = await putFile(`${pid}/${kind}`, file);
      const entry = { kind, name: file.name, url, path, size, uploaded_at: new Date().toISOString() };
      const next = (draft.products || []).map(p => p.id === pid ? { ...p, files: [...(p.files || []), entry] } : p);
      await persistProducts(next);
    } catch (e) { alert('Lỗi upload: ' + e.message); }
    finally { setBusy(''); }
  };
  const deleteProductFile = async (pid, entry) => {
    if (!cur || !confirm(`Xoá file "${entry.name}"?`)) return;
    try {
      if (entry.path) await supabase.storage.from(BUCKET).remove([entry.path]);
      const next = (draft.products || []).map(p => p.id === pid ? { ...p, files: (p.files || []).filter(f => (f.path || f.url) !== (entry.path || entry.url)) } : p);
      await persistProducts(next);
    } catch (e) { alert('Lỗi xoá file: ' + e.message); }
  };
  const prodFiles = (product, kind) => (product.files || []).filter(f => f.kind === kind);

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
            style={{ ...btn(r.brand === sel ? ORANGE : '#fff', r.brand === sel ? '#fff' : '#475569'), border: r.brand === sel ? 'none' : '1.5px solid #e5e7eb', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            {r.avatar_url
              ? <img src={r.avatar_url} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
              : <span style={{ width: 20, height: 20, borderRadius: '50%', background: r.brand === sel ? 'rgba(255,255,255,.3)' : '#f1f5f9', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>🏷️</span>}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label title="Đổi avatar/logo brand" style={{ cursor: busy === 'avatar' ? 'default' : 'pointer', flex: 'none' }}>
                  {cur.avatar_url
                    ? <img src={cur.avatar_url} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid #ffedd5' }} />
                    : <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fff7ed', border: '2px dashed #fdba74', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ORANGE, fontSize: '0.6rem', fontWeight: 800, textAlign: 'center', lineHeight: 1.1 }}>{busy === 'avatar' ? '⏳' : '+ ảnh'}</div>}
                  <input type="file" accept="image/*" disabled={busy === 'avatar'} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ''; }} />
                </label>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: ORANGE }}>{cur.brand} — Brief & SKU</h3>
              </div>
              <button style={{ ...btn('#fff', '#ef4444'), border: '1.5px solid #fecaca', padding: '6px 12px', fontSize: '0.78rem' }} onClick={deleteBrand}>🗑 Xoá brand</button>
            </div>

            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151' }}>Nội dung brief cho KOC</label>
            <textarea value={draft.brief} onChange={e => setDraft(d => ({ ...d, brief: e.target.value }))}
              rows={5} placeholder="Dán nội dung brief gửi KOC…" style={{ ...inputStyle, marginTop: 6, resize: 'vertical' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 8px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151' }}>🏷️ Top 5 SKU (fill thiệp KOC)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ ...btn('#1e293b'), padding: '5px 12px', fontSize: '0.78rem' }} onClick={openPicker}>📦 Chọn từ gian hàng</button>
                <button style={{ ...btn('#fff7ed', ORANGE), border: `1.5px solid ${ORANGE}`, padding: '5px 12px', fontSize: '0.78rem' }} onClick={addSku}>+ thủ công</button>
              </div>
            </div>
            {draft.skus.length === 0 && <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 8 }}>Chưa có SKU. Bấm "+ SKU" để thêm.</div>}
            {draft.skus.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: ORANGE, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, flex: 'none' }}>{i + 1}</span>
                <label title="Ảnh SKU" style={{ cursor: busy === `sku-${i}` ? 'default' : 'pointer', flex: 'none' }}>
                  {s.image
                    ? <img src={s.image} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', border: '1px solid #e5e7eb' }} />
                    : <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f8fafc', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>{busy === `sku-${i}` ? '⏳' : '🖼️'}</div>}
                  <input type="file" accept="image/*" disabled={busy === `sku-${i}`} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadSkuImage(i, f); e.target.value = ''; }} />
                </label>
                <input value={s.name || ''} onChange={e => onSkuName(i, e.target.value)} list="bm-sku-products" placeholder="Tên SKU (gõ để lọc DS booking)" style={{ ...inputStyle, flex: 2 }} />
                <input value={s.note || ''} onChange={e => setSku(i, 'note', e.target.value)} placeholder="Ghi chú (mã, giá, ưu đãi…)" style={{ ...inputStyle, flex: 3 }} />
                <button style={{ ...btn('#fff', '#ef4444'), border: '1.5px solid #fecaca', padding: '7px 10px' }} onClick={() => delSku(i)}>✕</button>
              </div>
            ))}
            <datalist id="bm-sku-products">
              {products.map((p, idx) => <option key={idx} value={p.ten_sanpham} />)}
            </datalist>
            {products.length > 0 && <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>💡 Gõ vào ô Tên SKU để chọn từ {products.length} sản phẩm của brand (tự điền mã/giá vào ghi chú).</div>}

            <button style={{ ...btn(ORANGE), marginTop: 12, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={saveInfo}>
              {saving ? '⏳ Đang lưu…' : '💾 Lưu brief + SKU'}
            </button>
          </div>

          {/* Sản phẩm — mỗi SP 1 khung riêng (ảnh .zip + giấy kiểm định .pdf) */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>📦 Sản phẩm ({(draft.products || []).length})</h3>
                <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: '0.8rem' }}>1 brand nhiều SP — mỗi sản phẩm 1 khung: ảnh (.zip) + giấy kiểm định (.pdf) riêng.</p>
              </div>
              <button style={btn(ORANGE)} onClick={addProduct}>➕ Thêm sản phẩm</button>
            </div>
            {(draft.products || []).length === 0 && <div style={{ color: '#94a3b8', fontSize: '0.88rem', padding: '8px 0' }}>Chưa có sản phẩm. Bấm "➕ Thêm sản phẩm" để tạo khung đầu tiên.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {(draft.products || []).map((p, idx) => (
                <div key={p.id} style={{ border: '1.5px solid #ffedd5', borderRadius: 12, padding: 14, background: '#fffdfb' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', background: ORANGE, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 800, flex: 'none' }}>{idx + 1}</span>
                    <input value={p.name || ''} onChange={e => renameProduct(p.id, e.target.value)} onBlur={commitProducts} placeholder="Tên sản phẩm…" style={{ ...inputStyle, flex: 1, fontWeight: 700 }} />
                    <button style={{ ...btn('#fff', '#ef4444'), border: '1.5px solid #fecaca', padding: '8px 12px', flex: 'none' }} onClick={() => removeProduct(p.id)}>🗑 Xoá SP</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
                    <FileBox title="🖼️ Ảnh sản phẩm (.zip)" hint="Nén ảnh thành file .zip rồi up lên" accept=".zip,application/zip,application/x-zip-compressed"
                      files={prodFiles(p, 'image_zip')} busy={busy === `${p.id}:image_zip`} onUpload={f => uploadProductFile(p.id, 'image_zip', f)} onDelete={e => deleteProductFile(p.id, e)} />
                    <FileBox title="📄 Giấy kiểm định (.pdf)" hint="Up file PDF kiểm định" accept=".pdf,application/pdf"
                      files={prodFiles(p, 'cert_pdf')} busy={busy === `${p.id}:cert_pdf`} onUpload={f => uploadProductFile(p.id, 'cert_pdf', f)} onDelete={e => deleteProductFile(p.id, e)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: chọn SP từ gian hàng TikTok (có ảnh) */}
      {picker.open && (
        <div onClick={() => setPicker(p => ({ ...p, open: false }))} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(920px,96vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #eef0f3', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, flex: 1 }}>📦 Chọn SP từ gian hàng <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.82rem' }}>(click để thêm vào SKU)</span></h3>
              <select value={picker.shop} onChange={e => fetchPicker(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '8px 10px' }}>
                {picker.shops.map(s => <option key={s.shop_id} value={s.shop_id}>{s.seller_name}</option>)}
              </select>
              <button style={{ ...btn('#f1f5f9', '#475569') }} onClick={() => setPicker(p => ({ ...p, open: false }))}>✕ Đóng</button>
            </div>
            <div style={{ padding: 16, overflow: 'auto' }}>
              {picker.loading && <div style={{ color: '#94a3b8', padding: 20 }}>⏳ Đang tải sản phẩm từ gian hàng…</div>}
              {picker.err && <div style={{ color: '#ef4444', padding: 20 }}>⚠️ {picker.err}</div>}
              {!picker.loading && !picker.err && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
                  {picker.items.map(p => {
                    const added = draft.skus.some(s => (s.name || '').trim() === (p.product_name || '').trim());
                    return (
                      <button key={p.product_id} onClick={() => addProductAsSku(p)} disabled={added}
                        style={{ textAlign: 'left', background: added ? '#f0fdf4' : '#fff', border: `1.5px solid ${added ? '#86efac' : '#eef0f3'}`, borderRadius: 12, padding: 8, cursor: added ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                        <div style={{ position: 'relative', width: '100%', aspectRatio: '1', borderRadius: 9, overflow: 'hidden', background: '#f8fafc', marginBottom: 6 }}>
                          {p.image ? <img src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#cbd5e1' }}>🖼️</div>}
                          {added && <div style={{ position: 'absolute', top: 4, right: 4, background: '#22c55e', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>✓</div>}
                        </div>
                        <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#334155', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.product_name}</div>
                        <div style={{ fontSize: '0.7rem', color: ORANGE, fontWeight: 700, marginTop: 3 }}>Đã bán: {Number(p.units_sold || 0).toLocaleString('vi-VN')}</div>
                      </button>
                    );
                  })}
                  {!picker.items.length && <div style={{ color: '#94a3b8', padding: 20 }}>Gian này chưa có sản phẩm trong 30 ngày.</div>}
                </div>
              )}
            </div>
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
