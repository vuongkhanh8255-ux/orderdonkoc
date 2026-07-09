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

    // tikwm /user/posts CHẬP CHỜN: ~4-5 lần mới được 1 lần (trả code:-1 "Server error!" xen kẽ).
    // Gọi 1 lần → đa số rớt → chặn đơn oan. RETRY tới 8 lần (giãn 1.2s) tới khi code:0.
    let vids: any[] = [];
    let serverBusy = false; // tikwm lỗi tạm (khác với kênh không tồn tại thật)
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const r = await fetch(`https://www.tikwm.com/api/user/posts?unique_id=${encodeURIComponent(username)}&count=15`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const j = await r.json();
        if (j?.code === 0) { vids = j?.data?.videos || []; serverBusy = false; break; }
        // code != 0 → tikwm bận/lỗi tạm → thử lại
        serverBusy = true;
      } catch (_) { serverBusy = true; }
      if (attempt < 7) await new Promise((res) => setTimeout(res, 1200));
    }

    let row: any;
    if (!vids.length) {
      // Phân biệt: tikwm bận (busy=true, cho qua tạm khỏi chặn) vs kênh thật sự không có video.
      row = { username, total_view: 0, video_count: 0, dat: false, videos: [], videos_all: [], busy: serverBusy,
        err: serverBusy
          ? 'Dịch vụ cào view đang bận (tikwm lỗi tạm) — thử lại sau vài giây hoặc bấm cào lại.'
          : 'Không lấy được video (kênh riêng tư / không tồn tại / TikTok chặn tạm)', checked_at: new Date().toISOString() };
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

    // KHÔNG cache khi tikwm bận (kẻo giữ lỗi tạm 30 ngày) — chỉ lưu kết quả CHẮC CHẮN.
    if (!serverBusy) await supa.from('koc_channel_views').upsert(row, { onConflict: 'username' });
    return json({ ok: true, cached: false, nguong: NGUONG, ...row });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
