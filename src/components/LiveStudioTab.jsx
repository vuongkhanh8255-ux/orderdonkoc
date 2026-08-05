// src/components/LiveStudioTab.jsx
// "Live AI Studio" — trung tâm điều khiển livestream AI (gói Module 4/5 + agent + OBS vào 1 màn pro).
// Miếng đầu (3/7): layout dark chuyên nghiệp + panel thật (Playlist clip, Kịch bản, Scene/Source, Điều khiển nhanh).
// Ô Preview OBS + Thống kê realtime = placeholder (Phase B — cần luồng OBS/Shopee). Nút điều khiển sẽ nối agent sau.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';

// Agent chạy NGAY TRÊN MÁY đang mở trang này (127.0.0.1). Chrome cho phép ws:// tới localhost
// kể cả khi trang là https, nên bấm nút trên web điều khiển được OBS của chính máy đó.
const AGENT_WS = 'ws://127.0.0.1:8787';

const C = { bg: '#0f1117', panel: '#181b24', panel2: '#1f2430', border: '#2a2f3d', text: '#e6e8ee', sub: '#8b93a7', accent: '#ff6a2c', good: '#22c55e', live: '#ef4444', purple: '#a855f7' };

export default function LiveStudioTab({ shop = 'chung' }) {
  const [clips, setClips] = useState([]);
  const [prod, setProd] = useState({});
  const [sel, setSel] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      // Chỉ lấy clip + kịch bản CỦA GIAN ĐANG CHỌN (Khánh 4/8) — ngày live mà lộn gian là phát nhầm nội dung
      const [{ data: it }, { data: pr }] = await Promise.all([
        supabase.from('livestream_intents').select('id,label,keywords,clip,enabled').eq('shop_key', shop).order('sort_order', { ascending: true }),
        supabase.from('livestream_clip_prod').select('intent_id,script,status').eq('shop_key', shop),
      ]);
      if (!alive) return;
      const pmap = {}; (pr || []).forEach(p => { pmap[p.intent_id] = p; });
      setClips(it || []); setProd(pmap); setSel((it || [])[0]?.id || null); setLoading(false);
    })();
    return () => { alive = false; };
  }, [shop]);

  // ── NỐI AGENT (4/8/2026) — nút bấm điều khiển OBS thật, không còn nút chết ──
  const [conn, setConn] = useState('dang');     // dang | ok | rot
  const [agentShop, setAgentShop] = useState('');
  const [playing, setPlaying] = useState(null); // intent đang phát
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState('');
  const wsRef = useRef(null);
  const retryRef = useRef(null);

  const addLog = useCallback((txt, mau) => {
    setLogs(l => [{ t: new Date().toLocaleTimeString('vi-VN'), txt, mau }, ...l].slice(0, 60));
  }, []);

  useEffect(() => {
    let huy = false;
    const noi = () => {
      if (huy) return;
      // Đóng socket cũ trước khi mở cái mới — nếu không, HMR/mount lại để sót socket đang mở,
      // nhật ký nhận 2 lần cùng 1 sự kiện (đã dính khi test 4/8).
      try { wsRef.current?.close(); } catch (e) {}
      wsRef.current = null;
      let ws;
      try { ws = new WebSocket(AGENT_WS); } catch (e) { setConn('rot'); return; }
      wsRef.current = ws;
      ws.onopen = () => { setConn('ok'); ws.send(JSON.stringify({ type: 'cmd', action: 'hello' })); };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.type === 'cmdres') {
          if (m.action === 'hello') { setAgentShop(m.shop || ''); setPlaying(null); }
          if (m.ok === false) addLog('❌ ' + (m.error || 'lỗi'), C.live);
          if (m.action === 'play' && m.ok) addLog('▶ Phát tay: ' + m.label, C.accent);
          if (m.action === 'stop' && m.ok) addLog('⏹ Đã dừng, về IDLE', C.sub);
          if (m.action === 'reload' && m.ok) addLog(`🔄 Nạp lại kho: ${m.n} câu`, C.good);
          setBusy('');
        } else if (m.type === 'log') {
          if (m.kind === 'play') { setPlaying(m.label); addLog(`▶ ${m.label}`, C.accent); }
          else if (m.kind === 'ended') { setPlaying(null); addLog('✔ Clip xong → IDLE', C.good); }
          else if (m.kind === 'stopped') { setPlaying(null); }
          else if (m.kind === 'skip') addLog(`· "${String(m.text).slice(0, 50)}" — không khớp câu nào`, C.sub);
          else if (m.kind === 'reload') addLog(`🔄 Kho câu hỏi cập nhật (${m.n} câu)`, C.good);
        }
      };
      // CHỈ dọn khi ĐÚNG socket này còn là socket hiện hành. React (dev) mount 2 lần: socket cũ
      // đóng SAU khi socket mới đã nối -> nếu xoá vô điều kiện là mất luôn kết nối tốt, badge báo
      // "đã nối" mà bấm nút lại kêu "chưa nối" (đã dính khi test 4/8).
      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        wsRef.current = null; setConn('rot');
        if (!huy) retryRef.current = setTimeout(noi, 4000);
      };
      ws.onerror = () => { try { ws.close(); } catch (e) {} };
    };
    noi();
    return () => { huy = true; clearTimeout(retryRef.current); try { wsRef.current?.close(); } catch (e) {} };
  }, [addLog]);

  const guiLenh = (action, extra = {}) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) { addLog('❌ Chưa nối được agent — mở agent trên máy này trước', C.live); return; }
    setBusy(action);
    ws.send(JSON.stringify({ type: 'cmd', action, ...extra }));
    setTimeout(() => setBusy(''), 4000);   // khỏi kẹt nút nếu agent im
  };

  const panel = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 };
  const head = { fontSize: '0.72rem', fontWeight: 800, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 };
  const badge = (bg, fg, txt) => <span style={{ background: bg, color: fg, borderRadius: 20, padding: '3px 11px', fontSize: '0.72rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 5 }}>{txt}</span>;
  const qbtn = (icon, label, onClick, disabled) => (
    <button onClick={onClick} disabled={disabled} title={disabled ? 'Chưa nối agent hoặc câu này chưa có clip' : label}
      style={{ background: disabled ? '#161a22' : C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 6px',
        color: disabled ? '#4b5566' : C.text, fontWeight: 700, fontSize: '0.76rem', cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, fontFamily: 'inherit', textAlign: 'center' }}>
      <span style={{ fontSize: '1.1rem' }}>{icon}</span>{label}
    </button>
  );
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
          {conn === 'ok'
            ? badge('#12291b', '#4ade80', '🟢 Đã nối agent' + (agentShop ? ` · ${agentShop}` : ''))
            : conn === 'dang'
              ? badge('#26221a', '#fbbf24', '⏳ Đang tìm agent...')
              : badge('#2a1a1a', '#f87171', '🔴 Chưa nối agent — mở agent trên máy này')}
          {playing
            ? badge('#2a1c10', '#fdba74', '▶ Đang phát: ' + playing)
            : badge('#1a1f2b', '#93a3bd', '⏸ Đang ở IDLE')}
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

          {/* ĐIỀU KHIỂN NHANH — bấm là chạy thật xuống OBS của máy này */}
          <div style={panel}>
            <div style={head}>Điều khiển nhanh
              <span style={{ color: C.sub, fontWeight: 400, textTransform: 'none' }}> · điều khiển OBS trên máy đang mở trang này</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {qbtn('▶', busy === 'play' ? 'Đang phát…' : 'Phát clip đang chọn', () => guiLenh('play', { intent_id: sel }), conn !== 'ok' || !sel || !selClip?.clip)}
              {qbtn('⏹', 'Dừng, về IDLE', () => guiLenh('stop'), conn !== 'ok')}
              {qbtn('🔄', busy === 'reload' ? 'Đang nạp…' : 'Nạp lại kho câu hỏi', () => guiLenh('reload'), conn !== 'ok')}
            </div>
            {conn !== 'ok' && (
              <div style={{ marginTop: 10, fontSize: '0.76rem', color: '#fca5a5', lineHeight: 1.6 }}>
                Chưa nối được agent. Mở agent trên <b>chính máy này</b> (thư mục <code>agent</code> → <code>npm start</code>) rồi chờ vài giây, nút sẽ tự sáng.
              </div>
            )}
            {conn === 'ok' && !selClip?.clip && (
              <div style={{ marginTop: 10, fontSize: '0.76rem', color: C.sub }}>
                Câu đang chọn chưa có clip — chọn câu khác trong Playlist bên trái, hoặc làm clip ở tab ② Xưởng Clip.
              </div>
            )}
          </div>

          {/* NHẬT KÝ CHẠY THẬT — agent bắn lên realtime */}
          <div style={panel}>
            <div style={head}>Nhật ký hoạt động <span style={{ color: C.sub, fontWeight: 400, textTransform: 'none' }}>· realtime từ agent</span></div>
            <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {logs.length === 0
                ? <div style={{ color: C.sub, fontSize: '0.8rem' }}>Chưa có hoạt động nào. Khi khách comment hoặc bạn bấm nút, sự kiện sẽ hiện ở đây.</div>
                : logs.map((l, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: '0.78rem', lineHeight: 1.5 }}>
                    <span style={{ color: C.sub, flex: 'none', fontFamily: 'monospace' }}>{l.t}</span>
                    <span style={{ color: l.mau || C.text }}>{l.txt}</span>
                  </div>
                ))}
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
        🧩 <b>Đã chạy được:</b> Playlist · Kịch bản · Điều khiển nhanh (phát/dừng/nạp lại) · Nhật ký realtime — đều nối thật xuống agent + OBS của máy này.
        <b> Chưa làm:</b> ô Preview màn OBS và Thống kê lượt xem/đơn (cần luồng OBS lên web + data realtime Shopee).
      </div>
    </div>
  );
}
