// src/components/LiveModelShotTab.jsx
// Live AI — Ảnh người mẫu: mỗi BRAND up 1 mớ ảnh sản phẩm thật → 1 nút gen ảnh
// người mẫu ảo CẦM + TRƯNG BÀY cả bộ sản phẩm → tải về đem lên Seedance làm video.
// Backend dùng chung action live_gen_image (OpenAI /images/edits, nhận tối đa 16 ảnh SP).
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';

const ACCENT = '#ff6a2c';
const API = '/api/tiktok-shop/analytics';
const BUCKET = 'live-assets';
const safe = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40) || 'brand';
const DEFAULT_PROMPT = 'Một người mẫu nữ Việt Nam trẻ trung, da sáng, tươi cười thân thiện, đang cầm trên tay và trưng bày CÁC SẢN PHẨM trong những ảnh đính kèm (giữ NGUYÊN đúng mẫu mã, nhãn hiệu, màu sắc thật của sản phẩm). Bối cảnh studio livestream sáng sủa, phía trước có bàn/kệ trưng bày xếp đẹp mắt các sản phẩm đó. Ảnh dọc 9:16, ánh sáng mềm chuyên nghiệp, chân thực như ảnh chụp thật, chất lượng cao.';

const callApi = async (action, payload) => {
  try {
    const r = await fetch(`${API}?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const t = await r.text();
    try { return JSON.parse(t); } catch { return { ok: false, error: t.slice(0, 200) || ('HTTP ' + r.status) }; }
  } catch (e) { return { ok: false, error: 'Lỗi mạng: ' + e.message }; }
};

const card = { background: '#fff', borderRadius: 16, border: '1px solid #eef0f3', boxShadow: '0 2px 8px rgba(15,23,42,0.06)', marginBottom: 16, overflow: 'hidden' };
const inp = { padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.95rem', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
const btn = (bg) => ({ padding: '11px 20px', borderRadius: 10, border: 'none', background: bg, color: '#fff', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit' });

export default function LiveModelShotTab() {
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');   // 'up' | 'gen'
  const [status, setStatus] = useState('');
  const [big, setBig] = useState(null);   // ảnh phóng to

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('live_brand_shots').select('*').order('brand');
    setRows(data || []);
    setSel(prev => prev || data?.[0]?.brand || '');
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const cur = useMemo(() => rows.find(r => r.brand === sel) || null, [rows, sel]);
  const patch = (brand, p) => setRows(rs => rs.map(r => r.brand === brand ? { ...r, ...p } : r));

  const persist = async (p) => {
    if (!cur) return;
    patch(cur.brand, p);
    const { error } = await supabase.from('live_brand_shots').update({ ...p, updated_at: new Date().toISOString() }).eq('brand', cur.brand);
    if (error) setStatus('❌ Lỗi lưu: ' + error.message);
  };

  const addBrand = async () => {
    const name = (prompt('Tên brand (VD: Milaganics):') || '').trim();
    if (!name) return;
    if (rows.some(r => r.brand.toLowerCase() === name.toLowerCase())) { setSel(name); return; }
    const { data, error } = await supabase.from('live_brand_shots').insert({ brand: name, prompt: DEFAULT_PROMPT }).select().single();
    if (error) { setStatus('❌ Lỗi tạo brand: ' + error.message); return; }
    setRows(rs => [...rs, data].sort((a, b) => a.brand.localeCompare(b.brand)));
    setSel(name);
  };
  const delBrand = async () => {
    if (!cur || !confirm(`Xoá brand "${cur.brand}" và danh sách ảnh? (file trên kho không xoá)`)) return;
    await supabase.from('live_brand_shots').delete().eq('brand', cur.brand);
    const rest = rows.filter(r => r.brand !== cur.brand);
    setRows(rest); setSel(rest[0]?.brand || '');
  };

  // Up NHIỀU ảnh sản phẩm cùng lúc (chọn cả thư mục thì Ctrl+A trong folder)
  const uploadImages = async (files) => {
    const list = [...(files || [])].filter(f => f.type.startsWith('image/'));
    if (!list.length || !cur) return;
    setBusy('up'); setStatus(`⬆️ Đang up ${list.length} ảnh...`);
    try {
      const added = [];
      for (const file of list) {
        const ext = (file.name.split('.').pop() || 'png').toLowerCase();
        const path = `brandshot/${safe(cur.brand)}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        added.push({ url: data.publicUrl, path, name: file.name });
      }
      await persist({ product_images: [...(cur.product_images || []), ...added] });
      setStatus(`✅ Đã up ${added.length} ảnh sản phẩm.`);
    } catch (e) { setStatus('❌ Lỗi up ảnh: ' + e.message); }
    finally { setBusy(''); }
  };
  const removeImage = async (img) => {
    if (!cur) return;
    if (img.path) supabase.storage.from(BUCKET).remove([img.path]).then(() => {}, () => {});
    await persist({ product_images: (cur.product_images || []).filter(x => (x.path || x.url) !== (img.path || img.url)) });
  };

  const genModelShot = async () => {
    if (!cur) return;
    const urls = (cur.product_images || []).map(x => x.url);
    if (!urls.length) { setStatus('❌ Up ít nhất 1 ảnh sản phẩm trước.'); return; }
    if (!String(cur.prompt || '').trim()) { setStatus('❌ Cần prompt (đã có mẫu sẵn).'); return; }
    setBusy('gen'); setStatus('🪄 Đang tạo ảnh người mẫu cầm sản phẩm... ~30-60s (đừng tắt trang)');
    const j = await callApi('live_gen_image', { prompt: cur.prompt, product_image_urls: urls.slice(0, 16) });
    setBusy('');
    if (!j.ok) { setStatus('❌ ' + (j.error || 'Lỗi tạo ảnh')); return; }
    await persist({ gallery: [{ url: j.image_url, at: new Date().toISOString() }, ...(cur.gallery || [])] });
    setStatus('✅ Xong! Ảnh mới ở khu "Ảnh đã tạo" — tải về đem lên Seedance làm video.' + (urls.length > 16 ? ' (chỉ dùng 16 ảnh đầu)' : ''));
  };
  const copyPrompt = () => { navigator.clipboard?.writeText(cur?.prompt || ''); setStatus('📋 Đã copy prompt — dán vào ChatGPT/Dreamina nếu làm tay.'); };

  // ── FORM làm prompt video: 5 ô (mô tả / nội dung / lời thoại / góc quay / hành động người) ──
  const setVf = (k, v) => patch(cur.brand, { vform: { ...(cur.vform || {}), [k]: v } });
  const saveVf = () => persist({ vform: cur.vform || {} });
  const copyTxt = (t, msg) => { navigator.clipboard?.writeText(t || ''); setStatus(msg || '📋 Đã copy.'); };
  // Ghép prompt Seedance từ form (client-side, tiếng Việt) — dùng khi điền tay, khỏi cần AI
  const buildPrompt = () => {
    const f = cur.vform || {};
    const p = [f.mo_ta, f.goc_quay && ('Góc quay: ' + f.goc_quay), f.hanh_dong && ('Hành động: ' + f.hanh_dong),
      'Giữ sản phẩm giống hệt ảnh tham chiếu, chân thực, chuyển động mượt, camera cố định.'].filter(Boolean).join('. ');
    persist({ prompt: p }); copyTxt(p, '📋 Đã ghép + copy prompt từ form. Muốn bản tiếng Anh xịn hơn thì bấm ✨ AI.');
  };
  // AI tự viết cả 5 ô + prompt tiếng Anh từ ý ở ô Nội dung/Mô tả
  const suggestForm = async () => {
    if (!cur) return;
    const idea = String(cur.vform?.noi_dung || '').trim() || String(cur.vform?.mo_ta || '').trim();
    if (!idea) { setStatus('❌ Ghi vài ý vào ô "Nội dung" (hoặc Mô tả) rồi bấm ✨.'); return; }
    setBusy('sug'); setStatus('✨ AI đang viết 5 ô + prompt... ~5-15s');
    const j = await callApi('live_suggest', { label: cur.brand, idea });
    setBusy('');
    if (!j.ok) { setStatus('❌ ' + (j.error || 'Lỗi AI')); return; }
    const f = j.form || {};
    await persist({
      vform: { mo_ta: f.mo_ta || cur.vform?.mo_ta || '', noi_dung: f.noi_dung || idea, loi_thoai: j.script || '', goc_quay: f.goc_quay || '', hanh_dong: f.hanh_dong || '' },
      prompt: j.img_prompt || cur.prompt,
    });
    setStatus('✅ AI viết xong 5 ô + prompt tiếng Anh. Đọc lại → Copy prompt + Copy lời thoại đem lên Seedance/CapCut.');
  };

  if (loading) return <div style={{ padding: 30, color: '#94a3b8' }}>⏳ Đang tải...</div>;

  return (
    <div style={{ padding: '8px 4px 40px', maxWidth: 1100, margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#1e293b' }}>🎨 Ảnh người mẫu cầm sản phẩm</h2>
        <p style={{ margin: '6px 0 0', color: '#475569', fontSize: '0.98rem', lineHeight: 1.65 }}>
          Mỗi brand up 1 mớ ảnh sản phẩm thật → bấm <b>1 nút</b> ra ảnh người mẫu ảo cầm + trưng bày cả bộ → tải về đem lên <b>Seedance</b> làm video (thêm giọng + lời thoại).
        </p>
      </div>

      {/* Brand selector */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        {rows.map(r => (
          <button key={r.brand} onClick={() => setSel(r.brand)}
            style={{ ...btn(r.brand === sel ? ACCENT : '#fff'), color: r.brand === sel ? '#fff' : '#475569', border: r.brand === sel ? 'none' : '1.5px solid #e2e8f0', padding: '9px 16px' }}>
            🏷️ {r.brand}
          </button>
        ))}
        <button onClick={addBrand} style={{ ...btn('#16a34a'), padding: '9px 16px' }}>➕ Thêm brand</button>
        {!rows.length && <span style={{ color: '#94a3b8' }}>Chưa có brand — bấm "Thêm brand".</span>}
      </div>

      {cur && (
        <>
          {/* Bước 1 — kho ảnh sản phẩm */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#fffdfb', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#0f172a' }}><span style={{ color: ACCENT }}>①</span> Ảnh sản phẩm brand {cur.brand} ({(cur.product_images || []).length})</span>
              <label style={{ ...btn('#0891b2'), padding: '9px 16px', cursor: busy === 'up' ? 'wait' : 'pointer', marginLeft: 'auto' }}>
                {busy === 'up' ? '⏳ đang up...' : '⬆️ Up ảnh sản phẩm (chọn nhiều)'}
                <input type="file" accept="image/*" multiple disabled={busy === 'up'} style={{ display: 'none' }} onChange={e => { const fs = e.target.files; e.target.value = ''; uploadImages(fs); }} />
              </label>
              <button onClick={delBrand} style={{ ...btn('#fff'), color: '#ef4444', border: '1.5px solid #fecaca', padding: '9px 14px' }}>🗑 Xoá brand</button>
            </div>
            <div style={{ padding: 18 }}>
              {(cur.product_images || []).length === 0
                ? <div style={{ color: '#94a3b8', fontSize: '0.92rem' }}>Chưa có ảnh. Bấm "Up ảnh sản phẩm" → chọn hết ảnh trong thư mục brand (Ctrl+A rồi mở).</div>
                : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 12 }}>
                    {(cur.product_images || []).map((img, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <img src={img.url} alt="" onClick={() => setBig(img.url)} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, border: '1px solid #e5e7eb', cursor: 'zoom-in' }} onError={e => { e.currentTarget.style.opacity = 0.3; }} />
                        <button onClick={() => removeImage(img)} title="Xoá" style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#dc2626', color: '#fff', fontSize: '0.7rem', cursor: 'pointer' }}>✕</button>
                      </div>
                    ))}
                  </div>}
            </div>
          </div>

          {/* Bước 2 — FORM làm prompt video (5 ô) */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#fffdfb', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#0f172a' }}><span style={{ color: ACCENT }}>②</span> Form làm prompt video (điền hoặc bấm ✨ AI)</span>
              <button onClick={suggestForm} disabled={busy === 'sug'} style={{ ...btn('#7c3aed'), padding: '9px 16px', marginLeft: 'auto', opacity: busy === 'sug' ? 0.6 : 1 }}>{busy === 'sug' ? '⏳ AI đang viết...' : '✨ AI viết giúp 5 ô'}</button>
            </div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { k: 'mo_ta', label: '1️⃣ Mô tả', ph: 'Bối cảnh + sản phẩm. VD: bộ chăm sóc da Milaganics thiên nhiên bày trên bàn gỗ, studio livestream sáng.', rows: 2 },
                { k: 'noi_dung', label: '2️⃣ Nội dung (điểm bán / ưu đãi)', ph: 'Ghi ý vào đây rồi bấm ✨. VD: ưu đãi phiên live, mua bộ giảm giá, freeship, thành phần thiên nhiên.', rows: 2 },
                { k: 'loi_thoai', label: '3️⃣ Lời thoại (voice-over — CapCut sẽ đọc)', ph: 'Đoạn host nói ~15 giây', rows: 3 },
                { k: 'goc_quay', label: '4️⃣ Góc quay', ph: 'VD: camera cố định, trung cảnh, không di chuyển', rows: 1 },
                { k: 'hanh_dong', label: '5️⃣ Hành động người', ph: 'VD: host nữ cầm từng sản phẩm đưa lên gần camera khoe nhãn rồi hạ xuống, mỉm cười thân thiện', rows: 2 },
              ].map(fld => (
                <div key={fld.k}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 800, color: '#334155', display: 'block', marginBottom: 5 }}>{fld.label}</label>
                  <textarea rows={fld.rows} style={{ ...inp, resize: 'vertical' }} placeholder={fld.ph}
                    value={(cur.vform || {})[fld.k] || ''} onChange={e => setVf(fld.k, e.target.value)} onBlur={saveVf} />
                </div>
              ))}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 800, color: '#334155', display: 'block', marginBottom: 5 }}>🎬 Prompt Seedance (ghép từ ô 1 + 4 + 5, có người cầm sản phẩm)</label>
                <textarea rows={3} style={{ ...inp, resize: 'vertical' }} value={cur.prompt || ''} onChange={e => patch(cur.brand, { prompt: e.target.value })} onBlur={() => persist({ prompt: cur.prompt })} />
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button onClick={buildPrompt} style={{ ...btn('#0ea5e9'), padding: '9px 14px', fontSize: '0.82rem' }}>🔧 Ghép prompt từ form</button>
                  <button onClick={() => copyTxt(cur.prompt, '📋 Copy prompt Seedance — dán vào Dreamina + kéo ảnh sản phẩm.')} style={{ ...btn('#7c3aed'), padding: '9px 14px', fontSize: '0.82rem' }}>📋 Copy prompt Seedance</button>
                  <button onClick={() => copyTxt((cur.vform || {}).loi_thoai, '📋 Copy lời thoại — dán vào CapCut Text-to-speech giọng Việt.')} style={{ ...btn('#16a34a'), padding: '9px 14px', fontSize: '0.82rem' }}>📋 Copy lời thoại</button>
                  <a href="https://dreamina.capcut.com" target="_blank" rel="noreferrer" style={{ ...btn('#334155'), padding: '9px 14px', fontSize: '0.82rem', textDecoration: 'none', display: 'inline-block' }}>🌐 Mở Dreamina</a>
                </div>
              </div>
            </div>
          </div>

          {/* Bước 3 (tuỳ chọn) — tạo ảnh bìa bằng OpenAI (Seedance chặn mặt nên ảnh này chủ yếu làm bìa) */}
          <div style={card}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#fffdfb', fontWeight: 900, fontSize: '1.1rem', color: '#0f172a' }}><span style={{ color: '#94a3b8' }}>③</span> (Tuỳ chọn) Tạo ảnh bìa người mẫu <span style={{ fontWeight: 500, fontSize: '0.82rem', color: '#94a3b8' }}>— dùng làm thumbnail; Seedance quay video thì dùng Form ② ở trên</span></div>
            <div style={{ padding: 18 }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 800, color: '#334155', display: 'block', marginBottom: 6 }}>Mô tả (prompt) — có mẫu sẵn, sửa nếu muốn</label>
              <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={cur.prompt || ''} onChange={e => patch(cur.brand, { prompt: e.target.value })} onBlur={() => persist({ prompt: cur.prompt })} />
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={genModelShot} disabled={busy === 'gen'} style={{ ...btn('#7c3aed'), padding: '13px 26px', fontSize: '1rem', opacity: busy === 'gen' ? 0.6 : 1 }}>
                  {busy === 'gen' ? '⏳ đang tạo ảnh...' : '🪄 Tạo ảnh người mẫu cầm sản phẩm'}
                </button>
                <button onClick={copyPrompt} style={{ ...btn('#64748b'), padding: '13px 18px' }}>📋 Copy prompt (làm tay)</button>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Nút 🪄 cần <code>OPENAI_API_KEY</code> đã cắm Vercel. Chưa có key → Copy prompt + kéo ảnh SP qua ChatGPT/Dreamina gen tay.</span>
              </div>
            </div>
          </div>

          {/* Bước 3 — ảnh đã tạo */}
          {(cur.gallery || []).length > 0 && (
            <div style={card}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#fffdfb', fontWeight: 900, fontSize: '1.1rem', color: '#0f172a' }}><span style={{ color: ACCENT }}>③</span> Ảnh đã tạo — tải về đem lên Seedance</div>
              <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 14 }}>
                {(cur.gallery || []).map((g, i) => (
                  <div key={i} style={{ border: '1px solid #eef0f3', borderRadius: 12, overflow: 'hidden' }}>
                    <img src={g.url} alt="" onClick={() => setBig(g.url)} style={{ width: '100%', display: 'block', cursor: 'zoom-in' }} />
                    <div style={{ padding: 8, display: 'flex', gap: 8 }}>
                      <a href={g.url} target="_blank" rel="noreferrer" download style={{ ...btn(ACCENT), padding: '7px 12px', fontSize: '0.8rem', textDecoration: 'none', flex: 1, textAlign: 'center' }}>⬇ Tải về</a>
                      <button onClick={() => persist({ gallery: (cur.gallery || []).filter((_, idx) => idx !== i) })} style={{ ...btn('#fff'), color: '#ef4444', border: '1.5px solid #fecaca', padding: '7px 10px' }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {big && (
        <div onClick={() => setBig(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <img src={big} alt="" style={{ maxWidth: '92vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}

      {status && <div style={{ position: 'sticky', bottom: 12, marginTop: 16, padding: '12px 18px', borderRadius: 12, fontWeight: 700, fontSize: '0.95rem', background: status.startsWith('❌') ? '#fef2f2' : '#f0fdf4', color: status.startsWith('❌') ? '#dc2626' : '#166534', border: `1.5px solid ${status.startsWith('❌') ? '#fecaca' : '#bbf7d0'}`, boxShadow: '0 6px 20px rgba(15,23,42,0.12)' }}>{status}</div>}
    </div>
  );
}
