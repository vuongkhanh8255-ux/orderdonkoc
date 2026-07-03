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
      if (!pr.ok) return { ok: false, error: 'Không tải được ảnh sản phẩm.' };
      const buf = Buffer.from(await pr.arrayBuffer());
      const form = new FormData();
      form.append('model', 'gpt-image-1');
      form.append('image[]', new Blob([buf], { type: 'image/png' }), 'product.png');
      form.append('prompt', prompt);
      form.append('input_fidelity', 'high');
      form.append('size', '1024x1536');
      form.append('quality', 'high');
      form.append('output_format', 'png');
      const r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
      const j = await r.json();
      b64 = j?.data?.[0]?.b64_json;
      if (!b64) return { ok: false, error: 'OpenAI (edits) lỗi: ' + clip(j?.error?.message || JSON.stringify(j)) };
    } else {
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-1', prompt, n: 1, size: '1024x1536', quality: 'high', output_format: 'png' }),
      });
      const j = await r.json();
      b64 = j?.data?.[0]?.b64_json;
      if (!b64) return { ok: false, error: 'OpenAI (gen) lỗi: ' + clip(j?.error?.message || JSON.stringify(j)) };
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
    if (intent_id) await store.from('livestream_clip_prod').upsert({ intent_id, image_url, updated_at: new Date().toISOString() }, { onConflict: 'intent_id' });
    return { ok: true, image_url };
  } catch (e) { return { ok: false, error: 'Lỗi lưu ảnh: ' + e.message }; }
}

// Chọn giọng Việt (nữ ưu tiên) từ HeyGen
async function pickVietnameseVoice(key) {
  const r = await fetch('https://api.heygen.com/v2/voices', { headers: { 'X-Api-Key': key, Accept: 'application/json' } });
  const j = await r.json();
  const list = j?.data?.voices || j?.data || [];
  const vi = list.filter(v => v.language === 'Vietnamese');
  return (vi.find(v => v.gender === 'Female') || vi[0])?.voice_id || null;
}

// ── list giọng Việt (cho UI chọn) ──
export async function handleLiveVoices() {
  const key = HEYGEN();
  if (!key) return { ok: false, error: 'Chưa cấu hình HEYGEN_API_KEY trên Vercel.' };
  try {
    const r = await fetch('https://api.heygen.com/v2/voices', { headers: { 'X-Api-Key': key, Accept: 'application/json' } });
    const j = await r.json();
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
  try {
    // Tải ảnh → upload talking photo (raw bytes)
    const ir = await fetch(image_url);
    if (!ir.ok) return { ok: false, error: 'Không tải được ảnh nhân vật.' };
    const ct = (ir.headers.get('content-type') || 'image/png').includes('jpeg') ? 'image/jpeg' : 'image/png';
    const imgBuf = Buffer.from(await ir.arrayBuffer());
    const upR = await fetch('https://upload.heygen.com/v1/talking_photo', { method: 'POST', headers: { 'X-Api-Key': key, 'Content-Type': ct }, body: imgBuf });
    const upJ = await upR.json();
    const talking_photo_id = upJ?.data?.talking_photo_id;
    if (!talking_photo_id) return { ok: false, error: 'HeyGen upload ảnh lỗi: ' + clip(upJ?.message || JSON.stringify(upJ)) };

    let vid = voice_id;
    if (!vid) { vid = await pickVietnameseVoice(key); if (!vid) return { ok: false, error: 'Không tìm thấy giọng Việt trong HeyGen (kiểm plan/voices).' }; }

    const genR = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST', headers: { 'X-Api-Key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        video_inputs: [{
          character: { type: 'talking_photo', talking_photo_id, scale: 1.0, talking_photo_style: 'square' },
          voice: { type: 'text', voice_id: vid, input_text: script, speed: 1.0 },
        }],
        dimension: { width: 720, height: 1280 }, test: false, caption: false, title: `faq-${intent_id || ''}`,
      }),
    });
    const genJ = await genR.json();
    const video_id = genJ?.data?.video_id;
    if (!video_id) return { ok: false, error: 'HeyGen tạo video lỗi: ' + clip(genJ?.error?.message || JSON.stringify(genJ)) };

    if (intent_id) await sb().from('livestream_clip_prod').upsert({ intent_id, video_id, voice_id: vid, status: 'lam', updated_at: new Date().toISOString() }, { onConflict: 'intent_id' });
    return { ok: true, video_id, voice_id: vid };
  } catch (e) { return { ok: false, error: 'Lỗi gọi HeyGen: ' + e.message }; }
}

// ── 3. KIỂM TRA VIDEO (poll HeyGen) → lấy mp4 url khi xong ──
export async function handleLiveCheckVideo(body) {
  const key = HEYGEN();
  if (!key) return { ok: false, error: 'Chưa cấu hình HEYGEN_API_KEY trên Vercel.' };
  const { intent_id, video_id } = body || {};
  if (!video_id) return { ok: false, error: 'Thiếu video_id.' };
  try {
    const r = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(video_id)}`, { headers: { 'X-Api-Key': key, Accept: 'application/json' } });
    const j = await r.json();
    const d = j?.data || {};
    if (d.status === 'completed' && d.video_url) {
      if (intent_id) await sb().from('livestream_clip_prod').upsert({ intent_id, video_url: d.video_url, updated_at: new Date().toISOString() }, { onConflict: 'intent_id' });
      return { ok: true, status: 'completed', video_url: d.video_url, duration: d.duration };
    }
    if (d.status === 'failed') return { ok: false, status: 'failed', error: clip(d.error?.message || 'HeyGen render thất bại') };
    return { ok: true, status: d.status || 'processing' };
  } catch (e) { return { ok: false, error: 'Lỗi poll HeyGen: ' + e.message }; }
}
