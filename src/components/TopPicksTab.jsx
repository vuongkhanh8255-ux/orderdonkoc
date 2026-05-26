// src/components/TopPicksTab.jsx — Top Picks (Đẩy Sản Phẩm) Management Tool
// Built by Quốc Khánh
import React, { useState, useEffect, useCallback, useMemo } from 'react';

const API_BASE = '/api/shopee/top-picks';
const PRODUCT_API_BASE = '/api/shopee/flash-sale';
const DEFAULT_SHOP_ID = '341325550';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtVnd = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '0';
  return n.toLocaleString('vi-VN') + ' ₫';
};

// ── API caller ───────────────────────────────────────────────────────────────
async function apiCall(action, params = {}, body = null) {
  const qs = new URLSearchParams({ action, shop_id: DEFAULT_SHOP_ID, ...params });
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
    shop_id: DEFAULT_SHOP_ID,
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

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function TopPicksTab() {
  const [step, setStep] = useState(0); // 0=list, 1=create/edit
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Collections list
  const [collections, setCollections] = useState([]);

  // Create/Edit state
  const [editingCollection, setEditingCollection] = useState(null); // null = creating new
  const [collectionName, setCollectionName] = useState('');
  const [isActivated, setIsActivated] = useState(true);

  // Product selector state
  const [products, setProducts] = useState([]);
  const [productPage, setProductPage] = useState(0);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState([]); // [{item_id, item_name, image, ...}]
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(null); // top_picks_id or null

  // ── Load collections ────────────────────────────────────────────────────
  const loadCollections = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiCall('list');
      if (res.ok) {
        setCollections(res.data?.collections || res.data?.top_picks_list || res.data || []);
      } else {
        setError(res.error || 'Lỗi tải danh sách bộ sưu tập');
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadCollections(); }, [loadCollections]);

  // ── Load products ───────────────────────────────────────────────────────
  const loadProducts = useCallback(async (page = 0, append = false) => {
    setLoadingProducts(true);
    try {
      const res = await loadProductsApi(page * 50, 50);
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
        setError(res.error || 'Lỗi tải sản phẩm');
      }
    } catch (e) {
      setError(e.message);
    }
    setLoadingProducts(false);
  }, []);

  // ── Start create ──────────────────────────────────────────────────────
  const startCreate = async () => {
    setStep(1);
    setEditingCollection(null);
    setCollectionName('');
    setIsActivated(true);
    setSelectedProducts([]);
    setSuccess('');
    setError('');
    await loadProducts(0);
  };

  // ── Start edit ────────────────────────────────────────────────────────
  const startEdit = async (collection) => {
    setStep(1);
    setEditingCollection(collection);
    setCollectionName(collection.name || '');
    setIsActivated(collection.is_activated !== undefined ? collection.is_activated : true);
    // Pre-select products from collection
    const existingItems = (collection.items || collection.item_id_list || []).map(item => {
      if (typeof item === 'object') {
        return {
          item_id: item.item_id,
          item_name: item.item_name || item.name || `Sản phẩm ${item.item_id}`,
          image: item.image || null,
        };
      }
      return {
        item_id: item,
        item_name: `Sản phẩm ${item}`,
        image: null,
      };
    });
    setSelectedProducts(existingItems);
    setSuccess('');
    setError('');
    await loadProducts(0);
  };

  // ── Toggle product selection ──────────────────────────────────────────
  const toggleProduct = (product) => {
    const idx = selectedProducts.findIndex(p => p.item_id === product.item_id);
    if (idx >= 0) {
      setSelectedProducts(prev => prev.filter(p => p.item_id !== product.item_id));
    } else {
      setSelectedProducts(prev => [...prev, {
        item_id: product.item_id,
        item_name: product.item_name || `Sản phẩm ${product.item_id}`,
        image: product.image || null,
      }]);
    }
  };

  // ── Submit create/update ──────────────────────────────────────────────
  const submitCollection = async () => {
    if (!collectionName.trim()) {
      setError('Vui lòng nhập tên bộ sưu tập');
      return;
    }
    if (selectedProducts.length === 0) {
      setError('Vui lòng chọn ít nhất 1 sản phẩm');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const itemIdList = selectedProducts.map(p => Number(p.item_id));

      if (editingCollection) {
        // Update
        const res = await apiCall('update', {}, {
          top_picks_id: editingCollection.top_picks_id,
          name: collectionName.trim(),
          item_id_list: itemIdList,
          is_activated: isActivated,
        });
        if (res.ok) {
          setSuccess('Cập nhật bộ sưu tập thành công!');
          setStep(0);
          await loadCollections();
        } else {
          setError(res.error || 'Lỗi cập nhật bộ sưu tập');
        }
      } else {
        // Create
        const res = await apiCall('create', {}, {
          name: collectionName.trim(),
          item_id_list: itemIdList,
          is_activated: isActivated,
        });
        if (res.ok) {
          setSuccess('Tạo bộ sưu tập thành công!');
          setStep(0);
          await loadCollections();
        } else {
          setError(res.error || 'Lỗi tạo bộ sưu tập');
        }
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  // ── Toggle activate ───────────────────────────────────────────────────
  const toggleActivate = async (collection) => {
    setLoading(true);
    setError('');
    try {
      const res = await apiCall('update', {}, {
        top_picks_id: collection.top_picks_id,
        is_activated: !collection.is_activated,
      });
      if (res.ok) {
        setSuccess(collection.is_activated ? 'Đã tắt bộ sưu tập' : 'Đã kích hoạt bộ sưu tập');
        await loadCollections();
      } else {
        setError(res.error || 'Lỗi cập nhật trạng thái');
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  // ── Delete collection ─────────────────────────────────────────────────
  const confirmDelete = async (topPicksId) => {
    setLoading(true);
    setError('');
    setDeleteConfirm(null);
    try {
      const res = await apiCall('delete', {}, { top_picks_id: topPicksId });
      if (res.ok) {
        setSuccess('Đã xóa bộ sưu tập');
        await loadCollections();
      } else {
        setError(res.error || 'Lỗi xóa bộ sưu tập');
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  // ── Back to list ──────────────────────────────────────────────────────
  const backToList = () => {
    setStep(0);
    setError('');
    setSuccess('');
    setEditingCollection(null);
    loadCollections();
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
            }}>🚀</span>
            Đẩy Sản Phẩm
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            Quản lý bộ sưu tập sản phẩm nổi bật
            <span style={{ margin: '0 0 0 12px', fontSize: '0.7rem', color: '#c4b5a0', fontStyle: 'italic' }}>
              Built by Quốc Khánh
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {step === 0 && (
            <button style={BTN_PRIMARY} onClick={startCreate}>
              + Tạo bộ sưu tập
            </button>
          )}
          {step > 0 && (
            <button style={BTN_SECONDARY} onClick={backToList}>
              ← Quay lại
            </button>
          )}
        </div>
      </div>

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
          textAlign: 'center', padding: '40px 20px', color: '#ea580c',
          fontSize: '0.9rem', fontWeight: 700,
        }}>
          <div style={{
            width: 40, height: 40, border: '3px solid #fed7aa', borderTopColor: '#ea580c',
            borderRadius: '50%', margin: '0 auto 12px',
            animation: 'tpSpin 0.8s linear infinite',
          }} />
          Đang tải...
          <style>{`@keyframes tpSpin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm !== null && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            ...CARD, maxWidth: 420, width: '90%', textAlign: 'center', padding: '32px',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🗑️</div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
              Xác nhận xóa bộ sưu tập?
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 24 }}>
              Bạn có chắc chắn muốn xóa bộ sưu tập này? Hành động này không thể hoàn tác.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button style={BTN_SECONDARY} onClick={() => setDeleteConfirm(null)}>
                Hủy bỏ
              </button>
              <button style={{ ...BTN_DANGER, background: '#fef2f2' }} onClick={() => confirmDelete(deleteConfirm)}>
                🗑️ Xóa bộ sưu tập
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 0: Collection List ═══ */}
      {step === 0 && !loading && (
        <CollectionList
          collections={collections}
          onEdit={startEdit}
          onDelete={(id) => setDeleteConfirm(id)}
          onToggleActivate={toggleActivate}
          onRefresh={loadCollections}
        />
      )}

      {/* ═══ STEP 1: Create/Edit Collection ═══ */}
      {step === 1 && !loading && (
        <CollectionEditor
          isEditing={!!editingCollection}
          collectionName={collectionName}
          onNameChange={setCollectionName}
          isActivated={isActivated}
          onActivatedChange={setIsActivated}
          products={products}
          selectedProducts={selectedProducts}
          onToggleProduct={toggleProduct}
          onLoadMore={() => loadProducts(productPage + 1, true)}
          hasMoreProducts={hasMoreProducts}
          loadingProducts={loadingProducts}
          onSubmit={submitCollection}
          onCancel={backToList}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

// ── Collection List ─────────────────────────────────────────────────────────
function CollectionList({ collections, onEdit, onDelete, onToggleActivate, onRefresh }) {
  if (!collections || collections.length === 0) {
    return (
      <div style={{ ...CARD, textAlign: 'center', padding: '60px 40px' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🚀</div>
        <h3 style={{ margin: '0 0 6px', color: '#0f172a', fontWeight: 800 }}>Chưa có bộ sưu tập nào</h3>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
          Bấm "Tạo bộ sưu tập" để bắt đầu tạo bộ sưu tập sản phẩm nổi bật
        </p>
      </div>
    );
  }

  return (
    <div style={{ ...CARD }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
          Danh sách bộ sưu tập ({collections.length})
        </h3>
        <button onClick={onRefresh} style={{ ...BTN_SECONDARY, padding: '6px 14px', fontSize: '0.78rem' }}>
          🔄 Làm mới
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {collections.map((col, i) => {
          const itemCount = col.item_count || col.items?.length || col.item_id_list?.length || 0;
          const isActive = col.is_activated;
          return (
            <div key={col.top_picks_id || i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', borderRadius: 12, border: '1px solid #e5e7eb',
              background: '#fafafa', transition: 'border-color 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, background: '#fff7ed', border: '1px solid #fed7aa',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
                }}>🚀</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>
                    {col.name || `Bộ sưu tập ${col.top_picks_id}`}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={BADGE(
                      isActive ? '#16a34a' : '#64748b',
                      isActive ? '#f0fdf4' : '#f8fafc',
                    )}>
                      {isActive ? '🟢 Đang hoạt động' : '⚪ Không hoạt động'}
                    </span>
                    <span style={BADGE('#475569', '#f1f5f9')}>
                      📦 {itemCount} sản phẩm
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* Toggle activate */}
                <div
                  onClick={() => onToggleActivate(col)}
                  title={isActive ? 'Tắt bộ sưu tập' : 'Kích hoạt bộ sưu tập'}
                  style={{
                    width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
                    background: isActive ? '#ea580c' : '#d1d5db', position: 'relative',
                    transition: 'background 0.2s', flexShrink: 0,
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 2,
                    left: isActive ? 22 : 2,
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </div>
                <button onClick={() => onEdit(col)} style={{ ...BTN_SECONDARY, padding: '6px 14px', fontSize: '0.76rem' }}>
                  ✏️ Sửa
                </button>
                <button onClick={() => onDelete(col.top_picks_id)} style={{ ...BTN_DANGER, padding: '6px 14px', fontSize: '0.76rem' }}>
                  🗑️ Xóa
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Collection Editor (Create / Edit) ───────────────────────────────────────
function CollectionEditor({
  isEditing, collectionName, onNameChange, isActivated, onActivatedChange,
  products, selectedProducts, onToggleProduct, onLoadMore, hasMoreProducts,
  loadingProducts, onSubmit, onCancel,
}) {
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
    <div>
      {/* Collection Info Card */}
      <div style={{ ...CARD, marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
          {isEditing ? '✏️ Chỉnh sửa bộ sưu tập' : '✨ Tạo bộ sưu tập mới'}
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: '#64748b' }}>
          {isEditing
            ? 'Cập nhật tên và sản phẩm trong bộ sưu tập'
            : 'Đặt tên và chọn sản phẩm cho bộ sưu tập mới'}
        </p>

        {/* Name input */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: 6 }}>
            Tên bộ sưu tập
          </label>
          <input
            type="text"
            value={collectionName}
            onChange={e => onNameChange(e.target.value)}
            placeholder="Nhập tên bộ sưu tập..."
            style={{ ...INPUT, maxWidth: 500 }}
          />
        </div>

        {/* Activation toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>
            Trạng thái:
          </label>
          <div
            onClick={() => onActivatedChange(!isActivated)}
            style={{
              width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
              background: isActivated ? '#ea580c' : '#d1d5db', position: 'relative',
              transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: '50%', background: '#fff',
              position: 'absolute', top: 2,
              left: isActivated ? 22 : 2,
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </div>
          <span style={{
            fontSize: '0.82rem', fontWeight: 600,
            color: isActivated ? '#16a34a' : '#64748b',
          }}>
            {isActivated ? 'Đang hoạt động' : 'Không hoạt động'}
          </span>
        </div>
      </div>

      {/* Product Selector Card */}
      <div style={{ ...CARD, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
              🛍️ Chọn sản phẩm ({selectedProducts.length} đã chọn)
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
              Chọn các sản phẩm muốn thêm vào bộ sưu tập
            </p>
          </div>
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

        {/* Selected products summary */}
        {selectedProducts.length > 0 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 8,
            padding: '12px 16px', background: '#fff7ed', borderRadius: 12,
            border: '1px solid #fed7aa', marginBottom: 16,
          }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#9a3412', alignSelf: 'center' }}>
              Đã chọn:
            </span>
            {selectedProducts.map(p => (
              <div key={p.item_id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px 4px 6px', borderRadius: 20,
                background: '#fff', border: '1px solid #fed7aa', fontSize: '0.72rem',
                fontWeight: 600, color: '#0f172a',
              }}>
                {p.image?.image_url_list?.[0] && (
                  <img src={p.image.image_url_list[0]} alt="" style={{
                    width: 18, height: 18, borderRadius: 4, objectFit: 'cover',
                  }} />
                )}
                <span style={{
                  maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {p.item_name || `SP ${p.item_id}`}
                </span>
                <span
                  onClick={() => onToggleProduct(p)}
                  style={{ cursor: 'pointer', color: '#dc2626', fontWeight: 800, fontSize: '0.8rem', marginLeft: 2 }}
                >
                  ×
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Product Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filtered.map(product => {
            const selected = isSelected(product.item_id);
            return (
              <div
                key={product.item_id}
                onClick={() => onToggleProduct(product)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                  border: selected ? '2px solid #ea580c' : '2px solid #e5e7eb',
                  background: selected ? '#fff7ed' : '#fff',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = '#fed7aa'; }}
                onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = selected ? '#ea580c' : '#e5e7eb'; }}
              >
                {/* Checkbox */}
                <div style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  border: selected ? '2px solid #ea580c' : '2px solid #d1d5db',
                  background: selected ? '#ea580c' : '#fff',
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
                      <span style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: 600 }}>
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
        {hasMoreProducts && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button onClick={onLoadMore} style={{ ...BTN_SECONDARY, fontSize: '0.82rem' }} disabled={loadingProducts}>
              {loadingProducts ? 'Đang tải...' : 'Tải thêm sản phẩm'}
            </button>
          </div>
        )}

        {filtered.length === 0 && !loadingProducts && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
            Không tìm thấy sản phẩm nào
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button style={BTN_SECONDARY} onClick={onCancel}>
          Hủy bỏ
        </button>
        <button
          style={{
            ...BTN_PRIMARY, padding: '12px 32px', fontSize: '0.92rem',
            opacity: (!collectionName.trim() || selectedProducts.length === 0) ? 0.5 : 1,
          }}
          onClick={onSubmit}
          disabled={!collectionName.trim() || selectedProducts.length === 0}
        >
          {isEditing ? '💾 Lưu thay đổi' : '🚀 Tạo bộ sưu tập'}
        </button>
      </div>
    </div>
  );
}
