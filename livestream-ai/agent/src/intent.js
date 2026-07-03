/*
 * Nhan dien cau hoi tieng Viet tu comment -> chon intent (clip tra loi).
 * Tang 1: keyword match sau khi chuan hoa (bo dau, thuong hoa, map viet tat).
 * Du de bat ~70-80% cau FAQ pho bien, chi phi 0, do tre ~0ms.
 * (Tang 2 embedding se them sau khi Phase 0 qua ai.)
 */

// Bo dau tieng Viet
export function removeDiacritics(str) {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

// Map viet tat / teencode pho bien khi chat live
const ABBR = {
  k: 'khong', ko: 'khong', kg: 'khong', hok: 'khong', khong: 'khong',
  bn: 'bao nhieu', bnhieu: 'bao nhieu',
  sp: 'san pham', shx: 'shop', sh: 'shop',
  ib: 'inbox', r: 'roi', dc: 'duoc', đc: 'duoc',
  vs: 'voi', vch: 'voucher', km: 'khuyen mai',
  m: 'may', j: 'gi', z: 'gi', mn: 'moi nguoi'
};

export function normalize(text) {
  let t = removeDiacritics(String(text || '')).toLowerCase();
  t = t.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  // Map viet tat theo tung tu
  t = t
    .split(' ')
    .map((w) => ABBR[w] || w)
    .join(' ');
  return t;
}

/*
 * So khop comment voi danh sach intent.
 * Diem = so keyword khop (keyword cung duoc bo dau truoc de so).
 * Tra { intent, score } hoac null neu duoi nguong.
 */
export function matchIntent(text, intents, minScore = 1) {
  const norm = normalize(text);
  if (!norm) return null;

  let best = null;
  let bestScore = 0;

  for (const intent of intents) {
    let score = 0;
    for (const kw of intent.keywords || []) {
      const nkw = normalize(kw);
      if (!nkw) continue;
      // Khop nguyen cum (co ranh gioi) de tranh dinh chu
      if (norm === nkw || norm.includes(' ' + nkw + ' ') ||
          norm.startsWith(nkw + ' ') || norm.endsWith(' ' + nkw) ||
          norm.includes(nkw)) {
        // Cum dai khop duoc tinh diem cao hon (uu tien cu the)
        score += nkw.includes(' ') ? 2 : 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = intent;
    }
  }

  if (best && bestScore >= minScore) {
    return { intent: best, score: bestScore };
  }
  return null;
}
