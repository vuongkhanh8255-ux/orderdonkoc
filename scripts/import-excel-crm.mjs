/**
 * scripts/import-excel-crm.mjs
 * Import data từ file Excel "PLAN SALE ZALO GROUP" vào Supabase CRM tables
 */
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const EXCEL_PATH = 'D:\\PLAN SALE ZALO GROUP_______.xlsx';

// Supabase config — dùng service key
const sbUrl = process.env.SUPABASE_URL || 'https://xkyhvcmnkrxdtmwtghln.supabase.co';
const sbKey = process.env.SUPABASE_SERVICE_KEY;
if (!sbKey) {
  console.error('❌ Cần SUPABASE_SERVICE_KEY env var');
  process.exit(1);
}
const supabase = createClient(sbUrl, sbKey, { auth: { persistSession: false } });

const wb = XLSX.readFile(EXCEL_PATH);
const getSheet = (name) => {
  const ws = wb.Sheets[name];
  if (!ws) { console.warn(`⚠️  Sheet "${name}" không tìm thấy`); return []; }
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const clean = (v) => String(v || '').trim();
const cleanPhone = (v) => {
  let p = clean(v).replace(/[^0-9+]/g, '');
  if (p.startsWith('+84')) p = '0' + p.slice(3);
  if (p.startsWith('84') && p.length >= 11) p = '0' + p.slice(2);
  // Remove leading double zeros
  if (p.startsWith('00')) p = '0' + p.slice(2);
  return p;
};
const excelDate = (v) => {
  if (!v) return null;
  if (typeof v === 'number') {
    // Excel serial date
    const d = new Date((v - 25569) * 86400000);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = clean(v);
  // Try DD/MM/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
};
const parseAmount = (v) => {
  const n = parseFloat(String(v || '0').replace(/[^0-9.,-]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

const BATCH = 500;
const upsertBatch = async (table, records, conflict = 'phone') => {
  let total = 0, errors = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: conflict });
    if (error) {
      console.error(`  ❌ ${table} batch ${i}: ${error.message}`);
      errors++;
    } else {
      total += batch.length;
    }
  }
  return { total, errors };
};

const insertBatch = async (table, records) => {
  let total = 0, errors = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      console.error(`  ❌ ${table} batch ${i}: ${error.message}`);
      errors++;
    } else {
      total += batch.length;
    }
  }
  return { total, errors };
};

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. DS SPA QUEN (Khách quen — 2.1, 3.1, DS SỈ OIL) ─────────────────────
const importSpaQuen = () => {
  const customers = [];

  // 2.1 DS SPA QUEN_KAH (row 2 = header)
  const kah = getSheet('2.1 DS SPA QUEN_KAH');
  for (let i = 2; i < kah.length; i++) {
    const row = kah[i];
    const phone = cleanPhone(row[9]); // SĐT col index 9
    const name = clean(row[1]);       // TÊN KHÁCH
    if (!phone && !name) continue;
    customers.push({
      phone: phone || `KAH-QUEN-${i}`,
      full_name: name,
      nick_id: clean(row[2]),
      order_count: parseInt(row[3]) || 0,
      total_quantity: parseInt(row[4]) || 0,
      business_type: 'SPA - CLINIC',
      data_source: clean(row[7]) || 'Sàn TMĐT',  // SÀN
      address: clean(row[8]),
      email: clean(row[10]),
      province: '',
      customer_type: 'Cũ',
      sales_person: 'KỲ ANH',
      contact_status: clean(row[11]) === 'true' ? 'Đã liên hệ' : 'Chưa liên hệ',
      created_date: excelDate(row[12]) || '2026-01-01',
    });
  }
  console.log(`  2.1 DS SPA QUEN_KAH: ${customers.length} KH`);

  // 3.1 DS SPA QUEN_HẠNH (row 2 = header)
  const hanh = getSheet('3.1 DS SPA QUEN_HẠNH');
  const before = customers.length;
  for (let i = 2; i < hanh.length; i++) {
    const row = hanh[i];
    const phone = cleanPhone(row[9]); // SĐT/MAIL
    const name = clean(row[1]);
    if (!phone && !name) continue;
    customers.push({
      phone: phone || `HANH-QUEN-${i}`,
      full_name: name,
      nick_id: clean(row[2]),
      order_count: parseInt(row[3]) || 0,
      total_quantity: parseInt(row[4]) || 0,
      business_type: 'SPA - CLINIC',
      data_source: clean(row[7]) || 'Sàn TMĐT',
      address: clean(row[8]),
      province: '',
      customer_type: 'Cũ',
      sales_person: 'HẠNH',
      contact_status: clean(row[10]) === 'true' ? 'Đã liên hệ' : 'Chưa liên hệ',
      created_date: excelDate(row[11]) || '2026-01-01',
    });
  }
  console.log(`  3.1 DS SPA QUEN_HẠNH: ${customers.length - before} KH`);

  // DS SỈ OIL EHERB (row 1 = header)
  const oil = getSheet('DS SỈ OIL EHERB');
  const before2 = customers.length;
  for (let i = 1; i < oil.length; i++) {
    const row = oil[i];
    const phone = cleanPhone(row[8]); // SĐT/MAIL
    const name = clean(row[1]);
    if (!phone && !name) continue;
    customers.push({
      phone: phone || `OIL-${i}`,
      full_name: name,
      nick_id: clean(row[2]),
      order_count: parseInt(row[3]) || 0,
      total_quantity: parseInt(row[4]) || 0,
      business_type: 'Sỉ Oil eHerb',
      data_source: clean(row[6]) || 'Sàn TMĐT',
      address: clean(row[7]),
      province: '',
      customer_type: 'Cũ',
      sales_person: '',
      contact_status: clean(row[9]) === 'x' ? 'Đã liên hệ' : 'Chưa liên hệ',
      created_date: '2026-01-01',
    });
  }
  console.log(`  DS SỈ OIL EHERB: ${customers.length - before2} KH`);

  return customers;
};

// ── 2. DS SPA MỚI (2.2, 3.2, 3.3) ──────────────────────────────────────────
const importSpaMoi = () => {
  const customers = [];

  // 2.2 DS SPA MỚI_KAH (row 2 = data, row 1 = header)
  const kah = getSheet('2.2 DS SPA MỚI_KAH');
  for (let i = 2; i < kah.length; i++) {
    const row = kah[i];
    const phone = cleanPhone(row[3]); // SDT
    const name = clean(row[1]);       // TÊN
    if (!phone && !name) continue;
    customers.push({
      phone: phone || `KAH-MOI-${i}`,
      full_name: name,
      address: clean(row[2]),
      province: clean(row[4]),
      business_type: clean(row[5]) || 'SPA - CLINIC',
      customer_type: 'Mới',
      data_source: 'Zalo SPA',
      sales_person: 'KỲ ANH',
      contact_status: clean(row[6]) === 'true' ? 'Đã liên hệ' : 'Chưa liên hệ',
      created_date: excelDate(row[7]) || '2026-01-01',
    });
  }
  console.log(`  2.2 DS SPA MỚI_KAH: ${customers.length} KH`);

  // 3.2 DS SPA MỚI_HẠNH (row 2 = data, row 1 = header, col 0 = region)
  const hanh = getSheet('3.2 DS SPA MỚI_HẠNH');
  const before = customers.length;
  let currentRegion = '';
  for (let i = 2; i < hanh.length; i++) {
    const row = hanh[i];
    if (clean(row[0])) currentRegion = clean(row[0]);
    const phone = cleanPhone(row[6]); // SDT
    const name = clean(row[2]);       // TÊN
    if (!phone && !name) continue;
    customers.push({
      phone: phone || `HANH-MOI-${i}`,
      full_name: name,
      address: clean(row[3]),
      province: clean(row[4]) || currentRegion,
      business_type: clean(row[5]) || 'SPA - CLINIC',
      customer_type: 'Mới',
      data_source: 'Zalo SPA',
      sales_person: 'HẠNH',
      contact_status: clean(row[7]) === 'true' ? 'Đã liên hệ' : 'Chưa liên hệ',
      created_date: excelDate(row[8]) || '2026-01-01',
      region: currentRegion,
    });
  }
  console.log(`  3.2 DS SPA MỚI_HẠNH: ${customers.length - before} KH`);

  // 3.3 DS SPA MỚI_HUỆ (row 2 = data)
  const hue = getSheet('3.3 DS SPA MỚI_HUỆ');
  const before2 = customers.length;
  for (let i = 2; i < hue.length; i++) {
    const row = hue[i];
    const phone = cleanPhone(row[3]); // SDT
    const name = clean(row[1]);       // TÊN
    if (!phone && !name) continue;
    customers.push({
      phone: phone || `HUE-MOI-${i}`,
      full_name: name,
      address: clean(row[2]),
      province: clean(row[4]),
      business_type: clean(row[5]) || 'SPA - CLINIC',
      customer_type: 'Mới',
      data_source: 'Zalo SPA',
      sales_person: 'HUỆ',
      contact_status: clean(row[6]) === 'true' ? 'Đã liên hệ' : 'Chưa liên hệ',
      created_date: excelDate(row[7]) || '2026-01-01',
    });
  }
  console.log(`  3.3 DS SPA MỚI_HUỆ: ${customers.length - before2} KH`);

  return customers;
};

// ── 3. ĐƠN SỈ (1.3) ────────────────────────────────────────────────────────
const importDonSi = () => {
  const orders = [];
  const data = getSheet('1.3 DATA ĐƠN SỈ');
  // Row 0 = header: STT, NGÀY, HỌ VÀ TÊN, ID KHÁCH, SẢN PHẨM, MÃ ĐƠN SÀN, SĐT, ĐỊA CHỈ, TỈNH, LOẠI HÌNH KD, PHÂN LOẠI ĐƠN, NGUỒN, SỐ TIỀN, ID ĐƠN NHANH, MÃ VẬN ĐƠN, TRẠNG THÁI ĐƠN
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = clean(row[2]);
    const phone = cleanPhone(row[6]);
    if (!name && !phone) continue;
    orders.push({
      order_code: clean(row[5]) || `SI-${i}`,
      order_type: 'Đơn sỉ',
      order_source: clean(row[11]) || 'Zalo SPA',
      recipient_name: name,
      recipient_phone: phone || `SI-PHONE-${i}`,
      recipient_address: clean(row[7]),
      product_name: clean(row[4]),
      total_amount: parseAmount(row[12]),
      customer_ref: clean(row[13]),
      shipping_code: clean(row[14]),
      status: clean(row[15]) || 'Mới',
      order_date: excelDate(row[1]),
      campaign: clean(row[10]),
      payment_method: 'Chuyển khoản',
    });
  }
  return orders;
};

// ── 4. ĐƠN CRM T1-T4 (sheet 14) ────────────────────────────────────────────
const importDonCRM = () => {
  const orders = [];
  const data = getSheet('5. ĐƠN CRM T1-T4');
  // Row 0 = header: STT, NGÀY, HỌ VÀ TÊN, SĐT, ĐỊA CHỈ, PHÂN LOẠI ĐƠN, MÃ ĐƠN, NGUỒN, CHIẾN DỊCH, SỐ TIỀN, ID ĐƠN NHANH, MÃ VẬN ĐƠN, TRẠNG THÁI ĐƠN
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = clean(row[2]);
    const phone = cleanPhone(row[3]);
    if (!name && !phone) continue;
    orders.push({
      order_code: clean(row[6]) || `CRM-${i}`,
      order_type: clean(row[5]) || 'Đơn CRM',
      order_source: clean(row[7]) || 'CRM',
      recipient_name: name,
      recipient_phone: phone || `CRM-PHONE-${i}`,
      recipient_address: clean(row[4]),
      total_amount: parseAmount(row[9]),
      customer_ref: clean(row[10]),
      shipping_code: clean(row[11]),
      status: clean(row[12]) || 'Mới',
      order_date: excelDate(row[1]),
      campaign: clean(row[8]),
      payment_method: 'COD',
    });
  }
  return orders;
};

// ── 5. ĐƠN QUÀ TẶNG (sheet 15) ─────────────────────────────────────────────
const importDonQuaTang = () => {
  const orders = [];
  const data = getSheet('6. ĐƠN KH QUÀ TẶNG');
  // Row 0 = header: STT, TÊN NGƯỜI NHẬN, SĐT, ĐỊA CHỈ NHẬN QUÀ, MÃ ĐƠN SÀN, EMAIL, MÃ ĐƠN WEB
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = clean(row[1]);
    const phone = cleanPhone(row[2]);
    if (!name && !phone) continue;
    orders.push({
      order_code: clean(row[6]) || clean(row[4]) || `QT-${i}`,
      order_type: 'Đơn quà tặng',
      order_source: 'Quà tặng',
      recipient_name: name,
      recipient_phone: phone || `QT-PHONE-${i}`,
      recipient_address: clean(row[3]),
      platform_order_id: clean(row[4]),
      total_amount: 0,
      status: 'Đã giao',
      payment_method: 'Miễn phí',
    });
  }
  return orders;
};

// ── 6. BLACKLIST (sheet 17) ──────────────────────────────────────────────────
const importBlacklist = () => {
  const items = [];
  const data = getSheet('8. BLACKLIST');
  // Row 0 = header: STT, HỌ VÀ TÊN, SĐT, ĐỊA CHỈ, NOTE
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const phone = cleanPhone(row[2]);
    const name = clean(row[1]);
    if (!phone && !name) continue;
    items.push({
      phone: phone || `BL-${i}`,
      full_name: name,
      address: clean(row[3]),
      reason: clean(row[4]),
    });
  }
  return items;
};

// ── 7. TRACKING ZALO - GROUP (sheet 16) ──────────────────────────────────────
const importTracking = () => {
  const data = getSheet('7. TRACKING ZALO - GROUP');
  const groups = [];
  const oa = [];

  // OA data is in rows 3-10ish, groups are in columns to the right
  // Row 2 header: STT, DANH MỤC, [value], TỈ LỆ, GROUP, SỐ THÀNH VIÊN, GROUP, SỐ THÀNH VIÊN
  // Row 3: 1, Số lượt quét vào OA, 1544, ...
  // Row 4: 1, Số lượt follow OA mới, 236, ...

  let oaScans = 0, oaFollows = 0, oaMenu = 0, totalFollows = 0;
  for (let i = 3; i < Math.min(data.length, 15); i++) {
    const row = data[i];
    const cat = clean(row[1]);
    const val = parseInt(row[2]) || 0;
    if (cat.includes('quét')) oaScans = val;
    if (cat.includes('follow') && cat.includes('mới')) oaFollows = val;
    if (cat.includes('tương tác') || cat.includes('menu')) oaMenu = val;
    if (cat.includes('quan tâm') || cat.includes('Tổng')) totalFollows = val;
  }

  if (oaScans || oaFollows) {
    oa.push({
      report_date: '2026-05-19',
      oa_scans: oaScans,
      new_follows: oaFollows,
      menu_interactions: oaMenu,
      total_follows: totalFollows || oaFollows,
    });
  }

  // Groups from columns 4-7
  for (let i = 3; i < Math.min(data.length, 15); i++) {
    const row = data[i];
    const gName = clean(row[4]);
    const gMembers = parseInt(row[5]) || 0;
    if (gName && gMembers) {
      groups.push({
        report_date: '2026-05-19',
        group_name: gName,
        total_members: gMembers,
        new_joins: 0,
      });
    }
  }

  return { oa, groups };
};

// ── 8. REPORT DAILY (sheet 5: 1.2 REPORT DAILY) ─────────────────────────────
const importDailyReport = () => {
  const data = getSheet('1.2 REPORT DAILY');
  const reports = [];
  // Complex structure: dates in row 0, staff names in row 1, metrics in rows 2+
  // Row 0: date serial numbers across columns in groups of 3
  // Row 1: HẠNH, KỲ ANH, HUỆ repeated
  // Row 2: SPA MỚI, values...
  // Row 3: SPA CŨ, values...
  // Row 4: ĐÃ PHẢN HỒI, values...

  if (data.length < 5) return reports;

  const dateRow = data[0];
  const staffRow = data[1];
  const spaNewRow = data[2];
  const spaOldRow = data[3];
  const respondedRow = data[4];

  // Process columns in groups of 3 (HẠNH, KỲ ANH, HUỆ)
  for (let col = 1; col < staffRow.length; col++) {
    const staff = clean(staffRow[col]);
    if (!staff || !['HẠNH', 'KỲ ANH', 'HUỆ'].includes(staff)) continue;

    // Find the date for this column group
    const groupStart = Math.floor((col - 1) / 3) * 3;
    const dateVal = dateRow[groupStart] || dateRow[groupStart + 1];
    const date = excelDate(dateVal);
    if (!date) continue;

    const spaNew = parseInt(spaNewRow[col]) || 0;
    const spaOld = parseInt(spaOldRow[col]) || 0;
    const responded = parseInt(respondedRow[col]) || 0;

    if (spaNew || spaOld || responded) {
      reports.push({
        report_date: date,
        sales_person: staff,
        spa_new: spaNew,
        spa_old: spaOld,
        responded: responded,
        orders_created: 0,
      });
    }
  }

  return reports;
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
const main = async () => {
  console.log('═'.repeat(60));
  console.log('IMPORT EXCEL → SUPABASE CRM');
  console.log('═'.repeat(60));

  // ── Customers ──────────────────────────────────────────────
  console.log('\n▶ KHÁCH HÀNG');
  const quenCusts = importSpaQuen();
  const moiCusts = importSpaMoi();

  // Deduplicate by phone
  const phoneMap = new Map();
  [...quenCusts, ...moiCusts].forEach(c => {
    if (!c.phone) return;
    const existing = phoneMap.get(c.phone);
    if (existing) {
      // Merge: keep richer data
      if (!existing.full_name && c.full_name) existing.full_name = c.full_name;
      if (!existing.address && c.address) existing.address = c.address;
      if (!existing.province && c.province) existing.province = c.province;
      if (c.order_count > (existing.order_count || 0)) existing.order_count = c.order_count;
      if (c.customer_type === 'Cũ') existing.customer_type = 'Cũ';
    } else {
      phoneMap.set(c.phone, c);
    }
  });
  const allCustomers = [...phoneMap.values()].filter(c =>
    c.phone && !c.phone.startsWith('KAH-') && !c.phone.startsWith('HANH-') &&
    !c.phone.startsWith('HUE-') && !c.phone.startsWith('OIL-') &&
    c.phone.length >= 9
  );
  console.log(`  Tổng unique (có SĐT hợp lệ): ${allCustomers.length}`);

  const custResult = await upsertBatch('crm_customers', allCustomers, 'phone');
  console.log(`  ✅ Upserted: ${custResult.total} | ❌ Errors: ${custResult.errors}`);

  // ── Orders ─────────────────────────────────────────────────
  console.log('\n▶ ĐƠN HÀNG');
  const donSi = importDonSi();
  console.log(`  1.3 DATA ĐƠN SỈ: ${donSi.length} đơn`);
  const donCRM = importDonCRM();
  console.log(`  5. ĐƠN CRM T1-T4: ${donCRM.length} đơn`);
  const donQT = importDonQuaTang();
  console.log(`  6. ĐƠN QUÀ TẶNG: ${donQT.length} đơn`);

  const allOrders = [...donSi, ...donCRM, ...donQT];
  console.log(`  Tổng đơn: ${allOrders.length}`);

  const orderResult = await insertBatch('crm_orders', allOrders);
  console.log(`  ✅ Inserted: ${orderResult.total} | ❌ Errors: ${orderResult.errors}`);

  // ── Blacklist ──────────────────────────────────────────────
  console.log('\n▶ BLACKLIST');
  const blacklist = importBlacklist();
  console.log(`  8. BLACKLIST: ${blacklist.length} records`);
  const blResult = await insertBatch('crm_blacklist', blacklist);
  console.log(`  ✅ Inserted: ${blResult.total} | ❌ Errors: ${blResult.errors}`);

  // Also mark blacklisted phones in crm_customers
  const blPhones = blacklist.map(b => b.phone).filter(p => p.length >= 9);
  if (blPhones.length > 0) {
    const { error } = await supabase.from('crm_customers')
      .update({ is_blacklisted: true })
      .in('phone', blPhones);
    console.log(`  Marked ${blPhones.length} phones as blacklisted in crm_customers`);
  }

  // ── Tracking Zalo/Group ────────────────────────────────────
  console.log('\n▶ TRACKING ZALO & GROUP');
  const { oa, groups } = importTracking();
  if (oa.length > 0) {
    const oaResult = await insertBatch('crm_zalo_oa', oa);
    console.log(`  Zalo OA: ✅ ${oaResult.total}`);
  }
  if (groups.length > 0) {
    const grResult = await insertBatch('crm_groups', groups);
    console.log(`  Groups: ✅ ${grResult.total}`);
  }

  // ── Daily Report ───────────────────────────────────────────
  console.log('\n▶ DAILY REPORT');
  const dailyReports = importDailyReport();
  console.log(`  Parsed: ${dailyReports.length} entries`);
  if (dailyReports.length > 0) {
    const drResult = await insertBatch('crm_daily_report', dailyReports);
    console.log(`  ✅ Inserted: ${drResult.total} | ❌ Errors: ${drResult.errors}`);
  }

  // ── Summary ────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('HOÀN THÀNH');
  console.log('═'.repeat(60));
};

main().catch(e => { console.error('❌ Fatal:', e.message); process.exit(1); });
