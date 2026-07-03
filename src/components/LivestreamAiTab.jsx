// src/components/LivestreamAiTab.jsx
// Module 4 — Live AI: quản lý kho câu hỏi (intent) → clip trả lời cho Desktop Agent OBS.
// Thay việc sửa faq.json tay: CRUD intent trên Supabase, test nhận diện ngay trên web, xuất faq.json.
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';

// ── Bộ nhận diện — COPY Y HỆT livestream-ai/agent/src/intent.js để test khớp với agent thật ──
function removeDiacritics(str) {
  return String(str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}
const ABBR = {
  k: 'khong', ko: 'khong', kg: 'khong', hok: 'khong', khong: 'khong',
  bn: 'bao nhieu', bnhieu: 'bao nhieu', sp: 'san pham', shx: 'shop', sh: 'shop',
  ib: 'inbox', r: 'roi', dc: 'duoc', 'đc': 'duoc', vs: 'voi', vch: 'voucher', km: 'khuyen mai',
  m: 'may', j: 'gi', z: 'gi', mn: 'moi nguoi'
};
function normalize(text) {
  let t = removeDiacritics(String(text || '')).toLowerCase();
  t = t.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.split(' ').map((w) => ABBR[w] || w).join(' ');
}
function matchIntent(text, intents, minScore = 1) {
  const norm = normalize(text);
  if (!norm) return null;
  let best = null, bestScore = 0;
  for (const intent of intents) {
    let score = 0;
    for (const kw of intent.keywords || []) {
      const nkw = normalize(kw);
      if (!nkw) continue;
      if (norm === nkw || norm.includes(' ' + nkw + ' ') || norm.startsWith(nkw + ' ') || norm.endsWith(' ' + nkw) || norm.includes(nkw)) {
        score += nkw.includes(' ') ? 2 : 1;
      }
    }
    if (score > bestScore) { bestScore = score; best = intent; }
  }
  return (best && bestScore >= minScore) ? { intent: best, score: bestScore } : null;
}

const ACCENT = '#ff6a2c';
const slugify = (s) => removeDiacritics(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || ('q' + Date.now().toString(36));

export default function LivestreamAiTab() {
  const [intents, setIntents] = useState([]);
  const [config, setConfig] = useState({ cooldown_sec: 45, min_confidence: 1, max_queue: 3 });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [testText, setTestText] = useState('');
  // form thêm/sửa
  const empty = { id: '', label: '', keywords: '', clip: '', enabled: true };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: it }, { data: cf }] = await Promise.all([
      supabase.from('livestream_intents').select('*').order('sort_order', { ascending: true }),
      supabase.from('livestream_config').select('*').eq('id', 'default').maybeSingle(),
    ]);
    setIntents((it || []).map(r => ({ ...r, keywords: Array.isArray(r.keywords) ? r.keywords : [] })));
    if (cf) setConfig({ cooldown_sec: cf.cooldown_sec ?? 45, min_confidence: cf.min_confidence ?? 1, max_queue: cf.max_queue ?? 3 });
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const testResult = useMemo(() => {
    if (!testText.trim()) return null;
    const enabled = intents.filter(i => i.enabled);
    return matchIntent(testText, enabled, config.min_confidence || 1);
  }, [testText, intents, config.min_confidence]);

  const saveIntent = async () => {
    const label = form.label.trim();
    if (!label) { setStatus('❌ Nhập nhãn (tên câu hỏi).'); return; }
    const id = (form.id || '').trim() || slugify(label);
    const keywords = form.keywords.split(',').map(k => k.trim()).filter(Boolean);
    if (!keywords.length) { setStatus('❌ Nhập ít nhất 1 từ khoá (cách nhau dấu phẩy).'); return; }
    const row = {
      id, label, keywords, clip: form.clip.trim(), enabled: form.enabled,
      sort_order: editing ? (intents.find(i => i.id === id)?.sort_order ?? intents.length + 1) : intents.length + 1,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('livestream_intents').upsert(row, { onConflict: 'id' });
    if (error) { setStatus('❌ Lỗi lưu: ' + error.message); return; }
    setStatus(`✅ Đã lưu "${label}".`);
    setForm(empty); setEditing(false);
    await load();
  };

  const editIntent = (it) => {
    setForm({ id: it.id, label: it.label, keywords: (it.keywords || []).join(', '), clip: it.clip || '', enabled: it.enabled });
    setEditing(true); setStatus('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const delIntent = async (it) => {
    if (!window.confirm(`Xoá câu hỏi "${it.label}"?`)) return;
    const { error } = await supabase.from('livestream_intents').delete().eq('id', it.id);
    if (error) { setStatus('❌ Lỗi xoá: ' + error.message); return; }
    setStatus(`🗑️ Đã xoá "${it.label}".`); await load();
  };
  const toggleEnabled = async (it) => {
    await supabase.from('livestream_intents').update({ enabled: !it.enabled, updated_at: new Date().toISOString() }).eq('id', it.id);
    await load();
  };
  const saveConfig = async () => {
    const { error } = await supabase.from('livestream_config').upsert({ id: 'default', ...config, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    setStatus(error ? '❌ Lỗi lưu cài đặt: ' + error.message : '✅ Đã lưu cài đặt chung.');
  };

  // Xuất faq.json đúng format agent đọc
  const exportFaq = () => {
    const data = {
      _note: 'Xuất từ Live AI dashboard (koc-tool). Đặt file này vào livestream-ai/agent/faq.json.',
      intents: intents.filter(i => i.enabled).map(i => ({ id: i.id, label: i.label, keywords: i.keywords, clip: i.clip })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'faq.json'; a.click();
    URL.revokeObjectURL(url);
    setStatus('📥 Đã xuất faq.json — đặt vào thư mục agent, chạy lại agent là dùng.');
  };

  const card = { background: '#fff', borderRadius: 16, border: '1px solid #eee', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08)', padding: 22, marginBottom: 20 };
  const inp = { padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.88rem', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
  const lbl = { fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginBottom: 4, display: 'block' };
  const btn = (bg) => ({ padding: '9px 18px', borderRadius: 8, border: 'none', background: bg, color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' });
  const th = { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #eee', color: ACCENT, fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', background: '#f9fafb' };
  const td = { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem', color: '#374151', verticalAlign: 'top' };

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>
      <h1 className="page-header">🤖 Live AI — Kho câu hỏi & clip trả lời</h1>
      <p style={{ fontSize: '0.88rem', color: '#666', margin: '0 0 18px', lineHeight: 1.6 }}>
        Quản lý danh sách <b>câu hỏi thường gặp → clip trả lời</b> để Desktop Agent tự phát clip khi có người comment trong livestream Shopee.
        Sửa ở đây thay cho việc sửa file <code>faq.json</code> tay. Bấm <b>Xuất faq.json</b> rồi đặt vào thư mục <code>agent</code> là agent dùng được ngay.
      </p>

      {/* TEST NHẬN DIỆN */}
      <div style={card}>
        <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 10, fontSize: '1rem' }}>🧪 Test nhận diện câu hỏi</div>
        <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 10px' }}>Gõ thử 1 comment như người xem hỏi → xem agent sẽ chọn clip nào (dùng đúng bộ nhận diện thật).</p>
        <input style={inp} placeholder='VD: "gia bao nhieu shop oi", "ship bao lau z", "con size 39 ko"...' value={testText} onChange={e => setTestText(e.target.value)} />
        <div style={{ marginTop: 10, fontSize: '0.9rem' }}>
          {!testText.trim() ? <span style={{ color: '#94a3b8' }}>— Chưa gõ gì —</span>
            : testResult
              ? <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ Khớp: <b>{testResult.intent.label}</b> → phát clip <code>{testResult.intent.clip || '(chưa gán clip)'}</code> <span style={{ color: '#94a3b8', fontWeight: 400 }}>(điểm {testResult.score})</span></span>
              : <span style={{ color: '#dc2626', fontWeight: 700 }}>✗ Không khớp câu nào → agent IM LẶNG (an toàn, không phát nhầm)</span>}
        </div>
      </div>

      {/* FORM THÊM / SỬA */}
      <div style={card}>
        <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12, fontSize: '1rem' }}>{editing ? '✏️ Sửa câu hỏi' : '➕ Thêm câu hỏi mới'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div><label style={lbl}>Nhãn (tên câu hỏi) *</label><input style={inp} placeholder="VD: Hỏi giá" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} /></div>
          <div><label style={lbl}>Mã (slug) — để trống sẽ tự tạo</label><input style={{ ...inp, background: editing ? '#f1f5f9' : '#fff' }} placeholder="gia" value={form.id} disabled={editing} onChange={e => setForm({ ...form, id: e.target.value })} /></div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Từ khoá (cách nhau dấu phẩy — có dấu/không dấu đều được, hệ thống tự bỏ dấu)</label>
          <textarea style={{ ...inp, minHeight: 54, resize: 'vertical' }} placeholder="gia, bao nhieu, bn, nhieu tien, may xu" value={form.keywords} onChange={e => setForm({ ...form, keywords: e.target.value })} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Đường dẫn clip trả lời (.mp4 trên máy phát live — OBS đọc)</label>
          <input style={inp} placeholder="D:/live-clips/faq_gia.mp4" value={form.clip} onChange={e => setForm({ ...form, clip: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button style={btn(ACCENT)} onClick={saveIntent}>{editing ? '💾 Lưu thay đổi' : '➕ Thêm'}</button>
          {editing && <button style={{ ...btn('#94a3b8') }} onClick={() => { setForm(empty); setEditing(false); }}>Huỷ</button>}
        </div>
      </div>

      {/* DANH SÁCH INTENT */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>📋 Danh sách câu hỏi ({intents.length})</div>
          <button style={btn('#16a34a')} onClick={exportFaq}>📥 Xuất faq.json cho agent</button>
        </div>
        {loading ? <div style={{ color: '#94a3b8' }}>⏳ Đang tải...</div> : intents.length === 0 ? <div style={{ color: '#94a3b8' }}>Chưa có câu hỏi nào.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Bật</th><th style={th}>Nhãn</th><th style={th}>Từ khoá</th><th style={th}>Clip</th><th style={{ ...th, textAlign: 'right' }}>Sửa/Xoá</th>
              </tr></thead>
              <tbody>
                {intents.map(it => (
                  <tr key={it.id} style={{ opacity: it.enabled ? 1 : 0.5 }}>
                    <td style={td}><input type="checkbox" checked={it.enabled} onChange={() => toggleEnabled(it)} /></td>
                    <td style={{ ...td, fontWeight: 700, color: '#111' }}>{it.label}<div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 400 }}>{it.id}</div></td>
                    <td style={td}>{(it.keywords || []).map((k, i) => <span key={i} style={{ display: 'inline-block', background: '#fff4ec', color: '#c2410c', borderRadius: 6, padding: '1px 7px', margin: '2px 3px 2px 0', fontSize: '0.76rem' }}>{k}</span>)}</td>
                    <td style={{ ...td, fontSize: '0.78rem', color: it.clip ? '#334155' : '#dc2626', wordBreak: 'break-all' }}>{it.clip || '⚠️ chưa gán clip'}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => editIntent(it)} style={{ ...btn('#3b82f6'), padding: '5px 12px', marginRight: 6 }}>Sửa</button>
                      <button onClick={() => delIntent(it)} style={{ ...btn('#ef4444'), padding: '5px 12px' }}>Xoá</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CÀI ĐẶT CHUNG */}
      <div style={card}>
        <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12, fontSize: '1rem' }}>⚙️ Cài đặt chung (logic agent)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
          <div><label style={lbl}>Cooldown (giây) — không lặp lại cùng clip</label><input type="number" style={inp} value={config.cooldown_sec} onChange={e => setConfig({ ...config, cooldown_sec: Number(e.target.value) || 0 })} /></div>
          <div><label style={lbl}>Điểm khớp tối thiểu</label><input type="number" style={inp} value={config.min_confidence} onChange={e => setConfig({ ...config, min_confidence: Number(e.target.value) || 1 })} /></div>
          <div><label style={lbl}>Giới hạn hàng đợi</label><input type="number" style={inp} value={config.max_queue} onChange={e => setConfig({ ...config, max_queue: Number(e.target.value) || 1 })} /></div>
        </div>
        <button style={btn(ACCENT)} onClick={saveConfig}>💾 Lưu cài đặt</button>
      </div>

      {status && <div style={{ padding: '10px 16px', borderRadius: 10, fontWeight: 600, fontSize: '0.88rem', background: status.startsWith('❌') ? '#fef2f2' : '#f0fdf4', color: status.startsWith('❌') ? '#dc2626' : '#166534', border: `1px solid ${status.startsWith('❌') ? '#fecaca' : '#bbf7d0'}` }}>{status}</div>}
    </div>
  );
}
