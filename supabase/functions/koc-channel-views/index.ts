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

// NGUỒN CÀO TRẢ PHÍ (TikHub) — ỔN ĐỊNH hơn tikwm nhiều. Chỉ bật khi có key trong env TIKHUB_KEY.
// Chưa có key -> tự động dùng tikwm free như cũ (an toàn, không sập).
const TIKHUB_KEY = Deno.env.get('TIKHUB_KEY') || '';

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
async function fetchT(url: string, ms = 2500, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', ...extraHeaders }, signal: ctl.signal });
  } finally { clearTimeout(id); }
}

// Chuẩn hoá 1 video từ nhiều dạng response (TikHub app v3 aweme_list / web itemList / tikwm) về chung field tikwm.
function normVid(a: any): any | null {
  if (!a) return null;
  const play = a?.statistics?.play_count ?? a?.stats?.playCount ?? a?.play_count ?? a?.playCount ?? 0;
  const id = a?.aweme_id ?? a?.id ?? a?.video_id ?? '';
  const cover = a?.video?.cover?.url_list?.[0] ?? a?.video?.origin_cover?.url_list?.[0] ?? a?.video?.cover
    ?? a?.origin_cover?.url_list?.[0] ?? a?.cover ?? '';
  const ct = a?.create_time ?? a?.createTime ?? 0;
  const top = a?.is_top ?? a?.isTop ?? 0;
  if (!id) return null;
  return { play_count: Number(play) || 0, cover, video_id: String(id), create_time: Number(ct) || 0, is_top: top };
}

// CÀO TRẢ PHÍ TikHub — 1 phát ra video theo username. Trả {ok, videos} (đã chuẩn hoá field tikwm).
// ok=false -> rớt về tikwm free. Lỗi/hết tiền không tính phí bên TikHub.
async function tikhubPosts(username: string): Promise<{ ok: boolean; videos: any[]; dbg: any }> {
  const dbg: any = {};
  for (let attempt = 0; attempt < 2; attempt++) {   // TikHub thi thoảng lỗi tạm -> thử 2 lần
    try {
      const r = await fetchT(
        `https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_user_post_videos_v3?unique_id=${encodeURIComponent(username)}&count=15`,
        9000, { Authorization: `Bearer ${TIKHUB_KEY}`, 'Accept': 'application/json' });
      dbg.http = r.status;
      const j = await r.json();
      dbg.code = j?.code; dbg.msg = j?.detail || j?.message || j?.msg || '';
      const data = j?.data ?? j;
      dbg.dataKeys = Object.keys(data || {}).slice(0, 14);
      // CHỈ coi là mảng video khi TikTok THỰC SỰ trả về key danh sách. Nếu vắng HẲN (chỉ có
      // log_pb/status_code/version) => TikTok báo lỗi user (không resolve được unique_id), KHÔNG
      // phải "kênh trống" => arr=null => trả ok:false để RỚT về tikwm/follower thay vì báo "kênh ko tồn tại".
      let arr: any = null;
      for (const k of ['aweme_list', 'videos', 'itemList', 'aweme_details']) {
        if (Array.isArray(data?.[k])) { arr = data[k]; break; }
      }
      if (arr === null && Array.isArray(data?.data?.aweme_list)) arr = data.data.aweme_list;
      dbg.n = Array.isArray(arr) ? arr.length : 'no-list';
      dbg.item0 = Object.keys((Array.isArray(arr) ? arr[0] : {}) || {}).slice(0, 16);
      if ((j?.code === 200 || j?.code === 0) && Array.isArray(arr)) {
        return { ok: true, videos: arr.map(normVid).filter((v: any) => v), dbg };
      }
    } catch (e) { dbg.err = String(e); }
    if (attempt < 1) await new Promise((res) => setTimeout(res, 600));
  }
  return { ok: false, videos: [], dbg };
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

// Lấy NGÀY ĐĂNG (create_time) của 1 video theo aweme_id qua TikHub (fetch_one_video). Cho Hợp đồng.
async function tikhubVideoDate(awemeId: string): Promise<{ ok: boolean; create_time: number; dbg: any }> {
  const dbg: any = {};
  if (!TIKHUB_KEY) return { ok: false, create_time: 0, dbg: { err: 'no key' } };
  try {
    const r = await fetchT(
      `https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_one_video?aweme_id=${encodeURIComponent(awemeId)}`,
      9000, { Authorization: `Bearer ${TIKHUB_KEY}`, 'Accept': 'application/json' });
    dbg.http = r.status;
    const j = await r.json();
    dbg.code = j?.code; dbg.msg = j?.detail || j?.message || '';
    const data = j?.data ?? j;
    const detail = data?.aweme_detail ?? data?.aweme_details?.[0] ?? data?.aweme_list?.[0] ?? data;
    const ct = detail?.create_time ?? detail?.createTime ?? 0;
    dbg.keys = Object.keys(detail || {}).slice(0, 16);
    if (ct) return { ok: true, create_time: Number(ct), dbg };
  } catch (e) { dbg.err = String(e); }
  return { ok: false, create_time: 0, dbg };
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

    // Chế độ NGÀY AIR: trả ngày đăng của 1 video (Hợp đồng tự tính ngày). air_id = aweme_id.
    const airId = url.searchParams.get('air_id') || body.air_id || '';
    if (airId) {
      const r = await tikhubVideoDate(airId);
      const dateStr = r.ok && r.create_time ? new Date(r.create_time * 1000).toISOString().slice(0, 10) : '';
      return json({ ok: r.ok, aweme_id: airId, create_time: r.create_time, date: dateStr, _dbg: (url.searchParams.get('debug') === '1' ? r.dbg : undefined) });
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

    const debug = url.searchParams.get('debug') === '1' || body.debug === true;
    let vids: any[] = [];
    let serverBusy = true; // chưa cào được (khác với kênh không tồn tại thật)
    let info = { exists: false, follower: 0 };
    let tikhubDbg: any = null;

    // 1) ƯU TIÊN nguồn TRẢ PHÍ TikHub nếu đã cắm key (ổn định, 1 phát ra video).
    if (TIKHUB_KEY) {
      const th = await tikhubPosts(username);
      tikhubDbg = th.dbg;
      if (th.ok) { vids = th.videos; serverBusy = false; }
    }

    // 2) Chưa có key / TikHub lỗi -> tikwm FREE (cào posts 3 lần song song + cào follower cứu cánh CÙNG LÚC).
    if (serverBusy) {
      const postsP = Promise.all([onePostsFetch(username), onePostsFetch(username), onePostsFetch(username)])
        .then((batch) => batch.find((b) => b !== null));   // undefined nếu cả 3 fail
      const infoP = tikwmUserInfo(username);
      const [postsHit, tinfo] = await Promise.all([postsP, infoP]);
      info = tinfo;
      if (postsHit !== undefined) { vids = postsHit as any[]; serverBusy = false; }  // [] (kênh trống) cũng tính là "được"
    }

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
    return json({ ok: true, cached: false, nguong: NGUONG, ...row, ...(debug ? { _tikhub: tikhubDbg } : {}) });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
