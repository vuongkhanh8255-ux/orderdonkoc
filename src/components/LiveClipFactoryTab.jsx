// src/components/LiveClipFactoryTab.jsx
// Module 5 — Xưởng Clip: dây chuyền sản xuất clip FAQ cho Live AI.
// Mỗi câu hỏi (intent) đi qua 4 bước: Kịch bản → Ảnh nhân vật → Video avatar → Clip cuối (đường dẫn OBS).
// Phase 1: chạy chế độ nhập/upload tay (dùng tài khoản web Gemini/GPT/HeyGen). API ráp sau.
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
        video_url: r.video_url, status: r.prod_status, updated_at: new Date().toISOString(),
      }, { onConflict: 'intent_id' }),
      supabase.from('livestream_intents').update({ clip: r.clip || '', updated_at: new Date().toISOString() }).eq('id', r.id),
    ]);
    setStatus((p1.error || p2.error) ? ('❌ Lỗi lưu: ' + (p1.error?.message || p2.error?.message)) : `✅ Đã lưu "${r.label}".`);
  };
  const copyTxt = (t) => { navigator.clipboard && navigator.clipboard.writeText(t || ''); setStatus('📋 Đã copy.'); };

  // ── TỰ ĐỘNG (Phase 2): OpenAI tạo ảnh, HeyGen tạo video, poll kiểm tra ──
  const genImageAuto = async (r) => {
    if (!r.img_prompt.trim()) { setStatus('❌ Cần prompt ảnh trước.'); return; }
    setBusy(`${r.id}:img`); setStatus('🪄 Đang tạo ảnh (OpenAI)... ~15-40s');
    const j = await callApi('live_gen_image', { intent_id: r.id, prompt: r.img_prompt });
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
    if (!r.image_url) { setStatus('❌ Cần ảnh nhân vật trước (bước ①).'); return; }
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

  const card = { background: '#fff', borderRadius: 14, border: '1px solid #eee', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', marginBottom: 14, overflow: 'hidden' };
  const inp = { padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.86rem', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
  const lbl = { fontSize: '0.76rem', fontWeight: 800, color: ACCENT, marginBottom: 5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.03em' };
  const btn = (bg) => ({ padding: '7px 14px', borderRadius: 8, border: 'none', background: bg, color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' });

  const doneCount = rows.filter(r => r.prod_status === 'xong').length;

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>
      <h1 className="page-header">🏭 Xưởng Clip — sản xuất video trả lời</h1>
      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '14px 18px', marginBottom: 18, fontSize: '0.86rem', color: '#7c2d12', lineHeight: 1.6 }}>
        <b>Dây chuyền 4 bước cho mỗi câu hỏi:</b><br />
        <b>1. Kịch bản</b> (avatar sẽ đọc) → <b>2. Ảnh nhân vật</b> cầm sản phẩm (copy prompt sang Gemini/GPT gen) → <b>3. Video avatar</b> (đưa ảnh + kịch bản qua HeyGen) → <b>4. Clip cuối</b> tải về máy phát live, điền <b>đường dẫn local</b> để OBS phát.<br />
        <span style={{ color: '#9a3412', fontWeight: 700 }}>⚠️ Ô "Clip cuối" phải là đường dẫn FILE TRÊN MÁY PHÁT LIVE</span> (VD <code>C:/live-clips/gia.mp4</code>) — chính là clip agent phát ở Module 4.
      </div>

      <div style={{ marginBottom: 12, fontSize: '0.9rem', color: '#475569', fontWeight: 600 }}>
        Tiến độ: <b style={{ color: ACCENT }}>{doneCount}/{rows.length}</b> clip xong
      </div>

      {loading ? <div style={{ color: '#94a3b8' }}>⏳ Đang tải...</div> : rows.map(r => {
        const st = STATUS[r.prod_status] || STATUS.todo;
        const open = openId === r.id;
        return (
          <div key={r.id} style={card}>
            <div onClick={() => setOpenId(open ? null : r.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', cursor: 'pointer', background: open ? '#fffaf6' : '#fff' }}>
              <span style={{ fontSize: '1.1rem' }}>{open ? '▼' : '▶'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{r.label}</div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{r.clip ? `🎬 ${r.clip}` : '⚠️ chưa có clip cuối'}</div>
              </div>
              <span style={{ background: st.bg, color: st.c, borderRadius: 20, padding: '3px 12px', fontSize: '0.76rem', fontWeight: 800 }}>{st.t}</span>
            </div>

            {open && (
              <div style={{ padding: '4px 18px 18px', borderTop: '1px solid #f1f5f9' }}>
                {/* B1 kịch bản */}
                <div style={{ marginTop: 14 }}>
                  <label style={lbl}>① Kịch bản (avatar đọc)</label>
                  <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={r.script} onChange={e => setField(r.id, 'script', e.target.value)} />
                  <button onClick={() => copyTxt(r.script)} style={{ ...btn('#64748b'), marginTop: 6, padding: '5px 12px', fontSize: '0.75rem' }}>📋 Copy kịch bản</button>
                </div>
                {/* B2 prompt ảnh */}
                <div style={{ marginTop: 14 }}>
                  <label style={lbl}>② Prompt tạo ảnh nhân vật (copy sang Gemini/GPT)</label>
                  <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={r.img_prompt} onChange={e => setField(r.id, 'img_prompt', e.target.value)} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => copyTxt(r.img_prompt)} style={{ ...btn('#64748b'), padding: '5px 12px', fontSize: '0.75rem' }}>📋 Copy prompt (làm tay)</button>
                    <button onClick={() => genImageAuto(r)} disabled={busy === `${r.id}:img`} style={{ ...btn('#7c3aed'), padding: '5px 12px', fontSize: '0.75rem', opacity: busy === `${r.id}:img` ? 0.6 : 1 }}>{busy === `${r.id}:img` ? '⏳ đang tạo...' : '🪄 Tạo ảnh tự động (OpenAI)'}</button>
                  </div>
                </div>
                {/* B2b link ảnh */}
                <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 320px' }}>
                    <label style={lbl}>Link ảnh nhân vật đã gen (dán vào)</label>
                    <input style={inp} placeholder="https://... (ảnh từ Gemini/GPT)" value={r.image_url} onChange={e => setField(r.id, 'image_url', e.target.value)} />
                  </div>
                  {r.image_url && <img src={r.image_url} alt="" style={{ height: 90, borderRadius: 8, border: '1px solid #e5e7eb', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />}
                </div>
                {/* B3 video */}
                <div style={{ marginTop: 14 }}>
                  <label style={lbl}>③ Video avatar (HeyGen)</label>
                  <input style={inp} placeholder="https://... (dán link, hoặc bấm Tạo video tự động)" value={r.video_url} onChange={e => setField(r.id, 'video_url', e.target.value)} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={() => makeVideoAuto(r)} disabled={busy === `${r.id}:vid`} style={{ ...btn('#7c3aed'), padding: '5px 12px', fontSize: '0.75rem', opacity: busy === `${r.id}:vid` ? 0.6 : 1 }}>{busy === `${r.id}:vid` ? '⏳ đang gửi...' : '🎬 Tạo video tự động (HeyGen)'}</button>
                    <button onClick={() => checkVideoAuto(r)} disabled={busy === `${r.id}:chk`} style={{ ...btn('#0891b2'), padding: '5px 12px', fontSize: '0.75rem', opacity: busy === `${r.id}:chk` ? 0.6 : 1 }}>{busy === `${r.id}:chk` ? '⏳...' : '🔄 Kiểm tra video'}</button>
                    {r.video_id && <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>id: {r.video_id.slice(0, 10)}…</span>}
                    {r.video_url && <a href={r.video_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: ACCENT, fontWeight: 700 }}>▶ Xem/tải video</a>}
                  </div>
                </div>
                {/* B4 clip cuoi */}
                <div style={{ marginTop: 14 }}>
                  <label style={lbl}>④ Clip cuối — ĐƯỜNG DẪN FILE trên máy phát live (OBS phát)</label>
                  <input style={{ ...inp, borderColor: r.clip ? '#86efac' : '#fecaca' }} placeholder="C:/live-clips/gia.mp4" value={r.clip || ''} onChange={e => setField(r.id, 'clip', e.target.value)} />
                </div>
                {/* trạng thái + lưu */}
                <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={r.prod_status} onChange={e => setField(r.id, 'prod_status', e.target.value)} style={{ ...inp, width: 'auto', padding: '7px 10px' }}>
                    <option value="todo">Chưa làm</option><option value="lam">Đang làm</option><option value="xong">Xong ✓</option>
                  </select>
                  <button onClick={() => saveRow(r)} style={btn(ACCENT)}>💾 Lưu bước này</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {rows.length === 0 && !loading && <div style={{ color: '#94a3b8' }}>Chưa có câu hỏi nào — vào <b>Module 4: Live AI</b> thêm câu hỏi trước.</div>}
      {status && <div style={{ position: 'sticky', bottom: 12, marginTop: 16, padding: '10px 16px', borderRadius: 10, fontWeight: 600, fontSize: '0.86rem', background: status.startsWith('❌') ? '#fef2f2' : '#f0fdf4', color: status.startsWith('❌') ? '#dc2626' : '#166534', border: `1px solid ${status.startsWith('❌') ? '#fecaca' : '#bbf7d0'}` }}>{status}</div>}
    </div>
  );
}
