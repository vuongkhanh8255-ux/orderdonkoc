// src/components/LiveClipFactoryTab.jsx
// Module 5 — Xưởng Clip: dây chuyền sản xuất clip FAQ cho Live AI.
// Mỗi câu hỏi (intent) đi qua 4 bước: Kịch bản → Ảnh nhân vật → Video avatar → Clip cuối (đường dẫn OBS).
// UI theo khối BƯỚC đánh số + chấm tiến độ ①②③④ trên từng thẻ — nhìn là biết câu nào xong tới đâu.
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

const ACCENT = '#ff6a2c';
const API = '/api/tiktok-shop/analytics';
const STATUS = { todo: { t: 'Chưa làm', c: '#94a3b8', bg: '#f1f5f9' }, lam: { t: 'Đang làm', c: '#b45309', bg: '#fffbeb' }, xong: { t: 'Xong ✓', c: '#166534', bg: '#f0fdf4' } };
const callApi = async (action, payload) => {
  try {
    const r = await fetch(`${API}?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const t = await r.text();
    try { return JSON.parse(t); } catch { return { ok: false, error: t.slice(0, 200) || ('HTTP ' + r.status) }; }
  } catch (e) { return { ok: false, error: 'Lỗi mạng: ' + e.message }; }
};

// ── design system dùng chung trong tab ──
const inp = { padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.95rem', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
const btn = (bg) => ({ padding: '10px 18px', borderRadius: 10, border: 'none', background: bg, color: '#fff', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit' });
const hintTxt = { fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.5 };

// Khối 1 bước: số tròn + tiêu đề to + hướng dẫn 1 dòng + nội dung
function StepBlock({ n, title, hint, color = ACCENT, children }) {
  return (
    <div style={{ marginTop: 14, border: '1.5px solid #f1f5f9', borderLeft: `4px solid ${color}`, borderRadius: 12, padding: '14px 16px', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 27, height: 27, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.88rem', flex: 'none' }}>{n}</span>
        <span style={{ fontWeight: 900, fontSize: '1.02rem', color: '#0f172a' }}>{title}</span>
      </div>
      {hint && <div style={{ ...hintTxt, margin: '5px 0 10px 37px' }}>{hint}</div>}
      {!hint && <div style={{ height: 10 }} />}
      {children}
    </div>
  );
}

export default function LiveClipFactoryTab() {
  const [rows, setRows] = useState([]);   // merge intents + prod
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState('');   // `${id}:${step}` khi đang gọi API
  const pollRef = useRef({});             // intent_id -> interval tự kiểm tra video
  useEffect(() => () => { Object.values(pollRef.current).forEach(clearInterval); }, []); // dọn khi rời tab

  const load = async () => {
    setLoading(true);
    const [{ data: intents }, { data: prod }] = await Promise.all([
      supabase.from('livestream_intents').select('id,label,keywords,clip,enabled').order('sort_order', { ascending: true }),
      supabase.from('livestream_clip_prod').select('*'),
    ]);
    const pmap = {}; (prod || []).forEach(p => { pmap[p.intent_id] = p; });
    setRows((intents || []).map(it => ({
      ...it,
      keywords: Array.isArray(it.keywords) ? it.keywords : [],
      script: pmap[it.id]?.script || '', img_prompt: pmap[it.id]?.img_prompt || '',
      product_image_url: pmap[it.id]?.product_image_url || '',
      image_url: pmap[it.id]?.image_url || '', video_url: pmap[it.id]?.video_url || '',
      video_id: pmap[it.id]?.video_id || '', voice_id: pmap[it.id]?.voice_id || '',
      prod_status: pmap[it.id]?.status || 'todo',
    })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setField = (id, field, val) => setRows(rs => rs.map(r => r.id === id ? { ...r, [field]: val } : r));

  const saveRow = async (r) => {
    const [p1, p2] = await Promise.all([
      supabase.from('livestream_clip_prod').upsert({
        intent_id: r.id, script: r.script, img_prompt: r.img_prompt, image_url: r.image_url,
        product_image_url: r.product_image_url || null,
        video_url: r.video_url, status: r.prod_status, updated_at: new Date().toISOString(),
      }, { onConflict: 'intent_id' }),
      supabase.from('livestream_intents').update({ clip: r.clip || '', updated_at: new Date().toISOString() }).eq('id', r.id),
    ]);
    setStatus((p1.error || p2.error) ? ('❌ Lỗi lưu: ' + (p1.error?.message || p2.error?.message)) : `✅ Đã lưu "${r.label}".`);
  };
  const copyTxt = (t) => { navigator.clipboard && navigator.clipboard.writeText(t || ''); setStatus('📋 Đã copy.'); };

  // ✨ AI viết giúp: yêu cầu thô → gpt-4o-mini viết kịch bản + prompt ảnh, điền vào ô cho user duyệt
  const suggestAuto = async (r) => {
    if (!String(r.idea || '').trim()) { setStatus('❌ Gõ yêu cầu thô trước (sản phẩm, giá, ưu đãi, tông giọng…).'); return; }
    if ((r.script.trim() || r.img_prompt.trim()) && !confirm('Ô kịch bản/prompt đang có nội dung — AI viết mới sẽ THAY THẾ. Tiếp tục?')) return;
    setBusy(`${r.id}:sug`); setStatus('✨ AI đang viết kịch bản + prompt ảnh... ~5-15s');
    const j = await callApi('live_suggest', { label: r.label, idea: r.idea });
    setBusy('');
    if (!j.ok) { setStatus('❌ ' + (j.error || 'Lỗi AI viết giúp')); return; }
    setField(r.id, 'script', j.script); setField(r.id, 'img_prompt', j.img_prompt);
    setStatus('✅ AI viết xong — đọc lại 2 ô, sửa ý nào chưa ưng rồi bấm 💾 Lưu bước này.');
  };

  // Up ảnh SẢN PHẨM THẬT lên kho (bucket live-assets, public) → lưu URL vào product_image_url
  const uploadProductImage = async (r, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setStatus('❌ Hãy chọn file ảnh.'); return; }
    setBusy(`${r.id}:pimg`); setStatus('⬆️ Đang up ảnh sản phẩm...');
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `prod/${r.id}_${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('live-assets').upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from('live-assets').getPublicUrl(path);
      setField(r.id, 'product_image_url', data.publicUrl);
      await supabase.from('livestream_clip_prod').upsert({ intent_id: r.id, product_image_url: data.publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'intent_id' });
      setStatus('✅ Đã up ảnh sản phẩm — bấm 🪄 Tạo ảnh là nhân vật cầm ĐÚNG sản phẩm này.');
    } catch (e) { setStatus('❌ Lỗi up ảnh sản phẩm: ' + e.message); }
    finally { setBusy(''); }
  };

  // Up ẢNH NHÂN VẬT có sẵn (làm tay, không cần AI) → live-assets (public) → điền image_url, HeyGen dùng luôn.
  const uploadCharImage = async (r, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setStatus('❌ Hãy chọn file ảnh.'); return; }
    setBusy(`${r.id}:cimg`); setStatus('⬆️ Đang up ảnh nhân vật...');
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `char/${r.id}_${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('live-assets').upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from('live-assets').getPublicUrl(path);
      setField(r.id, 'image_url', data.publicUrl);
      await supabase.from('livestream_clip_prod').upsert({ intent_id: r.id, image_url: data.publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'intent_id' });
      setStatus('✅ Đã up ảnh nhân vật — qua bước ③ bấm 🎬 tạo video là được (không cần OpenAI).');
    } catch (e) { setStatus('❌ Lỗi up ảnh nhân vật: ' + e.message); }
    finally { setBusy(''); }
  };

  // Up VIDEO mp4 làm từ Dreamina (Seedance/OmniHuman) → live-assets → điền video_url (lưu kho xem lại được)
  const uploadVideoFile = async (r, file) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) { setStatus('❌ Hãy chọn file video (mp4).'); return; }
    if (file.size > 45 * 1024 * 1024) { setStatus('❌ Video >45MB — nén nhỏ lại rồi up.'); return; }
    setBusy(`${r.id}:vup`); setStatus('⬆️ Đang up video...');
    try {
      const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
      const path = `vid/manual_${r.id}_${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('live-assets').upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from('live-assets').getPublicUrl(path);
      setField(r.id, 'video_url', data.publicUrl); setField(r.id, 'prod_status', 'xong');
      await supabase.from('livestream_clip_prod').upsert({ intent_id: r.id, video_url: data.publicUrl, status: 'xong', updated_at: new Date().toISOString() }, { onConflict: 'intent_id' });
      setStatus('✅ Đã up video vào kho — giờ tải về máy phát live rồi điền đường dẫn ở ④.');
    } catch (e) { setStatus('❌ Lỗi up video: ' + e.message); }
    finally { setBusy(''); }
  };
  // Action prompt chung để dán vào Dreamina (OmniHuman) cùng kịch bản
  const DREAMINA_ACTION = 'talks directly to camera with natural hand gestures, friendly smile, picks up the product bottle and points at its label while speaking';

  // ── TỰ ĐỘNG (Phase 2): OpenAI tạo ảnh, HeyGen tạo video, poll kiểm tra ──
  const genImageAuto = async (r) => {
    if (!r.img_prompt.trim()) { setStatus('❌ Cần prompt ảnh trước.'); return; }
    setBusy(`${r.id}:img`); setStatus('🪄 Đang tạo ảnh (OpenAI)... ~15-40s' + (r.product_image_url ? ' — ghép ảnh sản phẩm thật' : ''));
    const j = await callApi('live_gen_image', { intent_id: r.id, prompt: r.img_prompt, product_image_url: r.product_image_url || undefined });
    setBusy('');
    if (!j.ok) { setStatus('❌ ' + (j.error || 'Lỗi tạo ảnh')); return; }
    setField(r.id, 'image_url', j.image_url); setStatus('✅ Đã tạo ảnh xong.' + (j.warn ? ' ⚠️ ' + j.warn : ''));
  };
  // Nhận kết quả poll (dùng chung cho tự động + bấm tay). label = tên câu hỏi để thông báo không lẫn
  // khi nhiều clip render song song.
  const applyCheckResult = (id, j, label = '') => {
    const tag = label ? `"${label}" ` : '';
    if (j.status === 'completed' && j.video_url) {
      clearInterval(pollRef.current[id]); delete pollRef.current[id];
      setField(id, 'video_url', j.video_url); setField(id, 'prod_status', 'xong');
      setStatus('✅ Video ' + tag + 'xong!' + (j.stored ? ' (đã lưu link VĨNH VIỄN vào kho)' : '') + ' Tải về máy phát live rồi điền đường dẫn ở ④.' + (j.warn ? ' ⚠️ ' + j.warn : ''));
      return true;
    }
    if (j.status === 'failed') {
      clearInterval(pollRef.current[id]); delete pollRef.current[id];
      setStatus('❌ HeyGen render lỗi ' + tag + ': ' + (j.error || ''));
      return true;
    }
    return false;
  };
  // Tự kiểm tra mỗi 15s sau khi gửi render (tối đa ~10 phút) — khỏi bấm 🔄 tay
  const startAutoPoll = (id, video_id, label = '') => {
    clearInterval(pollRef.current[id]);
    let count = 0, errStreak = 0;
    const timer = setInterval(async () => {
      count++;
      const j = await callApi('live_check_video', { intent_id: id, video_id });
      // Bấm 🎬 lần nữa giữa chừng → interval mới thay thế; lượt poll CŨ đang bay về thì tự bỏ, kẻo giết
      // nhầm interval mới / ghi đè kết quả video mới bằng video cũ.
      if (pollRef.current[id] !== timer) return;
      if (j.ok === false && j.error && j.status !== 'failed') {
        // Lỗi API (key hỏng, mạng...) — chờ 3 lần liên tiếp mới dừng (1 lần có thể là mạng chớp)
        errStreak++;
        if (errStreak >= 3) { clearInterval(timer); delete pollRef.current[id]; setStatus('❌ Lỗi kiểm tra video ' + (label ? `"${label}" ` : '') + ': ' + j.error); }
        return;
      }
      errStreak = 0;
      if (applyCheckResult(id, j, label)) return;
      if (count >= 40) { clearInterval(timer); delete pollRef.current[id]; setStatus('⏳ Render lâu bất thường (>10 phút) — bấm "🔄 Kiểm tra video" tay sau nhé.'); }
    }, 15000);
    pollRef.current[id] = timer;
  };

  const makeVideoAuto = async (r) => {
    if (!r.image_url) { setStatus('❌ Cần ảnh nhân vật trước (bước ②).'); return; }
    if (!r.script.trim()) { setStatus('❌ Cần kịch bản trước.'); return; }
    setBusy(`${r.id}:vid`); setStatus('🎬 Đang gửi HeyGen tạo video...');
    const j = await callApi('live_make_video', { intent_id: r.id, image_url: r.image_url, script: r.script, voice_id: r.voice_id || undefined });
    setBusy('');
    if (!j.ok) { setStatus('❌ ' + (j.error || 'Lỗi tạo video')); return; }
    setField(r.id, 'video_id', j.video_id); if (j.voice_id) setField(r.id, 'voice_id', j.voice_id); setField(r.id, 'prod_status', 'lam');
    startAutoPoll(r.id, j.video_id, r.label);
    setStatus('⏳ HeyGen đang render (vài phút) — hệ thống TỰ kiểm tra mỗi 15 giây, xong sẽ báo.' + (j.warn ? ' ⚠️ ' + j.warn : ''));
  };
  const checkVideoAuto = async (r) => {
    if (!r.video_id) { setStatus('❌ Chưa có video_id (bấm "Tạo video" trước).'); return; }
    setBusy(`${r.id}:chk`); setStatus('🔄 Đang kiểm tra HeyGen...');
    const j = await callApi('live_check_video', { intent_id: r.id, video_id: r.video_id });
    setBusy('');
    if (!applyCheckResult(r.id, j, r.label)) setStatus(j.ok === false && j.error ? '❌ ' + j.error : `⏳ Đang render (${j.status || 'processing'})... đợi thêm rồi bấm kiểm tra lại.`);
  };

  const card = { background: '#fff', borderRadius: 16, border: '1px solid #eef0f3', boxShadow: '0 2px 8px rgba(15,23,42,0.06)', marginBottom: 14, overflow: 'hidden' };
  const doneCount = rows.filter(r => r.prod_status === 'xong').length;
  const pct = rows.length ? Math.round(doneCount / rows.length * 100) : 0;

  return (
    <div style={{ padding: '8px 4px 40px', maxWidth: 1100, margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>
      {/* Tiêu đề + mô tả to rõ */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#1e293b' }}>🏭 Bước 2 — Xưởng Clip</h2>
        <p style={{ margin: '6px 0 0', color: '#475569', fontSize: '0.98rem', lineHeight: 1.65 }}>
          Mỗi câu hỏi làm 1 video trả lời, đi qua 4 bước. <b>Cách làm:</b> ghi đại ý → bấm ✨ AI viết → 🪄 tạo ảnh → 📋 lấy prompt <b>tự đi gen clip</b> (Dreamina/Seedance) → dán/Up clip vô ③ → điền đường dẫn ở ④.
        </p>
      </div>

      {/* Dải tiến độ tổng */}
      <div style={{ ...card, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: '1 1 420px', alignItems: 'center' }}>
          {['① Kịch bản', '② Ảnh nhân vật', '③ Video avatar', '④ Clip cuối'].map((t, i) => (
            <React.Fragment key={t}>
              <span style={{ background: '#fff4ec', color: '#c2410c', borderRadius: 20, padding: '6px 14px', fontSize: '0.85rem', fontWeight: 800 }}>{t}</span>
              {i < 3 && <span style={{ color: '#cbd5e1', fontWeight: 900 }}>→</span>}
            </React.Fragment>
          ))}
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 800, color: '#475569', marginBottom: 5 }}>
            <span>Tiến độ</span><span style={{ color: ACCENT }}>{doneCount}/{rows.length} clip xong</span>
          </div>
          <div style={{ height: 10, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: pct + '%', height: '100%', background: `linear-gradient(90deg,#fb923c,${ACCENT})`, borderRadius: 6, transition: 'width .4s' }} />
          </div>
        </div>
      </div>

      {loading ? <div style={{ color: '#94a3b8', padding: 20 }}>⏳ Đang tải...</div> : rows.map(r => {
        const st = STATUS[r.prod_status] || STATUS.todo;
        const open = openId === r.id;
        // 4 chấm bước: xanh khi bước đó có dữ liệu
        const dots = [
          { t: '①', done: !!r.script.trim(), tip: 'Kịch bản' },
          { t: '②', done: !!r.image_url, tip: 'Ảnh nhân vật' },
          { t: '③', done: !!r.video_url, tip: 'Video' },
          { t: '④', done: !!String(r.clip || '').trim(), tip: 'Clip cuối' },
        ];
        return (
          <div key={r.id} style={card}>
            <div onClick={() => setOpenId(open ? null : r.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 20px', cursor: 'pointer', background: open ? '#fffaf6' : '#fff', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1rem', color: '#94a3b8' }}>{open ? '▼' : '▶'}</span>
              <div style={{ flex: '1 1 200px', minWidth: 160 }}>
                <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '1.05rem' }}>{r.label}</div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8', wordBreak: 'break-all' }}>{r.clip ? `🎬 ${r.clip}` : '⚠️ chưa có đường dẫn clip cuối'}</div>
              </div>
              <div style={{ display: 'flex', gap: 5, flex: 'none' }} title="4 bước: xanh = đã có dữ liệu">
                {dots.map(d => (
                  <span key={d.t} title={`${d.t} ${d.tip}: ${d.done ? 'đã có ✓' : 'chưa có'}`}
                    style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 900, background: d.done ? '#dcfce7' : '#f1f5f9', color: d.done ? '#166534' : '#cbd5e1', border: `1.5px solid ${d.done ? '#86efac' : '#e2e8f0'}` }}>
                    {d.t}
                  </span>
                ))}
              </div>
              <span style={{ background: st.bg, color: st.c, borderRadius: 20, padding: '5px 14px', fontSize: '0.82rem', fontWeight: 800, flex: 'none' }}>{st.t}</span>
            </div>

            {open && (
              <div style={{ padding: '4px 20px 20px', borderTop: '1px solid #f1f5f9', background: '#fcfcfd' }}>
                {/* ✨ AI viết giúp — con đường nhanh nhất */}
                <div style={{ marginTop: 14, background: '#faf5ff', border: '1.5px dashed #d8b4fe', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontWeight: 900, fontSize: '0.98rem', color: '#7c3aed', marginBottom: 4 }}>✨ Làm nhanh: ghi đại ý — AI viết kịch bản + prompt ảnh cho</div>
                  <div style={{ ...hintTxt, marginBottom: 8 }}>Ghi sản phẩm + giá + ưu đãi + tông giọng. AI sẽ điền vào ô ① và ② bên dưới, mày đọc lại rồi sửa.</div>
                  <textarea style={{ ...inp, minHeight: 52, resize: 'vertical' }} placeholder='VD: "xịt thơm Bodymiss 99k, mua 2 giảm 50%, freeship, tông vui tươi trẻ trung"'
                    value={r.idea || ''} onChange={e => setField(r.id, 'idea', e.target.value)} />
                  <button onClick={() => suggestAuto(r)} disabled={busy === `${r.id}:sug`}
                    style={{ ...btn('#7c3aed'), marginTop: 8, opacity: busy === `${r.id}:sug` ? 0.6 : 1 }}>
                    {busy === `${r.id}:sug` ? '⏳ AI đang viết...' : '✨ AI viết giúp (điền vào ① và ②)'}
                  </button>
                </div>

                {/* ① Kịch bản */}
                <StepBlock n="1" title="Kịch bản — avatar đọc nguyên văn" hint="60-120 chữ (~20-40 giây). Viết như đang nói chuyện với người xem.">
                  <textarea style={{ ...inp, minHeight: 76, resize: 'vertical' }} value={r.script} onChange={e => setField(r.id, 'script', e.target.value)} />
                  <button onClick={() => copyTxt(r.script)} style={{ ...btn('#64748b'), marginTop: 8, padding: '7px 14px', fontSize: '0.8rem' }}>📋 Copy kịch bản</button>
                </StepBlock>

                {/* ② Ảnh nhân vật (gồm ảnh SP thật + prompt + kết quả) */}
                <StepBlock n="2" title="Ảnh nhân vật cầm sản phẩm" hint="Up ảnh sản phẩm thật (nếu có) → mô tả nhân vật → bấm 🪄. Không có key thì copy prompt qua ChatGPT/Gemini gen tay rồi dán link vào.">
                  {/* 2a ảnh SP thật */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
                    <div style={{ flex: '1 1 300px' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#334155', marginBottom: 6 }}>📦 Ảnh sản phẩm thật <span style={{ fontWeight: 500, color: '#94a3b8' }}>(không bắt buộc — có thì ghép ĐÚNG sản phẩm vào tay nhân vật)</span></div>
                      <input style={inp} placeholder="https://... (dán link, hoặc bấm Up ảnh)" value={r.product_image_url || ''} onChange={e => setField(r.id, 'product_image_url', e.target.value)} />
                      <label style={{ ...btn('#0891b2'), padding: '7px 14px', fontSize: '0.8rem', display: 'inline-block', marginTop: 8, cursor: busy === `${r.id}:pimg` ? 'wait' : 'pointer' }}>
                        {busy === `${r.id}:pimg` ? '⏳ đang up...' : '⬆️ Up ảnh sản phẩm'}
                        <input type="file" accept="image/*" disabled={busy === `${r.id}:pimg`} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadProductImage(r, f); }} />
                      </label>
                    </div>
                    {r.product_image_url && <img src={r.product_image_url} alt="" style={{ height: 88, borderRadius: 10, border: '1px solid #e5e7eb', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />}
                  </div>
                  {/* 2b prompt */}
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#334155', marginBottom: 6 }}>🎨 Mô tả nhân vật (prompt)</div>
                  <textarea style={{ ...inp, minHeight: 64, resize: 'vertical' }} value={r.img_prompt} onChange={e => setField(r.id, 'img_prompt', e.target.value)} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => genImageAuto(r)} disabled={busy === `${r.id}:img`} style={{ ...btn('#7c3aed'), opacity: busy === `${r.id}:img` ? 0.6 : 1 }}>{busy === `${r.id}:img` ? '⏳ đang tạo ảnh...' : '🪄 Tạo ảnh tự động (OpenAI)'}</button>
                    <button onClick={() => copyTxt(r.img_prompt)} style={{ ...btn('#64748b'), padding: '10px 14px', fontSize: '0.8rem' }}>📋 Copy prompt (làm tay)</button>
                  </div>
                  {/* 2c kết quả ảnh */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 12 }}>
                    <div style={{ flex: '1 1 300px' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#334155', marginBottom: 6 }}>🖼️ Ảnh nhân vật (dùng cho video) — bấm 🪄 (AI), hoặc dán link, hoặc <b>Up ảnh có sẵn</b></div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input style={{ ...inp, flex: 1 }} placeholder="https://... (dán link ảnh)" value={r.image_url} onChange={e => setField(r.id, 'image_url', e.target.value)} />
                        <label style={{ ...btn('#0891b2'), padding: '10px 14px', fontSize: '0.8rem', cursor: busy === `${r.id}:cimg` ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: busy === `${r.id}:cimg` ? 0.6 : 1 }}>
                          {busy === `${r.id}:cimg` ? '⏳...' : '⬆️ Up ảnh'}
                          <input type="file" accept="image/*" disabled={busy === `${r.id}:cimg`} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadCharImage(r, f); }} />
                        </label>
                      </div>
                    </div>
                    {r.image_url && <img src={r.image_url} alt="" style={{ height: 88, borderRadius: 10, border: '1px solid #e5e7eb', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />}
                  </div>
                </StepBlock>

                {/* ③ Video — GỌN: lấy prompt → tự đi gen (Dreamina/Seedance) → dán/up clip vô. Không còn HeyGen trên UI. */}
                <StepBlock n="3" title="Video — lấy prompt đi gen, xong dán clip vào" hint="Bấm 📋 lấy prompt (kịch bản + cử động) → qua Dreamina/Seedance up ảnh ② + dán prompt → gen xong tải mp4 → Up hoặc dán link vào đây.">
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={() => copyTxt(`${r.script || ''}\n\nAction (cử động): ${DREAMINA_ACTION}`)} style={{ ...btn('#7c3aed') }}>📋 Lấy prompt làm video</button>
                    <a href="https://dreamina.capcut.com" target="_blank" rel="noreferrer" style={{ ...btn('#0ea5e9'), padding: '10px 14px', fontSize: '0.8rem', textDecoration: 'none', display: 'inline-block' }}>🌐 Mở Dreamina</a>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={{ ...inp, flex: 1 }} placeholder="https://... (dán link clip, hoặc bấm Up video)" value={r.video_url} onChange={e => setField(r.id, 'video_url', e.target.value)} />
                    <label style={{ ...btn('#16a34a'), padding: '10px 14px', fontSize: '0.8rem', cursor: busy === `${r.id}:vup` ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: busy === `${r.id}:vup` ? 0.6 : 1 }}>
                      {busy === `${r.id}:vup` ? '⏳...' : '⬆️ Up video (mp4)'}
                      <input type="file" accept="video/mp4,video/*" disabled={busy === `${r.id}:vup`} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadVideoFile(r, f); }} />
                    </label>
                  </div>
                  {r.video_url && <div style={{ marginTop: 8 }}><a href={r.video_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.88rem', color: ACCENT, fontWeight: 800 }}>▶ Xem / tải video</a></div>}
                </StepBlock>

                {/* ④ Clip cuối */}
                <StepBlock n="4" title="Clip cuối — đường dẫn file trên MÁY PHÁT LIVE" color={r.clip ? '#16a34a' : '#dc2626'}
                  hint="Tải video ở ③ về máy chạy OBS, lưu vào thư mục cố định, rồi điền đường dẫn file vào đây. Đây chính là clip máy sẽ phát khi có người hỏi.">
                  <input style={{ ...inp, borderColor: r.clip ? '#86efac' : '#fecaca', fontWeight: 700 }} placeholder="C:/live-clips/gia.mp4" value={r.clip || ''} onChange={e => setField(r.id, 'clip', e.target.value)} />
                </StepBlock>

                {/* lưu */}
                <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={() => saveRow(r)} style={{ ...btn(ACCENT), padding: '13px 28px', fontSize: '1rem' }}>💾 Lưu bước này</button>
                  <select value={r.prod_status} onChange={e => setField(r.id, 'prod_status', e.target.value)} style={{ ...inp, width: 'auto', padding: '10px 12px' }}>
                    <option value="todo">Chưa làm</option><option value="lam">Đang làm</option><option value="xong">Xong ✓</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {rows.length === 0 && !loading && <div style={{ color: '#94a3b8', padding: 20, fontSize: '0.95rem' }}>Chưa có câu hỏi nào — qua tab <b>① Kho câu hỏi</b> thêm trước.</div>}
      {status && <div style={{ position: 'sticky', bottom: 12, marginTop: 16, padding: '12px 18px', borderRadius: 12, fontWeight: 700, fontSize: '0.95rem', background: status.startsWith('❌') ? '#fef2f2' : '#f0fdf4', color: status.startsWith('❌') ? '#dc2626' : '#166534', border: `1.5px solid ${status.startsWith('❌') ? '#fecaca' : '#bbf7d0'}`, boxShadow: '0 6px 20px rgba(15,23,42,0.12)' }}>{status}</div>}
    </div>
  );
}
