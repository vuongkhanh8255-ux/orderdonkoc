import { Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppDataContext } from '../context/AppDataContext';
import * as XLSX from 'xlsx-js-style';
import { supabase } from '../supabaseClient';

// ── Storage keys ──────────────────────────────────────────────────────────────
const STORAGE_KEY    = 'stella_listed_price_rows_v2';  // v2: grouped TikTok+Shopee pairs
const BRANDS_KEY     = 'stella_listed_price_brands_v1';
const PROMOTIONS_KEY = 'stella_listed_price_promotions_v1';
const VOUCHERS_KEY   = 'stella_listed_price_vouchers_v1';

const DEFAULT_BRANDS     = ['Body Miss', 'Stella Kinetics'];
const DEFAULT_PROMOTIONS = ['M1T1', 'M2G50%', 'M2G30%', 'BÁN LẺ'];
const DEFAULT_VOUCHERS   = ['10%', '15%', '20%', '30%', '50.000đ', '100.000đ', '200.000đ'];

// ── Columns (A–J kept for formula engine) ─────────────────────────────────────
// A=productName B=barcode C=brand D=platform(fixed) E=listedPrice F=promotion G=regularPrice H=fsPrice I=voucher J=finalPrice
const ALL_COLUMNS = [
  { key: 'productName',  label: 'Tên sản phẩm', minWidth: 240 },
  { key: 'barcode',      label: 'Barcode',       minWidth: 150 },
  { key: 'brand',        label: 'Brand',         minWidth: 150, type: 'brand' },
  { key: 'platform',     label: 'Sàn',           minWidth: 90  },
  { key: 'listedPrice',  label: 'Giá Niêm yết',  minWidth: 150 },
  { key: 'promotion',    label: 'Promotion',     minWidth: 150, type: 'promotion' },
  { key: 'regularPrice', label: 'Giá regular',   minWidth: 150 },
  { key: 'fsPrice',      label: 'Giá FS',        minWidth: 130 },
  { key: 'voucher',      label: 'Voucher',       minWidth: 130, type: 'voucher' },
  { key: 'finalPrice',   label: 'Giá final',     minWidth: 150 },
];

// Sub-sets used for rendering
const PRODUCT_COLS_LIST = ALL_COLUMNS.slice(0, 3);          // A B C
const PLATFORM_COL      = ALL_COLUMNS[3];                   // D
const PRICE_COLS        = ALL_COLUMNS.slice(4);             // E–J

// Column keys that are shared across the product group (sync both rows)
const SHARED_KEYS = new Set(['productName', 'barcode', 'brand']);

const columnLetters = ALL_COLUMNS.reduce((acc, col, i) => {
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

const createRow = () => ({
  id: newId(), groupId: null,
  productName: '', barcode: '', brand: '', platform: '',
  listedPrice: '', promotion: '', regularPrice: '', fsPrice: '', voucher: '', finalPrice: '',
});

const createGroupPair = () => {
  const groupId = newId();
  const shared  = { productName: '', barcode: '', brand: '' };
  return [
    { ...createRow(), groupId, platform: 'TikTok', ...shared },
    { ...createRow(), groupId, platform: 'Shopee', ...shared },
  ];
};

const loadArray = (key, def) => {
  try {
    const r = localStorage.getItem(key);
    const p = r ? JSON.parse(r) : null;
    return Array.isArray(p) && p.length ? p : def;
  } catch { return def; }
};

const loadRows = () => {
  const rows = loadArray(STORAGE_KEY, null);
  return rows?.length ? rows : createGroupPair();
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
    expr = expr.replace(/\b([A-Ja-j])(\d+)\b/g, (_, l, n) => {
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
  return formula.replace(/\b([A-Ja-j])(\d+)\b/g, (_, col, rowNum) =>
    `${col.toUpperCase()}${parseInt(rowNum) + offset}`
  );
};

// ── Final price auto-calculator ───────────────────────────────────────────────
const parsePromotion = (promo) => {
  if (!promo) return { base: 'single', rate: 0 };
  const p = String(promo).toUpperCase().trim();
  if (p === 'M1T1' || p === 'BÁN LẺ' || p === 'BAN LE') return { base: 'single', rate: 0 }; // chỉ tính 1 sản phẩm, không nhân 2
  // MxGy% → buy x items, discount y%
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

const calcFinalPrice = (row) => {
  const fs = parseNumber(row.fsPrice);
  if (!fs || fs <= 0) return null;

  const promo    = parsePromotion(row.promotion);
  const voucher  = parseVoucher(row.voucher);
  const isTikTok = row.platform === 'TikTok';

  // Step 1: base after promotion
  let base, originalTotal, unitCount;
  const isCombo = promo.base === 'combo';
  if (isCombo) {
    unitCount     = promo.count;
    originalTotal = fs * unitCount;
    base          = originalTotal * (1 - promo.rate);
  } else {
    // M1T1 / BÁN LẺ / no promo — tính cho 1 sản phẩm
    unitCount     = 1;
    originalTotal = fs;
    base          = fs;
  }

  // Step 2: apply voucher
  // TikTok: luôn trừ voucher
  // Shopee combo: không trừ voucher (chỉ chia)
  // Shopee single (BÁN LẺ / M1T1): có trừ voucher
  const applyVoucher = isTikTok || !isCombo;
  let total;
  if (!applyVoucher || voucher.type === 'none') {
    total = base;
  } else if (voucher.type === 'percent') {
    if (isTikTok) {
      // TikTok: trừ voucher % tính trên giá gốc (trước promotion)
      total = base - originalTotal * voucher.value;
    } else {
      // Shopee single: trừ thẳng vào base
      total = base * (1 - voucher.value);
    }
  } else {
    // Fixed amount
    total = base - voucher.value;
  }

  // Step 3: chia cho số lượng để ra giá 1 unit
  const final = total / unitCount;

  return Number.isFinite(final) && final >= 0 ? Math.round(final) : null;
};

// Sinh chuỗi công thức hiển thị để user đọc/hiểu
const getFormulaHint = (row) => {
  const promo    = parsePromotion(row.promotion);
  const voucher  = parseVoucher(row.voucher);
  const isTikTok = row.platform === 'TikTok';
  const isCombo  = promo.base === 'combo';
  const count    = isCombo ? promo.count : 1;

  // Phần base (sau promotion)
  let baseStr;
  if (isCombo) {
    const discPct = Math.round((1 - promo.rate) * 100);
    baseStr = `(FS×${count})×${discPct}%`;
  } else {
    baseStr = 'FS';
  }

  // Phần voucher: TikTok luôn trừ, Shopee chỉ trừ khi single (không phải combo)
  const showVoucher = voucher.type !== 'none' && (isTikTok || !isCombo);
  let totalStr = baseStr;
  if (showVoucher) {
    if (voucher.type === 'percent') {
      const vPct = Math.round(voucher.value * 100);
      if (isTikTok) {
        const origStr = isCombo ? `FS×${count}` : 'FS';
        totalStr = `${baseStr} − ${origStr}×${vPct}%`;
      } else {
        // Shopee single: nhân trực tiếp
        totalStr = `${baseStr}×${100 - vPct}%`;
      }
    } else {
      const fixedStr = voucher.value >= 1000
        ? `${(voucher.value / 1000).toLocaleString('vi-VN')}k`
        : String(voucher.value);
      totalStr = `${baseStr} − ${fixedStr}`;
    }
  }

  // Chia cho số lượng nếu combo → giá per unit
  if (isCombo) {
    return `(${totalStr}) ÷ ${count}`;
  }
  return totalStr;
};

// ── Excel export ──────────────────────────────────────────────────────────────
const toExcelFormulaText = (value) =>
  isFormula(value)
    ? String(value || '').replace(/(\d+)\.(\d+)/g, '$1,$2').replace(/\b([A-Ja-j])(\d+)\b/g, (_, c, n) => `${c.toUpperCase()}${parseInt(n) + 1}`)
    : value;

const exportExcel = (rows) => {
  const headers = ['Tên sản phẩm','Barcode','Brand','Sàn','Giá Niêm yết','Promotion','Giá regular','Giá FS','Voucher','Giá final'];
  const data = [
    headers,
    ...rows.map(r => [
      r.productName, r.barcode, r.brand, r.platform,
      toExcelFormulaText(r.listedPrice), r.promotion,
      toExcelFormulaText(r.regularPrice), toExcelFormulaText(r.fsPrice),
      toExcelFormulaText(r.voucher),      toExcelFormulaText(r.finalPrice),
    ])
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  headers.forEach((_, ci) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: ci });
    if (ws[cellRef]) ws[cellRef].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: 'EA580C' } },
      alignment: { horizontal: 'center' },
    };
  });
  ws['!cols'] = [{ wch: 40 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bang Gia Niem Yet');
  XLSX.writeFile(wb, 'bang-gia-niem-yet.xlsx');
};

// ── Platform logos (inline SVG — no external files needed) ───────────────────
const ShopeeLogo = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sp-bg" x1="50" y1="0" x2="50" y2="100" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FF6633"/>
        <stop offset="1" stopColor="#EE4D2D"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="20" fill="url(#sp-bg)"/>
    {/* bag body */}
    <path d="M22 46 L78 46 L71 79 L29 79 Z" fill="white"/>
    {/* bag handle */}
    <path d="M33 46 C33 27 67 27 67 46" stroke="white" strokeWidth="8" strokeLinecap="round"/>
    {/* S letter */}
    <text x="50" y="71" textAnchor="middle" fill="#EE4D2D" fontSize="26" fontWeight="900" fontFamily="Arial Black,Arial,sans-serif">S</text>
  </svg>
);

const TikTokLogo = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" rx="20" fill="#010101"/>
    {/* pink/red shadow — shifted right */}
    <g fill="#FE2C55" transform="translate(2,0)">
      <ellipse cx="33" cy="67" rx="13" ry="10"/>
      <rect x="44" y="19" width="6" height="49"/>
      <rect x="44" y="19" width="24" height="8" rx="3"/>
      <rect x="62" y="19" width="6" height="22" rx="2"/>
    </g>
    {/* cyan shadow — shifted left */}
    <g fill="#25F4EE" transform="translate(-4,0)">
      <ellipse cx="33" cy="67" rx="13" ry="10"/>
      <rect x="44" y="19" width="6" height="49"/>
      <rect x="44" y="19" width="24" height="8" rx="3"/>
      <rect x="62" y="19" width="6" height="22" rx="2"/>
    </g>
    {/* white main note */}
    <g fill="white">
      <ellipse cx="33" cy="67" rx="13" ry="10"/>
      <rect x="44" y="19" width="6" height="49"/>
      <rect x="44" y="19" width="24" height="8" rx="3"/>
      <rect x="62" y="19" width="6" height="22" rx="2"/>
    </g>
  </svg>
);

// ── Excel import ──────────────────────────────────────────────────────────────
const importExcel = (file, onSuccess) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const firstRow = raw[0] || [];
    const isHeader = String(firstRow[0] || '').toLowerCase().includes('tên') ||
                     String(firstRow[0] || '').toLowerCase().includes('product');
    const start = isHeader ? 1 : 0;
    const flatRows = raw.slice(start)
      .map(r => ({ ...createRow(),
        productName: String(r[0] || ''), barcode: String(r[1] || ''),
        brand: String(r[2] || ''), platform: String(r[3] || '') || 'TikTok',
        listedPrice: String(r[4] || ''), promotion: String(r[5] || ''),
        regularPrice: String(r[6] || ''), fsPrice: String(r[7] || ''),
        voucher: String(r[8] || ''), finalPrice: String(r[9] || ''),
      }))
      .filter(r => r.productName || r.barcode || r.brand);

    // Pair consecutive TikTok+Shopee rows with same product into groups
    const paired = [];
    for (let i = 0; i < flatRows.length; i++) {
      const row = flatRows[i];
      const next = flatRows[i + 1];
      const isAlreadyPaired = next && next.platform === 'Shopee' &&
        next.productName === row.productName && next.barcode === row.barcode;
      const groupId = newId();
      if (row.platform === 'TikTok' && isAlreadyPaired) {
        paired.push({ ...row, groupId }, { ...next, groupId });
        i++;
      } else if (row.platform !== 'Shopee') {
        const shopeeRow = { ...createRow(), groupId, platform: 'Shopee',
          productName: row.productName, barcode: row.barcode, brand: row.brand,
          regularPrice: row.regularPrice ? String(Math.round(parseNumber(row.regularPrice) * 1.10)) : '',
          fsPrice:      row.regularPrice ? String(Math.round(parseNumber(row.regularPrice) * 1.05)) : '',
        };
        paired.push({ ...row, groupId }, shopeeRow);
      } else {
        paired.push({ ...row, groupId });
      }
    }
    onSuccess(paired.length ? paired : createGroupPair());
  };
  reader.readAsArrayBuffer(file);
};

// ── Supabase sync helpers ─────────────────────────────────────────────────────
const rowToDb = (row, idx) => ({
  id:            row.id,
  group_id:      row.groupId   || '',
  row_type:      row.rowType   || 'price',
  platform:      row.platform  || '',
  product_name:  row.productName  || '',
  barcode:       row.barcode   || '',
  brand:         row.brand     || '',
  listed_price:  row.listedPrice  || '',
  promotion:     row.promotion || '',
  regular_price: row.regularPrice || '',
  fs_price:      row.fsPrice   || '',
  voucher:       row.voucher   || '',
  final_price:   row.finalPrice || '',
  sort_order:    idx,
});

const dbToRow = (r) => ({
  id:           r.id,
  groupId:      r.group_id,
  rowType:      r.row_type,
  platform:     r.platform,
  productName:  r.product_name,
  barcode:      r.barcode,
  brand:        r.brand,
  listedPrice:  r.listed_price,
  promotion:    r.promotion,
  regularPrice: r.regular_price,
  fsPrice:      r.fs_price,
  voucher:      r.voucher,
  finalPrice:   r.final_price,
});

// ── Inline AddOption ──────────────────────────────────────────────────────────
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

// ── Main Component ────────────────────────────────────────────────────────────
const ListedPriceTab = () => {
  const { brands: ctxBrands = [] } = useContext(AppDataContext) || {};

  const [rows, setRows]             = useState(loadRows);
  const [brands, setBrands]         = useState(() => loadArray(BRANDS_KEY, DEFAULT_BRANDS));
  const [promotions, setPromotions] = useState(() => loadArray(PROMOTIONS_KEY, DEFAULT_PROMOTIONS));
  const [vouchers, setVouchers]     = useState(() => loadArray(VOUCHERS_KEY, DEFAULT_VOUCHERS));
  const [syncing, setSyncing]       = useState(false);

  // Filter state
  const [filterText,      setFilterText]      = useState('');
  const [filterBrand,     setFilterBrand]     = useState('');
  const [filterPromotion, setFilterPromotion] = useState('');
  const [filterBarcode,   setFilterBarcode]   = useState('');

  // Add-option toggles
  const [addingBrand,     setAddingBrand]     = useState(false);
  const [addingPromotion, setAddingPromotion] = useState(false);
  const [addingVoucher,   setAddingVoucher]   = useState(false);

  // Cell edit + drag-to-fill
  const [editingCell, setEditingCell] = useState(null);
  const [fillDrag,    setFillDrag]    = useState(null);
  const [fillOver,    setFillOver]    = useState(null);

  const importRef   = useRef(null);
  const syncTimer   = useRef(null);

  // ── Load từ Supabase khi mount ──
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('listed_price_rows')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error || !data?.length) return; // fallback localStorage
      const loaded = data.map(dbToRow);
      setRows(loaded);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded));
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist localStorage ──
  useEffect(() => { localStorage.setItem(STORAGE_KEY,    JSON.stringify(rows));       }, [rows]);
  useEffect(() => { localStorage.setItem(BRANDS_KEY,     JSON.stringify(brands));     }, [brands]);
  useEffect(() => { localStorage.setItem(PROMOTIONS_KEY, JSON.stringify(promotions)); }, [promotions]);
  useEffect(() => { localStorage.setItem(VOUCHERS_KEY,   JSON.stringify(vouchers));   }, [vouchers]);

  // ── Sync lên Supabase (debounce 1.5s) ──
  const syncToSupabase = useCallback((nextRows) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      setSyncing(true);
      try {
        const dbRows = nextRows.map((r, i) => rowToDb(r, i));
        // Upsert tất cả rows hiện tại
        await supabase.from('listed_price_rows').upsert(dbRows, { onConflict: 'id' });
        // Xóa rows cũ không còn trong danh sách
        const ids = nextRows.map(r => r.id);
        await supabase.from('listed_price_rows').delete().not('id', 'in', `(${ids.map(id => `"${id}"`).join(',')})`);
      } finally {
        setSyncing(false);
      }
    }, 1500);
  }, []);

  // Sync mỗi khi rows thay đổi
  useEffect(() => { syncToSupabase(rows); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync brands from Supabase context
  useEffect(() => {
    if (!ctxBrands?.length) return;
    const ctxNames = ctxBrands.map(b => b.ten_brand).filter(Boolean);
    setBrands(prev => [...new Set([...ctxNames, ...prev])]);
  }, [ctxBrands]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Global mouseup: finish drag-to-fill ──
  useEffect(() => {
    if (!fillDrag) return;
    const handleMouseUp = () => {
      if (fillOver !== null && fillOver !== fillDrag.fromIndex) {
        const { fromIndex, colKey, sourceValue } = fillDrag;
        const lo = Math.min(fromIndex, fillOver);
        const hi = Math.max(fromIndex, fillOver);
        setRows(prev => prev.map((r, i) => {
          if (i === fromIndex || i < lo || i > hi) return r;
          const newVal = isFormula(sourceValue) ? shiftFormula(sourceValue, i - fromIndex) : sourceValue;
          return { ...r, [colKey]: newVal };
        }));
      }
      setFillDrag(null);
      setFillOver(null);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [fillDrag, fillOver]);

  const addBrand     = (v) => { if (!brands.includes(v))     setBrands(p     => [...p, v]); };
  const addPromotion = (v) => { if (!promotions.includes(v)) setPromotions(p => [...p, v]); };
  const addVoucher   = (v) => { if (!vouchers.includes(v))   setVouchers(p   => [...p, v]); };

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  // updateCell: sync shared keys (name/barcode/brand) across group + auto-calc Shopee prices
  const updateCell = (id, key, value) => {
    setRows(prev => {
      const targetRow = prev.find(r => r.id === id);
      if (!targetRow) return prev;

      // 1. Update target row + sync shared columns across the group
      let updated = prev.map(r => {
        if (r.id === id) return { ...r, [key]: value };
        if (targetRow.groupId && SHARED_KEYS.has(key) && r.groupId === targetRow.groupId)
          return { ...r, [key]: value };
        return r;
      });

      // 2. Auto-calc Shopee prices when TikTok regularPrice changes
      if (key === 'regularPrice' && targetRow.platform === 'TikTok' && targetRow.groupId) {
        const rowIdx = prev.findIndex(r => r.id === id);
        const regNum = isFormula(value)
          ? evaluateFormula(value, { ...targetRow, regularPrice: value }, rowIdx, prev, 'regularPrice')
          : parseNumber(value);
        if (Number.isFinite(regNum) && regNum > 0) {
          updated = updated.map(r =>
            r.groupId === targetRow.groupId && r.platform === 'Shopee'
              ? { ...r, regularPrice: String(Math.round(regNum * 1.10)), fsPrice: String(Math.round(regNum * 1.05)) }
              : r
          );
        }
      }

      // 3. Auto-add/remove gift row khi promotion thay đổi
      if (key === 'promotion' && targetRow.groupId) {
        const anyM1T1 = updated.some(r =>
          r.groupId === targetRow.groupId && r.rowType !== 'gift' &&
          String(r.promotion || '').toUpperCase().trim() === 'M1T1'
        );
        const hasGift = updated.some(r => r.groupId === targetRow.groupId && r.rowType === 'gift');

        if (anyM1T1 && !hasGift) {
          // Tự thêm gift row
          const gift = { ...createRow(), groupId: targetRow.groupId, platform: 'gift', rowType: 'gift' };
          const lastIdx = updated.reduce((max, r, i) => r.groupId === targetRow.groupId ? i : max, -1);
          const next = [...updated];
          next.splice(lastIdx + 1, 0, gift);
          updated = next;
        } else if (!anyM1T1 && hasGift) {
          // Tự xóa gift row khi không còn M1T1 nào trong group
          updated = updated.filter(r => !(r.groupId === targetRow.groupId && r.rowType === 'gift'));
        }
      }

      return updated;
    });
  };

  const addGroup       = () => setRows(p => [...p, ...createGroupPair()]);

  // Gift row (M1T1): direct update — không sync SHARED_KEYS
  const updateGiftCell = (id, key, value) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [key]: value } : r));

  const addGiftRow = (groupId) => setRows(prev => {
    if (prev.some(r => r.groupId === groupId && r.rowType === 'gift')) return prev;
    const gift = { ...createRow(), groupId, platform: 'gift', rowType: 'gift' };
    const lastIdx = prev.reduce((max, r, i) => r.groupId === groupId ? i : max, -1);
    const result = [...prev];
    result.splice(lastIdx + 1, 0, gift);
    return result;
  });

  const removeGiftRow = (groupId) =>
    setRows(prev => prev.filter(r => !(r.groupId === groupId && r.rowType === 'gift')));

  const deleteGroup    = (groupId) => setRows(p => {
    const filtered = p.filter(r => r.groupId !== groupId);
    const hasGroups = filtered.some(r => r.groupId);
    return hasGroups ? filtered : createGroupPair();
  });

  const duplicateGroup = (groupId) => setRows(p => {
    const groupRows  = p.filter(r => r.groupId === groupId);
    const newGroupId = newId();
    const duped      = groupRows.map(r => ({ ...r, id: newId(), groupId: newGroupId }));
    const lastIdx    = p.reduce((max, r, i) => r.groupId === groupId ? i : max, -1);
    const result     = [...p];
    result.splice(lastIdx + 1, 0, ...duped);
    return result;
  });

  const clearAll = () => { if (window.confirm('Xóa toàn bộ bảng giá niêm yết?')) setRows(createGroupPair()); };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    importExcel(file, (newRows) => {
      const productCount = new Set(newRows.map(r => r.groupId)).size;
      if (window.confirm(`Import ${productCount} sản phẩm?\n\nOK = Ghi đè\nCancel = Thêm vào cuối`)) {
        setRows(newRows);
      } else {
        setRows(p => {
          const existing = p.filter(r => r.productName || r.barcode || r.brand);
          return [...existing, ...newRows];
        });
      }
    });
    e.target.value = '';
  };

  // ── Grouped products (for render) ─────────────────────────────────────────────
  const groupedProducts = useMemo(() => {
    // Build map groupId → [{row, index}]
    const groupMap = new Map();
    rows.forEach((row, index) => {
      if (!row.groupId) return;
      if (!groupMap.has(row.groupId)) groupMap.set(row.groupId, []);
      groupMap.get(row.groupId).push({ row, index });
    });

    // Sort each group: TikTok first, Shopee second, gift last
    groupMap.forEach(items => items.sort((a, b) => {
      if (a.row.rowType === 'gift') return 1;
      if (b.row.rowType === 'gift') return -1;
      return a.row.platform === 'TikTok' ? -1 : 1;
    }));

    const allGroups = Array.from(groupMap.values());

    // Apply filters (use TikTok row as representative for brand/barcode)
    return allGroups.filter(groupItems => {
      const rep = (groupItems.find(i => i.row.platform === 'TikTok') || groupItems[0]).row;
      if (filterBrand    && rep.brand !== filterBrand) return false;
      if (filterBarcode  && !String(rep.barcode || '').toLowerCase().includes(filterBarcode.toLowerCase())) return false;
      if (filterPromotion && !groupItems.some(({ row }) => row.promotion === filterPromotion)) return false;
      if (filterText && !groupItems.some(({ row }) =>
        ALL_COLUMNS.some(c => String(row[c.key] || '').toLowerCase().includes(filterText.toLowerCase()))
      )) return false;
      return true;
    });
  }, [rows, filterBrand, filterPromotion, filterBarcode, filterText]);

  const hasFilter  = filterBrand || filterPromotion || filterBarcode || filterText;
  const clearFilter = () => { setFilterText(''); setFilterBrand(''); setFilterPromotion(''); setFilterBarcode(''); };

  // ── Styles ──
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

  // ── Cell renderer (price + promotion + platform label) ────────────────────
  const renderCell = (col, row, index) => {
    const rawValue  = row[col.key] ?? '';
    const isEditing = editingCell?.id === row.id && editingCell?.key === col.key;
    const isDragSrc = fillDrag?.fromIndex === index && fillDrag?.colKey === col.key;

    // Fixed platform label with actual logo
    if (col.key === 'platform') {
      const isTikTok = row.platform === 'TikTok';
      return (
        <td key="platform" style={{
          background:  isTikTok ? '#f0f4ff' : '#fff7ed',
          borderRight: `2px solid ${isTikTok ? '#c7d2fe' : '#fed7aa'}`,
          userSelect:  'none',
          padding:     '4px 6px',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            {isTikTok ? <TikTokLogo size={22} /> : <ShopeeLogo size={22} />}
            <span style={{
              fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.3px',
              color: isTikTok ? '#4f46e5' : '#ea580c',
            }}>
              {isTikTok ? 'TikTok' : 'Shopee'}
            </span>
          </div>
        </td>
      );
    }

    // Dropdown: promotion
    if (col.type === 'promotion') return (
      <td key={col.key} style={{ position: 'relative' }}>
        <select value={rawValue} onChange={e => updateCell(row.id, col.key, e.target.value)} style={selectStyle}>
          <option value="">— chọn —</option>
          {promotions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {rawValue && <FillHandle onMouseDown={e => startFill(e, index, col.key, rawValue)} active={isDragSrc} />}
      </td>
    );

    // Dropdown: voucher
    if (col.type === 'voucher') return (
      <td key={col.key} style={{ position: 'relative' }}>
        <select value={rawValue} onChange={e => updateCell(row.id, col.key, e.target.value)} style={selectStyle}>
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

    // Auto-computed final price (shown when cell is empty and not editing)
    const autoFinal = (!isEditing && !rawValue && col.key === 'finalPrice')
      ? calcFinalPrice(row) : null;
    const formulaHint = autoFinal !== null ? getFormulaHint(row) : null;

    return (
      <td key={col.key} style={{ position: 'relative', outline: isDragSrc ? '2px solid #ea580c' : undefined }}>
        {autoFinal !== null && !isEditing ? (
          <div
            onClick={() => setEditingCell({ id: row.id, key: col.key })}
            title="Click để ghi đè bằng số hoặc công thức riêng"
            style={{
              textAlign: 'center', padding: '2px 8px', minHeight: 34, display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: 'text',
              background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
              borderRadius: 9, border: '1px dashed #86efac', gap: 1,
            }}
          >
            <span style={{ color: '#059669', fontWeight: 700, fontSize: '0.82rem' }}>
              +&nbsp;{fmtResult(autoFinal)}
            </span>
            {formulaHint && (
              <span style={{ fontSize: '0.6rem', color: '#16a34a', opacity: 0.75, fontFamily: 'monospace', lineHeight: 1.2 }}>
                {formulaHint}
              </span>
            )}
          </div>
        ) : (
          <input
            type="text"
            value={displayValue}
            placeholder={isEditing || !hasFormula ? col.label : ''}
            onChange={e => updateCell(row.id, col.key, e.target.value)}
            onFocus={() => setEditingCell({ id: row.id, key: col.key })}
            onBlur={() => setEditingCell(null)}
            style={{ color: !isEditing && hasFormula && isError ? '#dc2626' : '#0f172a', textAlign: 'center' }}
          />
        )}
        {isEditing && hasFormula && (
          <div style={{ fontSize: 10, color: Number.isFinite(formulaResult) ? '#16a34a' : '#dc2626', paddingLeft: 6, paddingBottom: 2, lineHeight: 1.2 }}>
            → {Number.isFinite(formulaResult) ? fmtResult(formulaResult) : 'Lỗi công thức'}
          </div>
        )}
        {rawValue && <FillHandle onMouseDown={e => startFill(e, index, col.key, rawValue)} active={isDragSrc} />}
      </td>
    );
  };

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

  // ── Render ──
  return (
    <div className="listed-price-page" style={fillDrag ? { userSelect: 'none', cursor: 'crosshair' } : {}}>

      {/* ── Header ── */}
      <div className="listed-price-page__header">
        <div>
          <div className="listed-price-page__eyebrow">Ecom</div>
          <h1 className="page-header" style={{ margin: 0 }}>BẢNG GIÁ NIÊM YẾT</h1>
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            Listing full giá niêm yết theo sản phẩm — mỗi sản phẩm có giá TikTok &amp; Shopee.
            {syncing
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 999, padding: '2px 10px', fontWeight: 700, flexShrink: 0 }}>⟳ Đang lưu...</span>
              : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: '#166534', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 999, padding: '2px 10px', fontWeight: 700, flexShrink: 0 }}>✓ Đã lưu</span>
            }
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={clearAll} className="listed-price-page__button is-muted">Xóa bảng</button>
          <button onClick={addGroup} className="listed-price-page__button is-primary">+ Thêm sản phẩm</button>
          <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportFile} />
          <button onClick={() => importRef.current?.click()}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #3b82f6', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            📥 Import Excel
          </button>
          <button onClick={() => exportExcel(rows)}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #16a34a', background: '#f0fdf4', color: '#15803d', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            📤 Export Excel
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 14px' }}>

        {/* Search group: tên SP + barcode gộp chung */}
        <div style={{ display: 'flex', background: '#f8fafc', border: '1.5px solid #e5e7eb', borderRadius: 9, overflow: 'hidden', flex: '1 1 280px', minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', flex: 2, borderRight: '1px solid #e5e7eb' }}>
            <span style={{ color: '#94a3b8', fontSize: 14, flexShrink: 0 }}>⌕</span>
            <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
              placeholder="Tên SP, barcode..."
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', width: '100%', padding: 0, boxShadow: 'none' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', flex: 1 }}>
            <input type="text" value={filterBarcode} onChange={e => setFilterBarcode(e.target.value)}
              placeholder="Lọc barcode..."
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', width: '100%', padding: 0, boxShadow: 'none' }} />
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: '#e5e7eb', flexShrink: 0 }} />

        {/* Brand */}
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

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: '#e5e7eb', flexShrink: 0 }} />

        {/* Promotion */}
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

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: '#e5e7eb', flexShrink: 0 }} />

        {/* Voucher */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>🏷️ Voucher</span>
            <button onClick={() => setAddingVoucher(v => !v)} style={addBtnStyle(addingVoucher)}>+</button>
          </div>
          {addingVoucher && <AddOptionInline placeholder="VD: 10% hoặc 50.000đ..." onAdd={addVoucher} onClose={() => setAddingVoucher(false)} />}
        </div>

        {hasFilter && (
          <button onClick={clearFilter}
            style={{ padding: '6px 12px', background: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: 8, color: '#dc2626', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
            ✕ Xóa lọc
          </button>
        )}

        <div style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
          <strong style={{ color: '#ea580c' }}>{groupedProducts.length}</strong> / {Math.ceil(rows.filter(r => r.platform === 'TikTok').length)} sản phẩm
        </div>
      </div>

      {/* ── Table ── */}
      <div className="listed-price-table-card">
        <div className="listed-price-table-wrap">
          <table className="listed-price-table"
            onMouseLeave={() => { if (fillDrag) setFillOver(null); }}>
            <thead>
              <tr>
                <th className="listed-price-table__index">#</th>
                {/* A B C — product columns */}
                {PRODUCT_COLS_LIST.map((col, i) => (
                  <th key={col.key} style={{ minWidth: col.minWidth }}>
                    <span>{String.fromCharCode(65 + i)}</span>{col.label}
                  </th>
                ))}
                {/* D — platform (fixed) */}
                <th style={{ minWidth: 90 }}><span>D</span>Sàn</th>
                {/* E–J — price columns */}
                {PRICE_COLS.map((col, i) => (
                  <th key={col.key} style={{ minWidth: col.minWidth }}>
                    <span>{String.fromCharCode(69 + i)}</span>{col.label}
                  </th>
                ))}
                <th className="listed-price-table__actions">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {groupedProducts.map((groupItems, groupIdx) => {
                const tiktokItem = groupItems.find(i => i.row.platform === 'TikTok') || groupItems[0];
                const shopeeItem = groupItems.find(i => i.row.platform === 'Shopee');
                const giftItem   = groupItems.find(i => i.row.rowType === 'gift');
                const { row: tRow, index: tIdx } = tiktokItem;
                const rowSpan    = shopeeItem ? 2 : 1;
                const groupId    = tRow.groupId;
                const tikHL      = getFillHighlight(tIdx);
                const shopHL     = shopeeItem ? getFillHighlight(shopeeItem.index) : false;
                const hasM1T1    = groupItems.some(i => String(i.row.promotion || '').toUpperCase().trim() === 'M1T1');

                return (
                  <Fragment key={groupId}>
                    {/* ── TikTok row ── */}
                    <tr
                      onMouseEnter={() => { if (fillDrag) setFillOver(tIdx); }}
                      style={tikHL ? { background: '#fff7ed', outline: '1px dashed #ea580c' } : undefined}
                    >
                      {/* # (merged) */}
                      <td className="listed-price-table__index" rowSpan={rowSpan}
                        style={{ verticalAlign: 'middle', fontWeight: 700, color: '#6b7280', fontSize: '0.9rem' }}>
                        {groupIdx + 1}
                      </td>

                      {/* Product name (merged) */}
                      <td rowSpan={rowSpan} style={{ position: 'relative', verticalAlign: 'middle' }}>
                        <input type="text" value={tRow.productName || ''} placeholder="Tên sản phẩm"
                          onChange={e => updateCell(tRow.id, 'productName', e.target.value)}
                          style={{ fontWeight: tRow.productName ? 700 : 400 }}
                        />
                      </td>

                      {/* Barcode (merged) */}
                      <td rowSpan={rowSpan} style={{ position: 'relative', verticalAlign: 'middle' }}>
                        <input type="text" value={tRow.barcode || ''} placeholder="Barcode"
                          onChange={e => updateCell(tRow.id, 'barcode', e.target.value)}
                          style={{ textAlign: 'center' }}
                        />
                      </td>

                      {/* Brand (merged) */}
                      <td rowSpan={rowSpan} style={{ position: 'relative', verticalAlign: 'middle' }}>
                        <select value={tRow.brand || ''} onChange={e => updateCell(tRow.id, 'brand', e.target.value)} style={selectStyle}>
                          <option value="">— chọn brand —</option>
                          {brands.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </td>

                      {/* TikTok platform label + price cells */}
                      {renderCell(PLATFORM_COL, tRow, tIdx)}
                      {PRICE_COLS.map(col => renderCell(col, tRow, tIdx))}

                      {/* Actions (merged) */}
                      <td rowSpan={rowSpan} className="listed-price-table__actions" style={{ verticalAlign: 'middle' }}>
                        {hasM1T1 && (
                          <button
                            type="button"
                            title={giftItem ? 'Ẩn SP quà tặng' : 'Hiện SP quà tặng'}
                            onClick={() => giftItem ? removeGiftRow(groupId) : addGiftRow(groupId)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: '1rem', padding: '2px 3px',
                              opacity: giftItem ? 1 : 0.35,
                              filter: giftItem ? 'none' : 'grayscale(1)',
                              title: giftItem ? 'Thu quà tặng' : 'Mở quà tặng',
                            }}
                          >🎁</button>
                        )}
                        <button type="button" title="Nhân bản" onClick={() => duplicateGroup(groupId)}>⧉</button>
                        <button type="button" title="Xóa" onClick={() => deleteGroup(groupId)}>×</button>
                      </td>
                    </tr>

                    {/* ── Shopee row ── */}
                    {shopeeItem && (
                      <tr
                        onMouseEnter={() => { if (fillDrag) setFillOver(shopeeItem.index); }}
                        style={shopHL ? { background: '#fff7ed', outline: '1px dashed #ea580c' } : undefined}
                      >
                        {renderCell(PLATFORM_COL, shopeeItem.row, shopeeItem.index)}
                        {PRICE_COLS.map(col => renderCell(col, shopeeItem.row, shopeeItem.index))}
                      </tr>
                    )}

                    {/* ── Gift row (M1T1) ── */}
                    {giftItem && (
                      <tr className="is-gift-row">
                        {/* # */}
                        <td className="listed-price-table__index"
                          style={{ color: '#059669', fontSize: '1rem', textAlign: 'center' }}>↳</td>
                        {/* Gift product name */}
                        <td style={{ position: 'relative' }}>
                          <input type="text" value={giftItem.row.productName || ''} placeholder="Tên SP quà tặng"
                            onChange={e => updateGiftCell(giftItem.row.id, 'productName', e.target.value)}
                            style={{ fontWeight: 600, color: '#059669' }} />
                        </td>
                        {/* Gift barcode */}
                        <td>
                          <input type="text" value={giftItem.row.barcode || ''} placeholder="Barcode quà"
                            onChange={e => updateGiftCell(giftItem.row.id, 'barcode', e.target.value)}
                            style={{ textAlign: 'center', color: '#059669' }} />
                        </td>
                        {/* Brand — empty */}
                        <td />
                        {/* Platform: 🎁 badge */}
                        <td style={{ background: '#dcfce7', borderRight: '2px solid #86efac', padding: '4px 6px', userSelect: 'none' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <span style={{ fontSize: 18 }}>🎁</span>
                            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#059669', letterSpacing: '0.3px' }}>Quà tặng</span>
                          </div>
                        </td>
                        {/* Listed price */}
                        <td>
                          <input type="text" value={giftItem.row.listedPrice || ''} placeholder="Giá niêm yết"
                            onChange={e => updateGiftCell(giftItem.row.id, 'listedPrice', e.target.value)}
                            style={{ textAlign: 'center', color: '#059669' }} />
                        </td>
                        {/* Promotion — empty */}
                        <td />
                        {/* Regular price — editable */}
                        <td>
                          <input type="text" value={giftItem.row.regularPrice || ''} placeholder="Giá regular"
                            onChange={e => updateGiftCell(giftItem.row.id, 'regularPrice', e.target.value)}
                            style={{ textAlign: 'center', color: '#059669' }} />
                        </td>
                        {/* fsPrice, voucher, finalPrice — empty */}
                        <td />
                        <td />
                        <td />
                        {/* Actions: remove gift row */}
                        <td className="listed-price-table__actions">
                          <button type="button" title="Xóa SP quà tặng" onClick={() => removeGiftRow(groupId)}>×</button>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ── Fill Handle widget ────────────────────────────────────────────────────────
const FillHandle = ({ onMouseDown, active }) => (
  <div
    onMouseDown={onMouseDown}
    title="Kéo xuống để áp dụng"
    style={{
      position: 'absolute', bottom: 1, right: 1,
      width: 9, height: 9,
      background: active ? '#c2410c' : '#ea580c',
      border: '1.5px solid #fff',
      borderRadius: 2,
      cursor: 'crosshair',
      zIndex: 10,
      opacity: 0.85,
      transition: 'opacity 0.1s',
    }}
    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.3)'; }}
    onMouseLeave={e => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.transform = 'scale(1)'; }}
  />
);

export default ListedPriceTab;
