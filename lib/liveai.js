// lib/liveai.js — logic tự động hoá "Xưởng Clip" (Module 5): OpenAI tạo ảnh + HeyGen ảnh→video nói.
// KHÔNG phải Vercel function (nằm ngoài api/ → không tính vào trần 12 function). analytics.js import + route.
// Spec đã verify (3/7/2026): OpenAI gpt-image-1 (b64), HeyGen talking_photo v1 upload → v2/video/generate → v1/video_status.get.
// Key đọc từ Vercel env: OPENAI_API_KEY, HEYGEN_API_KEY. Supabase service role như các function khác.
import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  return createClient(url, key, { auth: { persistSession: false } });
}
const OPENAI = () => (process.env.OPENAI_API_KEY || '').trim();
const HEYGEN = () => (process.env.HEYGEN_API_KEY || '').trim();
const clip = (s, n = 240) => String(s || '').slice(0, n);

// Parse response AN TOÀN: nếu API trả non-JSON (429/5xx/HTML gateway/body rỗng) thì không ném "Unexpected token"
// mà trả text thô + status để báo lỗi thật cho user. Trả { ok, status, j, text }.
async function jparse(r) {
  const text = await r.text().catch(() => '');
  try { return { ok: r.ok, status: r.status, j: JSON.parse(text), text }; }
  catch { return { ok: r.ok, status: r.status, j: null, text }; }
}
// Ảnh JPEG→image/jpeg, còn lại→image/png
const imgType = (ct) => (String(ct || '').includes('jpeg') || String(ct || '').includes('jpg')) ? 'image/jpeg' : 'image/png';

// ── 1. TẠO ẢNH (OpenAI gpt-image-1) — text→ảnh, hoặc ghép ảnh sản phẩm thật (edit) ──
export async function handleLiveGenImage(body) {
  const key = OPENAI();
  if (!key) return { ok: false, error: 'Chưa cấu hình OPENAI_API_KEY trên Vercel.' };
  const { intent_id, prompt, product_image_url } = body || {};
  if (!prompt) return { ok: false, error: 'Thiếu prompt ảnh.' };

  let b64;
  try {
    if (product_image_url) {
      // Ghép ảnh SẢN PHẨM THẬT vào cảnh → /v1/images/edits (multipart), giữ nguyên sản phẩm (input_fidelity=high).
      const pr = await fetch(product_image_url);
      if (!pr.ok) return { ok: false, error: 'Không tải được ảnh sản phẩm (HTTP ' + pr.status + ').' };
      const type = imgType(pr.headers.get('content-type'));
      const buf = Buffer.from(await pr.arrayBuffer());
      const form = new FormData();
      form.append('model', 'gpt-image-1');
      form.append('image[]', new Blob([buf], { type }), type === 'image/jpeg' ? 'product.jpg' : 'product.png');
      form.append('prompt', prompt);
      form.append('input_fidelity', 'high');
      form.append('size', '1024x1536');
      form.append('quality', 'high');
      form.append('output_format', 'png');
      const { ok, status, j, text } = await jparse(await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form }));
      b64 = j?.data?.[0]?.b64_json;
      if (!b64) return { ok: false, error: 'OpenAI (edits) HTTP ' + status + ': ' + clip(j?.error?.message || text || 'không rõ') };
    } else {
      const { ok, status, j, text } = await jparse(await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-1', prompt, n: 1, size: '1024x1536', quality: 'high', output_format: 'png' }),
      }));
      b64 = j?.data?.[0]?.b64_json;
      if (!b64) return { ok: false, error: 'OpenAI (gen) HTTP ' + status + ': ' + clip(j?.error?.message || text || 'không rõ') };
    }
  } catch (e) { return { ok: false, error: 'Lỗi gọi OpenAI: ' + e.message }; }

  // Lưu ảnh lên Supabase Storage → lấy public URL
  try {
    const buf = Buffer.from(b64, 'base64');
    const path = `img/${(intent_id || 'x')}_${Date.now()}.png`;
    const store = sb();
    const { error: upErr } = await store.storage.from('live-assets').upload(path, buf, { contentType: 'image/png', upsert: true });
    if (upErr) return { ok: false, error: 'Lưu ảnh lên Storage lỗi: ' + upErr.message };
    const image_url = store.storage.from('live-assets').getPublicUrl(path).data.publicUrl;
    let warn;
    if (intent_id) {
      const { error: e } = await store.from('livestream_clip_prod').upsert({ intent_id, image_url, updated_at: new Date().toISOString() }, { onConflict: 'intent_id' });
      if (e) warn = 'Ảnh tạo được nhưng lưu DB lỗi: ' + e.message;
    }
    return { ok: true, image_url, warn };
  } catch (e) { return { ok: false, error: 'Lỗi lưu ảnh: ' + e.message }; }
}

// Chọn giọng Việt (nữ ưu tiên) từ HeyGen
async function pickVietnameseVoice(key) {
  const { ok, status, j } = await jparse(await fetch('https://api.heygen.com/v2/voices', { headers: { 'X-Api-Key': key, Accept: 'application/json' } }));
  if (!ok) throw new Error('HeyGen voices HTTP ' + status);
  const list = j?.data?.voices || j?.data || [];
  const vi = list.filter(v => v.language === 'Vietnamese');
  return (vi.find(v => v.gender === 'Female') || vi[0])?.voice_id || null;
}

// ── list giọng Việt (cho UI chọn) ──
export async function handleLiveVoices() {
  const key = HEYGEN();
  if (!key) return { ok: false, error: 'Chưa cấu hình HEYGEN_API_KEY trên Vercel.' };
  try {
    const { ok, status, j, text } = await jparse(await fetch('https://api.heygen.com/v2/voices', { headers: { 'X-Api-Key': key, Accept: 'application/json' } }));
    if (!ok) return { ok: false, error: 'HeyGen voices HTTP ' + status + ': ' + clip(text) };
    const list = j?.data?.voices || j?.data || [];
    const voices = list.filter(v => v.language === 'Vietnamese').map(v => ({ voice_id: v.voice_id, name: v.name, gender: v.gender, preview: v.preview_audio }));
    return { ok: true, voices };
  } catch (e) { return { ok: false, error: 'Lỗi list voices: ' + e.message }; }
}

// ── 2. TẠO VIDEO (HeyGen): ảnh → talking_photo → generate (giọng Việt đọc kịch bản) → video_id ──
export async function handleLiveMakeVideo(body) {
  const key = HEYGEN();
  if (!key) return { ok: false, error: 'Chưa cấu hình HEYGEN_API_KEY trên Vercel.' };
  const { intent_id, image_url, script, voice_id } = body || {};
  if (!image_url) return { ok: false, error: 'Chưa có ảnh nhân vật (làm bước ① trước).' };
  if (!script) return { ok: false, error: 'Chưa có kịch bản.' };
  const store = sb();
  try {
    // TÁI DÙNG talking_photo_id nếu ảnh không đổi (mỗi lần upload HeyGen tạo 1 photo-avatar group mới →
    // rác + dính trần group; tối ưu từ vòng thẩm định QUY-TRINH mục 11.6).
    let talking_photo_id = null;
    if (intent_id) {
      const { data: row } = await store.from('livestream_clip_prod').select('talking_photo_id, tp_image_url').eq('intent_id', intent_id).maybeSingle();
      if (row?.talking_photo_id && row.tp_image_url === image_url) talking_photo_id = row.talking_photo_id;
    }
    if (!talking_photo_id) {
      // Tải ảnh → upload talking photo (raw bytes)
      const ir = await fetch(image_url);
      if (!ir.ok) return { ok: false, error: 'Không tải được ảnh nhân vật (HTTP ' + ir.status + '). Kiểm bucket live-assets có public không.' };
      const type = imgType(ir.headers.get('content-type'));
      const imgBuf = Buffer.from(await ir.arrayBuffer());
      const up = await jparse(await fetch('https://upload.heygen.com/v1/talking_photo', { method: 'POST', headers: { 'X-Api-Key': key, 'Content-Type': type }, body: imgBuf }));
      talking_photo_id = up.j?.data?.talking_photo_id;
      if (!talking_photo_id) return { ok: false, error: 'HeyGen upload ảnh lỗi (HTTP ' + up.status + '): ' + clip(up.j?.message || up.text || 'không rõ') };
      if (intent_id) await store.from('livestream_clip_prod').upsert({ intent_id, talking_photo_id, tp_image_url: image_url, updated_at: new Date().toISOString() }, { onConflict: 'intent_id' });
    }

    let vid = voice_id;
    if (!vid) { vid = await pickVietnameseVoice(key); if (!vid) return { ok: false, error: 'Không tìm thấy giọng Việt trong HeyGen (kiểm plan/voices).' }; }

    const gen = await jparse(await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST', headers: { 'X-Api-Key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        video_inputs: [{
          character: { type: 'talking_photo', talking_photo_id, scale: 1.0, talking_photo_style: 'square' },
          voice: { type: 'text', voice_id: vid, input_text: script, speed: 1.0 },
        }],
        dimension: { width: 720, height: 1280 }, test: false, caption: false, title: `faq-${intent_id || ''}`,
      }),
    }));
    const video_id = gen.j?.data?.video_id;
    if (!video_id) return { ok: false, error: 'HeyGen tạo video lỗi (HTTP ' + gen.status + '): ' + clip(gen.j?.error?.message || gen.text || 'không rõ') };

    let warn;
    if (intent_id) {
      const { error: e } = await store.from('livestream_clip_prod').upsert({ intent_id, video_id, voice_id: vid, status: 'lam', updated_at: new Date().toISOString() }, { onConflict: 'intent_id' });
      if (e) warn = 'Video đang tạo nhưng lưu DB lỗi: ' + e.message;
    }
    return { ok: true, video_id, voice_id: vid, warn };
  } catch (e) { return { ok: false, error: 'Lỗi gọi HeyGen: ' + e.message }; }
}

// ── 3. KIỂM TRA VIDEO (poll HeyGen) → khi xong TỰ LƯU mp4 về Storage (link VĨNH VIỄN) ──
// Link HeyGen là signed URL hết hạn ~7 ngày → tải mp4 về bucket live-assets ngay khi completed,
// lưu link Supabase (bền) vào DB. (Tối ưu từ vòng thẩm định QUY-TRINH mục 11.3.)
const STORED_MARK = '/object/public/live-assets/';
export async function handleLiveCheckVideo(body) {
  const key = HEYGEN();
  if (!key) return { ok: false, error: 'Chưa cấu hình HEYGEN_API_KEY trên Vercel.' };
  const { intent_id, video_id } = body || {};
  if (!video_id) return { ok: false, error: 'Thiếu video_id.' };
  const store = sb();
  try {
    // Đã lưu vĩnh viễn rồi → trả luôn, khỏi gọi HeyGen / tải lại
    if (intent_id) {
      const { data: row } = await store.from('livestream_clip_prod').select('video_url').eq('intent_id', intent_id).maybeSingle();
      if (row?.video_url && row.video_url.includes(STORED_MARK)) {
        return { ok: true, status: 'completed', video_url: row.video_url, stored: true };
      }
    }

    const { ok, status, j, text } = await jparse(await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(video_id)}`, { headers: { 'X-Api-Key': key, Accept: 'application/json' } }));
    if (!ok && !j) return { ok: false, error: 'HeyGen poll HTTP ' + status + ': ' + clip(text) };
    const d = j?.data || {};
    if (d.status === 'completed' && d.video_url) {
      // Tải mp4 từ link HeyGen (7 ngày) → upload Storage → link bền. Lỗi thì fallback link tạm + cảnh báo.
      let finalUrl = d.video_url, stored = false, warn;
      try {
        const vr = await fetch(d.video_url);
        if (vr.ok) {
          const vbuf = Buffer.from(await vr.arrayBuffer());
          if (vbuf.byteLength > 45 * 1024 * 1024) {
            warn = 'Video >45MB, không lưu kho được — link HeyGen chỉ sống ~7 ngày, TẢI VỀ NGAY.';
          } else {
            const vpath = `vid/${(intent_id || 'x')}_${Date.now()}.mp4`;
            const { error: sErr } = await store.storage.from('live-assets').upload(vpath, vbuf, { contentType: 'video/mp4', upsert: true });
            if (!sErr) { finalUrl = store.storage.from('live-assets').getPublicUrl(vpath).data.publicUrl; stored = true; }
            else warn = 'Không lưu được mp4 vào kho: ' + sErr.message + ' — link HeyGen chỉ sống ~7 ngày, TẢI VỀ NGAY.';
          }
        } else warn = 'Không tải được mp4 từ HeyGen (HTTP ' + vr.status + ') — dùng link tạm ~7 ngày.';
      } catch (e) { warn = 'Lỗi lưu mp4: ' + e.message + ' — dùng link tạm ~7 ngày.'; }
      if (intent_id) await store.from('livestream_clip_prod').upsert({ intent_id, video_url: finalUrl, status: 'xong', updated_at: new Date().toISOString() }, { onConflict: 'intent_id' });
      return { ok: true, status: 'completed', video_url: finalUrl, duration: d.duration, stored, warn };
    }
    if (d.status === 'failed') return { ok: false, status: 'failed', error: clip(d.error?.message || 'HeyGen render thất bại') };
    return { ok: true, status: d.status || 'processing' };
  } catch (e) { return { ok: false, error: 'Lỗi poll HeyGen: ' + e.message }; }
}
