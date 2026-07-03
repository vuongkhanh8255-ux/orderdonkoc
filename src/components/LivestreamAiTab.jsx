// src/components/LivestreamAiTab.jsx
// Module 4 — Live AI: quản lý kho câu hỏi (intent) → clip trả lời cho Desktop Agent OBS.
// Thay việc sửa faq.json tay: CRUD intent trên Supabase, test nhận diện ngay trên web, xuất faq.json.
// UI thiết kế theo BƯỚC (A thêm → B danh sách → C test) — chữ to, mỗi khu có hướng dẫn ngay tại chỗ.
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

// ── design system dùng chung trong tab ──
const card = { background: '#fff', borderRadius: 16, border: '1px solid #eef0f3', boxShadow: '0 2px 8px rgba(15,23,42,0.06)', marginBottom: 18, overflow: 'hidden' };
const inp = { padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.95rem', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
const lbl = { fontSize: '0.85rem', fontWeight: 800, color: '#334155', marginBottom: 6, display: 'block' };
const hintTxt = { fontSize: '0.8rem', color: '#94a3b8', marginTop: 5, lineHeight: 1.5 };
const btn = (bg) => ({ padding: '12px 24px', borderRadius: 10, border: 'none', background: bg, color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit' });

// Header khu vực: chữ cái bước + tiêu đề to + hướng dẫn 1 dòng
function SecHead({ badge, icon, title, hint, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#fffdfb', flexWrap: 'wrap' }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, background: '#fff4ec', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flex: 'none' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontWeight: 900, fontSize: '1.12rem', color: '#0f172a' }}>{badge && <span style={{ color: ACCENT, marginRight: 8 }}>{badge}</span>}{title}</div>
        {hint && <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 2, lineHeight: 1.5 }}>{hint}</div>}
      </div>
      {right}
    </div>
  );
}

export default function LivestreamAiTab() {
  const [intents, setIntents] = useState([]);
  const [config, setConfig] = useState({ cooldown_sec: 45, min_confidence: 1, max_queue: 3 });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [testText, setTestText] = useState('');
  const [showAdv, setShowAdv] = useState(false); // cài đặt nâng cao — gấp lại cho đỡ rối
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

  // Xuất faq.json đúng format agent đọc (dự phòng — agent giờ đọc thẳng Supabase)
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

  return (
    <div style={{ padding: '8px 4px 40px', maxWidth: 1100, margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>
      {/* Tiêu đề + hướng dẫn to rõ */}
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#1e293b' }}>📝 Bước 1 — Kho câu hỏi</h2>
        <p style={{ margin: '6px 0 0', color: '#475569', fontSize: '0.98rem', lineHeight: 1.65 }}>
          Khai báo <b>các câu người xem hay hỏi khi live</b> (giá? ship? size? voucher?…) + từ khoá để máy nhận diện.
          Làm xong qua tab <b>② Xưởng Clip</b> để sản xuất video trả lời cho từng câu.
        </p>
      </div>

      {/* A — THÊM / SỬA */}
      <div style={card}>
        <SecHead badge="A" icon={editing ? '✏️' : '➕'} title={editing ? `Sửa câu hỏi "${form.label}"` : 'Thêm câu hỏi mới'}
          hint="Chỉ cần Tên + Từ khoá là thêm được. Đường dẫn clip có thể để trống — làm video xong bên Xưởng Clip nó tự điền." />
        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Tên câu hỏi *</label>
              <input style={inp} placeholder="VD: Hỏi giá" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} />
            </div>
            <div>
              <label style={lbl}>Mã (để trống sẽ tự tạo)</label>
              <input style={{ ...inp, background: editing ? '#f1f5f9' : '#fff' }} placeholder="gia" value={form.id} disabled={editing} onChange={e => setForm({ ...form, id: e.target.value })} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Từ khoá nhận diện *</label>
            <textarea style={{ ...inp, minHeight: 58, resize: 'vertical' }} placeholder="gia, bao nhieu, bn, nhieu tien, may xu" value={form.keywords} onChange={e => setForm({ ...form, keywords: e.target.value })} />
            <div style={hintTxt}>Cách nhau <b>dấu phẩy</b>. Có dấu / không dấu / viết tắt (bn, ko, z…) đều bắt được — hệ thống tự chuẩn hoá. Càng nhiều từ khoá càng bắt trúng.</div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Đường dẫn clip trả lời (file .mp4 trên máy phát live)</label>
            <input style={inp} placeholder="D:/live-clips/faq_gia.mp4 — để trống cũng được, điền sau ở Xưởng Clip" value={form.clip} onChange={e => setForm({ ...form, clip: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button style={btn(ACCENT)} onClick={saveIntent}>{editing ? '💾 Lưu thay đổi' : '➕ Thêm câu hỏi'}</button>
            {editing && <button style={btn('#94a3b8')} onClick={() => { setForm(empty); setEditing(false); }}>Huỷ</button>}
          </div>
        </div>
      </div>

      {/* B — DANH SÁCH */}
      <div style={card}>
        <SecHead badge="B" icon="📋" title={`Danh sách câu hỏi (${intents.length})`}
          hint="Tick Bật/Tắt để máy có nhận diện câu đó hay không. Câu nào ⚠️ chưa có clip → qua Xưởng Clip làm."
          right={<button style={{ ...btn('#16a34a'), padding: '9px 16px', fontSize: '0.85rem' }} onClick={exportFaq} title="Dự phòng — agent giờ đọc thẳng Supabase, không cần file này">📥 Xuất faq.json</button>} />
        <div style={{ padding: '10px 20px 20px' }}>
          {loading ? <div style={{ color: '#94a3b8', padding: 20 }}>⏳ Đang tải...</div>
            : intents.length === 0 ? <div style={{ color: '#94a3b8', padding: 20, fontSize: '0.95rem' }}>Chưa có câu hỏi nào — thêm ở khung A phía trên.</div>
            : intents.map(it => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '14px 16px', marginTop: 10, borderRadius: 12, border: '1.5px solid #f1f5f9', background: it.enabled ? '#fff' : '#f8fafc', opacity: it.enabled ? 1 : 0.6 }}>
                <label title={it.enabled ? 'Đang BẬT — máy sẽ nhận diện câu này' : 'Đang TẮT'} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 'none' }}>
                  <input type="checkbox" checked={it.enabled} onChange={() => toggleEnabled(it)} style={{ width: 20, height: 20, accentColor: ACCENT, cursor: 'pointer' }} />
                </label>
                <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>{it.label}</div>
                  <div style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>{it.id}</div>
                </div>
                <div style={{ flex: '2 1 260px' }}>
                  {(it.keywords || []).map((k, i) => <span key={i} style={{ display: 'inline-block', background: '#fff4ec', color: '#c2410c', borderRadius: 7, padding: '3px 10px', margin: '2px 4px 2px 0', fontSize: '0.82rem', fontWeight: 600 }}>{k}</span>)}
                </div>
                <div style={{ flex: '1 1 180px', minWidth: 160 }}>
                  {it.clip
                    ? <span title={it.clip} style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 8, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 700 }}>🎬 {it.clip}</span>
                    : <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 700 }}>⚠️ Chưa có clip — làm ở ② Xưởng Clip</span>}
                </div>
                <div style={{ flex: 'none', display: 'flex', gap: 8 }}>
                  <button onClick={() => editIntent(it)} style={{ ...btn('#3b82f6'), padding: '8px 16px', fontSize: '0.85rem' }}>Sửa</button>
                  <button onClick={() => delIntent(it)} style={{ ...btn('#ef4444'), padding: '8px 16px', fontSize: '0.85rem' }}>Xoá</button>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* C — TEST NHẬN DIỆN */}
      <div style={card}>
        <SecHead badge="C" icon="🧪" title="Gõ thử để test máy nhận diện"
          hint="Gõ 1 câu như người xem comment → xem máy chọn đúng clip không (dùng đúng bộ nhận diện thật của agent)." />
        <div style={{ padding: 20 }}>
          <input style={{ ...inp, fontSize: '1.05rem', padding: '14px 16px' }} placeholder='Gõ thử: "gia bao nhieu shop oi" · "ship bao lau z" · "con size 39 ko"…' value={testText} onChange={e => setTestText(e.target.value)} />
          <div style={{ marginTop: 12 }}>
            {!testText.trim()
              ? <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>— Kết quả hiện ở đây —</div>
              : testResult
                ? <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '14px 18px', fontSize: '1rem', color: '#166534' }}>
                    ✅ Máy hiểu là: <b style={{ fontSize: '1.08rem' }}>{testResult.intent.label}</b>
                    <span style={{ color: '#64748b', fontSize: '0.85rem' }}> (điểm khớp {testResult.score})</span>
                    <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: 4 }}>→ sẽ phát clip: <code>{testResult.intent.clip || '(chưa gán clip — làm ở Xưởng Clip)'}</code></div>
                  </div>
                : <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, padding: '14px 18px', fontSize: '1rem', color: '#dc2626', fontWeight: 700 }}>
                    ✗ Không khớp câu nào → máy IM LẶNG (an toàn, không phát nhầm).
                    <div style={{ fontSize: '0.85rem', fontWeight: 400, color: '#9a3412', marginTop: 4 }}>Muốn bắt được câu này → thêm từ khoá tương ứng vào câu hỏi ở khung A.</div>
                  </div>}
          </div>
        </div>
      </div>

      {/* Cài đặt nâng cao — gấp lại cho gọn */}
      <div style={card}>
        <div onClick={() => setShowAdv(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 20px', cursor: 'pointer' }}>
          <span style={{ fontSize: '1.1rem' }}>⚙️</span>
          <span style={{ fontWeight: 800, fontSize: '1rem', color: '#475569', flex: 1 }}>Cài đặt nâng cao (ít khi cần đụng)</span>
          <span style={{ color: '#94a3b8', fontWeight: 800 }}>{showAdv ? '▲ Thu gọn' : '▼ Mở'}</span>
        </div>
        {showAdv && (
          <div style={{ padding: '0 20px 20px', borderTop: '1px solid #f1f5f9' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, margin: '16px 0' }}>
              <div>
                <label style={lbl}>Cooldown (giây)</label>
                <input type="number" style={inp} value={config.cooldown_sec} onChange={e => setConfig({ ...config, cooldown_sec: Number(e.target.value) || 0 })} />
                <div style={hintTxt}>Không phát lại CÙNG 1 clip trong khoảng này (kẻo 2 người hỏi giá liên tiếp phát 2 lần).</div>
              </div>
              <div>
                <label style={lbl}>Điểm khớp tối thiểu</label>
                <input type="number" style={inp} value={config.min_confidence} onChange={e => setConfig({ ...config, min_confidence: Number(e.target.value) || 1 })} />
                <div style={hintTxt}>Càng cao càng khó khớp (ít phát nhầm nhưng dễ bỏ sót). Mặc định 1 là hợp lý.</div>
              </div>
              <div>
                <label style={lbl}>Giới hạn hàng đợi</label>
                <input type="number" style={inp} value={config.max_queue} onChange={e => setConfig({ ...config, max_queue: Number(e.target.value) || 1 })} />
                <div style={hintTxt}>Nhiều người hỏi dồn dập → chỉ xếp hàng tối đa chừng này clip.</div>
              </div>
            </div>
            <button style={btn(ACCENT)} onClick={saveConfig}>💾 Lưu cài đặt</button>
          </div>
        )}
      </div>

      {status && <div style={{ position: 'sticky', bottom: 12, padding: '12px 18px', borderRadius: 12, fontWeight: 700, fontSize: '0.95rem', background: status.startsWith('❌') ? '#fef2f2' : '#f0fdf4', color: status.startsWith('❌') ? '#dc2626' : '#166534', border: `1.5px solid ${status.startsWith('❌') ? '#fecaca' : '#bbf7d0'}`, boxShadow: '0 6px 20px rgba(15,23,42,0.12)' }}>{status}</div>}
    </div>
  );
}
