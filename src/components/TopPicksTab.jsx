// src/components/TopPicksTab.jsx — Đẩy Sản Phẩm (Boost + Top Picks)
// Built by Quốc Khánh
import React, { useState, useEffect, useCallback, useMemo, useRef, Component } from 'react';

const API_BASE = '/api/shopee/top-picks';
const PRODUCT_API_BASE = '/api/shopee/flash-sale';
const DEFAULT_SHOP_ID = '341325550';

// ── Helpers ──────────────────────────────────────────────────────────────────
/** Safely extract an array from API response — prevents crash when data is a non-array object */
const safeArray = (...candidates) => {
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
};

const fmtVnd = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '0';
  return n.toLocaleString('vi-VN') + ' ₫';
};

const fmtTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
};

/** Format an ISO / Date string for the log (Vietnam locale) */
const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
};

/** Format a millisecond duration as HH:MM:SS (clamped at 0) */
const fmtCountdown = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

// ── Active shop ────────────────────────────────────────────────────────────
// Mutable module-level value so the stateless API callers below always target the
// shop the user currently has selected. TopPicksTab updates it on every shop switch.
let ACTIVE_SHOP_ID = DEFAULT_SHOP_ID;
function setActiveShopId(id) { ACTIVE_SHOP_ID = id ? String(id) : DEFAULT_SHOP_ID; }

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

async function loadProductsApi(offset = 0, pageSize = 50) {
  const qs = new URLSearchParams({
    action: 'products',
    shop_id: ACTIVE_SHOP_ID,
    offset: String(offset),
    page_size: String(pageSize),
  });
  const url = `${PRODUCT_API_BASE}?${qs}`;
  const res = await fetch(url, { method: 'GET' });
  return res.json();
}

// ── Styles ───────────────────────────────────────────────────────────────────
const CARD = {
  background: '#fff', borderRadius: 16, padding: '24px',
  boxShadow: '0 1px 4px rgba(15,23,42,0.06)', border: '1px solid #f1f5f9',
};
const BTN_PRIMARY = {
  padding: '10px 24px', borderRadius: 10, border: 'none',
  background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: '0.88rem',
  cursor: 'pointer', boxShadow: '0 4px 12px rgba(234,88,12,0.2)',
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
const BADGE = (color = '#ea580c', bg = '#fff7ed') => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
  color, background: bg,
});

// ── Error Boundary — prevents blank page on component crash ─────────────────
class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[TopPicksTab ErrorBoundary]', error, info?.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠️</div>
          <h3 style={{ margin: '0 0 8px', fontWeight: 800, color: '#dc2626' }}>Đã xảy ra lỗi</h3>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 16 }}>
            {this.state.error?.message || 'Không thể hiển thị nội dung'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
          >
            🔄 Thử lại
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function TopPicksTab() {
  // Tab: 'boost' | 'top_picks'
  const [activeTab, setActiveTab] = useState('boost');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ── Multi-shop selector ──
  const [shops, setShops] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState(DEFAULT_SHOP_ID);

  // ── Product list (shared) ──
  const [products, setProducts] = useState([]);
  const [productPage, setProductPage] = useState(0);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // ── Boost state ──
  const [boostedItems, setBoostedItems] = useState([]);
  const [boostSelected, setBoostSelected] = useState([]); // [{item_id, item_name, image}]
  const [boosting, setBoosting] = useState(false);

  // ── Top Picks state ──
  const [collections, setCollections] = useState([]);
  const [tpStep, setTpStep] = useState(0); // 0=list, 1=create/edit
  const [editingCollection, setEditingCollection] = useState(null);
  const [collectionName, setCollectionName] = useState('');
  const [isActivated, setIsActivated] = useState(true);
  const [tpSelected, setTpSelected] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // ── Recurring auto-boost (Đẩy định kỳ) state ──
  const [scheduleData, setScheduleData] = useState(null);   // saved config from server
  const [scheduleEnabled, setScheduleEnabled] = useState(false); // working toggle (until Save)
  const [scheduleItems, setScheduleItems] = useState([]);   // working selection [{item_id,item_name,image_url}]
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [boostLog, setBoostLog] = useState([]);
  const [nowTick, setNowTick] = useState(Date.now());       // drives the live countdown
  const autoTriggerRef = useRef(null);                      // guards against repeat frontend triggers

  // ── Load products ───────────────────────────────────────────────────────
  const loadProducts = useCallback(async (page = 0, append = false) => {
    setLoadingProducts(true);
    try {
      const res = await loadProductsApi(page * 50, 50);
      if (res.ok) {
        const items = safeArray(res.data?.items, res.data);
        if (append) {
          setProducts(prev => [...prev, ...items]);
        } else {
          setProducts(items);
        }
        setHasMoreProducts(items.length >= 50);
        setProductPage(page);
      }
    } catch (e) {
      setError(e.message);
    }
    setLoadingProducts(false);
  }, []);

  // ── Load boosted list ──────────────────────────────────────────────────
  const loadBoostedList = useCallback(async () => {
    try {
      const res = await apiCall('boosted_list');
      if (res.ok) {
        setBoostedItems(safeArray(res.data?.boosted_item_list, res.data?.items, res.data));
      }
    } catch { /* silent */ }
  }, []);

  // ── Load collections ────────────────────────────────────────────────────
  const loadCollections = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiCall('list');
      if (res.ok) {
        setCollections(safeArray(res.data?.collections, res.data?.top_picks_list, res.data));
      } else {
        setError(res.error || 'Lỗi tải danh sách bộ sưu tập');
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  // ── Load recurring-boost schedule ────────────────────────────────────────
  const loadSchedule = useCallback(async () => {
    try {
      const res = await apiCall('schedule_get');
      if (res.ok && res.data) {
        setScheduleData(res.data);
        setScheduleEnabled(!!res.data.enabled);
        const meta = safeArray(res.data.items_meta);
        const ids = safeArray(res.data.item_ids);
        if (meta.length > 0) {
          setScheduleItems(meta.map(m => ({
            item_id: Number(m.item_id),
            item_name: m.item_name || `SP ${m.item_id}`,
            image_url: m.image_url || null,
          })));
        } else {
          setScheduleItems(ids.map(id => ({ item_id: Number(id), item_name: `SP ${id}`, image_url: null })));
        }
      }
    } catch { /* silent */ }
  }, []);

  // ── Load run log ──────────────────────────────────────────────────────────
  const loadBoostLog = useCallback(async () => {
    try {
      const res = await apiCall('boost_log', { limit: 20 });
      if (res.ok) setBoostLog(safeArray(res.data));
    } catch { /* silent */ }
  }, []);

  // Load the list of authorized shops once (independent of the selected shop)
  useEffect(() => {
    (async () => {
      try {
        const res = await apiCall('list_shops');
        if (res.ok) {
          const list = safeArray(res.data);
          setShops(list);
          // If the primary shop isn't among the authorized shops, fall back to the first one
          if (list.length && !list.some(s => String(s.shop_id) === String(DEFAULT_SHOP_ID))) {
            setSelectedShopId(String(list[0].shop_id));
          }
        }
      } catch { /* silent */ }
    })();
  }, []);

  // Load all per-shop data on mount and whenever the selected shop changes
  useEffect(() => {
    setActiveShopId(selectedShopId);
    // Reset working selections so they don't bleed across shops
    setBoostSelected([]);
    setScheduleItems([]);
    setScheduleData(null);
    autoTriggerRef.current = null;
    loadProducts(0);
    loadBoostedList();
    loadCollections();
    loadSchedule();
    loadBoostLog();
  }, [selectedShopId, loadProducts, loadBoostedList, loadCollections, loadSchedule, loadBoostLog]);

  // ── Save schedule config ──────────────────────────────────────────────────
  const saveSchedule = async () => {
    setSavingSchedule(true); setError(''); setSuccess('');
    try {
      const item_ids = scheduleItems.map(p => Number(p.item_id));
      const items_meta = scheduleItems.map(p => ({
        item_id: Number(p.item_id),
        item_name: p.item_name || `SP ${p.item_id}`,
        image_url: p.image_url || p.image?.image_url_list?.[0] || null,
      }));
      const res = await apiCall('schedule_save', {}, {
        enabled: scheduleEnabled, item_ids, items_meta, interval_hours: 4,
      });
      if (res.ok) {
        setSuccess(scheduleEnabled
          ? `Đã lưu lịch đẩy định kỳ: ${item_ids.length} SP, tự đẩy mỗi 4 giờ.`
          : 'Đã lưu & TẮT lịch đẩy định kỳ.');
        autoTriggerRef.current = null; // allow a fresh trigger against the new config
        await loadSchedule();
        await loadBoostLog();
      } else {
        setError(res.error || 'Lỗi lưu lịch đẩy');
      }
    } catch (e) { setError(e.message); }
    setSavingSchedule(false);
  };

  // ── Run the recurring boost now (force from a button; due-gated from auto-trigger) ──
  const runNow = useCallback(async (source = 'frontend', force = false) => {
    setRunningNow(true);
    try {
      const params = { source };
      if (force) params.force = '1';
      const res = await apiCall('auto_boost', params);
      if (res.ok && res.ran) {
        if (res.status === 'ok') setSuccess(res.message || 'Đã đẩy theo lịch!');
        else if (res.status === 'partial') setSuccess(res.message || 'Đẩy xong (một phần lỗi).');
        else setError(res.message || 'Đẩy theo lịch thất bại.');
      } else if (res.ok && res.skipped && force) {
        // Only surface skip reasons when the user explicitly clicked run
        setError(res.message || 'Bỏ qua (chưa tới giờ hoặc lịch đang tắt).');
      } else if (!res.ok) {
        setError(res.error || 'Lỗi chạy đẩy định kỳ');
      }
      await loadSchedule();
      await loadBoostLog();
      return res;
    } catch (e) {
      setError(e.message);
      return { ok: false, error: e.message };
    } finally {
      setRunningNow(false);
    }
  }, [loadSchedule, loadBoostLog]);

  // ── Toggle a product in the schedule selection (no 5-item cap — rotation handles batching) ──
  const toggleScheduleSelect = useCallback((product) => {
    setScheduleItems(prev => {
      const idx = prev.findIndex(p => p.item_id === product.item_id);
      if (idx >= 0) return prev.filter(p => p.item_id !== product.item_id);
      return [...prev, {
        item_id: product.item_id,
        item_name: product.item_name || `SP ${product.item_id}`,
        image_url: product.image?.image_url_list?.[0] || product.image_url || null,
      }];
    });
  }, []);

  // ── Live countdown tick (only while viewing the schedule tab) ──
  useEffect(() => {
    if (activeTab !== 'schedule') return undefined;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activeTab]);

  // ── Frontend auto-trigger: when the saved schedule is due & the tab is open, boost once ──
  useEffect(() => {
    if (activeTab !== 'schedule') return;
    if (runningNow) return;
    if (!scheduleData?.enabled) return;
    if (!safeArray(scheduleData.item_ids).length) return;
    const nextMs = scheduleData.next_run_at ? new Date(scheduleData.next_run_at).getTime() : null;
    const due = !nextMs || nowTick >= nextMs;
    const guardKey = scheduleData.next_run_at || 'initial';
    if (due && autoTriggerRef.current !== guardKey) {
      autoTriggerRef.current = guardKey;
      runNow('frontend', false);
    }
  }, [nowTick, activeTab, scheduleData, runningNow, runNow]);

  // ── Boost products ──────────────────────────────────────────────────────
  const handleBoost = async () => {
    if (boostSelected.length === 0) {
      setError('Vui lòng chọn ít nhất 1 sản phẩm để đẩy');
      return;
    }
    if (boostSelected.length > 5) {
      setError('Shopee chỉ cho phép đẩy tối đa 5 sản phẩm cùng lúc');
      return;
    }

    setBoosting(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiCall('boost', {}, {
        item_id_list: boostSelected.map(p => Number(p.item_id)),
      });
      if (res.ok) {
        const failCount = res.data?.failure_count || 0;
        const successList = res.data?.success_list || {};
        if (failCount > 0) {
          const failures = res.data?.failure_list || [];
          const failMsg = failures.map(f => `${f.item_id}: ${f.failed_reason || 'Lỗi'}`).join(', ');
          setSuccess(`Đẩy thành công ${boostSelected.length - failCount}/${boostSelected.length} SP. Lỗi: ${failMsg}`);
        } else {
          setSuccess(`Đã đẩy ${boostSelected.length} sản phẩm lên top tìm kiếm! Hiệu lực 4 giờ.`);
        }
        setBoostSelected([]);
        await loadBoostedList();
      } else {
        // Translate common Shopee errors to Vietnamese
        const errMsg = res.message || res.error || '';
        if (errMsg.includes('bump slot limit') || errMsg.includes('slot limit')) {
          setError('Shop đã đạt giới hạn đẩy sản phẩm! Tất cả 5 slot đang được sử dụng. Vui lòng chờ hết hiệu lực (4 giờ) rồi đẩy tiếp.');
        } else if (errMsg.includes('item is boosted') || errMsg.includes('already boosted')) {
          setError('Sản phẩm này đang được đẩy rồi. Vui lòng chờ hết hiệu lực trước khi đẩy lại.');
        } else if (errMsg.includes('cooldown')) {
          setError('Sản phẩm đang trong thời gian chờ (cooldown). Vui lòng thử lại sau.');
        } else {
          setError(`Lỗi đẩy sản phẩm: ${res.error}${res.message ? ' — ' + res.message : ''}`);
        }
      }
    } catch (e) {
      setError(e.message);
    }
    setBoosting(false);
  };

  // ── Toggle boost selection ──────────────────────────────────────────────
  const toggleBoostSelect = (product) => {
    const idx = boostSelected.findIndex(p => p.item_id === product.item_id);
    if (idx >= 0) {
      setBoostSelected(prev => prev.filter(p => p.item_id !== product.item_id));
    } else {
      if (boostSelected.length >= 5) {
        setError('Tối đa 5 sản phẩm! Bỏ chọn 1 SP trước khi thêm.');
        return;
      }
      setBoostSelected(prev => [...prev, {
        item_id: product.item_id,
        item_name: product.item_name || `SP ${product.item_id}`,
        image: product.image || null,
      }]);
    }
  };

  // ── Top Picks: create/edit/delete ────────────────────────────────────────
  const startCreate = async () => {
    setTpStep(1);
    setEditingCollection(null);
    setCollectionName('');
    setIsActivated(true);
    setTpSelected([]);
    setSuccess('');
    setError('');
  };

  const startEdit = async (collection) => {
    setTpStep(1);
    setEditingCollection(collection);
    setCollectionName(collection.name || '');
    setIsActivated(collection.is_activated !== undefined ? collection.is_activated : true);
    const existingItems = (collection.items || collection.item_id_list || []).map(item => {
      if (typeof item === 'object') return { item_id: item.item_id, item_name: item.item_name || item.name || `SP ${item.item_id}`, image: item.image || null };
      return { item_id: item, item_name: `SP ${item}`, image: null };
    });
    setTpSelected(existingItems);
    setSuccess('');
    setError('');
  };

  const toggleTpProduct = (product) => {
    const idx = tpSelected.findIndex(p => p.item_id === product.item_id);
    if (idx >= 0) {
      setTpSelected(prev => prev.filter(p => p.item_id !== product.item_id));
    } else {
      setTpSelected(prev => [...prev, { item_id: product.item_id, item_name: product.item_name || `SP ${product.item_id}`, image: product.image || null }]);
    }
  };

  const submitCollection = async () => {
    if (!collectionName.trim()) { setError('Vui lòng nhập tên bộ sưu tập'); return; }
    if (tpSelected.length === 0) { setError('Vui lòng chọn ít nhất 1 sản phẩm'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const itemIdList = tpSelected.map(p => Number(p.item_id));
      const action = editingCollection ? 'update' : 'create';
      const body = editingCollection
        ? { top_picks_id: editingCollection.top_picks_id, name: collectionName.trim(), item_id_list: itemIdList, is_activated: isActivated }
        : { name: collectionName.trim(), item_id_list: itemIdList, is_activated: isActivated };
      const res = await apiCall(action, {}, body);
      if (res.ok) {
        setSuccess(editingCollection ? 'Cập nhật bộ sưu tập thành công!' : 'Tạo bộ sưu tập thành công!');
        setTpStep(0);
        await loadCollections();
      } else {
        setError(res.error || 'Lỗi xử lý bộ sưu tập');
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const toggleActivate = async (collection) => {
    setLoading(true); setError('');
    try {
      const res = await apiCall('update', {}, { top_picks_id: collection.top_picks_id, is_activated: !collection.is_activated });
      if (res.ok) { setSuccess(collection.is_activated ? 'Đã tắt bộ sưu tập' : 'Đã kích hoạt bộ sưu tập'); await loadCollections(); }
      else setError(res.error || 'Lỗi cập nhật trạng thái');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const confirmDeleteCol = async (topPicksId) => {
    setLoading(true); setError(''); setDeleteConfirm(null);
    try {
      const res = await apiCall('delete', {}, { top_picks_id: topPicksId });
      if (res.ok) { setSuccess('Đã xóa bộ sưu tập'); await loadCollections(); }
      else setError(res.error || 'Lỗi xóa bộ sưu tập');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const backToList = () => { setTpStep(0); setError(''); setSuccess(''); setEditingCollection(null); loadCollections(); };

  // ══════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════
  const tabStyle = (isActive) => ({
    padding: '10px 24px', borderRadius: '10px 10px 0 0', cursor: 'pointer',
    fontWeight: isActive ? 800 : 600, fontSize: '0.88rem',
    color: isActive ? '#ea580c' : '#64748b',
    background: isActive ? '#fff' : '#f1f5f9',
    border: isActive ? '1px solid #e5e7eb' : '1px solid transparent',
    borderBottom: isActive ? '2px solid #fff' : '1px solid #e5e7eb',
    marginBottom: isActive ? '-1px' : '0',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 42, height: 42, borderRadius: 12, background: '#fff7ed', border: '1px solid #fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>🚀</span>
            Đẩy Sản Phẩm
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            Đẩy sản phẩm lên top tìm kiếm & quản lý bộ sưu tập nổi bật
            <span style={{ margin: '0 0 0 12px', fontSize: '0.7rem', color: '#c4b5a0', fontStyle: 'italic' }}>Built by Quốc Khánh</span>
          </p>
        </div>

        {/* Shop selector */}
        {shops.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>🏪 Shop:</span>
            <select
              value={selectedShopId}
              onChange={(e) => setSelectedShopId(e.target.value)}
              style={{ padding: '9px 14px', borderRadius: 10, border: '2px solid #fed7aa', fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', background: '#fff7ed', cursor: 'pointer', fontFamily: 'inherit', outline: 'none', minWidth: 180 }}
            >
              {shops.map(s => (
                <option key={s.shop_id} value={s.shop_id}>
                  {s.shop_name || `Shop ${s.shop_id}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 0 }}>
        <div style={tabStyle(activeTab === 'boost')} onClick={() => { setActiveTab('boost'); setError(''); setSuccess(''); }}>
          🚀 Đẩy sản phẩm
        </div>
        <div style={tabStyle(activeTab === 'schedule')} onClick={() => { setActiveTab('schedule'); setError(''); setSuccess(''); loadSchedule(); loadBoostLog(); }}>
          ⏰ Đẩy định kỳ
        </div>
        <div style={tabStyle(activeTab === 'top_picks')} onClick={() => { setActiveTab('top_picks'); setError(''); setSuccess(''); setTpStep(0); loadCollections(); }}>
          ⭐ Bộ sưu tập nổi bật
        </div>
      </div>

      {/* Content area */}
      <div style={{ ...CARD, borderRadius: '0 16px 16px 16px', marginBottom: 24 }}>
        {/* Error / Success */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12, padding: '12px 16px', marginBottom: 16, color: '#dc2626', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⚠️</span> {error}
            <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#dc2626' }}>×</button>
          </div>
        )}
        {success && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '12px 16px', marginBottom: 16, color: '#15803d', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>✅</span> {success}
            <button onClick={() => setSuccess('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#15803d' }}>×</button>
          </div>
        )}

        {/* Loading spinner */}
        {(loading || boosting) && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#ea580c', fontSize: '0.9rem', fontWeight: 700 }}>
            <div style={{ width: 40, height: 40, border: '3px solid #fed7aa', borderTopColor: '#ea580c', borderRadius: '50%', margin: '0 auto 12px', animation: 'tpSpin 0.8s linear infinite' }} />
            {boosting ? 'Đang đẩy sản phẩm...' : 'Đang tải...'}
            <style>{`@keyframes tpSpin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ═══ BOOST TAB ═══ */}
        {activeTab === 'boost' && !loading && !boosting && (
          <SectionErrorBoundary>
            <BoostSection
              products={products}
              boostedItems={boostedItems}
              boostSelected={boostSelected}
              onToggleSelect={toggleBoostSelect}
              onBoost={handleBoost}
              onRefreshBoosted={loadBoostedList}
              onLoadMore={() => loadProducts(productPage + 1, true)}
              hasMoreProducts={hasMoreProducts}
              loadingProducts={loadingProducts}
            />
          </SectionErrorBoundary>
        )}

        {/* ═══ SCHEDULE (Đẩy định kỳ) TAB ═══ */}
        {activeTab === 'schedule' && !loading && !boosting && (
          <SectionErrorBoundary>
            <ScheduleSection
              products={products}
              scheduleData={scheduleData}
              scheduleEnabled={scheduleEnabled}
              onToggleEnabled={setScheduleEnabled}
              selectedItems={scheduleItems}
              onToggleSelect={toggleScheduleSelect}
              onClearSelect={() => setScheduleItems([])}
              onSave={saveSchedule}
              saving={savingSchedule}
              onRunNow={() => runNow('frontend', true)}
              running={runningNow}
              boostLog={boostLog}
              onRefreshLog={loadBoostLog}
              nowTick={nowTick}
              onLoadMore={() => loadProducts(productPage + 1, true)}
              hasMoreProducts={hasMoreProducts}
              loadingProducts={loadingProducts}
            />
          </SectionErrorBoundary>
        )}

        {/* ═══ TOP PICKS TAB ═══ */}
        {activeTab === 'top_picks' && !loading && (
          <>
            {/* Delete Confirmation Modal */}
            {deleteConfirm !== null && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                <div style={{ ...CARD, maxWidth: 420, width: '90%', textAlign: 'center', padding: '32px' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🗑️</div>
                  <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>Xác nhận xóa bộ sưu tập?</h3>
                  <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 24 }}>Hành động này không thể hoàn tác.</p>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button style={BTN_SECONDARY} onClick={() => setDeleteConfirm(null)}>Hủy bỏ</button>
                    <button style={{ ...BTN_DANGER, background: '#fef2f2' }} onClick={() => confirmDeleteCol(deleteConfirm)}>🗑️ Xóa</button>
                  </div>
                </div>
              </div>
            )}

            {tpStep === 0 && (
              <TopPicksList
                collections={collections}
                onEdit={startEdit}
                onDelete={(id) => setDeleteConfirm(id)}
                onToggleActivate={toggleActivate}
                onRefresh={loadCollections}
                onCreate={startCreate}
              />
            )}
            {tpStep === 1 && (
              <TopPicksEditor
                isEditing={!!editingCollection}
                collectionName={collectionName}
                onNameChange={setCollectionName}
                isActivated={isActivated}
                onActivatedChange={setIsActivated}
                products={products}
                selectedProducts={tpSelected}
                onToggleProduct={toggleTpProduct}
                onLoadMore={() => loadProducts(productPage + 1, true)}
                hasMoreProducts={hasMoreProducts}
                loadingProducts={loadingProducts}
                onSubmit={submitCollection}
                onCancel={backToList}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BOOST SECTION
// ══════════════════════════════════════════════════════════════════════════════
function BoostSection({ products: rawProducts, boostedItems: rawBoosted, boostSelected: rawSelected, onToggleSelect, onBoost, onRefreshBoosted, onLoadMore, hasMoreProducts, loadingProducts }) {
  // Defensive: ensure all list props are always arrays
  const products = Array.isArray(rawProducts) ? rawProducts : [];
  const boostedItems = Array.isArray(rawBoosted) ? rawBoosted : [];
  const boostSelected = Array.isArray(rawSelected) ? rawSelected : [];

  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(p => (p.item_name || '').toLowerCase().includes(q) || String(p.item_id).includes(q));
  }, [products, search]);

  const isSelected = (itemId) => boostSelected.some(p => p.item_id === itemId);
  const isBoosted = (itemId) => boostedItems.some(b => b.item_id === itemId);

  return (
    <div>
      {/* Info banner */}
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: '1.2rem' }}>💡</span>
        <div style={{ fontSize: '0.82rem', color: '#92400e', lineHeight: 1.6 }}>
          <strong>Đẩy sản phẩm</strong> giúp sản phẩm xuất hiện ở vị trí cao hơn trong kết quả tìm kiếm Shopee trong <strong>4 giờ</strong>.
          Tối đa <strong>5 sản phẩm</strong> mỗi lần đẩy. Mỗi sản phẩm có thể đẩy lại sau khi hết hiệu lực.
        </div>
      </div>

      {/* Currently boosted */}
      {boostedItems.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
              🔥 Đang được đẩy ({boostedItems.length})
            </h3>
            <button onClick={onRefreshBoosted} style={{ ...BTN_SECONDARY, padding: '5px 12px', fontSize: '0.74rem' }}>
              🔄 Làm mới
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {boostedItems.map((item, i) => (
              <div key={item.item_id || i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                borderRadius: 12, background: '#fef3c7', border: '1px solid #fde68a',
              }}>
                <span style={{ fontSize: '1rem' }}>🔥</span>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#92400e' }}>
                    {item.item_name || `SP ${item.item_id}`}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#b45309' }}>
                    Hết lúc: {item.cooldown_second ? `${Math.ceil(item.cooldown_second / 60)} phút nữa` : 'đang hoạt động'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected for boost */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
          Chọn sản phẩm để đẩy ({boostSelected.length}/5)
        </h3>
        <button
          style={{ ...BTN_PRIMARY, padding: '10px 28px', opacity: boostSelected.length === 0 ? 0.5 : 1 }}
          onClick={onBoost}
          disabled={boostSelected.length === 0}
        >
          🚀 Đẩy ngay ({boostSelected.length})
        </button>
      </div>

      {/* Selected chips */}
      {boostSelected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 16px', background: '#fff7ed', borderRadius: 12, border: '1px solid #fed7aa', marginBottom: 16 }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#9a3412', alignSelf: 'center' }}>Sẽ đẩy:</span>
          {boostSelected.map(p => (
            <div key={p.item_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 6px', borderRadius: 20, background: '#fff', border: '1px solid #fed7aa', fontSize: '0.72rem', fontWeight: 600, color: '#0f172a' }}>
              {p.image?.image_url_list?.[0] && <img src={p.image.image_url_list[0]} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover' }} />}
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.item_name}</span>
              <span onClick={() => onToggleSelect(p)} style={{ cursor: 'pointer', color: '#dc2626', fontWeight: 800, fontSize: '0.8rem', marginLeft: 2 }}>×</span>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Tìm kiếm sản phẩm..." style={{ ...INPUT, maxWidth: 400 }} />
      </div>

      {/* Product Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {filtered.map(product => {
          const selected = isSelected(product.item_id);
          const boosted = isBoosted(product.item_id);
          return (
            <div
              key={product.item_id}
              onClick={() => !boosted && onToggleSelect(product)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 12,
                cursor: boosted ? 'default' : 'pointer',
                border: selected ? '2px solid #ea580c' : boosted ? '2px solid #fde68a' : '2px solid #e5e7eb',
                background: selected ? '#fff7ed' : boosted ? '#fffbeb' : '#fff',
                opacity: boosted ? 0.7 : 1,
                transition: 'all 0.2s',
              }}
            >
              {/* Checkbox */}
              <div style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                border: selected ? '2px solid #ea580c' : boosted ? '2px solid #f59e0b' : '2px solid #d1d5db',
                background: selected ? '#ea580c' : boosted ? '#f59e0b' : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: '0.7rem', fontWeight: 900,
              }}>
                {selected && '✓'}
                {boosted && !selected && '🔥'}
              </div>

              {/* Image */}
              <div style={{ width: 48, height: 48, borderRadius: 8, flexShrink: 0, overflow: 'hidden', background: '#f1f5f9', border: '1px solid #e5e7eb' }}>
                {product.image?.image_url_list?.[0] && <img src={product.image.image_url_list[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {product.item_name || `Item ${product.item_id}`}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>ID: {product.item_id}</span>
                  {product.price_info?.[0]?.original_price && (
                    <span style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: 600 }}>{fmtVnd(product.price_info[0].original_price)}</span>
                  )}
                  {boosted && <span style={BADGE('#b45309', '#fef3c7')}>🔥 Đang đẩy</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Load More */}
      {hasMoreProducts && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={onLoadMore} style={{ ...BTN_SECONDARY, fontSize: '0.82rem' }} disabled={loadingProducts}>
            {loadingProducts ? 'Đang tải...' : 'Tải thêm sản phẩm'}
          </button>
        </div>
      )}

      {filtered.length === 0 && !loadingProducts && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Không tìm thấy sản phẩm nào</div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SCHEDULE SECTION — Đẩy định kỳ (auto re-boost mỗi 4 giờ)
// ══════════════════════════════════════════════════════════════════════════════
function logStatusBadge(status) {
  if (status === 'ok') return BADGE('#16a34a', '#f0fdf4');
  if (status === 'partial') return BADGE('#b45309', '#fef3c7');
  if (status === 'error') return BADGE('#dc2626', '#fef2f2');
  return BADGE('#64748b', '#f1f5f9'); // skipped / unknown
}
const logSourceLabel = (s) => (s === 'cron' ? '🤖 Tự động' : s === 'frontend' ? '🌐 Web' : s === 'manual' ? '👆 Thủ công' : s || '—');
const logStatusLabel = (s) => (s === 'ok' ? '✅ OK' : s === 'partial' ? '⚠️ Một phần' : s === 'error' ? '❌ Lỗi' : '⏭️ Bỏ qua');

function ScheduleSection({
  products: rawProducts, scheduleData, scheduleEnabled, onToggleEnabled,
  selectedItems: rawSelected, onToggleSelect, onClearSelect,
  onSave, saving, onRunNow, running,
  boostLog: rawLog, onRefreshLog, nowTick,
  onLoadMore, hasMoreProducts, loadingProducts,
}) {
  const products = Array.isArray(rawProducts) ? rawProducts : [];
  const selectedItems = Array.isArray(rawSelected) ? rawSelected : [];
  const boostLog = Array.isArray(rawLog) ? rawLog : [];
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(p => (p.item_name || '').toLowerCase().includes(q) || String(p.item_id).includes(q));
  }, [products, search]);
  const isSelected = (itemId) => selectedItems.some(p => p.item_id === itemId);

  // ── Saved-state derived values ──
  const saved = scheduleData || {};
  const savedEnabled = !!saved.enabled;
  const savedIds = Array.isArray(saved.item_ids) ? saved.item_ids : [];
  const savedCount = savedIds.length;
  const intervalH = saved.interval_hours || 4;
  const nextMs = saved.next_run_at ? new Date(saved.next_run_at).getTime() : null;
  const lastRunStr = saved.last_run_at ? fmtDateTime(saved.last_run_at) : 'Chưa chạy lần nào';
  const remaining = nextMs != null ? nextMs - nowTick : null;
  const totalBatches = savedCount > 0 ? Math.ceil(savedCount / 5) : 0;
  const rotIdx = saved.rotation_index || 0;
  const curBatch = (savedCount > 5 && totalBatches > 0) ? (Math.floor(rotIdx / 5) % totalBatches) + 1 : 1;

  // ── Unsaved-changes hint ──
  const workingIds = selectedItems.map(p => Number(p.item_id)).sort((a, b) => a - b);
  const savedSorted = savedIds.map(Number).sort((a, b) => a - b);
  const dirty = (scheduleEnabled !== savedEnabled) || (JSON.stringify(workingIds) !== JSON.stringify(savedSorted));

  // ── Countdown text ──
  let countdownText, countdownColor;
  if (!savedEnabled) { countdownText = 'Lịch đang TẮT'; countdownColor = '#94a3b8'; }
  else if (savedCount === 0) { countdownText = 'Chưa có sản phẩm'; countdownColor = '#94a3b8'; }
  else if (remaining == null) { countdownText = 'Sẽ đẩy ở chu kỳ tới'; countdownColor = '#ea580c'; }
  else if (remaining > 0) { countdownText = fmtCountdown(remaining); countdownColor = '#ea580c'; }
  else { countdownText = 'Đang tới lượt đẩy…'; countdownColor = '#16a34a'; }

  const statCell = (label, value, color = '#0f172a') => (
    <div style={{ flex: '1 1 140px', minWidth: 130 }}>
      <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: '0.92rem', fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    </div>
  );

  return (
    <div>
      {/* Info banner */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: '1.2rem' }}>⏰</span>
        <div style={{ fontSize: '0.82rem', color: '#1e40af', lineHeight: 1.6 }}>
          <strong>Đẩy định kỳ</strong> tự động đẩy lại sản phẩm <strong>mỗi 4 giờ, 24/7</strong> — chạy ngầm bằng GitHub Actions kể cả khi tắt web,
          và đếm ngược + tự đẩy khi web đang mở. Chọn bao nhiêu sản phẩm cũng được: hệ thống <strong>xoay vòng theo nhóm 5 SP</strong> (giới hạn của Shopee) qua từng lượt.
        </div>
      </div>

      {/* Status card */}
      <div style={{ background: savedEnabled ? '#fff7ed' : '#f8fafc', border: `1px solid ${savedEnabled ? '#fed7aa' : '#e5e7eb'}`, borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            {savedEnabled ? '🟢' : '⚪'} Trạng thái lịch đẩy
            {dirty && <span style={{ ...BADGE('#b45309', '#fef3c7'), fontSize: '0.66rem' }}>● Có thay đổi chưa lưu</span>}
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onRunNow} disabled={running || savedCount === 0} style={{ ...BTN_PRIMARY, padding: '7px 16px', fontSize: '0.78rem', opacity: (running || savedCount === 0) ? 0.5 : 1 }}>
              {running ? '⏳ Đang đẩy…' : '⚡ Chạy ngay'}
            </button>
            <button onClick={onRefreshLog} disabled={running} style={{ ...BTN_SECONDARY, padding: '7px 14px', fontSize: '0.76rem' }}>🔄 Làm mới</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {statCell('Trạng thái', savedEnabled ? 'BẬT' : 'TẮT', savedEnabled ? '#16a34a' : '#94a3b8')}
          {statCell('Số sản phẩm', `${savedCount} SP`)}
          {statCell('Chu kỳ', `Mỗi ${intervalH} giờ`)}
          {statCell('Lần chạy cuối', lastRunStr)}
          {statCell('Lần đẩy kế tiếp', countdownText, countdownColor)}
          {savedCount > 5 && statCell('Nhóm đang đẩy', `Nhóm ${curBatch}/${totalBatches}`)}
        </div>
      </div>

      {/* Editor: toggle + picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0f172a' }}>Bật đẩy định kỳ</span>
        <div onClick={() => onToggleEnabled(!scheduleEnabled)} style={{ width: 48, height: 26, borderRadius: 13, cursor: 'pointer', background: scheduleEnabled ? '#ea580c' : '#d1d5db', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: scheduleEnabled ? 24 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
        </div>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: scheduleEnabled ? '#16a34a' : '#64748b' }}>
          {scheduleEnabled ? 'Đang bật' : 'Đang tắt'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
          Sản phẩm trong lịch ({selectedItems.length})
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {selectedItems.length > 0 && (
            <button onClick={onClearSelect} style={{ ...BTN_SECONDARY, padding: '8px 16px', fontSize: '0.78rem' }}>Bỏ chọn hết</button>
          )}
          <button onClick={onSave} disabled={saving} style={{ ...BTN_PRIMARY, padding: '10px 24px', opacity: saving ? 0.6 : 1 }}>
            {saving ? '💾 Đang lưu…' : '💾 Lưu lịch'}
          </button>
        </div>
      </div>

      {/* Selected chips */}
      {selectedItems.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 16px', background: '#fff7ed', borderRadius: 12, border: '1px solid #fed7aa', marginBottom: 16 }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#9a3412', alignSelf: 'center' }}>Sẽ xoay vòng đẩy:</span>
          {selectedItems.map(p => (
            <div key={p.item_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 6px', borderRadius: 20, background: '#fff', border: '1px solid #fed7aa', fontSize: '0.72rem', fontWeight: 600, color: '#0f172a' }}>
              {p.image_url && <img src={p.image_url} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover' }} />}
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.item_name}</span>
              <span onClick={() => onToggleSelect(p)} style={{ cursor: 'pointer', color: '#dc2626', fontWeight: 800, fontSize: '0.8rem', marginLeft: 2 }}>×</span>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Tìm kiếm sản phẩm..." style={{ ...INPUT, maxWidth: 400 }} />
      </div>

      {/* Product grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {filtered.map(product => {
          const selected = isSelected(product.item_id);
          return (
            <div key={product.item_id} onClick={() => onToggleSelect(product)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
              border: selected ? '2px solid #ea580c' : '2px solid #e5e7eb', background: selected ? '#fff7ed' : '#fff', transition: 'all 0.2s',
            }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, border: selected ? '2px solid #ea580c' : '2px solid #d1d5db', background: selected ? '#ea580c' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.7rem', fontWeight: 900 }}>
                {selected && '✓'}
              </div>
              <div style={{ width: 48, height: 48, borderRadius: 8, flexShrink: 0, overflow: 'hidden', background: '#f1f5f9', border: '1px solid #e5e7eb' }}>
                {product.image?.image_url_list?.[0] && <img src={product.image.image_url_list[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.item_name || `Item ${product.item_id}`}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>ID: {product.item_id}</span>
                  {product.price_info?.[0]?.original_price && <span style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: 600 }}>{fmtVnd(product.price_info[0].original_price)}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {hasMoreProducts && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button onClick={onLoadMore} style={{ ...BTN_SECONDARY, fontSize: '0.82rem' }} disabled={loadingProducts}>
            {loadingProducts ? 'Đang tải...' : 'Tải thêm sản phẩm'}
          </button>
        </div>
      )}

      {/* Run log */}
      <div style={{ marginTop: 28 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>📜 Lịch sử đẩy ({boostLog.length})</h3>
        {boostLog.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '0.85rem', background: '#fafafa', borderRadius: 12, border: '1px dashed #e5e7eb' }}>
            Chưa có lượt đẩy nào. Bấm "Chạy ngay" hoặc chờ chu kỳ tự động.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {boostLog.map((row, i) => (
              <div key={row.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#475569', minWidth: 96 }}>{fmtDateTime(row.ran_at)}</span>
                <span style={{ ...BADGE('#475569', '#f1f5f9'), fontSize: '0.68rem' }}>{logSourceLabel(row.source)}</span>
                <span style={{ ...logStatusBadge(row.status), fontSize: '0.68rem' }}>{logStatusLabel(row.status)}</span>
                <span style={{ fontSize: '0.74rem', color: '#16a34a', fontWeight: 700 }}>✓ {row.success_count || 0}</span>
                {(row.fail_count || 0) > 0 && <span style={{ fontSize: '0.74rem', color: '#dc2626', fontWeight: 700 }}>✗ {row.fail_count}</span>}
                <span style={{ fontSize: '0.74rem', color: '#64748b', flex: 1, minWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.message || ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TOP PICKS — LIST
// ══════════════════════════════════════════════════════════════════════════════
function TopPicksList({ collections, onEdit, onDelete, onToggleActivate, onRefresh, onCreate }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
          Bộ sưu tập nổi bật ({collections.length})
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onRefresh} style={{ ...BTN_SECONDARY, padding: '6px 14px', fontSize: '0.78rem' }}>🔄 Làm mới</button>
          <button onClick={onCreate} style={{ ...BTN_PRIMARY, padding: '8px 18px', fontSize: '0.82rem' }}>+ Tạo bộ sưu tập</button>
        </div>
      </div>

      {(!collections || collections.length === 0) ? (
        <div style={{ textAlign: 'center', padding: '50px 40px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>⭐</div>
          <h3 style={{ margin: '0 0 6px', color: '#0f172a', fontWeight: 800 }}>Chưa có bộ sưu tập nào</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Bấm "Tạo bộ sưu tập" để hiển thị sản phẩm nổi bật trên trang shop</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {collections.map((col, i) => {
            const itemCount = col.item_count || col.items?.length || col.item_id_list?.length || 0;
            const isActive = col.is_activated;
            return (
              <div key={col.top_picks_id || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 12, border: '1px solid #e5e7eb', background: '#fafafa' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fff7ed', border: '1px solid #fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>⭐</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>{col.name || `Bộ sưu tập ${col.top_picks_id}`}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={BADGE(isActive ? '#16a34a' : '#64748b', isActive ? '#f0fdf4' : '#f8fafc')}>
                        {isActive ? '🟢 Đang hoạt động' : '⚪ Không hoạt động'}
                      </span>
                      <span style={BADGE('#475569', '#f1f5f9')}>📦 {itemCount} SP</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div onClick={() => onToggleActivate(col)} title={isActive ? 'Tắt' : 'Kích hoạt'} style={{ width: 44, height: 24, borderRadius: 12, cursor: 'pointer', background: isActive ? '#ea580c' : '#d1d5db', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: isActive ? 22 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                  <button onClick={() => onEdit(col)} style={{ ...BTN_SECONDARY, padding: '6px 14px', fontSize: '0.76rem' }}>✏️ Sửa</button>
                  <button onClick={() => onDelete(col.top_picks_id)} style={{ ...BTN_DANGER, padding: '6px 14px', fontSize: '0.76rem' }}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TOP PICKS — EDITOR
// ══════════════════════════════════════════════════════════════════════════════
function TopPicksEditor({ isEditing, collectionName, onNameChange, isActivated, onActivatedChange, products, selectedProducts, onToggleProduct, onLoadMore, hasMoreProducts, loadingProducts, onSubmit, onCancel }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(p => (p.item_name || '').toLowerCase().includes(q) || String(p.item_id).includes(q));
  }, [products, search]);
  const isSelected = (itemId) => selectedProducts.some(p => p.item_id === itemId);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
            {isEditing ? '✏️ Chỉnh sửa bộ sưu tập' : '✨ Tạo bộ sưu tập mới'}
          </h3>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
            {isEditing ? 'Cập nhật tên và sản phẩm trong bộ sưu tập' : 'Đặt tên và chọn sản phẩm cho bộ sưu tập mới'}
          </p>
        </div>
        <button style={BTN_SECONDARY} onClick={onCancel}>← Quay lại</button>
      </div>

      {/* Name + toggle */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 250 }}>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: 6 }}>Tên bộ sưu tập</label>
          <input type="text" value={collectionName} onChange={e => onNameChange(e.target.value)} placeholder="Nhập tên..." style={{ ...INPUT, maxWidth: 500 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 24 }}>
          <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>Trạng thái:</label>
          <div onClick={() => onActivatedChange(!isActivated)} style={{ width: 44, height: 24, borderRadius: 12, cursor: 'pointer', background: isActivated ? '#ea580c' : '#d1d5db', position: 'relative', transition: 'background 0.2s' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: isActivated ? 22 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </div>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: isActivated ? '#16a34a' : '#64748b' }}>
            {isActivated ? 'Đang hoạt động' : 'Không hoạt động'}
          </span>
        </div>
      </div>

      {/* Product selector */}
      <h3 style={{ margin: '0 0 10px', fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>🛍️ Chọn sản phẩm ({selectedProducts.length} đã chọn)</h3>

      <div style={{ marginBottom: 16 }}>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Tìm kiếm sản phẩm..." style={{ ...INPUT, maxWidth: 400 }} />
      </div>

      {selectedProducts.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 16px', background: '#fff7ed', borderRadius: 12, border: '1px solid #fed7aa', marginBottom: 16 }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#9a3412', alignSelf: 'center' }}>Đã chọn:</span>
          {selectedProducts.map(p => (
            <div key={p.item_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 6px', borderRadius: 20, background: '#fff', border: '1px solid #fed7aa', fontSize: '0.72rem', fontWeight: 600, color: '#0f172a' }}>
              {p.image?.image_url_list?.[0] && <img src={p.image.image_url_list[0]} alt="" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover' }} />}
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.item_name || `SP ${p.item_id}`}</span>
              <span onClick={() => onToggleProduct(p)} style={{ cursor: 'pointer', color: '#dc2626', fontWeight: 800, fontSize: '0.8rem', marginLeft: 2 }}>×</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }}>
        {filtered.map(product => {
          const selected = isSelected(product.item_id);
          return (
            <div key={product.item_id} onClick={() => onToggleProduct(product)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
              border: selected ? '2px solid #ea580c' : '2px solid #e5e7eb', background: selected ? '#fff7ed' : '#fff', transition: 'all 0.2s',
            }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, border: selected ? '2px solid #ea580c' : '2px solid #d1d5db', background: selected ? '#ea580c' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.7rem', fontWeight: 900 }}>
                {selected && '✓'}
              </div>
              <div style={{ width: 48, height: 48, borderRadius: 8, flexShrink: 0, overflow: 'hidden', background: '#f1f5f9', border: '1px solid #e5e7eb' }}>
                {product.image?.image_url_list?.[0] && <img src={product.image.image_url_list[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.item_name || `Item ${product.item_id}`}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>ID: {product.item_id}</span>
                  {product.price_info?.[0]?.original_price && <span style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: 600 }}>{fmtVnd(product.price_info[0].original_price)}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {hasMoreProducts && (
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <button onClick={onLoadMore} style={{ ...BTN_SECONDARY, fontSize: '0.82rem' }} disabled={loadingProducts}>
            {loadingProducts ? 'Đang tải...' : 'Tải thêm sản phẩm'}
          </button>
        </div>
      )}

      {/* Submit */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
        <button style={BTN_SECONDARY} onClick={onCancel}>Hủy bỏ</button>
        <button style={{ ...BTN_PRIMARY, padding: '12px 32px', fontSize: '0.92rem', opacity: (!collectionName.trim() || selectedProducts.length === 0) ? 0.5 : 1 }}
          onClick={onSubmit} disabled={!collectionName.trim() || selectedProducts.length === 0}>
          {isEditing ? '💾 Lưu thay đổi' : '⭐ Tạo bộ sưu tập'}
        </button>
      </div>
    </div>
  );
}
