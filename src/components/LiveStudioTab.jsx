// src/components/LiveStudioTab.jsx
// "Live AI Studio" — trung tâm điều khiển livestream AI (gói Module 4/5 + agent + OBS vào 1 màn pro).
// Miếng đầu (3/7): layout dark chuyên nghiệp + panel thật (Playlist clip, Kịch bản, Scene/Source, Điều khiển nhanh).
// Ô Preview OBS + Thống kê realtime = placeholder (Phase B — cần luồng OBS/Shopee). Nút điều khiển sẽ nối agent sau.
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const C = { bg: '#0f1117', panel: '#181b24', panel2: '#1f2430', border: '#2a2f3d', text: '#e6e8ee', sub: '#8b93a7', accent: '#ff6a2c', good: '#22c55e', live: '#ef4444', purple: '#a855f7' };

export default function LiveStudioTab() {
  const [clips, setClips] = useState([]);
  const [prod, setProd] = useState({});
  const [sel, setSel] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: it }, { data: pr }] = await Promise.all([
        supabase.from('livestream_intents').select('id,label,keywords,clip,enabled').order('sort_order', { ascending: true }),
        supabase.from('livestream_clip_prod').select('intent_id,script,status'),
      ]);
      const pmap = {}; (pr || []).forEach(p => { pmap[p.intent_id] = p; });
      setClips(it || []); setProd(pmap); setSel((it || [])[0]?.id || null); setLoading(false);
    })();
  }, []);

  const panel = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 };
  const head = { fontSize: '0.72rem', fontWeight: 800, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 };
  const badge = (bg, fg, txt) => <span style={{ background: bg, color: fg, borderRadius: 20, padding: '3px 11px', fontSize: '0.72rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 5 }}>{txt}</span>;
  const qbtn = (icon, label) => <button style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 6px', color: C.text, fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}><span style={{ fontSize: '1.1rem' }}>{icon}</span>{label}</button>;
  const selClip = clips.find(c => c.id === sel);
  const selScript = prod[sel]?.script || '';
  const doneClips = clips.filter(c => c.clip).length;

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100%', margin: '-20px', padding: 20, fontFamily: 'Outfit, sans-serif' }}>
      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: '1.15rem', fontWeight: 900, color: C.text }}>🎛️ Live AI Studio</div>
          <span style={{ color: C.sub, fontSize: '0.85rem' }}>Phiên: <b style={{ color: C.text }}>Chưa bắt đầu</b></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {badge('#3a2a1a', '#fbbf24', '⏻ OBS: chưa nối (Phase B)')}
          {badge('#2a1a1a', '#f87171', '● Chưa LIVE')}
          <span style={{ color: C.sub, fontSize: '0.82rem' }}>⏱ 00:00:00</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        {/* CỘT TRÁI */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* PREVIEW (placeholder Phase B) */}
          <div style={panel}>
            <div style={head}>Preview (OBS Program)</div>
            <div style={{ aspectRatio: '16 / 9', background: '#0a0c12', border: `1px dashed ${C.border}`, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.sub }}>
              <div style={{ fontSize: '2.4rem' }}>🎥</div>
              <div style={{ fontWeight: 700 }}>Preview màn OBS sẽ hiện ở đây</div>
              <div style={{ fontSize: '0.78rem' }}>Phase B — cần bắt luồng OBS đẩy lên web (WebRTC/virtual-cam)</div>
            </div>
          </div>

          {/* PLAYLIST — clip THẬT */}
          <div style={panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ ...head, marginBottom: 0 }}>Playlist clip trả lời ({clips.length})</div>
              <span style={{ fontSize: '0.75rem', color: C.sub }}>Sẵn sàng: <b style={{ color: C.good }}>{doneClips}/{clips.length}</b></span>
            </div>
            {loading ? <div style={{ color: C.sub }}>⏳ Đang tải...</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead><tr style={{ color: C.sub, fontSize: '0.7rem', textTransform: 'uppercase' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>#</th><th style={{ textAlign: 'left', padding: '6px 8px' }}>Câu hỏi</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Clip</th><th style={{ textAlign: 'center', padding: '6px 8px' }}>TT</th>
                  </tr></thead>
                  <tbody>
                    {clips.map((c, i) => (
                      <tr key={c.id} onClick={() => setSel(c.id)} style={{ cursor: 'pointer', background: sel === c.id ? C.panel2 : 'transparent', borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: '9px 8px', color: C.sub, fontWeight: 700 }}>{i + 1}</td>
                        <td style={{ padding: '9px 8px', fontWeight: 700 }}>{c.label}<div style={{ fontSize: '0.68rem', color: C.sub, fontWeight: 400 }}>{(c.keywords || []).slice(0, 3).join(' · ')}</div></td>
                        <td style={{ padding: '9px 8px', fontSize: '0.74rem', color: c.clip ? '#93c5fd' : C.live, wordBreak: 'break-all' }}>{c.clip || '⚠️ chưa có'}</td>
                        <td style={{ padding: '9px 8px', textAlign: 'center' }}>{c.clip ? badge('#12301c', C.good, 'Sẵn') : badge('#301212', '#f87171', 'Thiếu')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* NHẬT KÝ (placeholder) */}
          <div style={panel}>
            <div style={head}>Nhật ký hoạt động</div>
            <div style={{ color: C.sub, fontSize: '0.82rem', lineHeight: 1.9 }}>
              <div>— Log realtime sẽ hiện khi agent chạy (Phase kế: agent ghi log về Supabase).</div>
            </div>
          </div>
        </div>

        {/* CỘT PHẢI */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* SCENE / SOURCE */}
          <div style={panel}>
            <div style={head}>Scene &amp; Nguồn (OBS)</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <span style={{ flex: 1, textAlign: 'center', padding: '8px', borderRadius: 8, background: C.panel2, border: `1px solid ${C.border}`, fontWeight: 700, fontSize: '0.82rem' }}>🟢 IDLE</span>
              <span style={{ flex: 1, textAlign: 'center', padding: '8px', borderRadius: 8, background: 'rgba(168,85,247,0.15)', border: `1px solid ${C.purple}`, color: '#d8b4fe', fontWeight: 700, fontSize: '0.82rem' }}>ANSWER</span>
            </div>
            {['ANSWER_PLAYER (clip trả lời)', 'IDLE playlist'].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 4px', borderTop: i ? `1px solid ${C.border}` : 'none', fontSize: '0.82rem' }}>
                <span style={{ color: C.good }}>▸</span><span style={{ flex: 1 }}>{s}</span><span style={{ color: C.sub }}>👁</span>
              </div>
            ))}
          </div>

          {/* ĐIỀU KHIỂN NHANH */}
          <div style={panel}>
            <div style={head}>Điều khiển nhanh <span style={{ color: C.sub, fontWeight: 400, textTransform: 'none' }}>· nối agent ở phase kế</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {qbtn('⏭', 'Clip kế')}{qbtn('⏮', 'Clip trước')}{qbtn('⏸', 'Tạm dừng')}
              {qbtn('🎬', 'Đổi scene')}{qbtn('🔤', 'Hiện text')}{qbtn('🔄', 'Tải Media')}
            </div>
          </div>

          {/* KỊCH BẢN clip đang chọn */}
          <div style={panel}>
            <div style={head}>Kịch bản — {selClip?.label || '—'}</div>
            <div style={{ background: C.panel2, borderRadius: 10, padding: 12, fontSize: '0.85rem', color: C.text, lineHeight: 1.7, minHeight: 70 }}>
              {selScript || <span style={{ color: C.sub }}>Chưa có kịch bản (làm ở Module 5 — Xưởng Clip).</span>}
            </div>
          </div>

          {/* THỐNG KÊ (placeholder) */}
          <div style={panel}>
            <div style={head}>Thống kê phiên live <span style={{ color: C.sub, fontWeight: 400, textTransform: 'none' }}>· Phase B</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, textAlign: 'center' }}>
              {[['Lượt xem', '—'], ['Thích', '—'], ['Bình luận', '—'], ['Đơn', '—']].map(([l, v]) => (
                <div key={l} style={{ background: C.panel2, borderRadius: 10, padding: '10px 4px' }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 900 }}>{v}</div>
                  <div style={{ fontSize: '0.68rem', color: C.sub }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: '0.74rem', color: C.sub }}>Cần data Shopee Live realtime (nửa "vào" — đang giải).</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(255,106,44,0.08)', border: `1px solid ${C.accent}55`, borderRadius: 12, fontSize: '0.82rem', color: '#fbbf24' }}>
        🧩 <b>Miếng 1/nhiều:</b> giao diện Studio + Playlist/Kịch bản thật đã dựng. Miếng kế: (1) agent ghi trạng thái + nghe lệnh để nút "Điều khiển nhanh" bấm được thật; (2) Preview OBS; (3) thống kê Shopee realtime.
      </div>
    </div>
  );
}
