// Tính NGÂN SÁCH booking (carryover) — DÙNG CHUNG cho Tạm đối chiếu (BookingBudgetTab) và
// Báo cáo nhân sự (BookingStaffReportTab) → 2 chỗ KHỚP 100% vì cùng 1 công thức + cùng nguồn.
// Mỗi tháng (từ T3/2026): ĐM thực = base(GMV lũy kế×2.2%, sàn 15tr) + dư cộng dồn tháng trước + CỘNG TAY
// (booking_budget_extra). Còn lại = ĐM thực − đã chi. Dư xài ko hết → cộng sang tháng sau; vượt (âm) về 0.
import { supabase } from '../supabaseClient';

export const BUDGET_START = { y: 2026, m: 3 };
const HIDDEN = ['Ngọc Quỳnh', 'Anh Kiệt', 'Thiệu Huy', 'Trúc Linh'];
export const isHiddenStaff = (name) => HIDDEN.some(h => String(name || '').toLowerCase().includes(h.toLowerCase()));

// Dãy tháng 'YYYY-MM' từ T3/2026 → tháng của toYmd (mặc định hôm nay).
export function budgetMonths(toYmd) {
  let y = BUDGET_START.y, m = BUDGET_START.m, ey, em;
  if (toYmd) { const p = String(toYmd).split('-').map(Number); ey = p[0]; em = p[1]; }
  else { const d = new Date(); ey = d.getFullYear(); em = d.getMonth() + 1; }
  const out = [];
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

// Load 3 nguồn (định mức base, đã chi, cộng tay) → maps theo [staff][ym].
export async function loadBudgetMaps(toYmd) {
  const from = `${BUDGET_START.y}-${String(BUDGET_START.m).padStart(2, '0')}-01`;
  const to = toYmd || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const [dm, cast, extra] = await Promise.all([
    supabase.rpc('booking_dinhmuc_by_staff_month'),
    supabase.rpc('booking_cast_by_month', { p_from: from, p_to: to }),
    supabase.from('booking_budget_extra').select('staff_name, ym, amount'),
  ]);
  const baseMap = {}, spentMap = {}, extraMap = {};
  (dm.data || []).forEach(r => { const k = `${r.year}-${String(r.month).padStart(2, '0')}`; (baseMap[r.staff] = baseMap[r.staff] || {})[k] = Number(r.dinh_muc) || 0; });
  (cast.data || []).forEach(r => { const x = (spentMap[r.staff] = spentMap[r.staff] || {}); x[r.air_month] = (x[r.air_month] || 0) + (Number(r.cast_net) || 0); });
  (extra.data || []).forEach(r => { const x = (extraMap[r.staff_name] = extraMap[r.staff_name] || {}); x[r.ym] = (x[r.ym] || 0) + (Number(r.amount) || 0); });
  return { baseMap, spentMap, extraMap };
}

// Carryover. Trả { [staff]: { cells: {ym:{base,extra,carryIn,dmThuc,xai,conLai}}, lastConLai, lastYm } }.
// CÙNG công thức với reconPivot trong BookingBudgetTab (giữ giống hệt → khớp 100%).
export function computeBudget(baseMap, spentMap, extraMap, mKeys) {
  const staffSet = new Set([...Object.keys(baseMap), ...Object.keys(spentMap), ...Object.keys(extraMap)].filter(s => !isHiddenStaff(s)));
  const out = {};
  for (const staff of staffSet) {
    let started = false, carry = 0, lastConLai = 0, lastYm = '';
    const cells = {};
    for (const mk of mKeys) {
      const hasBase = baseMap[staff]?.[mk] != null;
      const xai = spentMap[staff]?.[mk] || 0;
      const ex = extraMap[staff]?.[mk] || 0;
      if (!started && !hasBase && xai <= 0 && ex <= 0) continue;
      started = true;
      const base = baseMap[staff]?.[mk] ?? 15000000;
      const dmThuc = base + carry + ex;
      const conLai = dmThuc - xai;
      cells[mk] = { base, extra: ex, carryIn: carry, dmThuc, xai, conLai };
      carry = Math.max(0, conLai); lastConLai = conLai; lastYm = mk;
    }
    if (Object.keys(cells).length) out[staff] = { cells, lastConLai, lastYm };
  }
  return out;
}

// Tiện ích: ngân sách CÒN LẠI + ĐM thực của THÁNG endYm cho từng nhân sự (để Báo cáo nhân sự hiện cột).
// Tính carryover trên TOÀN kỳ (T3→nay, y như Tạm đối chiếu) rồi ĐỌC đúng ô tháng endYm → khớp 100%.
export async function budgetRemainingByStaff(endYm) {
  const { baseMap, spentMap, extraMap } = await loadBudgetMaps();
  const mKeys = budgetMonths();
  const target = (endYm && mKeys.includes(endYm)) ? endYm : mKeys[mKeys.length - 1];
  const all = computeBudget(baseMap, spentMap, extraMap, mKeys);
  const res = {};
  for (const [staff, v] of Object.entries(all)) {
    const c = v.cells[target];
    res[staff] = c ? { conLai: c.conLai, dmThuc: c.dmThuc, xai: c.xai, extra: c.extra }
                   : { conLai: 0, dmThuc: 0, xai: 0, extra: 0 }; // tháng đó nhân sự chưa hoạt động
  }
  return res;
}
