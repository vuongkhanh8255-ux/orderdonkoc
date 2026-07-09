// Edge Function Supabase: cào view kênh KOC qua tikwm (miễn phí). Deploy verify_jwt=false.
// Bỏ video GHIM (is_top), cộng view 7 video mới nhất. dat = tổng >= NGUONG (1500).
// Cache vào bảng koc_channel_views (30 ngày). Order gọi qua supabase.functions.invoke('koc-channel-views').
// THÊM (v2): ?video_id=... (+ vuser) -> trả link mp4 trực tiếp (play/hdplay) để phát <video>,
//   lách chặn embed video gắn giỏ hàng (TikTok chặn embed loại này, chỉ app mới coi được).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const NGUONG = 1500;
const SO_VIDEO = 7;              // số video tính NGƯỠNG (bỏ ghim)
const SO_VIDEO_DISPLAY = 10;    // số video trả về để XEM (popup phóng to)
const CACHE_NGAY = 30;
const FOLLOWER_DAT = 2000;      // cào posts fail nhưng follower >= mức này -> coi như ĐẠT (kênh thật, xịn)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function normUser(raw: string): string {
  const s = (raw || '').trim();
  const m = s.match(/tiktok\.com\/@?([\w.\-]+)/i);
  return (m ? m[1] : s).toLowerCase().replace(/^@/, '').replace(/[\/?#].*$/, '').trim();
}

// fetch có GIỚI HẠN THỜI GIAN: tikwm khi lỗi trả chậm ~3s, cắt sớm để đỡ treo popup.
async function fetchT(url: string, ms = 2500): Promise<Response> {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: ctl.signal });
  } finally { clearTimeout(id); }
}

// Lấy thông tin kênh (follower...) — dùng làm CỨU CÁNH khi /user/posts cào không nổi.
// Endpoint này ỔN ĐỊNH hơn nhiều so với /user/posts.
async function tikwmUserInfo(username: string): Promise<{ exists: boolean; follower: number }> {
  // Endpoint này ỔN ĐỊNH — thử tối đa 2 lần TUẦN TỰ (nhẹ tay, tránh bị tikwm rate-limit).
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetchT(`https://www.tikwm.com/api/user/info?unique_id=${encodeURIComponent(username)}`);
      const j = await r.json();
      if (j?.code === 0) {
        const s = j?.data?.stats || {};
        return { exists: true, follower: Number(s.followerCount ?? j?.data?.user?.followerCount ?? 0) || 0 };
      }
    } catch (_) { /* lỗi */ }
  }
  return { exists: false, follower: 0 };
}

// 1 lần gọi /user/posts. Trả mảng video nếu code:0 (kể cả [] khi kênh trống), null nếu tikwm lỗi.
async function onePostsFetch(username: string): Promise<any[] | null> {
  try {
    const r = await fetchT(`https://www.tikwm.com/api/user/posts?unique_id=${encodeURIComponent(username)}&count=15`);
    const j = await r.json();
    if (j?.code === 0) return j?.data?.videos || [];
  } catch (_) { /* lỗi mạng */ }
  return null;
}

async function tikwmPlay(link: string) {
  try {
    const r = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(link)}&hd=1`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const j = await r.json();
    return { play: j?.data?.play || null, wmplay: j?.data?.wmplay || null, hdplay: j?.data?.hdplay || null };
  } catch (_) { return { play: null, wmplay: null, hdplay: null }; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    let username = url.searchParams.get('username') || body.username || '';
    const force = url.searchParams.get('force') === '1' || body.force === true || body.force === '1';
    const videoId = url.searchParams.get('video_id') || body.video_id || '';
    const vuser = normUser(url.searchParams.get('vuser') || body.vuser || username);

    // Chế độ PHÁT: lấy link mp4 trực tiếp cho 1 video (KHÔNG cache, luôn tươi vì URL hết hạn).
    if (videoId) {
      const link = vuser ? `https://www.tiktok.com/@${vuser}/video/${videoId}` : `https://www.tiktok.com/video/${videoId}`;
      const p = await tikwmPlay(link);
      return json({ ok: true, video_id: videoId, ...p });
    }

    username = normUser(username);
    if (!username) return json({ ok: false, error: 'thiếu username' }, 400);

    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    if (!force) {
      const { data: c } = await supa.from('koc_channel_views').select('*').eq('username', username).maybeSingle();
      if (c?.checked_at && Date.now() - new Date(c.checked_at).getTime() < CACHE_NGAY * 86400000) {
        return json({ ok: true, cached: true, nguong: NGUONG, ...c });
      }
    }

    // Chạy SONG SONG: cào posts (view thật, 3 lần vì tikwm chập chờn ~1/3) + cào follower (cứu cánh) CÙNG LÚC.
    // Xong sớm cái nào xài cái đó -> ~2-3s. posts được -> tính view thật; posts fail -> đã có follower sẵn.
    const postsP = Promise.all([onePostsFetch(username), onePostsFetch(username), onePostsFetch(username)])
      .then((batch) => batch.find((b) => b !== null));   // undefined nếu cả 3 fail
    const infoP = tikwmUserInfo(username);
    const [postsHit, info] = await Promise.all([postsP, infoP]);

    let vids: any[] = [];
    let serverBusy = true; // tikwm lỗi tạm (khác với kênh không tồn tại thật)
    if (postsHit !== undefined) { vids = postsHit as any[]; serverBusy = false; }  // [] (kênh trống) cũng tính là "được"

    let row: any;
    let shouldCache = true;   // chỉ cache kết quả CHẮC CHẮN; ca "bận không rõ" -> khỏi cache để lần sau cào lại
    if (!vids.length) {
      // Cào posts KHÔNG NỔI. Dùng FOLLOWER (đã cào song song sẵn) làm cứu cánh.
      // Kênh nhiều follower (>= FOLLOWER_DAT) chắc chắn là kênh thật/xịn -> coi như ĐẠT,
      // khỏi chặn oan (vd hoangson71gym 48k follower nhưng tikwm cào posts fail 100%).
      const follower = serverBusy ? info.follower : 0;
      const existed = serverBusy ? info.exists : false;
      if (serverBusy && existed && follower >= FOLLOWER_DAT) {
        row = { username, total_view: 0, video_count: 0, dat: true, videos: [], videos_all: [],
          busy: false, follower_count: follower, by_follower: true, err: null, checked_at: new Date().toISOString() };
        shouldCache = true;   // kênh thật + nhiều follower -> cache bình thường
      } else if (serverBusy) {
        // Tikwm bận + không đủ tín hiệu follower -> KHÔNG chặn cứng (cho nhân sự tự quyết), khỏi cache.
        row = { username, total_view: 0, video_count: 0, dat: false, videos: [], videos_all: [],
          busy: true, follower_count: follower, by_follower: false,
          err: existed
            ? `Tikwm cào view không nổi kênh này lúc này (kênh có thật, ${follower.toLocaleString('vi-VN')} follower) — vẫn có thể tạo đơn.`
            : 'Dịch vụ cào view đang bận (tikwm lỗi tạm) — thử lại sau vài giây hoặc bấm cào lại.',
          checked_at: new Date().toISOString() };
        shouldCache = false;
      } else {
        // Tikwm trả code:0 nhưng KHÔNG có video -> kênh riêng tư / mới tạo / xoá hết clip.
        row = { username, total_view: 0, video_count: 0, dat: false, videos: [], videos_all: [],
          busy: false, follower_count: 0, by_follower: false,
          err: 'Không lấy được video (kênh riêng tư / không tồn tại / TikTok chặn tạm)', checked_at: new Date().toISOString() };
      }
    } else {
      const sorted = vids
        .filter((v: any) => !v.is_top)
        .sort((a: any, b: any) => (b.create_time || 0) - (a.create_time || 0));
      const list = sorted.slice(0, SO_VIDEO);          // 7 video tính ngưỡng
      const disp = sorted.slice(0, SO_VIDEO_DISPLAY);  // ~10 video để xem trong popup
      const total = list.reduce((s: number, v: any) => s + (Number(v.play_count) || 0), 0);
      const mapV = (v: any) => ({ cover: v.cover, view: Number(v.play_count) || 0, id: v.video_id });
      row = {
        username, total_view: total, video_count: list.length, dat: total >= NGUONG,
        videos: list.map(mapV),
        videos_all: disp.map(mapV),
        err: null, checked_at: new Date().toISOString(),
      };
    }

    // Chỉ cache kết quả CHẮC CHẮN (có video / follower cứu cánh / kênh trống thật).
    // Ca "tikwm bận không rõ" -> shouldCache=false để lần sau cào lại tươi.
    if (shouldCache) await supa.from('koc_channel_views').upsert(row, { onConflict: 'username' });
    return json({ ok: true, cached: false, nguong: NGUONG, ...row });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
