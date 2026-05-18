import { Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppDataContext } from '../context/AppDataContext';
import * as XLSX from 'xlsx-js-style';
import { supabase } from '../supabaseClient';

// ── Storage keys ──────────────────────────────────────────────────────────────
const STORAGE_KEY    = 'stella_listed_price_rows_v3'; // v3: accordion product+variant
const BRANDS_KEY     = 'stella_listed_price_brands_v1';
const PROMOTIONS_KEY = 'stella_listed_price_promotions_v1';
const VOUCHERS_KEY   = 'stella_listed_price_vouchers_v1';

const DEFAULT_BRANDS     = ['Body Miss', 'Stella Kinetics'];
const DEFAULT_PROMOTIONS = ['M1T1', 'M1T2', 'M1T3', 'M2G50%', 'M2G30%', 'BÁN LẺ'];
const DEFAULT_VOUCHERS   = ['10%', '15%', '20%', '30%', '50.000đ', '100.000đ', '200.000đ'];

// ── Variant columns ───────────────────────────────────────────────────────────
// productName field on variants = "phân loại" (classification)
const VARIANT_COLS = [
  { key: 'barcode',      label: 'Barcode',      minWidth: 160 },
  { key: 'productName',  label: 'Phân loại',    minWidth: 220 },
  { key: 'listedPrice',  label: 'Giá Niêm yết', minWidth: 130 },
  { key: 'regularPrice', label: 'Giá regular',  minWidth: 130 },
  { key: 'fsPrice',      label: 'Giá FS',       minWidth: 110 },
  { key: 'voucher',      label: 'Voucher',      minWidth: 110, type: 'voucher' },
  { key: 'finalPrice',   label: 'Giá final',    minWidth: 150 },
];

// Formula engine column letters: A=barcode … L=finalPrice
const columnLetters = VARIANT_COLS.reduce((acc, col, i) => {
  acc[String.fromCharCode(65 + i)] = col.key;
  return acc;
}, {});

const formulaAliases = {
  listedPrice: 'listedPrice', giaNiemYet: 'listedPrice',
  regularPrice: 'regularPrice', giaRegular: 'regularPrice',
  fsPrice: 'fsPrice', giaFS: 'fsPrice',
  voucher: 'voucher', finalPrice: 'finalPrice', giaFinal: 'finalPrice',
  promotion: 'promotion',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const newId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;

const loadArray = (key, def) => {
  try {
    const r = localStorage.getItem(key);
    const p = r ? JSON.parse(r) : null;
    return Array.isArray(p) && p.length ? p : def;
  } catch { return def; }
};

const isFormula   = (v) => String(v || '').trim().startsWith('=');
const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  if (raw.endsWith('%')) return parseNumber(raw.slice(0, -1)) / 100;
  const normalized = raw.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const p = Number(normalized);
  return Number.isFinite(p) ? p : 0;
};
const fmtResult = (v) =>
  !Number.isFinite(v) ? 'Lỗi' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(v);

const evaluateFormula = (formula, row, rowIndex, allRows, currentKey) => {
  const stack = new Set([`${rowIndex}:${currentKey}`]);
  const getValue = (ri, key) => {
    const r = allRows[ri]; if (!r) return 0;
    const sk = `${ri}:${key}`; if (stack.has(sk)) return 0;
    const rv = r[key];
    if (isFormula(rv)) { stack.add(sk); const res = run(rv, r, ri); stack.delete(sk); return res; }
    return parseNumber(rv);
  };
  const run = (raw, _activeRow, activeIdx) => {
    let expr = String(raw || '').trim().replace(/^=/, '');
    expr = expr.replace(/(\d+(?:[.,]\d+)?)%/g, '($1/100)');
    expr = expr.replace(/(\d+),(\d+)/g, '$1.$2');
    expr = expr.replace(/\b([A-La-l])(\d+)\b/g, (_, l, n) => {
      const k = columnLetters[l.toUpperCase()]; return k ? String(getValue(Number(n) - 1, k)) : '0';
    });
    Object.entries(formulaAliases).forEach(([alias, key]) => {
      expr = expr.replace(new RegExp(`\\b${alias}\\b`, 'gi'), String(getValue(activeIdx, key)));
    });
    if (!/^[\d+\-*/().\s]+$/.test(expr)) return NaN;
    try { const r = Function(`"use strict"; return (${expr});`)(); return Number.isFinite(r) ? r : NaN; }
    catch { return NaN; }
  };
  return run(formula, row, rowIndex);
};

const shiftFormula = (formula, offset) => {
  if (!offset) return formula;
  return formula.replace(/\b([A-La-l])(\d+)\b/g, (_, col, rowNum) =>
    `${col.toUpperCase()}${parseInt(rowNum) + offset}`
  );
};

// ── Price auto-calculator ─────────────────────────────────────────────────────
const parsePromotion = (promo) => {
  if (!promo) return { base: 'single', rate: 0 };
  const p = String(promo).toUpperCase().trim();
  if (/^M1T\d+$/i.test(p) || p === 'BÁN LẺ' || p === 'BAN LE') return { base: 'single', rate: 0 };
  const match = p.match(/M(\d+)G(\d+)%/);
  if (match) return { base: 'combo', count: parseInt(match[1]), rate: parseInt(match[2]) / 100 };
  return { base: 'single', rate: 0 };
};
const parseVoucher = (voucher) => {
  if (!voucher) return { type: 'none', value: 0 };
  const v = String(voucher).trim();
  if (v.endsWith('%')) return { type: 'percent', value: parseFloat(v) / 100 };
  const num = parseNumber(v);
  if (num > 0) return { type: 'fixed', value: num };
  return { type: 'none', value: 0 };
};
const calcFinalPrice = (row, promoStr) => {
  const fs = parseNumber(row.fsPrice);
  if (!fs || fs <= 0) return null;
  const promo   = parsePromotion(promoStr !== undefined ? promoStr : row.promotion);
  const voucher = parseVoucher(row.voucher);
  const isTikTok = row.platform === 'TikTok';
  const isCombo  = promo.base === 'combo';
  const unitCount     = isCombo ? promo.count : 1;
  const originalTotal = fs * unitCount;
  const base          = isCombo ? originalTotal * (1 - promo.rate) : fs;
  const applyVoucher  = isTikTok || !isCombo;
  let total;
  if (!applyVoucher || voucher.type === 'none') {
    total = base;
  } else if (voucher.type === 'percent') {
    total = isTikTok ? base - originalTotal * voucher.value : base * (1 - voucher.value);
  } else {
    total = base - voucher.value;
  }
  const aff = parseFloat(row.affPercent) || 0;
  const ads = parseFloat(row.adsPercent) || 0;
  const affDeduction = fs * aff / 100;
  const adsDeduction = fs * ads / 100;
  const final = total / unitCount - affDeduction - adsDeduction;
  return Number.isFinite(final) && final >= 0 ? Math.round(final) : null;
};
const getFormulaHint = (row, promoStr) => {
  const promo   = parsePromotion(promoStr !== undefined ? promoStr : row.promotion);
  const voucher = parseVoucher(row.voucher);
  const isTikTok = row.platform === 'TikTok';
  const isCombo  = promo.base === 'combo';
  const count    = isCombo ? promo.count : 1;
  let baseStr = isCombo ? `(FS×${count})×${Math.round((1 - promo.rate) * 100)}%` : 'FS';
  const showVoucher = voucher.type !== 'none' && (isTikTok || !isCombo);
  let totalStr = baseStr;
  if (showVoucher) {
    if (voucher.type === 'percent') {
      const vPct = Math.round(voucher.value * 100);
      if (isTikTok) {
        totalStr = `${baseStr} − ${isCombo ? `FS×${count}` : 'FS'}×${vPct}%`;
      } else {
        totalStr = `${baseStr}×${100 - vPct}%`;
      }
    } else {
      const fixedStr = voucher.value >= 1000 ? `${(voucher.value / 1000).toLocaleString('vi-VN')}k` : String(voucher.value);
      totalStr = `${baseStr} − ${fixedStr}`;
    }
  }
  const perUnit = isCombo ? `(${totalStr}) ÷ ${count}` : totalStr;
  const aff = parseFloat(row.affPercent) || 0;
  const ads = parseFloat(row.adsPercent) || 0;
  const parts = [perUnit];
  if (aff) parts.push(`FS×${aff}%`);
  if (ads) parts.push(`FS×${ads}%`);
  return parts.length > 1 ? `${parts[0]} − ${parts.slice(1).join(' − ')}` : parts[0];
};

// ── Data model ────────────────────────────────────────────────────────────────
const emptyRow = () => ({
  link: '', productName: '', barcode: '', brand: '', platform: '',
  affPercent: '', adsPercent: '',
  listedPrice: '', promotion: '', regularPrice: '', fsPrice: '', voucher: '', finalPrice: '',
});

const createProduct = () => {
  const id = newId();
  return { ...emptyRow(), id, groupId: id, rowType: 'product' };
};

const createVariant = (productId) => ({
  ...emptyRow(), id: newId(), groupId: productId, rowType: 'variant', platform: 'TikTok',
});

const createProductWithVariant = () => {
  const p = createProduct();
  return [p, createVariant(p.id)];
};

// Migrate from old TikTok+Shopee pair format (v1/v2)
const migrateRows = (rows) => {
  if (!rows?.length) return createProductWithVariant();
  if (rows.some(r => r.rowType === 'product')) return rows;

  const groups = new Map();
  rows.forEach(r => {
    if (!r.groupId) return;
    if (!groups.has(r.groupId)) groups.set(r.groupId, []);
    groups.get(r.groupId).push(r);
  });

  const result = [];
  groups.forEach(groupRows => {
    const rep = groupRows.find(r => r.platform === 'TikTok') || groupRows[0];
    const p = createProduct();
    p.link = rep.link || '';
    p.productName = rep.productName || '';
    result.push(p);
    groupRows
      .filter(r => r.rowType !== 'gift')
      .forEach(r => result.push({
        ...r, id: newId(), groupId: p.id, rowType: 'variant',
        productName: r.productName || r.platform || '',
        link: '',
      }));
  });
  return result.length ? result : createProductWithVariant();
};

const loadRows = () => migrateRows(loadArray(STORAGE_KEY, null));

// ── Supabase helpers ──────────────────────────────────────────────────────────
const rowToDb = (row, idx) => ({
  id:            row.id,
  group_id:      row.groupId      || '',
  row_type:      row.rowType      || 'variant',
  platform:      row.platform     || '',
  link:          row.link         || '',
  product_name:  row.productName  || '',
  barcode:       row.barcode      || '',
  brand:         row.brand        || '',
  aff_percent:   row.affPercent   || '',
  ads_percent:   row.adsPercent   || '',
  listed_price:  row.listedPrice  || '',
  promotion:     row.promotion    || '',
  regular_price: row.regularPrice || '',
  fs_price:      row.fsPrice      || '',
  voucher:       row.voucher      || '',
  final_price:   row.finalPrice   || '',
  gift_barcode:  JSON.stringify((row.gifts || []).map(g => g.barcode || '')),
  gift_name:     JSON.stringify((row.gifts || []).map(g => g.name || '')),
  sort_order:    idx,
});

const dbToRow = (r) => ({
  id:           r.id,
  groupId:      r.group_id,
  rowType:      r.row_type,
  platform:     r.platform,
  link:         r.link        || '',
  productName:  r.product_name || '',
  barcode:      r.barcode      || '',
  brand:        r.brand        || '',
  affPercent:   r.aff_percent  || '',
  adsPercent:   r.ads_percent  || '',
  listedPrice:  r.listed_price || '',
  promotion:    r.promotion    || '',
  regularPrice: r.regular_price || '',
  fsPrice:      r.fs_price     || '',
  voucher:      r.voucher      || '',
  finalPrice:   r.final_price  || '',
  gifts: (() => {
    try {
      const barcodes = JSON.parse(r.gift_barcode || '[]');
      const names    = JSON.parse(r.gift_name    || '[]');
      if (!Array.isArray(barcodes)) return [];
      return barcodes.map((b, i) => ({ barcode: b || '', name: names[i] || '' }));
    } catch { return []; }
  })(),
});

// ── Excel helpers ─────────────────────────────────────────────────────────────
const toExcelFormulaText = (value) =>
  isFormula(value)
    ? String(value || '').replace(/(\d+)\.(\d+)/g, '$1,$2').replace(/\b([A-La-l])(\d+)\b/g, (_, c, n) => `${c.toUpperCase()}${parseInt(n) + 1}`)
    : value;

const exportExcel = (rows, promotions = []) => {
  const products = rows.filter(r => r.rowType === 'product');
  const variants  = rows.filter(r => r.rowType === 'variant');
  const headers   = ['Tên sản phẩm', 'Link', 'Barcode', 'Phân loại', 'Brand', 'Sàn', 'AFF%', 'ADS%', 'Giá Niêm yết', 'Promotion', 'Giá regular', 'Giá FS', 'Voucher', 'Giá final'];
  const data      = [headers];
  products.forEach(p => {
    variants.filter(v => v.groupId === p.id).forEach(v => {
      data.push([
        p.productName, p.link, v.barcode, v.productName, p.brand, p.platform || 'TikTok',
        p.affPercent, p.adsPercent,
        toExcelFormulaText(v.listedPrice), p.promotion,
        toExcelFormulaText(v.regularPrice), toExcelFormulaText(v.fsPrice),
        toExcelFormulaText(v.voucher), toExcelFormulaText(v.finalPrice),
      ]);
    });
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  headers.forEach((_, ci) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: ci });
    if (ws[cellRef]) ws[cellRef].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'EA580C' } },
      alignment: { horizontal: 'center' },
    };
  });
  ws['!cols'] = [{ wch: 40 }, { wch: 30 }, { wch: 20 }, { wch: 30 }, { wch: 20 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];
  // Data validation dropdown cho cột Promotion (cột J = index 9)
  if (promotions.length) {
    const totalRows = data.length;
    ws['!dataValidations'] = [{
      type: 'list',
      allowBlank: true,
      showDropDown: false,
      sqref: `J2:J${Math.max(totalRows, 1000)}`,
      formula1: `"${promotions.join(',')}"`,
    }];
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bang Gia Niem Yet');
  XLSX.writeFile(wb, 'bang-gia-niem-yet.xlsx');
};

const importExcel = (file, onSuccess) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const wb  = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const firstRow = raw[0] || [];
    const isHeader = String(firstRow[0] || '').toLowerCase().includes('tên') || String(firstRow[0] || '').toLowerCase().includes('product');
    const start    = isHeader ? 1 : 0;
    const dataRows = raw.slice(start).filter(r => r.some(c => String(c || '').trim()));

    // Group by product name (col0) + link (col1)
    const productMap = new Map(); // key = productName|link
    dataRows.forEach(r => {
      const pName = String(r[0] || '').trim();
      const pLink = String(r[1] || '').trim();
      const key   = `${pName}||${pLink}`;
      if (!productMap.has(key)) productMap.set(key, { pName, pLink, variants: [] });
      productMap.get(key).variants.push(r);
    });

    const result = [];
    productMap.forEach(({ pName, pLink, variants: variantDataRows }) => {
      const p = createProduct();
      p.productName = pName;
      p.link        = pLink;
      result.push(p);
      variantDataRows.forEach(r => {
        result.push({
          ...createVariant(p.id),
          barcode:      String(r[2] || ''),
          productName:  String(r[3] || ''),
          brand:        String(r[4] || ''),
          platform:     String(r[5] || '') || 'TikTok',
          affPercent:   String(r[6] || ''),
          adsPercent:   String(r[7] || ''),
          listedPrice:  String(r[8] || ''),
          promotion:    String(r[9] || ''),
          regularPrice: String(r[10] || ''),
          fsPrice:      String(r[11] || ''),
          voucher:      String(r[12] || ''),
          finalPrice:   String(r[13] || ''),
        });
      });
    });
    onSuccess(result.length ? result : createProductWithVariant());
  };
  reader.readAsArrayBuffer(file);
};

// ── Platform logos ────────────────────────────────────────────────────────────
const ShopeeLogo = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="sp-bg" x1="50" y1="0" x2="50" y2="100" gradientUnits="userSpaceOnUse"><stop stopColor="#FF6633"/><stop offset="1" stopColor="#EE4D2D"/></linearGradient></defs>
    <rect width="100" height="100" rx="20" fill="url(#sp-bg)"/>
    <path d="M22 46 L78 46 L71 79 L29 79 Z" fill="white"/>
    <path d="M33 46 C33 27 67 27 67 46" stroke="white" strokeWidth="8" strokeLinecap="round"/>
    <text x="50" y="71" textAnchor="middle" fill="#EE4D2D" fontSize="26" fontWeight="900" fontFamily="Arial Black,Arial,sans-serif">S</text>
  </svg>
);

const TikTokLogo = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" rx="20" fill="#010101"/>
    <g fill="#FE2C55" transform="translate(2,0)"><ellipse cx="33" cy="67" rx="13" ry="10"/><rect x="44" y="19" width="6" height="49"/><rect x="44" y="19" width="24" height="8" rx="3"/><rect x="62" y="19" width="6" height="22" rx="2"/></g>
    <g fill="#25F4EE" transform="translate(-4,0)"><ellipse cx="33" cy="67" rx="13" ry="10"/><rect x="44" y="19" width="6" height="49"/><rect x="44" y="19" width="24" height="8" rx="3"/><rect x="62" y="19" width="6" height="22" rx="2"/></g>
    <g fill="white"><ellipse cx="33" cy="67" rx="13" ry="10"/><rect x="44" y="19" width="6" height="49"/><rect x="44" y="19" width="24" height="8" rx="3"/><rect x="62" y="19" width="6" height="22" rx="2"/></g>
  </svg>
);

// ── AddOptionInline ───────────────────────────────────────────────────────────
const AddOptionInline = ({ placeholder, onAdd, onClose }) => {
  const [val, setVal] = useState('');
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
      <input autoFocus value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onAdd(val.trim()); onClose(); } if (e.key === 'Escape') onClose(); }}
        placeholder={placeholder}
        style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1.5px solid #ea580c', fontSize: 12, outline: 'none' }} />
      <button onClick={() => { if (val.trim()) { onAdd(val.trim()); onClose(); } }}
        style={{ padding: '4px 10px', background: '#ea580c', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>+</button>
      <button onClick={onClose}
        style={{ padding: '4px 8px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>✕</button>
    </div>
  );
};

// ── FillHandle ────────────────────────────────────────────────────────────────
const FillHandle = ({ onMouseDown, active }) => (
  <div onMouseDown={onMouseDown} title="Kéo xuống để áp dụng"
    style={{
      position: 'absolute', bottom: 1, right: 1, width: 9, height: 9,
      background: active ? '#c2410c' : '#ea580c', border: '1.5px solid #fff',
      borderRadius: 2, cursor: 'crosshair', zIndex: 10, opacity: 0.85,
    }}
    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.3)'; }}
    onMouseLeave={e => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'scale(1)'; }}
  />
);

// ── Main Component ────────────────────────────────────────────────────────────
const ListedPriceTab = () => {
  const { brands: ctxBrands = [] } = useContext(AppDataContext) || {};

  const [rows, setRows]             = useState(loadRows);
  const [brands, setBrands]         = useState(() => loadArray(BRANDS_KEY, DEFAULT_BRANDS));
  const [promotions, setPromotions] = useState(() => loadArray(PROMOTIONS_KEY, DEFAULT_PROMOTIONS));
  const [vouchers, setVouchers]     = useState(() => loadArray(VOUCHERS_KEY, DEFAULT_VOUCHERS));
  const [syncing, setSyncing]       = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());

  const [filterText,      setFilterText]      = useState('');
  const [filterBrand,     setFilterBrand]     = useState('');
  const [filterPromotion, setFilterPromotion] = useState('');
  const [filterBarcode,   setFilterBarcode]   = useState('');

  const [addingBrand,     setAddingBrand]     = useState(false);
  const [addingPromotion, setAddingPromotion] = useState(false);
  const [addingVoucher,   setAddingVoucher]   = useState(false);

  const [editingCell, setEditingCell] = useState(null);
  const [fillDrag,    setFillDrag]    = useState(null);
  const [fillOver,    setFillOver]    = useState(null);

  const importRef = useRef(null);
  const syncTimer = useRef(null);

  // Load from Supabase
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('listed_price_rows').select('*').order('sort_order', { ascending: true });
      if (error || !data?.length) return;
      const loaded = migrateRows(data.map(dbToRow));
      setRows(loaded);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded));
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { localStorage.setItem(STORAGE_KEY,    JSON.stringify(rows));       }, [rows]);
  useEffect(() => { localStorage.setItem(BRANDS_KEY,     JSON.stringify(brands));     }, [brands]);
  useEffect(() => { localStorage.setItem(PROMOTIONS_KEY, JSON.stringify(promotions)); }, [promotions]);
  useEffect(() => { localStorage.setItem(VOUCHERS_KEY,   JSON.stringify(vouchers));   }, [vouchers]);

  const syncToSupabase = useCallback((nextRows) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      setSyncing(true);
      try {
        const dbRows = nextRows.map((r, i) => rowToDb(r, i));
        await supabase.from('listed_price_rows').upsert(dbRows, { onConflict: 'id' });
        const ids = nextRows.map(r => r.id);
        await supabase.from('listed_price_rows').delete().not('id', 'in', `(${ids.map(id => `"${id}"`).join(',')})`);
      } finally { setSyncing(false); }
    }, 1500);
  }, []);

  useEffect(() => { syncToSupabase(rows); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ctxBrands?.length) return;
    const ctxNames = ctxBrands.map(b => b.ten_brand).filter(Boolean);
    setBrands(prev => [...new Set([...ctxNames, ...prev])]);
  }, [ctxBrands]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fill drag
  useEffect(() => {
    if (!fillDrag) return;
    const handleMouseUp = () => {
      if (fillOver !== null && fillOver !== fillDrag.fromIndex) {
        const { fromIndex, colKey, sourceValue } = fillDrag;
        const lo = Math.min(fromIndex, fillOver);
        const hi = Math.max(fromIndex, fillOver);
        setRows(prev => prev.map((r, i) => {
          if (i === fromIndex || i < lo || i > hi || r.rowType !== 'variant') return r;
          const newVal = isFormula(sourceValue) ? shiftFormula(sourceValue, i - fromIndex) : sourceValue;
          return { ...r, [colKey]: newVal };
        }));
      }
      setFillDrag(null); setFillOver(null);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [fillDrag, fillOver]);

  const addBrand     = (v) => { if (!brands.includes(v))     setBrands(p => [...p, v]); };
  const addPromotion = (v) => { if (!promotions.includes(v)) setPromotions(p => [...p, v]); };
  const addVoucher   = (v) => { if (!vouchers.includes(v))   setVouchers(p => [...p, v]); };

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const addProduct = () => setRows(p => [...p, ...createProductWithVariant()]);

  const addVariant = (productId) => setRows(prev => {
    const lastIdx = prev.reduce((max, r, i) => r.groupId === productId ? i : max, -1);
    const result  = [...prev];
    result.splice(lastIdx + 1, 0, createVariant(productId));
    return result;
  });

  const updateProductCell = (id, key, value) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [key]: value } : r));

  const switchPlatform = (productId, currentPlatform) => {
    const newPlatform = (currentPlatform || 'TikTok') === 'Shopee' ? 'TikTok' : 'Shopee';
    setRows(prev => prev.map(r => {
      if (r.id === productId) return { ...r, platform: newPlatform };
      if (r.groupId === productId && r.rowType === 'variant') {
        if (newPlatform === 'Shopee') {
          // Luôn tính từ giá TikTok gốc (đã lưu hoặc là giá hiện tại)
          const baseReg = parseNumber(r._tiktokRegular ?? r.regularPrice);
          const baseFs  = parseNumber(r._tiktokFs  ?? r.fsPrice);
          if (!baseReg) return r;
          return {
            ...r,
            _tiktokRegular: r._tiktokRegular ?? r.regularPrice,
            _tiktokFs:      r._tiktokFs      ?? r.fsPrice,
            regularPrice: String(Math.round(baseReg * 1.10)),
            fsPrice:      String(Math.round(baseReg * 1.05)),
          };
        } else {
          // Restore giá TikTok gốc
          return {
            ...r,
            regularPrice: r._tiktokRegular ?? r.regularPrice,
            fsPrice:      r._tiktokFs      ?? r.fsPrice,
            _tiktokRegular: undefined,
            _tiktokFs:      undefined,
          };
        }
      }
      return r;
    }));
  };

  const updateGift = (productId, idx, field, value) =>
    setRows(prev => prev.map(r => {
      if (r.id !== productId) return r;
      const gifts = [...(r.gifts || [])];
      while (gifts.length <= idx) gifts.push({ barcode: '', name: '' });
      gifts[idx] = { ...gifts[idx], [field]: value };
      return { ...r, gifts };
    }));

  const updateVariantCell = (id, key, value) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [key]: value } : r));

  const deleteProduct = (productId) => setRows(prev => {
    const filtered = prev.filter(r => r.id !== productId && r.groupId !== productId);
    return filtered.some(r => r.rowType === 'product') ? filtered : createProductWithVariant();
  });

  const deleteVariant = (id) => setRows(prev => prev.filter(r => r.id !== id));

  const duplicateProduct = (productId) => setRows(prev => {
    const productRow  = prev.find(r => r.id === productId);
    if (!productRow) return prev;
    const variantRows = prev.filter(r => r.rowType === 'variant' && r.groupId === productId);
    const newPId      = newId();
    const newProduct  = { ...productRow, id: newPId, groupId: newPId };
    const newVariants = variantRows.map(v => ({ ...v, id: newId(), groupId: newPId }));
    const lastIdx     = prev.reduce((max, r, i) => (r.id === productId || r.groupId === productId) ? i : max, -1);
    const result      = [...prev];
    result.splice(lastIdx + 1, 0, newProduct, ...newVariants);
    return result;
  });

  const toggleExpand = (productId) => setExpandedGroups(prev => {
    const next = new Set(prev);
    next.has(productId) ? next.delete(productId) : next.add(productId);
    return next;
  });

  const expandAll  = () => setExpandedGroups(new Set(rows.filter(r => r.rowType === 'product').map(r => r.id)));
  const collapseAll = () => setExpandedGroups(new Set());

  const clearAll = () => {
    if (window.confirm('Xóa toàn bộ bảng giá niêm yết?')) {
      setRows(createProductWithVariant());
      setExpandedGroups(new Set());
    }
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    importExcel(file, (newRows) => {
      const productCount = newRows.filter(r => r.rowType === 'product').length;
      if (window.confirm(`Import ${productCount} sản phẩm?\n\nOK = Ghi đè\nCancel = Thêm vào cuối`)) {
        setRows(newRows); setExpandedGroups(new Set());
      } else {
        setRows(p => [...p, ...newRows]);
      }
    });
    e.target.value = '';
  };

  // ── Grouped products ───────────────────────────────────────────────────────
  const groupedProducts = useMemo(() => {
    const allGroups = rows
      .filter(r => r.rowType === 'product')
      .map(product => ({
        product,
        variants: rows.filter(r => r.rowType === 'variant' && r.groupId === product.id),
      }));

    return allGroups.filter(({ product, variants }) => {
      if (filterBrand && !variants.some(v => v.brand === filterBrand)) return false;
      if (filterPromotion && !variants.some(v => v.promotion === filterPromotion)) return false;
      if (filterBarcode && !variants.some(v => String(v.barcode || '').toLowerCase().includes(filterBarcode.toLowerCase()))) return false;
      if (filterText) {
        const combined = [product.productName, product.link, ...variants.flatMap(v => [v.barcode, v.productName, v.brand])].join(' ').toLowerCase();
        if (!combined.includes(filterText.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, filterBrand, filterPromotion, filterBarcode, filterText]);

  const hasFilter   = filterBrand || filterPromotion || filterBarcode || filterText;
  const clearFilter = () => { setFilterText(''); setFilterBrand(''); setFilterPromotion(''); setFilterBarcode(''); };

  // ── Styles ─────────────────────────────────────────────────────────────────
  const selectStyle = {
    width: '100%', padding: '5px 6px', border: 'none', background: 'transparent',
    fontSize: '0.82rem', outline: 'none', cursor: 'pointer',
    color: '#0f172a', fontFamily: 'inherit', textAlign: 'center',
  };
  const filterSelectStyle = {
    padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb',
    fontSize: '0.82rem', outline: 'none', cursor: 'pointer', background: '#fff',
    color: '#374151', minWidth: 130,
  };
  const addBtnStyle = (active) => ({
    padding: '6px 10px', background: active ? '#ea580c' : '#fff7ed',
    border: '1.5px solid #fed7aa', borderRadius: 8,
    color: active ? '#fff' : '#ea580c', fontWeight: 700, cursor: 'pointer', fontSize: 14,
  });

  // ── Fill drag helpers ──────────────────────────────────────────────────────
  const startFill = (e, fromIndex, colKey, sourceValue) => {
    e.preventDefault(); e.stopPropagation();
    setFillDrag({ fromIndex, colKey, sourceValue });
  };
  const getFillHighlight = (index) => {
    if (!fillDrag || fillOver === null) return false;
    const lo = Math.min(fillDrag.fromIndex, fillOver);
    const hi = Math.max(fillDrag.fromIndex, fillOver);
    return index > lo && index <= hi && index !== fillDrag.fromIndex;
  };

  // ── Variant cell renderer ─────────────────────────────────────────────────
  const renderVariantCell = (col, row, index, product) => {
    const rawValue  = row[col.key] ?? '';
    const isEditing = editingCell?.id === row.id && editingCell?.key === col.key;
    const isDragSrc = fillDrag?.fromIndex === index && fillDrag?.colKey === col.key;

    // Voucher dropdown
    if (col.type === 'voucher') return (
      <td key={col.key} style={{ position: 'relative' }}>
        <select value={rawValue} onChange={e => updateVariantCell(row.id, col.key, e.target.value)} style={selectStyle}>
          <option value="">— chọn —</option>
          {vouchers.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        {rawValue && <FillHandle onMouseDown={e => startFill(e, index, col.key, rawValue)} active={isDragSrc} />}
      </td>
    );

    // Text / formula cell
    const hasFormula    = isFormula(rawValue);
    const formulaResult = hasFormula ? evaluateFormula(rawValue, row, index, rows, col.key) : null;
    const displayValue  = (!isEditing && hasFormula)
      ? (Number.isFinite(formulaResult) ? fmtResult(formulaResult) : 'Lỗi')
      : rawValue;
    const isError = hasFormula && !Number.isFinite(formulaResult);

    const effectiveRow = product ? { ...row, platform: product.platform || 'TikTok', affPercent: product.affPercent || '', adsPercent: product.adsPercent || '' } : row;
    const autoFinal   = (!isEditing && !rawValue && col.key === 'finalPrice') ? calcFinalPrice(effectiveRow, product?.promotion) : null;
    const formulaHint = autoFinal !== null ? getFormulaHint(effectiveRow, product?.promotion) : null;

    return (
      <td key={col.key} style={{ position: 'relative', outline: isDragSrc ? '2px solid #ea580c' : undefined }}
        onMouseEnter={() => { if (fillDrag) setFillOver(index); }}>
        {autoFinal !== null && !isEditing ? (
          <div onClick={() => setEditingCell({ id: row.id, key: col.key })} title="Click để ghi đè"
            style={{ textAlign: 'center', padding: '2px 8px', minHeight: 34, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'text', background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', borderRadius: 9, border: '1px dashed #86efac', gap: 1 }}>
            <span style={{ color: '#059669', fontWeight: 700, fontSize: '0.82rem' }}>+ {fmtResult(autoFinal)}</span>
            {formulaHint && <span style={{ fontSize: '0.6rem', color: '#16a34a', opacity: 0.75, fontFamily: 'monospace', lineHeight: 1.2 }}>{formulaHint}</span>}
          </div>
        ) : (
          <input type="text" value={displayValue}
            placeholder={isEditing || !hasFormula ? col.label : ''}
            onChange={e => updateVariantCell(row.id, col.key, e.target.value)}
            onFocus={() => setEditingCell({ id: row.id, key: col.key })}
            onBlur={() => setEditingCell(null)}
            style={{ color: !isEditing && hasFormula && isError ? '#dc2626' : '#0f172a', textAlign: col.key === 'productName' ? 'left' : 'center' }}
          />
        )}
        {isEditing && hasFormula && (
          <div style={{ fontSize: 10, color: Number.isFinite(formulaResult) ? '#16a34a' : '#dc2626', paddingLeft: 6, paddingBottom: 2 }}>
            → {Number.isFinite(formulaResult) ? fmtResult(formulaResult) : 'Lỗi'}
          </div>
        )}
        {rawValue && <FillHandle onMouseDown={e => startFill(e, index, col.key, rawValue)} active={isDragSrc} />}
      </td>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const totalVariants = rows.filter(r => r.rowType === 'variant').length;

  return (
    <div className="listed-price-page" style={fillDrag ? { userSelect: 'none', cursor: 'crosshair' } : {}}>

      {/* Header */}
      <div className="listed-price-page__header">
        <div>
          <div className="listed-price-page__eyebrow">Ecom</div>
          <h1 className="page-header" style={{ margin: 0 }}>BẢNG GIÁ NIÊM YẾT</h1>
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            Listing full giá niêm yết — mỗi link sản phẩm chứa nhiều phân loại.
            {syncing
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 999, padding: '2px 10px', fontWeight: 700, flexShrink: 0 }}>⟳ Đang lưu...</span>
              : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: '#166534', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 999, padding: '2px 10px', fontWeight: 700, flexShrink: 0 }}>✓ Đã lưu</span>
            }
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={clearAll} className="listed-price-page__button is-muted">Xóa bảng</button>
          <button onClick={addProduct} className="listed-price-page__button is-primary">+ Thêm sản phẩm</button>
          <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportFile} />
          <button onClick={() => importRef.current?.click()}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #3b82f6', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            📥 Import Excel
          </button>
          <button onClick={() => exportExcel(rows, promotions)}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #16a34a', background: '#f0fdf4', color: '#15803d', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            📤 Export Excel
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 14px' }}>
        <div style={{ display: 'flex', background: '#f8fafc', border: '1.5px solid #e5e7eb', borderRadius: 9, overflow: 'hidden', flex: '1 1 280px', minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', flex: 2, borderRight: '1px solid #e5e7eb' }}>
            <span style={{ color: '#94a3b8', fontSize: 14, flexShrink: 0 }}>⌕</span>
            <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)} placeholder="Tên SP, link, phân loại..."
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', width: '100%', padding: 0 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', flex: 1 }}>
            <input type="text" value={filterBarcode} onChange={e => setFilterBarcode(e.target.value)} placeholder="Lọc barcode..."
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', width: '100%', padding: 0 }} />
          </div>
        </div>

        <div style={{ width: 1, height: 28, background: '#e5e7eb', flexShrink: 0 }} />

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={filterSelectStyle}>
              <option value="">Tất cả brand</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <button onClick={() => setAddingBrand(v => !v)} style={addBtnStyle(addingBrand)}>+</button>
          </div>
          {addingBrand && <AddOptionInline placeholder="Tên brand mới..." onAdd={addBrand} onClose={() => setAddingBrand(false)} />}
        </div>

        <div style={{ width: 1, height: 28, background: '#e5e7eb', flexShrink: 0 }} />

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <select value={filterPromotion} onChange={e => setFilterPromotion(e.target.value)} style={filterSelectStyle}>
              <option value="">Tất cả promotion</option>
              {promotions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button onClick={() => setAddingPromotion(v => !v)} style={addBtnStyle(addingPromotion)}>+</button>
          </div>
          {addingPromotion && <AddOptionInline placeholder="Tên promotion mới..." onAdd={addPromotion} onClose={() => setAddingPromotion(false)} />}
        </div>

        <div style={{ width: 1, height: 28, background: '#e5e7eb', flexShrink: 0 }} />

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>🏷️ Voucher</span>
            <button onClick={() => setAddingVoucher(v => !v)} style={addBtnStyle(addingVoucher)}>+</button>
          </div>
          {addingVoucher && <AddOptionInline placeholder="VD: 10% hoặc 50.000đ..." onAdd={addVoucher} onClose={() => setAddingVoucher(false)} />}
        </div>

        {/* Expand / collapse all */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={expandAll}
            style={{ padding: '6px 10px', background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 8, color: '#15803d', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
            ▼ Mở hết
          </button>
          <button onClick={collapseAll}
            style={{ padding: '6px 10px', background: '#f8fafc', border: '1.5px solid #e5e7eb', borderRadius: 8, color: '#64748b', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
            ▶ Thu hết
          </button>
        </div>

        {hasFilter && (
          <button onClick={clearFilter}
            style={{ padding: '6px 12px', background: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: 8, color: '#dc2626', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
            ✕ Xóa lọc
          </button>
        )}

        <div style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
          <strong style={{ color: '#ea580c' }}>{groupedProducts.length}</strong> sản phẩm &middot; <strong style={{ color: '#6366f1' }}>{totalVariants}</strong> phân loại
        </div>
      </div>

      {/* Table */}
      <div className="listed-price-table-card">
        <div className="listed-price-table-wrap">
          <table className="listed-price-table" onMouseLeave={() => { if (fillDrag) setFillOver(null); }}>
            <thead>
              <tr>
                <th className="listed-price-table__index">#</th>
                {VARIANT_COLS.map((col, i) => (
                  <th key={col.key} style={{ minWidth: col.minWidth }}>
                    <span>{String.fromCharCode(65 + i)}</span>{col.label}
                  </th>
                ))}
                <th className="listed-price-table__actions">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {groupedProducts.map((g, groupIdx) => {
                const { product, variants } = g;
                const isExpanded = expandedGroups.has(product.id);
                const variantCount = variants.length;

                return (
                  <Fragment key={product.id}>
                    {/* ── Product accordion header ── */}
                    <tr className="listed-price-product-row">
                      {/* Toggle + # */}
                      <td className="listed-price-table__index"
                        onClick={() => toggleExpand(product.id)}
                        style={{ cursor: 'pointer', verticalAlign: 'middle', userSelect: 'none' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                          <span style={{ fontSize: '0.65rem', color: '#ea580c', fontWeight: 900 }}>
                            {isExpanded ? '▼' : '▶'}
                          </span>
                          <span style={{ fontWeight: 800, color: '#374151' }}>{groupIdx + 1}</span>
                        </div>
                      </td>

                      {/* Link + Product name + count — spans all variant cols */}
                      <td colSpan={VARIANT_COLS.length} style={{ verticalAlign: 'middle', padding: '6px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {/* Platform badge */}
                          <button type="button"
                            title={(product.platform || 'TikTok') === 'Shopee' ? 'Shopee — click để đổi' : 'TikTok — click để đổi'}
                            onClick={() => switchPlatform(product.id, product.platform)}
                            style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', background: (product.platform || 'TikTok') === 'Shopee' ? '#fff7ed' : '#f0f4ff' }}>
                            {(product.platform || 'TikTok') === 'Shopee' ? <ShopeeLogo size={20} /> : <TikTokLogo size={20} />}
                          </button>

                          {/* Link input */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flex: '0 0 140px' }}>
                            <input type="text" value={product.link || ''} placeholder="Link SP..."
                              onChange={e => updateProductCell(product.id, 'link', e.target.value)}
                              style={{ flex: 1, fontSize: '0.72rem', color: '#3b82f6', minWidth: 0, height: 30, padding: '0 5px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#f8fafc', fontFamily: 'inherit', outline: 'none' }}
                              onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.background = '#fff'; }}
                              onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.background = '#f8fafc'; }}
                            />
                            {product.link
                              ? <a href={product.link} target="_blank" rel="noopener noreferrer" title="Mở link" style={{ color: '#3b82f6', fontSize: '0.9rem', textDecoration: 'none', flexShrink: 0 }}>🔗</a>
                              : <span style={{ color: '#d1d5db', fontSize: '0.85rem', flexShrink: 0 }}>🔗</span>}
                          </div>

                          {/* Product name — chiếm phần lớn chỗ còn lại */}
                          <input type="text" value={product.productName || ''} placeholder="Tên sản phẩm..."
                            onChange={e => updateProductCell(product.id, 'productName', e.target.value)}
                            style={{ flex: '3 1 0', minWidth: 100, height: 30, padding: '0 8px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#f8fafc', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', outline: 'none' }}
                            onFocus={e => { e.target.style.borderColor = '#ea580c'; e.target.style.background = '#fff'; }}
                            onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.background = '#f8fafc'; }}
                          />

                          {/* Brand */}
                          <select value={product.brand || ''} onChange={e => updateProductCell(product.id, 'brand', e.target.value)}
                            style={{ flex: '1.2 1 0', minWidth: 80, height: 30, borderRadius: 7, border: '1px solid #e5e7eb', background: '#f8fafc', fontSize: '0.78rem', padding: '0 4px', outline: 'none', cursor: 'pointer', color: product.brand ? '#0f172a' : '#9ca3af' }}>
                            <option value="">— Brand —</option>
                            {brands.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>

                          {/* AFF% */}
                          <input type="text" inputMode="numeric" value={product.affPercent || ''} placeholder="AFF%"
                            onChange={e => updateProductCell(product.id, 'affPercent', e.target.value)}
                            style={{ flex: '0.6 1 0', minWidth: 44, height: 30, padding: '0 4px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#f8fafc', fontSize: '0.78rem', outline: 'none', fontFamily: 'inherit', textAlign: 'center' }}
                            onFocus={e => { e.target.style.borderColor = '#6366f1'; e.target.style.background = '#fff'; }}
                            onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.background = '#f8fafc'; }}
                          />

                          {/* ADS% */}
                          <input type="text" inputMode="numeric" value={product.adsPercent || ''} placeholder="ADS%"
                            onChange={e => updateProductCell(product.id, 'adsPercent', e.target.value)}
                            style={{ flex: '0.6 1 0', minWidth: 44, height: 30, padding: '0 4px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#f8fafc', fontSize: '0.78rem', outline: 'none', fontFamily: 'inherit', textAlign: 'center' }}
                            onFocus={e => { e.target.style.borderColor = '#6366f1'; e.target.style.background = '#fff'; }}
                            onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.background = '#f8fafc'; }}
                          />

                          {/* Promotion */}
                          <select value={product.promotion || ''} onChange={e => updateProductCell(product.id, 'promotion', e.target.value)}
                            style={{ flex: '1 1 0', minWidth: 80, height: 30, borderRadius: 7, border: '1px solid #e5e7eb', background: product.promotion ? '#fef3c7' : '#f8fafc', fontSize: '0.78rem', padding: '0 4px', outline: 'none', cursor: 'pointer', color: product.promotion ? '#92400e' : '#9ca3af', fontWeight: product.promotion ? 700 : 400 }}>
                            <option value="">— Promo —</option>
                            {promotions.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>

                          {/* Variant count badge */}
                          <span onClick={() => toggleExpand(product.id)}
                            style={{ background: isExpanded ? '#ede9fe' : '#eff6ff', color: isExpanded ? '#7c3aed' : '#3b82f6', borderRadius: 999, padding: '3px 8px', fontSize: '0.7rem', fontWeight: 800, flexShrink: 0, cursor: 'pointer', border: `1px solid ${isExpanded ? '#ddd6fe' : '#bfdbfe'}`, whiteSpace: 'nowrap' }}>
                            {variantCount} PL
                          </span>

                          {/* Add variant button */}
                          <button type="button"
                            onClick={() => { addVariant(product.id); setExpandedGroups(s => { const n = new Set(s); n.add(product.id); return n; }); }}
                            style={{ padding: '4px 8px', background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 7, color: '#ea580c', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                            + Phân loại
                          </button>
                        </div>
                      </td>

                      {/* Product actions */}
                      <td className="listed-price-table__actions" style={{ verticalAlign: 'middle' }}>
                        <button type="button" title="Nhân bản" onClick={() => duplicateProduct(product.id)}>⧉</button>
                        <button type="button" title="Xóa sản phẩm" onClick={() => deleteProduct(product.id)}>×</button>
                      </td>
                    </tr>

                    {/* ── Variant rows (when expanded) ── */}
                    {isExpanded && variants.map((variant, vi) => {
                      const variantIdx = rows.indexOf(variant);
                      const hlBg = getFillHighlight(variantIdx);
                      return (
                        <tr key={variant.id} className="listed-price-variant-row"
                          style={hlBg ? { background: '#fff7ed', outline: '1px dashed #ea580c' } : undefined}
                          onMouseEnter={() => { if (fillDrag) setFillOver(variantIdx); }}>
                          {/* Variant # */}
                          <td className="listed-price-table__index" style={{ paddingLeft: 18, color: '#a78bfa', fontSize: '0.75rem' }}>
                            {vi + 1}
                          </td>
                          {/* Variant cells */}
                          {VARIANT_COLS.map(col => renderVariantCell(col, variant, variantIdx, product))}
                          {/* Delete variant */}
                          <td className="listed-price-table__actions" style={{ verticalAlign: 'middle' }}>
                            <button type="button" title="Xóa phân loại" onClick={() => deleteVariant(variant.id)}>×</button>
                          </td>
                        </tr>
                      );
                    })}

                    {/* ── Gift rows (shown when promotion is M1T{N}, N rows) ── */}
                    {isExpanded && (() => {
                      const m = (product.promotion || '').match(/M1T(\d+)/i);
                      if (!m) return null;
                      const giftCount = parseInt(m[1]);
                      return Array.from({ length: giftCount }, (_, i) => {
                        const gift = (product.gifts || [])[i] || { barcode: '', name: '' };
                        return (
                          <tr key={`gift-${i}`} className="listed-price-variant-row" style={{ background: '#fffbeb' }}>
                            <td className="listed-price-table__index" style={{ paddingLeft: 14, color: '#d97706', fontSize: '1rem' }}>🎁</td>
                            <td colSpan={VARIANT_COLS.length} style={{ padding: '6px 10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#92400e', flexShrink: 0 }}>
                                  {giftCount > 1 ? `Quà ${i + 1}:` : 'Quà tặng:'}
                                </span>
                                <input
                                  type="text"
                                  value={gift.barcode}
                                  placeholder="Barcode quà..."
                                  onChange={e => updateGift(product.id, i, 'barcode', e.target.value)}
                                  style={{ width: 140, height: 28, padding: '0 6px', borderRadius: 6, border: '1px solid #fcd34d', background: '#fffbeb', fontSize: '0.78rem', outline: 'none', fontFamily: 'inherit' }}
                                />
                                <input
                                  type="text"
                                  value={gift.name}
                                  placeholder="Tên quà tặng..."
                                  onChange={e => updateGift(product.id, i, 'name', e.target.value)}
                                  style={{ flex: 1, height: 28, padding: '0 6px', borderRadius: 6, border: '1px solid #fcd34d', background: '#fffbeb', fontSize: '0.78rem', outline: 'none', fontFamily: 'inherit' }}
                                />
                              </div>
                            </td>
                            <td className="listed-price-table__actions" style={{ verticalAlign: 'middle' }} />
                          </tr>
                        );
                      });
                    })()}
                  </Fragment>
                );
              })}

              {groupedProducts.length === 0 && (
                <tr>
                  <td colSpan={VARIANT_COLS.length + 2} style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af', fontSize: '0.9rem' }}>
                    {hasFilter ? 'Không tìm thấy sản phẩm nào.' : 'Chưa có sản phẩm. Bấm "+ Thêm sản phẩm" để bắt đầu.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ListedPriceTab;
