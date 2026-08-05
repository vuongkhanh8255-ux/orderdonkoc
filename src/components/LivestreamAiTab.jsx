// src/components/LivestreamAiTab.jsx
// Module 4 — Live AI: quản lý kho câu hỏi (intent) → clip trả lời cho Desktop Agent OBS.
// Thay việc sửa faq.json tay: CRUD intent trên Supabase, test nhận diện ngay trên web, xuất faq.json.
// UI thiết kế theo BƯỚC (A thêm → B danh sách → C test) — chữ to, mỗi khu có hướng dẫn ngay tại chỗ.
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { LIVE_SHOP_OPTIONS, LIVE_TEMPLATE_KEY, liveShopLabel } from '../constants/shops';

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
// ⚠️ PHẢI GIỐNG HỆT agent/src/intent.js — sửa 1 bên là phải sửa bên kia, kẻo web bảo
// nhận diện đúng mà lúc live thật lại phát nhầm clip.
// Từ hỏi CHUNG CHUNG (không chỉ ra chủ đề gì) chỉ được 1 điểm; từ chỉ CHỦ ĐỀ được 4-5 điểm.
// Vì sao: câu "ship bao nhiêu tiền" dính 3 từ khoá của GIÁ (bao nhiêu + bn + nhiêu tiền)
// = 6 điểm, trong khi "ship" chỉ 1 → trước đây phát nhầm clip GIÁ (bắt được khi test 4/8).
const WEAK_KEYWORDS = new Set([
  'bao nhieu', 'bn', 'nhieu tien', 'nhiu tien', 'may xu', 'gia sao',
  'con khong', 'con ko', 'het chua', 'co ben khong', 'chat the nao',
]);
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
        score += WEAK_KEYWORDS.has(nkw) ? 1 : (nkw.includes(' ') ? 5 : 4);
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
// dùng cho khối HƯỚNG DẪN CÀI MÁY LIVE
const codeTag = { background: '#f1f5f9', padding: '2px 6px', borderRadius: 5, fontFamily: 'monospace', fontSize: '0.85em', color: '#0f172a' };
const preBox = { flex: 1, margin: 0, padding: '11px 14px', background: '#0f172a', color: '#e2e8f0', borderRadius: 9, fontFamily: 'monospace', fontSize: '0.86rem', overflowX: 'auto', whiteSpace: 'pre' };
const btnCopy = { padding: '10px 14px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' };
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

export default function LivestreamAiTab({ shop = 'chung' }) {
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

  // MỌI truy vấn đều khoá theo gian hàng đang chọn (Khánh 4/8) — không thì shop này ghi đè shop kia.
  const load = async () => {
    setLoading(true);
    const [{ data: it }, { data: cf }] = await Promise.all([
      supabase.from('livestream_intents').select('*').eq('shop_key', shop).order('sort_order', { ascending: true }),
      supabase.from('livestream_config').select('*').eq('id', shop).maybeSingle(),
    ]);
    setIntents((it || []).map(r => ({ ...r, keywords: Array.isArray(r.keywords) ? r.keywords : [] })));
    // Gian chưa có dòng cấu hình -> quay về mặc định an toàn, KHÔNG mượn cấu hình gian khác
    setConfig({
      cooldown_sec: cf?.cooldown_sec ?? 45,
      min_confidence: cf?.min_confidence ?? 1,
      max_queue: cf?.max_queue ?? 3,
    });
    setForm(empty); setEditing(false);   // đổi gian -> bỏ form đang sửa dở của gian cũ
    setLoading(false);
  };
  useEffect(() => { load(); }, [shop]);

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
      shop_key: shop, id, label, keywords, clip: form.clip.trim(), enabled: form.enabled,
      sort_order: editing ? (intents.find(i => i.id === id)?.sort_order ?? intents.length + 1) : intents.length + 1,
      updated_at: new Date().toISOString(),
    };
    // onConflict PHẢI đủ cặp khoá — để 'id' không thôi là ghi đè câu cùng mã của gian khác
    const { error } = await supabase.from('livestream_intents').upsert(row, { onConflict: 'shop_key,id' });
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
    // Xoá câu hỏi: dọn luôn dòng sản xuất clip của ĐÚNG gian đó, tránh để lại rác mồ côi
    const { error } = await supabase.from('livestream_intents').delete().eq('shop_key', shop).eq('id', it.id);
    if (error) { setStatus('❌ Lỗi xoá: ' + error.message); return; }
    await supabase.from('livestream_clip_prod').delete().eq('shop_key', shop).eq('intent_id', it.id);
    setStatus(`🗑️ Đã xoá "${it.label}".`); await load();
  };
  const toggleEnabled = async (it) => {
    await supabase.from('livestream_intents').update({ enabled: !it.enabled, updated_at: new Date().toISOString() })
      .eq('shop_key', shop).eq('id', it.id);
    await load();
  };
  const saveConfig = async () => {
    const { error } = await supabase.from('livestream_config').upsert({ id: shop, ...config, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    setStatus(error ? '❌ Lỗi lưu cài đặt: ' + error.message : '✅ Đã lưu cài đặt cho gian này.');
  };

  // ── NHÂN BẢN bộ câu hỏi từ gian khác (Khánh 4/8) ──────────────────────────
  // Gian mới khỏi gõ lại 20 câu: copy nguyên bộ (kèm từ khoá) từ "Bộ mẫu" hoặc gian đã làm rồi.
  // CỐ Ý không copy `clip`: clip là video của gian cũ, để lại là live gian mới phát nhầm nội dung.
  const [helpOpen, setHelpOpen] = useState(false);   // hướng dẫn cài trên máy live
  const [cloneFrom, setCloneFrom] = useState('');
  const [cloning, setCloning] = useState(false);
  const cloneIntents = async () => {
    if (!cloneFrom || cloneFrom === shop) { setStatus('❌ Chọn gian NGUỒN khác gian đang mở.'); return; }
    const { data: src, error: e1 } = await supabase.from('livestream_intents').select('*').eq('shop_key', cloneFrom);
    if (e1) { setStatus('❌ Lỗi đọc gian nguồn: ' + e1.message); return; }
    if (!src?.length) { setStatus('❌ Gian nguồn chưa có câu hỏi nào.'); return; }
    const daCo = new Set(intents.map(i => i.id));
    const them = src.filter(r => !daCo.has(r.id));   // câu đã có thì GIỮ NGUYÊN, không đè
    if (!them.length) { setStatus('ℹ️ Gian này đã có đủ các câu của gian nguồn — không thêm gì.'); return; }
    if (!window.confirm(`Chép ${them.length} câu hỏi từ "${cloneFrom}" sang gian đang mở?\n\nChỉ chép câu hỏi + từ khoá. KHÔNG chép đường dẫn clip (clip là video riêng của từng gian) — bạn làm clip mới ở tab Xưởng Clip.`)) return;
    setCloning(true);
    const rows = them.map((r, i) => ({
      shop_key: shop, id: r.id, label: r.label, keywords: r.keywords || [],
      clip: '', enabled: r.enabled ?? true, sort_order: intents.length + i + 1,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('livestream_intents').upsert(rows, { onConflict: 'shop_key,id' });
    setCloning(false);
    if (error) { setStatus('❌ Lỗi nhân bản: ' + error.message); return; }
    setStatus(`✅ Đã chép ${rows.length} câu hỏi sang gian này. Giờ qua ② Xưởng Clip làm video riêng cho gian.`);
    await load();
  };

  // Xuất faq.json đúng format agent đọc (dự phòng — agent giờ đọc thẳng Supabase)
  const exportFaq = () => {
    const data = {
      _note: `Xuất từ Live AI dashboard (koc-tool) — GIAN HÀNG: ${shop}. Đặt file này vào livestream-ai/agent/faq.json của ĐÚNG máy chạy gian này.`,
      shop_key: shop,
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
        <div style={{ marginTop: 8, fontSize: '0.9rem', color: '#0f172a' }}>
          Đang soạn cho: <b style={{ color: '#ea580c' }}>{liveShopLabel(shop)}</b> — mỗi gian hàng một kho riêng.
        </div>
      </div>

      {/* MÃ GIAN HÀNG cho agent + NHÂN BẢN từ gian khác */}
      <div style={{ ...card, padding: 0, marginBottom: 16 }}>
        <div style={{ padding: '14px 20px', display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 320px' }}>
            <label style={lbl}>Mã gian hàng — dán vào <code>config.json</code> của agent</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={shop} style={{ ...inp, fontFamily: 'monospace', background: '#f8fafc' }} onFocus={e => e.target.select()} />
              <button onClick={() => { navigator.clipboard?.writeText(shop); setStatus('📋 Đã copy mã gian hàng — dán vào "shop" trong config.json của agent.'); }}
                style={{ padding: '10px 16px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>📋 Copy</button>
            </div>
            <div style={hintTxt}>Máy live phải khai <b>đúng</b> mã này thì mới nạp được kho câu hỏi của gian.</div>
            <button onClick={() => setHelpOpen(v => !v)}
              style={{ marginTop: 8, padding: '7px 14px', borderRadius: 8, border: '1.5px solid #fed7aa', background: '#fff7ed', color: '#c2410c', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              {helpOpen ? '▲ Đóng hướng dẫn' : '❓ Cài trên máy live thế nào? — xem hướng dẫn'}
            </button>
          </div>
          <div style={{ flex: '1 1 320px' }}>
            <label style={lbl}>Nhân bản câu hỏi từ gian khác (khỏi gõ lại)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={cloneFrom} onChange={e => setCloneFrom(e.target.value)} style={inp}>
                <option value="">— chọn gian nguồn —</option>
                {LIVE_SHOP_OPTIONS.filter(o => o.key !== shop).map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <button onClick={cloneIntents} disabled={cloning || !cloneFrom}
                style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: cloneFrom ? '#7c3aed' : '#e2e8f0', color: '#fff', fontWeight: 800, cursor: cloneFrom ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                {cloning ? '⏳...' : '⧉ Chép sang đây'}
              </button>
            </div>
            <div style={hintTxt}>Chỉ chép <b>câu hỏi + từ khoá</b>. <b>Không</b> chép clip — clip là video riêng của từng gian.</div>
          </div>
        </div>

        {/* HƯỚNG DẪN CÀI TRÊN MÁY LIVE — mở ra là làm theo được, khỏi hỏi ai */}
        {helpOpen && (
          <div style={{ borderTop: '1px solid #f1f5f9', background: '#fffdfb', padding: '18px 20px' }}>
            <div style={{ fontWeight: 900, fontSize: '1.02rem', color: '#0f172a', marginBottom: 4 }}>
              🖥️ Cài máy live cho gian <span style={{ color: '#ea580c' }}>{liveShopLabel(shop)}</span>
            </div>
            <div style={{ ...hintTxt, marginBottom: 14 }}>
              Mỗi gian hàng chạy trên <b>1 máy riêng</b> (1 OBS + 1 extension + 1 agent). Làm 1 lần, các buổi live sau chỉ việc mở lên.
            </div>

            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#334155', marginBottom: 6 }}>
              Bước 1 — Mở file <code style={codeTag}>livestream-ai\agent\config.json</code> trên máy live, sửa dòng <code style={codeTag}>"shop"</code> thành:
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
              <pre style={preBox}>{`"shop": ${JSON.stringify(shop)},`}</pre>
              <button onClick={() => { navigator.clipboard?.writeText(`"shop": ${JSON.stringify(shop)},`); setStatus('📋 Đã copy dòng cấu hình — dán đè dòng "shop" trong config.json.'); }}
                style={btnCopy}>📋 Copy dòng này</button>
            </div>
            <div style={{ ...hintTxt, marginBottom: 14 }}>Giữ nguyên các dòng còn lại (OBS, cổng…). Nhớ <b>dấu phẩy</b> ở cuối.</div>

            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#334155', marginBottom: 6 }}>Bước 2 — Chép clip của gian này vào ổ cứng máy đó</div>
            <div style={{ ...hintTxt, marginBottom: 14 }}>
              OBS phát clip bằng <b>file trong máy</b>, web chỉ lưu <b>đường dẫn</b>. Nên máy live phải có sẵn file mp4.
              👉 Mẹo: máy nào cũng để clip ở cùng một chỗ (VD <code style={codeTag}>C:\live-clips\</code>) thì đường dẫn ghi trên web dùng chung được, khỏi nhớ máy nào để đâu.
            </div>

            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#334155', marginBottom: 6 }}>Bước 3 — Mỗi buổi live</div>
            <ol style={{ margin: '0 0 14px', paddingLeft: 20, color: '#475569', fontSize: '0.88rem', lineHeight: 1.9 }}>
              <li>Mở <b>OBS</b> → bắt đầu phát (đang ở scene <b>IDLE</b>)</li>
              <li>Mở cửa sổ lệnh ở thư mục <code style={codeTag}>agent</code> → gõ <code style={codeTag}>npm start</code></li>
              <li>Mở phòng live Shopee của gian này trên Chrome → chờ ~10-15 giây, thấy panel cam báo <b>“tự dò ✓”</b> là xong</li>
            </ol>

            <div style={{ padding: '11px 14px', borderRadius: 9, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: '0.85rem', lineHeight: 1.6 }}>
              ✅ Chạy đúng thì cửa sổ lệnh in: <code style={codeTag}>[Config] Gian hang: {shop}</code> và <code style={codeTag}>Nguon: Supabase (Module 4)</code>.<br />
              ❌ Nếu gõ sai mã gian, agent <b>dừng hẳn</b> và báo lý do — cố tình vậy để không phát nhầm clip của gian khác lúc đang live.
            </div>
          </div>
        )}
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
