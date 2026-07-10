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

// ── 0. AI VIẾT GIÚP (bộ lọc prompt) — yêu cầu thô → kịch bản đọc + prompt ảnh xịn ──
// User gõ đại ý ("xịt thơm 99k, mua 2 giảm 50%, tông vui") → gpt-4o-mini viết lại thành:
//   script (avatar đọc 20-40s) + img_prompt (chuẩn cho gpt-image-1). UI điền vào ô, user duyệt rồi Lưu.
export async function handleLiveSuggest(body) {
  const key = OPENAI();
  if (!key) return { ok: false, error: 'Chưa cấu hình OPENAI_API_KEY trên Vercel.' };
  const { label, idea } = body || {};
  if (!String(idea || '').trim()) return { ok: false, error: 'Gõ yêu cầu thô trước (sản phẩm, giá, ưu đãi, tông giọng…).' };
  const sys = `Bạn là biên kịch clip livestream bán hàng Shopee Việt Nam. Nhiệm vụ: từ yêu cầu thô của người bán, viết ra JSON đúng định dạng {"script": "...", "img_prompt": "..."}.
- "script": lời thoại avatar AI đọc thành tiếng, 60-120 chữ (~20-40 giây). Tiếng Việt tự nhiên như host livestream: xưng "em", gọi người xem "cả nhà", thân thiện, có call-to-action chốt đơn nhẹ cuối câu. KHÔNG emoji, KHÔNG hashtag, KHÔNG xuống dòng. Giữ ĐÚNG số liệu giá/ưu đãi người bán cung cấp, tuyệt đối không bịa thêm khuyến mãi.
- "img_prompt": mô tả ảnh chân dung DỌC (1024x1536) cho AI vẽ: 1 người (mặc định nữ Việt 22-28 tuổi, trừ khi yêu cầu khác) đang cầm sản phẩm hướng về camera, bối cảnh studio livestream sáng sủa, mô tả rõ trang phục / ánh sáng / biểu cảm tươi tắn / góc nhìn ngang ngực trở lên. Viết tiếng Việt, 40-80 chữ. Không cần tả chi tiết sản phẩm (sẽ ghép ảnh thật).`;
  const usr = `Câu hỏi/chủ đề clip: ${label || '(không rõ)'}\nYêu cầu thô của người bán: ${idea}`;
  try {
    const { status, j, text } = await jparse(await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.7, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }] }),
    }));
    const content = j?.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: 'OpenAI HTTP ' + status + ': ' + clip(j?.error?.message || text || 'không rõ') };
    let out; try { out = JSON.parse(content); } catch { return { ok: false, error: 'AI trả về sai định dạng — bấm thử lại.' }; }
    const script = String(out.script || '').trim(), img_prompt = String(out.img_prompt || '').trim();
    if (!script || !img_prompt) return { ok: false, error: 'AI trả thiếu kịch bản/prompt — bấm thử lại.' };
    return { ok: true, script, img_prompt };
  } catch (e) { return { ok: false, error: 'Lỗi gọi OpenAI: ' + e.message }; }
}

// ── 1. TẠO ẢNH (OpenAI gpt-image-1) — text→ảnh, hoặc ghép ảnh sản phẩm thật (edit) ──
export async function handleLiveGenImage(body) {
  const key = OPENAI();
  if (!key) return { ok: false, error: 'Chưa cấu hình OPENAI_API_KEY trên Vercel.' };
  const { intent_id, prompt, product_image_url, product_image_urls } = body || {};
  if (!prompt) return { ok: false, error: 'Thiếu prompt ảnh.' };
  // Nhận 1 ảnh (product_image_url) HOẶC NHIỀU ảnh (product_image_urls[]) — VD gian hàng bày đủ bộ
  // sản phẩm 1 brand. OpenAI edits cho tối đa 16 ảnh tham chiếu/lần.
  const srcUrls = (Array.isArray(product_image_urls) && product_image_urls.length ? product_image_urls : (product_image_url ? [product_image_url] : [])).slice(0, 16);

  let b64;
  try {
    if (srcUrls.length) {
      // Ghép ảnh SẢN PHẨM THẬT vào cảnh → /v1/images/edits (multipart), giữ nguyên sản phẩm (input_fidelity=high).
      const form = new FormData();
      form.append('model', 'gpt-image-1');
      for (let i = 0; i < srcUrls.length; i++) {
        const pr = await fetch(srcUrls[i]);
        if (!pr.ok) return { ok: false, error: `Không tải được ảnh sản phẩm #${i + 1} (HTTP ${pr.status}).` };
        const type = imgType(pr.headers.get('content-type'));
        const buf = Buffer.from(await pr.arrayBuffer());
        form.append('image[]', new Blob([buf], { type }), (type === 'image/jpeg' ? `product${i + 1}.jpg` : `product${i + 1}.png`));
      }
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
// Giọng GỐC HeyGen (tên có " - Natural/Gently/Kindly/Excited") đọc tiếng Việt CHUẨN;
// giọng còn lại là clone người dùng up → hay lơ lớ. Ưu tiên giọng gốc, nữ trước.
const OFFICIAL_VOICE_RE = / - (Natural|Gently|Kindly|Excited|Serious|Cheerful)/i;
function rankVoices(list) {
  const vi = list.filter(v => v.language === 'Vietnamese');
  const off = vi.filter(v => OFFICIAL_VOICE_RE.test(v.name || ''));
  const clo = vi.filter(v => !OFFICIAL_VOICE_RE.test(v.name || ''));
  // HeyGen trả gender 'female'/'male' (CHỮ THƯỜNG) → so sánh không phân biệt hoa/thường,
  // nếu không thì fem() luôn rỗng → tụt xuống lấy giọng NAM đầu tiên (bug giọng nam cho host nữ).
  const isFem = (v) => String(v.gender || '').toLowerCase() === 'female';
  const fem = (arr) => arr.filter(isFem);
  const male = (arr) => arr.filter(v => !isFem(v));
  return [...fem(off), ...male(off), ...fem(clo), ...male(clo)];
}
// Giọng MẶC ĐỊNH Khánh chốt (8/7): "Hoai - Natural" (nữ, tự nhiên). UI/clip không chọn giọng riêng thì dùng cái này.
const PREFERRED_VOICE_ID = '9a247a37f3c04e6aa934171998b9659c';
async function pickVietnameseVoice(key) {
  const { ok, status, j } = await jparse(await fetch('https://api.heygen.com/v2/voices', { headers: { 'X-Api-Key': key, Accept: 'application/json' } }));
  if (!ok) throw new Error('HeyGen voices HTTP ' + status);
  const list = j?.data?.voices || j?.data || [];
  if (list.some(v => v.voice_id === PREFERRED_VOICE_ID)) return PREFERRED_VOICE_ID;   // ưu tiên giọng Hoai
  const ranked = rankVoices(list);
  return ranked[0]?.voice_id || null;   // dự phòng: giọng nữ tự nhiên đầu tiên
}

// ── list giọng Việt (cho UI chọn) — giọng GỐC HeyGen lên đầu, gắn cờ official + nhãn ──
export async function handleLiveVoices() {
  const key = HEYGEN();
  if (!key) return { ok: false, error: 'Chưa cấu hình HEYGEN_API_KEY trên Vercel.' };
  try {
    const { ok, status, j, text } = await jparse(await fetch('https://api.heygen.com/v2/voices', { headers: { 'X-Api-Key': key, Accept: 'application/json' } }));
    if (!ok) return { ok: false, error: 'HeyGen voices HTTP ' + status + ': ' + clip(text) };
    const voices = rankVoices(j?.data?.voices || j?.data || []).map(v => ({
      voice_id: v.voice_id, name: v.name, gender: v.gender, preview: v.preview_audio,
      official: OFFICIAL_VOICE_RE.test(v.name || ''),
    }));
    return { ok: true, voices };
  } catch (e) { return { ok: false, error: 'Lỗi list voices: ' + e.message }; }
}

// ── Liệt kê talking-photo của tài khoản. LƯU Ý: talking-photo tạo qua v1 upload KHÔNG hiện ở đây
// và HeyGen chưa hỗ trợ xoá qua API → phải xoá tay ở app.heygen.com. Giữ lệnh này phòng khi HeyGen mở API sau. ──
export async function handleLiveListAvatars() {
  const key = HEYGEN();
  if (!key) return { ok: false, error: 'Chưa cấu hình HEYGEN_API_KEY trên Vercel.' };
  try {
    const { ok, status, j, text } = await jparse(await fetch('https://api.heygen.com/v2/avatars', { headers: { 'X-Api-Key': key, Accept: 'application/json' } }));
    if (!ok) return { ok: false, error: 'HeyGen avatars HTTP ' + status + ': ' + clip(text) };
    const tp = j?.data?.talking_photos || [];
    return { ok: true, count: tp.length, talking_photos: tp.map(t => ({ id: t.talking_photo_id || t.id, name: t.talking_photo_name || t.name || '' })) };
  } catch (e) { return { ok: false, error: 'Lỗi list avatars: ' + e.message }; }
}

// ── Thử XOÁ 1 talking-photo/photo-avatar (thử nhiều endpoint vì HeyGen hay đổi/deprecate) ──
export async function handleLiveDelAvatar(body) {
  const key = HEYGEN();
  if (!key) return { ok: false, error: 'Chưa cấu hình HEYGEN_API_KEY trên Vercel.' };
  const { id } = body || {};
  if (!id) return { ok: false, error: 'Thiếu id avatar cần xoá.' };
  const urls = [
    'https://api.heygen.com/v2/photo_avatar/' + id,
    'https://api.heygen.com/v2/talking_photo/' + id,
    'https://api.heygen.com/v2/photo_avatar_group/' + id,
    'https://api.heygen.com/v1/talking_photo/' + id,
  ];
  const tries = [];
  for (const u of urls) {
    try {
      const { ok, status, j, text } = await jparse(await fetch(u, { method: 'DELETE', headers: { 'X-Api-Key': key, Accept: 'application/json' } }));
      tries.push({ url: u, status, ok, msg: clip(j?.error?.message || j?.message || text || '') });
      if (ok) return { ok: true, deleted: id, via: u };
    } catch (e) { tries.push({ url: u, err: e.message }); }
  }
  return { ok: false, error: 'Không xoá được qua API (HeyGen chưa hỗ trợ cho loại này).', tries };
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
    let tpWarn;
    // Upload ảnh thành talking photo (raw bytes) — dùng khi chưa có cache hoặc cache bị HeyGen xoá
    const uploadTalkingPhoto = async () => {
      const ir = await fetch(image_url);
      if (!ir.ok) return { error: 'Không tải được ảnh nhân vật (HTTP ' + ir.status + '). Kiểm bucket live-assets có public không.' };
      const type = imgType(ir.headers.get('content-type'));
      const imgBuf = Buffer.from(await ir.arrayBuffer());
      const up = await jparse(await fetch('https://upload.heygen.com/v1/talking_photo', { method: 'POST', headers: { 'X-Api-Key': key, 'Content-Type': type }, body: imgBuf }));
      const id = up.j?.data?.talking_photo_id;
      if (!id) return { error: 'HeyGen upload ảnh lỗi (HTTP ' + up.status + '): ' + clip(up.j?.message || up.text || 'không rõ') };
      if (intent_id) {
        const { error: e } = await store.from('livestream_clip_prod').upsert({ intent_id, talking_photo_id: id, tp_image_url: image_url, updated_at: new Date().toISOString() }, { onConflict: 'intent_id' });
        if (e) tpWarn = 'Không lưu được cache nhân vật (lần sau sẽ upload lại): ' + e.message;
      }
      return { id };
    };

    // TÁI DÙNG talking_photo_id nếu ảnh không đổi (upload mới mỗi lần = rác + dính trần group HeyGen)
    let talking_photo_id = null, reused = false;
    if (intent_id) {
      const { data: row } = await store.from('livestream_clip_prod').select('talking_photo_id, tp_image_url').eq('intent_id', intent_id).maybeSingle();
      if (row?.talking_photo_id && row.tp_image_url === image_url) { talking_photo_id = row.talking_photo_id; reused = true; }
    }
    if (!talking_photo_id) {
      const up = await uploadTalkingPhoto();
      if (!up.id) return { ok: false, error: up.error };
      talking_photo_id = up.id;
    }

    let vid = voice_id;
    if (!vid) { vid = await pickVietnameseVoice(key); if (!vid) return { ok: false, error: 'Không tìm thấy giọng Việt trong HeyGen (kiểm plan/voices).' }; }

    const doGenerate = async (tpId) => jparse(await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST', headers: { 'X-Api-Key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        video_inputs: [{
          character: { type: 'talking_photo', talking_photo_id: tpId, scale: 1.0, talking_photo_style: 'square' },
          voice: { type: 'text', voice_id: vid, input_text: script, speed: 1.0 },
        }],
        dimension: { width: 720, height: 1280 }, test: false, caption: false, title: `faq-${intent_id || ''}`,
      }),
    }));

    let gen = await doGenerate(talking_photo_id);
    let video_id = gen.j?.data?.video_id;
    // Nhân vật cache có thể đã bị xoá bên HeyGen → upload lại 1 lần rồi thử lại (chỉ khi đang tái dùng)
    if (!video_id && reused) {
      const up = await uploadTalkingPhoto();
      if (up.id) { talking_photo_id = up.id; gen = await doGenerate(talking_photo_id); video_id = gen.j?.data?.video_id; }
    }
    if (!video_id) return { ok: false, error: 'HeyGen tạo video lỗi (HTTP ' + gen.status + '): ' + clip(gen.j?.error?.message || gen.text || 'không rõ') };

    let warn = tpWarn;
    if (intent_id) {
      // video_url: '' — XOÁ link video CŨ khi phát video mới (kẻo check_video trả nhầm bản cũ đã lưu kho)
      const { error: e } = await store.from('livestream_clip_prod').upsert({ intent_id, video_id, voice_id: vid, video_url: '', status: 'lam', updated_at: new Date().toISOString() }, { onConflict: 'intent_id' });
      if (e) warn = (warn ? warn + ' · ' : '') + 'Video đang tạo nhưng lưu DB lỗi: ' + e.message;
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
    // Đã lưu vĩnh viễn rồi → trả luôn, khỏi gọi HeyGen / tải lại.
    // CHỈ khi video_id trong DB TRÙNG video_id đang hỏi — nếu user vừa gen video MỚI (video_id khác)
    // thì phải poll bản mới, không được trả nhầm video CŨ đã lưu.
    if (intent_id) {
      const { data: row } = await store.from('livestream_clip_prod').select('video_url, video_id').eq('intent_id', intent_id).maybeSingle();
      if (row?.video_url && row.video_url.includes(STORED_MARK) && row.video_id === video_id) {
        return { ok: true, status: 'completed', video_url: row.video_url, stored: true };
      }
    }

    const { ok, status, j, text } = await jparse(await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(video_id)}`, { headers: { 'X-Api-Key': key, Accept: 'application/json' } }));
    // !ok (401 key sai / 404 video_id sai / 429...) phải BÁO LỖI THẬT — không được rơi xuống 'processing' vô hạn
    if (!ok) return { ok: false, error: 'HeyGen poll HTTP ' + status + ': ' + clip(j?.message || j?.error?.message || text || 'không rõ') };
    const d = j?.data || {};
    if (d.status === 'completed' && d.video_url) {
      // Tải mp4 từ link HeyGen (7 ngày) → upload Storage → link bền. Lỗi thì fallback link tạm + cảnh báo.
      let finalUrl = d.video_url, stored = false, warn;
      try {
        // Timeout 60s (chừa thời gian upsert DB trước trần 90s Vercel) + check dung lượng TRƯỚC khi tải trọn vào RAM
        const vr = await fetch(d.video_url, { signal: AbortSignal.timeout(60000) });
        const clen = Number(vr.headers.get('content-length') || 0);
        if (vr.ok && clen > 45 * 1024 * 1024) {
          warn = 'Video ~' + Math.round(clen / 1048576) + 'MB (>45MB), không lưu kho — link HeyGen chỉ sống ~7 ngày, TẢI VỀ NGAY.';
        } else if (vr.ok) {
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
