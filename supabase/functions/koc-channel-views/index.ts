// Edge Function Supabase: cào view kênh KOC qua tikwm (miễn phí). Deploy: verify_jwt=false.
// Bỏ video GHIM (is_top), cộng view 7 video mới nhất. dat = tổng >= NGUONG (1500).
// Cache vào bảng koc_channel_views (khỏi cào lại 30 ngày). Trang Order gọi qua supabase.functions.invoke('koc-channel-views').
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const NGUONG = 1500;        // ngưỡng ĐẠT
const SO_VIDEO = 7;         // cộng 7 video mới nhất (sau khi bỏ ghim)
const CACHE_NGAY = 30;      // cào lại sau 30 ngày

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = new URL(req.url);
    let username = url.searchParams.get('username') || '';
    let force = url.searchParams.get('force') === '1';
    if (req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      username = username || b.username || '';
      force = force || b.force === true || b.force === '1';
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

    let vids: any[] = [];
    try {
      const r = await fetch(`https://www.tikwm.com/api/user/posts?unique_id=${encodeURIComponent(username)}&count=15`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const j = await r.json();
      vids = j?.data?.videos || [];
    } catch (_) { /* mạng lỗi → coi như 0 video */ }

    let row: any;
    if (!vids.length) {
      row = { username, total_view: 0, video_count: 0, dat: false, videos: [],
        err: 'Không lấy được video (kênh riêng tư / không tồn tại / TikTok chặn tạm)', checked_at: new Date().toISOString() };
    } else {
      const list = vids
        .filter((v: any) => !v.is_top)                                  // bỏ video GHIM
        .sort((a: any, b: any) => (b.create_time || 0) - (a.create_time || 0))
        .slice(0, SO_VIDEO);
      const total = list.reduce((s: number, v: any) => s + (Number(v.play_count) || 0), 0);
      row = {
        username, total_view: total, video_count: list.length, dat: total >= NGUONG,
        videos: list.map((v: any) => ({ cover: v.cover, view: Number(v.play_count) || 0, id: v.video_id })),
        err: null, checked_at: new Date().toISOString(),
      };
    }

    await supa.from('koc_channel_views').upsert(row, { onConflict: 'username' });
    return json({ ok: true, cached: false, nguong: NGUONG, ...row });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
