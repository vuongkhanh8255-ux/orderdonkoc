/*
 * Nap kho cau hoi (intent) + logic tu Supabase — dung chung nguon voi dashboard "Module 4: Live AI"
 * trong koc-tool. Sua tren web -> agent tu lay, khoi xuat faq.json tay.
 * Neu khong cau hinh supabase (hoac loi mang) -> tra null de index.js fallback ve faq.json.
 * Dung global fetch (Node >= 18).
 *
 * 4/8/2026 — THEO TUNG GIAN HANG: moi gian co kho cau hoi + bo clip RIENG (clip la noi dung cua
 * chinh shop do: gia, san pham, chinh sach ship, nguoi mau). Truoc day agent nap TAT CA intent
 * bat ky shop nao -> may live shop A co the phat clip shop B. Nay BAT BUOC loc theo shop_key.
 * shop_key lay tu config.json ("shop"), dinh dang "san|ten" — bam nut Copy trong Module 4.
 */
export async function loadFromSupabase(sb, shopKey) {
  if (!sb || !sb.url || !sb.anonKey) return null;
  if (!shopKey) return null;                 // chua khai gian hang -> index.js se bao loi ro rang
  const base = String(sb.url).replace(/\/$/, '');
  const headers = { apikey: sb.anonKey, Authorization: `Bearer ${sb.anonKey}` };
  const q = encodeURIComponent(shopKey);     // ten gian co dau + ky tu '|' -> phai encode

  const [intentsRes, cfgRes] = await Promise.all([
    fetch(`${base}/rest/v1/livestream_intents?select=id,label,keywords,clip,clips&enabled=eq.true&shop_key=eq.${q}&order=sort_order.asc`, { headers }),
    fetch(`${base}/rest/v1/livestream_config?select=cooldown_sec,min_confidence,max_queue&id=eq.${q}`, { headers }),
  ]);
  if (!intentsRes.ok) throw new Error('intents HTTP ' + intentsRes.status);

  const intents = (await intentsRes.json()) || [];
  const cfgArr = cfgRes.ok ? ((await cfgRes.json()) || []) : [];
  const c = cfgArr[0] || {};
  const logic = {
    cooldownSec: c.cooldown_sec ?? 45,
    minConfidence: c.min_confidence ?? 1,
    maxQueue: c.max_queue ?? 3,
  };
  return {
    // `clips` = danh sach clip de XOAY VONG. Cau nao chua co mang thi dung tam `clip` cu (1 cai).
    intents: intents.map((i) => {
      const ds = Array.isArray(i.clips) ? i.clips.map((c) => String(c || '').trim()).filter(Boolean) : [];
      const mot = String(i.clip || '').trim();
      return {
        id: i.id, label: i.label, keywords: i.keywords || [],
        clips: ds.length ? ds : (mot ? [mot] : []),
        clip: ds[0] || mot || '',        // giu cho cho nao con doc 1 clip
      };
    }),
    logic,
  };
}
