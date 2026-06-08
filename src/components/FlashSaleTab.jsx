// src/components/FlashSaleTab.jsx — Flash Sale Automation Tool
// Built by Quốc Khánh
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';

const API_BASE = '/api/shopee/flash-sale';
const DEFAULT_SHOP_ID = '341325550';

// Shop đang chọn cho mọi apiCall — cập nhật khi đổi shop ở selector (shops nạp động từ list_shops).
let ACTIVE_SHOP_ID = DEFAULT_SHOP_ID;

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtVnd = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '0';
  return n.toLocaleString('vi-VN') + ' ₫';
};
const fmtDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const fmtTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
};
const fmtDateTime = (ts) => `${fmtTime(ts)} ${fmtDate(ts)}`;
const slotKey = (s) => s?.time_slot_id || s?.timeslot_id;

// ── API caller ───────────────────────────────────────────────────────────────
async function apiCall(action, params = {}, body = null) {
  const qs = new URLSearchParams({ action, shop_id: ACTIVE_SHOP_ID, ...params });
  const url = `${API_BASE}?${qs}`;
  const opts = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { method: 'GET' };
  const res = await fetch(url, opts);
  return res.json();
}

// Chạy tác vụ async theo lô (giới hạn song song) để không quá tải API.
async function runChunked(arr, size, fn) {
  for (let i = 0; i < arr.length; i += size) {
    await Promise.all(arr.slice(i, i + size).map(fn));
  }
}

// Đọc sheet Excel → các dòng { item_id, model_id, item_name, model_name, original_price, price, stock }.
// Khớp cột theo TÊN tiêu đề (không phụ thuộc thứ tự cột), bỏ dấu để dò.
function parseSheetRows(ws) {
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  if (!aoa.length) return [];
  const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd').trim();
  let hi = aoa.findIndex(row => Array.isArray(row) && row.some(c => { const n = norm(c); return n.includes('id san pham') || n === 'item_id'; }));
  if (hi < 0) hi = 0;
  const header = (aoa[hi] || []).map(norm);
  const col = (...keys) => header.findIndex(h => keys.some(k => h.includes(k)));
  const cItem = col('id san pham', 'item_id', 'item id');
  const cModel = col('id phan loai', 'model_id', 'model id');
  const cIName = col('ten san pham', 'ten sp');
  const cMName = col('ten phan loai');
  const cOrig = col('gia goc', 'original');
  const cPrice = col('gia flash', 'gia fs', 'gia sale', 'gia km');
  const cStock = col('so luong', 'ton kho', 'stock', 'sl km');
  const digits = (v) => String(v ?? '').replace(/[^\d]/g, '');
  const num = (v) => { const d = digits(v); return d ? parseInt(d, 10) : 0; };
  const out = [];
  for (let i = hi + 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!Array.isArray(row)) continue;
    const item_id = cItem >= 0 ? digits(row[cItem]) : '';
    if (!item_id) continue;
    const price = cPrice >= 0 ? num(row[cPrice]) : 0;
    if (!price) continue; // dòng chưa điền giá → bỏ qua
    out.push({
      item_id,
      model_id: cModel >= 0 ? (digits(row[cModel]) || '0') : '0',
      item_name: cIName >= 0 ? String(row[cIName] ?? '').trim() : '',
      model_name: cMName >= 0 ? String(row[cMName] ?? '').trim() : '',
      original_price: cOrig >= 0 ? num(row[cOrig]) : 0,
      price,
      stock: cStock >= 0 ? (num(row[cStock]) || 100) : 100,
    });
  }
  return out;
}

// ── Styles ───────────────────────────────────────────────────────────────────
const CARD = {
  background: '#fff', borderRadius: 16, padding: '24px',
  boxShadow: '0 1px 4px rgba(15,23,42,0.06)', border: '1px solid #f1f5f9',
};
const BTN_PRIMARY = {
  padding: '10px 24px', borderRadius: 10, border: 'none',
  background: '#ff6a2c', color: '#fff', fontWeight: 700, fontSize: '0.88rem',
  cursor: 'pointer', boxShadow: '0 4px 12px rgba(255,106,44,0.2)',
  transition: 'all 0.2s',
};
const BTN_SECONDARY = {
  padding: '10px 24px', borderRadius: 10,
  border: '1.5px solid #e5e7eb', background: '#fff',
  color: '#64748b', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
};
const BTN_DANGER = {
  ...BTN_SECONDARY, color: '#dc2626', borderColor: '#fecaca',
};
const INPUT = {
  padding: '8px 12px', borderRadius: 8, border: '2px solid #e5e7eb',
  fontSize: '0.85rem', outline: 'none', width: '100%', boxSizing: 'border-box',
  fontFamily: 'inherit', transition: 'border 0.2s',
};
const BADGE = (color = '#ff6a2c', bg = '#fff7ed') => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
  color, background: bg,
});

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function FlashSaleTab() {
  const [step, setStep] = useState(0); // 0=list, 1=slots, 2=products, 3=config, 4=review
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Flash Sale list
  const [flashSales, setFlashSales] = useState([]);

  // Creation wizard state
  const [timeSlots, setTimeSlots] = useState([]);
  const [selectedSlots, setSelectedSlots] = useState([]); // multi-select khung giờ
  const [submitResults, setSubmitResults] = useState([]); // kết quả tạo từng khung giờ
  const [submitProgress, setSubmitProgress] = useState(null); // {done,total} khi tạo hàng loạt
  const [products, setProducts] = useState([]);
  const [productPage, setProductPage] = useState(0);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState([]); // [{item_id, name, image, models: [...]}]
  const [productConfigs, setProductConfigs] = useState({}); // {item_id: {model_id: {price, stock, enabled}}}
  const [createdFsId, setCreatedFsId] = useState(null);

  // ── Multi-shop ──
  const [shops, setShops] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState(DEFAULT_SHOP_ID);

  // ── Load Flash Sale list ────────────────────────────────────────────────
  const loadFlashSales = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiCall('list');
      if (res.ok) {
        setFlashSales(res.data?.flash_sale_list || res.data || []);
      } else {
        setError(res.error || 'Lỗi load Flash Sale list');
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadFlashSales(); }, [loadFlashSales]);

  // keep the module-level shop in sync so every apiCall targets the selected shop
  useEffect(() => { ACTIVE_SHOP_ID = selectedShopId; }, [selectedShopId]);

  // load the list of connected shops for the selector (once)
  useEffect(() => {
    (async () => {
      try {
        const res = await apiCall('list_shops');
        const list = (res.ok && Array.isArray(res.data?.shops)) ? res.data.shops : [];
        if (list.length) {
          setShops(list);
          if (!list.some(s => String(s.shop_id) === String(selectedShopId))) {
            ACTIVE_SHOP_ID = list[0].shop_id;
            setSelectedShopId(list[0].shop_id);
          }
        }
      } catch { /* keep default shop */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // switch shop → reset the wizard + reload that shop's flash sales
  const changeShop = useCallback((shopId) => {
    const sid = String(shopId);
    if (sid === String(selectedShopId)) return;
    ACTIVE_SHOP_ID = sid;
    setSelectedShopId(sid);
    setStep(0);
    setSelectedSlots([]); setSelectedProducts([]); setProductConfigs({}); setCreatedFsId(null);
    setError(''); setSuccess('');
    loadFlashSales();
  }, [selectedShopId, loadFlashSales]);

  // ── Load time slots ─────────────────────────────────────────────────────
  const loadTimeSlots = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiCall('time_slots');
      if (res.ok) {
        setTimeSlots(res.data?.slot_list || res.data || []);
      } else {
        setError(res.error || 'Lỗi load time slots');
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  // ── Load products ───────────────────────────────────────────────────────
  const loadProducts = useCallback(async (page = 0, append = false) => {
    setLoading(true);
    setError('');
    try {
      const res = await apiCall('products', { offset: page * 50, page_size: 50 });
      if (res.ok) {
        const items = res.data?.items || res.data || [];
        if (append) {
          setProducts(prev => [...prev, ...items]);
        } else {
          setProducts(items);
        }
        setHasMoreProducts(items.length >= 50);
        setProductPage(page);
      } else {
        setError(res.error || 'Lỗi load sản phẩm');
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  // ── Load models for selected product ────────────────────────────────────
  const loadModels = useCallback(async (itemId) => {
    try {
      const res = await apiCall('product_models', { item_id: itemId });
      if (res.ok) {
        return res.data?.model || res.data || [];
      }
    } catch (e) {
      console.error('loadModels error:', e);
    }
    return [];
  }, []);

  // ── Start creation wizard ──────────────────────────────────────────────
  const startCreateWizard = async () => {
    setStep(1);
    setSelectedSlots([]);
    setSelectedProducts([]);
    setProductConfigs({});
    setCreatedFsId(null);
    setSuccess('');
    await loadTimeSlots();
  };

  // ── Multi-select khung giờ ──────────────────────────────────────────────
  const toggleSlot = (slot) => {
    const k = slotKey(slot);
    setSelectedSlots(prev => prev.some(s => slotKey(s) === k)
      ? prev.filter(s => slotKey(s) !== k)
      : [...prev, slot]);
  };
  // chọn/bỏ tất cả khung giờ trong 1 nhóm (vd cả 1 ngày) cho nhanh
  const toggleSlotGroup = (groupSlots) => {
    const keys = groupSlots.map(slotKey);
    setSelectedSlots(prev => {
      const have = new Set(prev.map(slotKey));
      const allIn = keys.every(k => have.has(k));
      if (allIn) return prev.filter(s => !keys.includes(slotKey(s)));     // bỏ hết nhóm
      const add = groupSlots.filter(s => !have.has(slotKey(s)));          // thêm phần còn thiếu
      return [...prev, ...add];
    });
  };
  const goToProducts = async () => {
    if (selectedSlots.length === 0) { setError('Vui lòng chọn ít nhất 1 khung giờ'); return; }
    setError('');
    setStep(2);
    await loadProducts(0);
  };

  // ── Toggle product selection ────────────────────────────────────────────
  const toggleProduct = async (product) => {
    const idx = selectedProducts.findIndex(p => p.item_id === product.item_id);
    if (idx >= 0) {
      // Remove
      setSelectedProducts(prev => prev.filter(p => p.item_id !== product.item_id));
      setProductConfigs(prev => {
        const next = { ...prev };
        delete next[product.item_id];
        return next;
      });
    } else {
      // Add — load models
      const models = await loadModels(product.item_id);
      const newProduct = { ...product, models };
      setSelectedProducts(prev => [...prev, newProduct]);

      // Init config with default prices
      const config = {};
      if (models.length > 0) {
        models.forEach(m => {
          const origPrice = m.price_info?.[0]?.original_price || m.original_price || 0;
          config[m.model_id] = {
            enabled: true,
            price: Math.floor(origPrice * 0.9), // Default 10% discount
            stock: 100,
            original_price: origPrice,
            model_name: m.model_name || m.name || `Model ${m.model_id}`,
            model_sku: m.model_sku || '',
          };
        });
      } else {
        // No variants — single item
        const origPrice = product.price_info?.[0]?.original_price || product.original_price || 0;
        config[0] = {
          enabled: true,
          price: Math.floor(origPrice * 0.9),
          stock: 100,
          original_price: origPrice,
          model_name: product.item_name || 'Single',
          model_sku: '',
        };
      }
      setProductConfigs(prev => ({ ...prev, [product.item_id]: config }));
    }
  };

  // ── Go to config step ──────────────────────────────────────────────────
  const goToConfig = () => {
    if (selectedProducts.length === 0) {
      setError('Vui lòng chọn ít nhất 1 sản phẩm');
      return;
    }
    setError('');
    setStep(3);
  };

  // ── Go to review step ─────────────────────────────────────────────────
  const goToReview = () => {
    // Validate configs
    for (const prod of selectedProducts) {
      const config = productConfigs[prod.item_id];
      if (!config) continue;
      const hasEnabled = Object.values(config).some(c => c.enabled);
      if (!hasEnabled) {
        setError(`Sản phẩm "${prod.item_name}" chưa có variant nào được bật`);
        return;
      }
      for (const [modelId, c] of Object.entries(config)) {
        if (!c.enabled) continue;
        if (!c.price || c.price <= 0) {
          setError(`Giá Flash Sale không hợp lệ cho "${c.model_name}"`);
          return;
        }
        if (!c.stock || c.stock <= 0) {
          setError(`Số lượng khuyến mãi không hợp lệ cho "${c.model_name}"`);
          return;
        }
        if (c.price >= c.original_price) {
          setError(`Giá Flash Sale phải thấp hơn giá gốc cho "${c.model_name}"`);
          return;
        }
      }
    }
    setError('');
    setStep(4);
  };

  // ── Submit: tạo Flash Sale cho TỪNG khung giờ đã chọn (cùng SP + giá) ─────
  const submitFlashSale = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    setSubmitResults([]);

    // Build danh sách item 1 lần — dùng chung cho mọi khung giờ
    const items = [];
    for (const prod of selectedProducts) {
      const config = productConfigs[prod.item_id];
      if (!config) continue;
      const enabledModels = Object.entries(config).filter(([, c]) => c.enabled);
      if (enabledModels.length === 0) continue;
      items.push({
        item_id: Number(prod.item_id),
        purchase_limit: 0, // 0 = no limit
        models: enabledModels.map(([modelId, c]) => ({
          model_id: modelId === '0' ? 0 : Number(modelId),
          input_promo_price: Number(c.price),
          stock: Number(c.stock),
        })),
      });
    }

    const results = [];
    let lastFsId = null;
    for (let i = 0; i < selectedSlots.length; i++) {
      const slot = selectedSlots[i];
      const label = `${fmtTime(slot.start_time)}–${fmtTime(slot.end_time)} ${fmtDate(slot.start_time)}`;
      setSubmitProgress({ done: i, total: selectedSlots.length });
      try {
        const createRes = await apiCall('create', {}, { time_slot_id: slotKey(slot) });
        if (!createRes.ok) throw new Error(createRes.message ? `${createRes.error}: ${createRes.message}` : (createRes.error || 'lỗi tạo'));
        const fsId = createRes.data?.flash_sale_id;
        if (!fsId) throw new Error('không nhận được flash_sale_id');

        const addRes = await apiCall('add_items', {}, { flash_sale_id: fsId, items });
        if (!addRes.ok) throw new Error(addRes.message ? `${addRes.error}: ${addRes.message}` : (addRes.error || 'lỗi thêm SP'));

        lastFsId = fsId;
        results.push({ label, ok: true, fsId });
      } catch (e) {
        results.push({ label, ok: false, error: e.message });
      }
      await new Promise(r => setTimeout(r, 350)); // giãn nhịp tránh rate-limit
    }

    setSubmitProgress(null);
    setSubmitResults(results);
    setCreatedFsId(lastFsId);
    const okCount = results.filter(r => r.ok).length;
    if (okCount === 0) {
      setError(`Tạo thất bại cả ${results.length} khung giờ. ${results[0]?.error || ''}`);
    } else {
      setSuccess(`Đã tạo ${okCount}/${results.length} Flash Sale`);
      setStep(5);
    }
    setLoading(false);
  };

  // ── Delete Flash Sale ──────────────────────────────────────────────────
  const deleteFlashSale = async (fsId) => {
    if (!confirm('Bạn có chắc chắn muốn xóa Flash Sale này?')) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiCall('delete', {}, { flash_sale_id: fsId });
      if (res.ok) {
        setSuccess('Đã xóa Flash Sale');
        await loadFlashSales();
      } else {
        setError(res.error || 'Lỗi xóa Flash Sale');
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  // ── Back to list ───────────────────────────────────────────────────────
  const backToList = () => {
    setStep(0);
    setError('');
    setSuccess('');
    loadFlashSales();
  };

  // ════════════ NHẬP FLASH SALE TỪ EXCEL (tự tick SP + điền giá) ════════════
  const [impBusy, setImpBusy] = useState(false);
  const [impMsg, setImpMsg]   = useState(null);   // { ok, text }
  const [impRows, setImpRows] = useState(null);   // dòng vừa nhập (để "Lưu mẫu")
  const [savedTpls, setSavedTpls] = useState([]); // mẫu đã lưu (theo shop)
  const [expProg, setExpProg] = useState(null);   // { done, total, phase }

  const loadSavedTemplates = useCallback(async () => {
    try {
      const { data } = await supabase.from('flash_sale_templates')
        .select('id,name,created_at').eq('shop_id', String(selectedShopId))
        .order('created_at', { ascending: false }).limit(50);
      setSavedTpls(data || []);
    } catch { /* bảng chưa tạo / lỗi mạng — bỏ qua */ }
  }, [selectedShopId]);
  useEffect(() => { loadSavedTemplates(); }, [loadSavedTemplates]);

  // Khớp các dòng (item_id + model_id) → tự tick SP + điền giá → nhảy tới bước cấu hình.
  const importFromRows = async (rows, srcName) => {
    setImpBusy(true); setImpMsg(null); setError('');
    try {
      const byItem = new Map();
      for (const r of rows) { if (!byItem.has(r.item_id)) byItem.set(r.item_id, []); byItem.get(r.item_id).push(r); }
      const ids = [...byItem.keys()];
      const newSelected = [], newConfigs = {}, missing = [];
      let done = 0;
      await runChunked(ids, 5, async (itemId) => {
        const itemRows = byItem.get(itemId);
        const models = await loadModels(itemId);
        const modelById = new Map(models.map(m => [String(m.model_id), m]));
        const cfg = {};
        for (const r of itemRows) {
          const mid = String(r.model_id ?? '0');
          const m = modelById.get(mid);
          if (!m && models.length > 0) { missing.push(`${itemId}/${mid}`); continue; }
          const orig = Number(m?.price_info?.[0]?.original_price || m?.original_price || r.original_price || 0);
          cfg[mid] = {
            enabled: true, price: Number(r.price), stock: Number(r.stock) || 100,
            original_price: orig,
            model_name: m?.model_name || m?.name || r.model_name || (mid === '0' ? 'Mặc định' : `Model ${mid}`),
            model_sku: m?.model_sku || '',
          };
        }
        if (Object.keys(cfg).length) {
          newSelected.push({ item_id: itemId, item_name: itemRows[0].item_name || `SP ${itemId}`, models });
          newConfigs[itemId] = cfg;
        } else { missing.push(`SP ${itemId}`); }
        done++; setExpProg({ done, total: ids.length, phase: 'Đang khớp sản phẩm…' });
      });
      setExpProg(null);
      if (!newSelected.length) { setError('Không khớp được sản phẩm nào. Kiểm tra cột ID sản phẩm / ID phân loại trong file.'); return; }
      setSelectedProducts(newSelected);
      setProductConfigs(newConfigs);
      setImpRows(rows);
      const skuCount = Object.values(newConfigs).reduce((a, c) => a + Object.keys(c).length, 0);
      setImpMsg({ ok: true, text: `✅ Đã nhập ${newSelected.length} SP · ${skuCount} phân loại từ ${srcName}.${missing.length ? ` ⚠️ ${missing.length} dòng không khớp.` : ''}` });
      setStep(3);
    } catch (e) {
      setError('Lỗi nhập file: ' + e.message);
    } finally { setImpBusy(false); }
  };

  const handleExcelFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImpBusy(true); setImpMsg(null); setError('');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = parseSheetRows(ws);
      if (!rows.length) { setError('File trống hoặc thiếu cột "Giá Flash Sale". Tải file mẫu để đối chiếu.'); setImpBusy(false); return; }
      await importFromRows(rows, file.name);
    } catch (err) { setError('Không đọc được file: ' + err.message); setImpBusy(false); }
  };

  // Xuất file mẫu = toàn bộ SP + phân loại của shop (ID + giá gốc), 2 cột giá/SL để trống.
  const exportTemplate = async () => {
    setImpBusy(true); setImpMsg(null); setError(''); setExpProg({ done: 0, total: 0, phase: 'Đang tải sản phẩm…' });
    try {
      const all = []; let page = 0;
      while (page <= 40) {
        const res = await apiCall('products', { offset: page * 50, page_size: 50 });
        const items = res.data?.items || res.data || [];
        all.push(...items);
        setExpProg({ done: all.length, total: all.length, phase: `Đang tải sản phẩm… (${all.length})` });
        if (items.length < 50) break;
        page++;
      }
      if (!all.length) { setError('Shop chưa có sản phẩm để xuất.'); return; }
      const rows = []; let done = 0;
      await runChunked(all, 6, async (p) => {
        const models = await loadModels(p.item_id);
        const iName = p.item_name || p.name || `SP ${p.item_id}`;
        if (models.length) {
          for (const m of models) rows.push({
            'ID sản phẩm': String(p.item_id), 'ID phân loại': String(m.model_id),
            'Tên sản phẩm': iName, 'Tên phân loại': m.model_name || m.name || '',
            'Giá gốc': Number(m.price_info?.[0]?.original_price || m.original_price || 0),
            'Giá Flash Sale': '', 'Số lượng KM': '',
          });
        } else rows.push({
          'ID sản phẩm': String(p.item_id), 'ID phân loại': '0',
          'Tên sản phẩm': iName, 'Tên phân loại': '(không phân loại)',
          'Giá gốc': Number(p.price_info?.[0]?.original_price || p.original_price || 0),
          'Giá Flash Sale': '', 'Số lượng KM': '',
        });
        done++; setExpProg({ done, total: all.length, phase: `Đang lấy phân loại… (${done}/${all.length})` });
      });
      const HEAD = ['ID sản phẩm', 'ID phân loại', 'Tên sản phẩm', 'Tên phân loại', 'Giá gốc', 'Giá Flash Sale', 'Số lượng KM'];
      const ws = XLSX.utils.json_to_sheet(rows, { header: HEAD });
      ws['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 42 }, { wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'FlashSale');
      const guide = XLSX.utils.aoa_to_sheet([
        ['HƯỚNG DẪN NHẬP FLASH SALE'], [''],
        ['1. KHÔNG sửa 2 cột "ID sản phẩm" và "ID phân loại" — đây là mã khớp với Shopee.'],
        ['2. Điền "Giá Flash Sale" (PHẢI thấp hơn Giá gốc) và "Số lượng KM" cho dòng muốn chạy.'],
        ['3. Dòng để TRỐNG cột "Giá Flash Sale" sẽ được bỏ qua (không tạo FS).'],
        ['4. Lưu file → bấm "Nhập file Excel" trên web → hệ thống tự tick SP + điền giá.'],
        ['5. Có thể bấm "Lưu mẫu này" để lần sau chọn lại, khỏi upload.'],
      ]);
      guide['!cols'] = [{ wch: 92 }];
      XLSX.utils.book_append_sheet(wb, guide, 'Hướng dẫn');
      XLSX.writeFile(wb, `FlashSale_Mau_${String(selectedShopId)}.xlsx`);
      setImpMsg({ ok: true, text: `✅ Đã tải file mẫu (${rows.length} phân loại). Điền Giá FS + Số lượng rồi upload lại.` });
    } catch (e) {
      setError('Lỗi xuất file mẫu: ' + e.message);
    } finally { setExpProg(null); setImpBusy(false); }
  };

  const saveCurrentTemplate = async () => {
    if (!impRows?.length) { setError('Chưa có dữ liệu file để lưu — nhập file Excel trước.'); return; }
    const name = prompt('Đặt tên cho mẫu giá này:', `Mẫu ${new Date().toLocaleDateString('vi-VN')}`);
    if (!name) return;
    setImpBusy(true);
    try {
      const { error: dbErr } = await supabase.from('flash_sale_templates')
        .insert({ name: name.trim(), shop_id: String(selectedShopId), rows: impRows });
      if (dbErr) throw dbErr;
      setImpMsg({ ok: true, text: `💾 Đã lưu mẫu "${name.trim()}".` });
      await loadSavedTemplates();
    } catch (e) { setError('Lỗi lưu mẫu: ' + e.message); }
    finally { setImpBusy(false); }
  };

  const applySavedTemplate = async (id) => {
    if (!id) return;
    setImpBusy(true); setError('');
    try {
      const { data, error: dbErr } = await supabase.from('flash_sale_templates').select('rows,name').eq('id', id).maybeSingle();
      if (dbErr) throw dbErr;
      const rows = data?.rows || [];
      if (!rows.length) { setError('Mẫu rỗng.'); setImpBusy(false); return; }
      await importFromRows(rows, `mẫu "${data.name}"`);
    } catch (e) { setError('Lỗi áp mẫu: ' + e.message); setImpBusy(false); }
  };

  // ══════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 42, height: 42, borderRadius: 12, background: '#fff7ed', border: '1px solid #fed7aa',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
            }}>⚡</span>
            Flash Sale Automation
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            Tạo và quản lý Flash Sale tự động
            <span style={{ margin: '0 0 0 12px', fontSize: '0.7rem', color: '#c4b5a0', fontStyle: 'italic' }}>
              Built by Quốc Khánh
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {step === 0 && (
            <button style={BTN_PRIMARY} onClick={startCreateWizard}>
              + Tạo Flash Sale
            </button>
          )}
          {step > 0 && step < 5 && (
            <button style={BTN_SECONDARY} onClick={backToList}>
              ← Quay lại
            </button>
          )}
        </div>
      </div>

      {/* Shop Selector */}
      {step === 0 && shops.length > 1 && (
        <div style={{ ...CARD, marginBottom: 16, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>🏪 Shop:</span>
          {shops.map(shop => {
            const active = String(selectedShopId) === String(shop.shop_id);
            return (
              <button
                key={shop.shop_id}
                onClick={() => changeShop(shop.shop_id)}
                disabled={loading}
                style={{
                  padding: '6px 16px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700,
                  border: '1.5px solid', cursor: loading ? 'default' : 'pointer', transition: 'all 0.2s',
                  ...(active
                    ? { borderColor: '#ff6a2c', background: '#fff7ed', color: '#ff6a2c' }
                    : { borderColor: '#e5e7eb', background: '#fff', color: '#64748b' }),
                }}
              >
                🏪 {shop.shop_name}
              </button>
            );
          })}
        </div>
      )}

      {/* Stepper */}
      {step > 0 && step < 5 && (
        <div style={{ ...CARD, marginBottom: 20, padding: '16px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {['Chọn khung giờ', 'Chọn sản phẩm', 'Cấu hình giá', 'Xác nhận'].map((label, i) => {
              const stepNum = i + 1;
              const isActive = step === stepNum;
              const isDone = step > stepNum;
              return (
                <React.Fragment key={i}>
                  {i > 0 && <div style={{ flex: 1, height: 2, background: isDone ? '#ff6a2c' : '#e5e7eb', margin: '0 8px' }} />}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.8rem', fontWeight: 800,
                      background: isDone ? '#ff6a2c' : isActive ? '#fff7ed' : '#f1f5f9',
                      color: isDone ? '#fff' : isActive ? '#ff6a2c' : '#94a3b8',
                      border: isActive ? '2px solid #ff6a2c' : '2px solid transparent',
                    }}>
                      {isDone ? '✓' : stepNum}
                    </div>
                    <span style={{
                      fontSize: '0.78rem', fontWeight: isActive ? 800 : 600,
                      color: isActive ? '#ff6a2c' : isDone ? '#16a34a' : '#94a3b8',
                    }}>{label}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Error / Success */}
      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12,
          padding: '12px 16px', marginBottom: 16, color: '#dc2626', fontSize: '0.82rem', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>⚠️</span> {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#dc2626' }}>×</button>
        </div>
      )}
      {success && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12,
          padding: '12px 16px', marginBottom: 16, color: '#15803d', fontSize: '0.82rem', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>✅</span> {success}
          <button onClick={() => setSuccess('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#15803d' }}>×</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{
          textAlign: 'center', padding: '40px 20px', color: '#ff6a2c',
          fontSize: '0.9rem', fontWeight: 700,
        }}>
          <div style={{
            width: 40, height: 40, border: '3px solid #fed7aa', borderTopColor: '#ff6a2c',
            borderRadius: '50%', margin: '0 auto 12px',
            animation: 'fsSpin 0.8s linear infinite',
          }} />
          {submitProgress
            ? `Đang tạo Flash Sale ${submitProgress.done + 1}/${submitProgress.total}...`
            : 'Đang tải...'}
          <style>{`@keyframes fsSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ═══ STEP 0: Flash Sale List ═══ */}
      {step === 0 && !loading && (
        <FlashSaleList
          flashSales={flashSales}
          onDelete={deleteFlashSale}
          onRefresh={loadFlashSales}
        />
      )}

      {/* ═══ STEP 1: Select Time Slot (multi-select) ═══ */}
      {step === 1 && !loading && (
        <TimeSlotPicker
          slots={timeSlots}
          selectedSlots={selectedSlots}
          onToggle={toggleSlot}
          onToggleGroup={toggleSlotGroup}
          onContinue={goToProducts}
        />
      )}

      {/* ═══ STEP 2: Select Products ═══ */}
      {step === 2 && !loading && (
        <>
          {/* ── Nhập nhanh từ Excel ── */}
          <div style={{ ...CARD, marginBottom: 16, padding: '16px 20px', border: '1px solid #fed7aa', background: '#fffdfa' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: '1.05rem' }}>📥</span>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>Nhập nhanh từ Excel</h3>
              <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>— khỏi tick + nhập giá tay</span>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>
              ① Tải <b>file mẫu</b> (đã có sẵn ID + giá gốc của shop) → ② điền <b>Giá Flash Sale</b> + <b>Số lượng</b> → ③ <b>upload lại</b>.
              Hệ thống tự tick SP &amp; điền giá rồi nhảy tới bước duyệt.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <button style={{ ...BTN_SECONDARY, opacity: impBusy ? 0.6 : 1 }} disabled={impBusy} onClick={exportTemplate}>⬇️ Tải file mẫu (SP shop này)</button>
              <label style={{ ...BTN_PRIMARY, opacity: impBusy ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: impBusy ? 'default' : 'pointer' }}>
                📤 Nhập file Excel
                <input type="file" accept=".xlsx,.xls" disabled={impBusy} onChange={handleExcelFile} style={{ display: 'none' }} />
              </label>
              {savedTpls.length > 0 && (
                <select disabled={impBusy} defaultValue="" onChange={e => applySavedTemplate(e.target.value)}
                  style={{ ...INPUT, width: 'auto', minWidth: 190, padding: '9px 12px' }}>
                  <option value="">📁 Chọn mẫu đã lưu…</option>
                  {savedTpls.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              {impRows?.length > 0 && (
                <button style={{ ...BTN_SECONDARY, opacity: impBusy ? 0.6 : 1 }} disabled={impBusy} onClick={saveCurrentTemplate}>💾 Lưu mẫu này</button>
              )}
            </div>
            {expProg && (
              <div style={{ marginTop: 10, fontSize: '0.78rem', color: '#ff6a2c', fontWeight: 700 }}>
                ⏳ {expProg.phase || 'Đang xử lý…'} {expProg.total ? `(${expProg.done}/${expProg.total})` : ''}
              </div>
            )}
            {impMsg && (
              <div style={{ marginTop: 10, fontSize: '0.8rem', fontWeight: 600, color: impMsg.ok ? '#15803d' : '#dc2626', background: impMsg.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${impMsg.ok ? '#bbf7d0' : '#fecaca'}`, borderRadius: 8, padding: '8px 12px' }}>
                {impMsg.text}
              </div>
            )}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #e5e7eb', fontSize: '0.76rem', color: '#94a3b8' }}>
              Hoặc chọn thủ công bên dưới ↓
            </div>
          </div>
          <ProductSelector
            products={products}
            selectedProducts={selectedProducts}
            onToggle={toggleProduct}
            onLoadMore={() => loadProducts(productPage + 1, true)}
            hasMore={hasMoreProducts}
            onNext={goToConfig}
            loading={loading}
          />
        </>
      )}

      {/* ═══ STEP 3: Configure Prices ═══ */}
      {step === 3 && !loading && (
        <PriceConfigurator
          selectedProducts={selectedProducts}
          configs={productConfigs}
          onUpdateConfig={setProductConfigs}
          onNext={goToReview}
          onBack={() => setStep(2)}
        />
      )}

      {/* ═══ STEP 4: Review & Submit ═══ */}
      {step === 4 && !loading && (
        <ReviewStep
          slots={selectedSlots}
          selectedProducts={selectedProducts}
          configs={productConfigs}
          onSubmit={submitFlashSale}
          onBack={() => setStep(3)}
        />
      )}

      {/* ═══ STEP 5: Success (kết quả tạo hàng loạt) ═══ */}
      {step === 5 && (
        <div style={{ ...CARD, padding: '40px' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
            <h2 style={{ margin: '0 0 6px', fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>
              Đã tạo {submitResults.filter(r => r.ok).length}/{submitResults.length} Flash Sale
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
              {selectedProducts.length} sản phẩm · cùng cấu hình giá cho mọi khung giờ
            </p>
          </div>

          <div style={{ maxWidth: 560, margin: '0 auto 24px', display: 'grid', gap: 8 }}>
            {submitResults.map((r, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                borderRadius: 10, fontSize: '0.84rem',
                background: r.ok ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${r.ok ? '#bbf7d0' : '#fecaca'}`,
              }}>
                <span>{r.ok ? '✅' : '❌'}</span>
                <strong style={{ color: '#0f172a' }}>{r.label}</strong>
                <span style={{ marginLeft: 'auto', color: r.ok ? '#15803d' : '#dc2626', fontSize: '0.78rem' }}>
                  {r.ok ? `FS #${r.fsId}` : r.error}
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button style={BTN_PRIMARY} onClick={backToList}>Quay lại danh sách</button>
            <button style={BTN_SECONDARY} onClick={startCreateWizard}>Tạo Flash Sale mới</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

// ── Flash Sale List ──────────────────────────────────────────────────────────
function FlashSaleList({ flashSales, onDelete, onRefresh }) {
  if (!flashSales || flashSales.length === 0) {
    return (
      <div style={{ ...CARD, textAlign: 'center', padding: '60px 40px' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>⚡</div>
        <h3 style={{ margin: '0 0 6px', color: '#0f172a', fontWeight: 800 }}>Chưa có Flash Sale nào</h3>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
          Bấm "Tạo Flash Sale" để bắt đầu tạo chương trình mới
        </p>
      </div>
    );
  }

  return (
    <div style={{ ...CARD }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
          Danh sách Flash Sale ({flashSales.length})
        </h3>
        <button onClick={onRefresh} style={{ ...BTN_SECONDARY, padding: '6px 14px', fontSize: '0.78rem' }}>
          🔄 Làm mới
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {flashSales.map((fs, i) => (
          <div key={fs.flash_sale_id || i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', borderRadius: 12, border: '1px solid #e5e7eb',
            background: '#fafafa', transition: 'border-color 0.2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: '#fff7ed', border: '1px solid #fed7aa',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
              }}>⚡</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>
                  {fmtDateTime(fs.start_time)} — {fmtTime(fs.end_time)}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={BADGE(
                    fs.type === 2 ? '#16a34a' : fs.type === 1 ? '#d97706' : '#64748b',
                    fs.type === 2 ? '#f0fdf4' : fs.type === 1 ? '#fffbeb' : '#f8fafc',
                  )}>
                    {fs.type === 2 ? '🟢 Đang diễn ra' : fs.type === 1 ? '🟡 Sắp diễn ra' : '⚪ Đã kết thúc'}
                  </span>
                  {(fs.item_count > 0 || fs.enabled_item_count > 0) && (
                    <span style={BADGE('#475569', '#f1f5f9')}>
                      📦 {fs.enabled_item_count || 0}/{fs.item_count || 0} SP
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onDelete(fs.flash_sale_id)} style={{ ...BTN_DANGER, padding: '6px 14px', fontSize: '0.76rem' }}>
                🗑️ Xóa
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Time Slot Picker ─────────────────────────────────────────────────────────
function TimeSlotPicker({ slots, selectedSlots, onToggle, onToggleGroup, onContinue }) {
  const selKeys = useMemo(() => new Set((selectedSlots || []).map(slotKey)), [selectedSlots]);

  const grouped = useMemo(() => {
    const map = {};
    (slots || []).forEach(slot => {
      const date = fmtDate(slot.start_time);
      if (!map[date]) map[date] = [];
      map[date].push(slot);
    });
    return Object.entries(map).sort((a, b) => {
      const da = slots.find(s => fmtDate(s.start_time) === a[0]);
      const db = slots.find(s => fmtDate(s.start_time) === b[0]);
      return (da?.start_time || 0) - (db?.start_time || 0);
    });
  }, [slots]);

  if (!slots || slots.length === 0) {
    return (
      <div style={{ ...CARD, textAlign: 'center', padding: '60px 40px' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📅</div>
        <h3 style={{ margin: '0 0 6px', color: '#0f172a', fontWeight: 800 }}>Không tìm thấy khung giờ nào</h3>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
          Hiện tại không có khung giờ Flash Sale khả dụng
        </p>
      </div>
    );
  }

  const count = selKeys.size;

  return (
    <div style={{ ...CARD }}>
      <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
        📅 Chọn khung giờ Flash Sale
      </h3>
      <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: '#64748b' }}>
        Bấm chọn <strong>nhiều khung giờ</strong> (hoặc “Chọn cả ngày”) — sẽ tạo Flash Sale cho từng khung với cùng sản phẩm &amp; giá.
      </p>

      {grouped.map(([date, dateSlots]) => {
        const allIn = dateSlots.every(s => selKeys.has(slotKey(s)));
        return (
          <div key={date} style={{ marginBottom: 20 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              fontSize: '0.82rem', fontWeight: 800, color: '#475569',
              padding: '6px 8px 6px 12px', background: '#f8fafc', borderRadius: 8,
              marginBottom: 10, border: '1px solid #e5e7eb',
            }}>
              <span>📅 {date}</span>
              <button onClick={() => onToggleGroup(dateSlots)}
                style={{
                  padding: '4px 12px', borderRadius: 14, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                  border: '1.5px solid', ...(allIn
                    ? { borderColor: '#ff6a2c', background: '#fff7ed', color: '#e85518' }
                    : { borderColor: '#e5e7eb', background: '#fff', color: '#64748b' }),
                }}>
                {allIn ? '✓ Bỏ chọn cả ngày' : '+ Chọn cả ngày'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {dateSlots.map(slot => {
                const on = selKeys.has(slotKey(slot));
                return (
                  <div
                    key={slotKey(slot)}
                    onClick={() => onToggle(slot)}
                    style={{
                      padding: '16px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s',
                      textAlign: 'center', position: 'relative',
                      border: `2px solid ${on ? '#ff6a2c' : '#e5e7eb'}`,
                      background: on ? '#fff7ed' : '#fff',
                    }}
                  >
                    {on && <span style={{ position: 'absolute', top: 8, right: 10, color: '#ff6a2c', fontWeight: 900 }}>✓</span>}
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: on ? '#e85518' : '#0f172a' }}>
                      {fmtTime(slot.start_time)} — {fmtTime(slot.end_time)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: on ? '#ff6a2c' : '#94a3b8', marginTop: 4 }}>
                      {on ? 'Đã chọn' : 'Bấm để chọn'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Sticky action bar: số khung đã chọn + tiếp tục */}
      <div style={{
        position: 'sticky', bottom: 12, marginTop: 18,
        background: '#fff', border: '1px solid #fed7aa', borderRadius: 12,
        padding: '12px 18px', boxShadow: '0 6px 18px rgba(15,23,42,0.10)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: count ? '#0f172a' : '#94a3b8' }}>
          Đã chọn <strong style={{ color: '#ff6a2c' }}>{count}</strong> khung giờ
        </span>
        <button
          onClick={onContinue}
          disabled={count === 0}
          style={{ ...BTN_PRIMARY, ...(count === 0 ? { background: '#d1d5db', boxShadow: 'none', cursor: 'default' } : {}) }}
        >
          Tiếp tục → Chọn sản phẩm
        </button>
      </div>
    </div>
  );
}

// ── Product Selector ─────────────────────────────────────────────────────────
function ProductSelector({ products, selectedProducts, onToggle, onLoadMore, hasMore, onNext, loading }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(p =>
      (p.item_name || '').toLowerCase().includes(q) ||
      String(p.item_id).includes(q)
    );
  }, [products, search]);

  const isSelected = (itemId) => selectedProducts.some(p => p.item_id === itemId);

  return (
    <div style={{ ...CARD }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
            🛍️ Chọn sản phẩm ({selectedProducts.length} đã chọn)
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
            Chọn các sản phẩm muốn thêm vào Flash Sale
          </p>
        </div>
        <button
          style={{ ...BTN_PRIMARY, opacity: selectedProducts.length === 0 ? 0.5 : 1 }}
          onClick={onNext}
          disabled={selectedProducts.length === 0}
        >
          Tiếp theo →
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Tìm kiếm sản phẩm..."
          style={{ ...INPUT, maxWidth: 400 }}
        />
      </div>

      {/* Product Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {filtered.map(product => {
          const selected = isSelected(product.item_id);
          return (
            <div
              key={product.item_id}
              onClick={() => onToggle(product)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                border: selected ? '2px solid #ff6a2c' : '2px solid #e5e7eb',
                background: selected ? '#fff7ed' : '#fff',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = '#fed7aa'; }}
              onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = '#e5e7eb'; }}
            >
              {/* Checkbox */}
              <div style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                border: selected ? '2px solid #ff6a2c' : '2px solid #d1d5db',
                background: selected ? '#ff6a2c' : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: '0.7rem', fontWeight: 900,
              }}>
                {selected && '✓'}
              </div>

              {/* Image */}
              <div style={{
                width: 48, height: 48, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
                background: '#f1f5f9', border: '1px solid #e5e7eb',
              }}>
                {product.image?.image_url_list?.[0] && (
                  <img src={product.image.image_url_list[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '0.8rem', fontWeight: 700, color: '#0f172a',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {product.item_name || `Item ${product.item_id}`}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    ID: {product.item_id}
                  </span>
                  {product.price_info?.[0]?.original_price && (
                    <span style={{ fontSize: '0.72rem', color: '#ff6a2c', fontWeight: 600 }}>
                      {fmtVnd(product.price_info[0].original_price)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Load More */}
      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={onLoadMore} style={{ ...BTN_SECONDARY, fontSize: '0.82rem' }} disabled={loading}>
            {loading ? 'Đang tải...' : 'Tải thêm sản phẩm'}
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
          Không tìm thấy sản phẩm nào
        </div>
      )}
    </div>
  );
}

// ── Price Configurator ───────────────────────────────────────────────────────
function PriceConfigurator({ selectedProducts, configs, onUpdateConfig, onNext, onBack }) {
  const [bulkDiscount, setBulkDiscount] = useState(10);
  const [bulkStock, setBulkStock] = useState(100);

  const updateField = (itemId, modelId, field, value) => {
    onUpdateConfig(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [modelId]: {
          ...prev[itemId]?.[modelId],
          [field]: value,
        },
      },
    }));
  };

  const applyBulkDiscount = () => {
    onUpdateConfig(prev => {
      const next = { ...prev };
      for (const itemId of Object.keys(next)) {
        for (const modelId of Object.keys(next[itemId])) {
          const orig = next[itemId][modelId].original_price;
          next[itemId] = {
            ...next[itemId],
            [modelId]: {
              ...next[itemId][modelId],
              price: Math.floor(orig * (1 - bulkDiscount / 100)),
              stock: bulkStock,
            },
          };
        }
      }
      return next;
    });
  };

  return (
    <div style={{ ...CARD }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
            💰 Cấu hình giá Flash Sale
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
            Thiết lập giá khuyến mãi và số lượng cho từng variant
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={BTN_SECONDARY} onClick={onBack}>← Quay lại</button>
          <button style={BTN_PRIMARY} onClick={onNext}>Tiếp theo →</button>
        </div>
      </div>

      {/* Bulk Actions */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px',
        background: '#f8fafc', borderRadius: 12, border: '1px solid #e5e7eb', marginBottom: 20,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>Áp dụng hàng loạt:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Giảm</span>
          <input
            type="number"
            value={bulkDiscount}
            onChange={e => setBulkDiscount(Number(e.target.value))}
            style={{ ...INPUT, width: 70, textAlign: 'center' }}
            min={5} max={90}
          />
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>SL:</span>
          <input
            type="number"
            value={bulkStock}
            onChange={e => setBulkStock(Number(e.target.value))}
            style={{ ...INPUT, width: 80, textAlign: 'center' }}
            min={1} max={1000}
          />
        </div>
        <button onClick={applyBulkDiscount} style={{ ...BTN_PRIMARY, padding: '6px 16px', fontSize: '0.78rem' }}>
          Áp dụng
        </button>
      </div>

      {/* Product configs */}
      {selectedProducts.map(product => {
        const config = configs[product.item_id] || {};
        return (
          <div key={product.item_id} style={{
            border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: 14, overflow: 'hidden',
          }}>
            {/* Product header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
                background: '#e5e7eb',
              }}>
                {product.image?.image_url_list?.[0] && (
                  <img src={product.image.image_url_list[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>
                  {product.item_name || `Item ${product.item_id}`}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>ID: {product.item_id}</div>
              </div>
            </div>

            {/* Variants table */}
            <div style={{ padding: '12px 16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ textAlign: 'left', padding: '8px 4px', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Variant</th>
                    <th style={{ textAlign: 'right', padding: '8px 4px', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Giá gốc</th>
                    <th style={{ textAlign: 'center', padding: '8px 4px', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Giá FS</th>
                    <th style={{ textAlign: 'center', padding: '8px 4px', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>% Giảm</th>
                    <th style={{ textAlign: 'center', padding: '8px 4px', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Số lượng</th>
                    <th style={{ textAlign: 'center', padding: '8px 4px', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Bật/Tắt</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(config).map(([modelId, c]) => {
                    const discountPct = c.original_price > 0
                      ? Math.round((1 - c.price / c.original_price) * 100)
                      : 0;
                    return (
                      <tr key={modelId} style={{ borderBottom: '1px solid #f1f5f9', opacity: c.enabled ? 1 : 0.4 }}>
                        <td style={{ padding: '8px 4px', fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.model_name}
                          {c.model_sku && <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>SKU: {c.model_sku}</div>}
                        </td>
                        <td style={{ padding: '8px 4px', textAlign: 'right', color: '#64748b' }}>
                          {fmtVnd(c.original_price)}
                        </td>
                        <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                          <input
                            type="number"
                            value={c.price}
                            onChange={e => updateField(product.item_id, modelId, 'price', Number(e.target.value))}
                            style={{ ...INPUT, width: 110, textAlign: 'right', borderColor: c.price >= c.original_price ? '#ef4444' : '#e5e7eb' }}
                            disabled={!c.enabled}
                          />
                        </td>
                        <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                          <span style={BADGE(
                            discountPct >= 5 ? '#16a34a' : '#dc2626',
                            discountPct >= 5 ? '#f0fdf4' : '#fef2f2',
                          )}>
                            {discountPct}%
                          </span>
                        </td>
                        <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                          <input
                            type="number"
                            value={c.stock}
                            onChange={e => updateField(product.item_id, modelId, 'stock', Number(e.target.value))}
                            style={{ ...INPUT, width: 80, textAlign: 'center' }}
                            min={1} max={1000}
                            disabled={!c.enabled}
                          />
                        </td>
                        <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                          <div
                            onClick={() => updateField(product.item_id, modelId, 'enabled', !c.enabled)}
                            style={{
                              width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
                              background: c.enabled ? '#ff6a2c' : '#d1d5db', position: 'relative',
                              transition: 'background 0.2s',
                            }}
                          >
                            <div style={{
                              width: 18, height: 18, borderRadius: '50%', background: '#fff',
                              position: 'absolute', top: 2,
                              left: c.enabled ? 20 : 2,
                              transition: 'left 0.2s',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                            }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Review Step ───────────────────────────────────────────────────────────────
function ReviewStep({ slots, selectedProducts, configs, onSubmit, onBack }) {
  const totalItems = useMemo(() => {
    let count = 0;
    for (const prod of selectedProducts) {
      const config = configs[prod.item_id] || {};
      count += Object.values(config).filter(c => c.enabled).length;
    }
    return count;
  }, [selectedProducts, configs]);

  return (
    <div style={{ ...CARD }}>
      <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
        📋 Xác nhận tạo Flash Sale
      </h3>
      <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: '#64748b' }}>
        Kiểm tra thông tin trước khi tạo Flash Sale
      </p>

      {/* Summary Card */}
      <div style={{
        background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12,
        padding: '18px 22px', marginBottom: 20,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#cc4a16', textTransform: 'uppercase', marginBottom: 4 }}>
              Số khung giờ
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#ff6a2c' }}>
              {(slots || []).length} khung
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>mỗi khung 1 Flash Sale</div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#cc4a16', textTransform: 'uppercase', marginBottom: 4 }}>
              Số sản phẩm
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>
              {selectedProducts.length} sản phẩm
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{totalItems} variants</div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#cc4a16', textTransform: 'uppercase', marginBottom: 4 }}>
              Tổng FS sẽ tạo
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>
              {(slots || []).length}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>cùng SP &amp; giá</div>
          </div>
        </div>
        {/* Danh sách khung giờ đã chọn */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(slots || []).map(s => (
            <span key={slotKey(s)} style={{
              fontSize: '0.74rem', fontWeight: 700, color: '#cc4a16',
              background: '#fff', border: '1px solid #fed7aa', borderRadius: 14, padding: '3px 10px',
            }}>
              {fmtTime(s.start_time)}–{fmtTime(s.end_time)} · {fmtDate(s.start_time)}
            </span>
          ))}
        </div>
      </div>

      {/* Product Details */}
      {selectedProducts.map(product => {
        const config = configs[product.item_id] || {};
        const enabledModels = Object.entries(config).filter(([, c]) => c.enabled);
        return (
          <div key={product.item_id} style={{
            border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px', marginBottom: 10,
          }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', marginBottom: 8 }}>
              {product.item_name}
            </div>
            {enabledModels.map(([modelId, c]) => {
              const disc = c.original_price > 0 ? Math.round((1 - c.price / c.original_price) * 100) : 0;
              return (
                <div key={modelId} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.8rem',
                }}>
                  <span style={{ color: '#475569', fontWeight: 600 }}>{c.model_name}</span>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <span style={{ color: '#94a3b8', textDecoration: 'line-through' }}>{fmtVnd(c.original_price)}</span>
                    <span style={{ color: '#ff6a2c', fontWeight: 700 }}>{fmtVnd(c.price)}</span>
                    <span style={BADGE('#16a34a', '#f0fdf4')}>-{disc}%</span>
                    <span style={{ color: '#64748b' }}>x{c.stock}</span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
        <button style={BTN_SECONDARY} onClick={onBack}>← Quay lại</button>
        <button
          style={{ ...BTN_PRIMARY, padding: '12px 32px', fontSize: '0.92rem' }}
          onClick={onSubmit}
        >
          ⚡ Tạo {(slots || []).length} Flash Sale
        </button>
      </div>
    </div>
  );
}
