// src/App.jsx

import { useState, useEffect, Component, lazy, Suspense } from 'react';
import { AppDataProvider } from './context/AppDataContext';
import RunnerLoader from './components/RunnerLoader';
import { supabase } from './supabaseClient';
// Giữ EAGER: cần ngay khi vào trang / có named export dùng đồng bộ
import LoginPage, { ROLE_VIEWS, ACCOUNTS } from './components/LoginPage';
import TikTokShopCallback from './components/TikTokShopCallback';
import PublicLandingPage from './components/PublicLandingPage';
import CompanySite from './components/CompanySite';

// LAZY-LOAD: chỉ tải code của tab khi người dùng mở tab đó → bundle lần đầu nhẹ hơn nhiều
const OrderTab = lazy(() => import('./components/OrderTab'));
const ContractTab = lazy(() => import('./components/ContractTab'));
const AirLinksTab = lazy(() => import('./components/AirLinksTab'));
const ExpenseEcomTab = lazy(() => import('./components/ExpenseEcomTab'));
const BookingManagerTab = lazy(() => import('./components/BookingManagerTab'));
const DashboardTab = lazy(() => import('./components/DashboardTab'));
const BookingPerformanceTab = lazy(() => import('./components/BookingPerformanceTab'));
const BookingStaffReportTab = lazy(() => import('./components/BookingStaffReportTab'));
const KocPerformanceTab = lazy(() => import('./components/KocPerformanceTab'));
const KocBlacklistTab = lazy(() => import('./components/KocBlacklistTab'));
const KocPaymentTab = lazy(() => import('./components/KocPaymentTab'));
const BookingMaterialTab = lazy(() => import('./components/BookingMaterialTab'));
const BookingBudgetTab = lazy(() => import('./components/BookingBudgetTab'));
const KocHuntTab = lazy(() => import('./components/KocHuntTab'));
const DataArchiveTab = lazy(() => import('./components/DataArchiveTab'));
const NhanhProductsTab = lazy(() => import('./components/NhanhProductsTab'));
const GmvRealtimeTab = lazy(() => import('./components/GmvRealtimeTab'));
const StellaDashboardTab = lazy(() => import('./components/StellaDashboardTab'));
const CSKHTab = lazy(() => import('./components/CSKHTab'));
const LivestreamTab = lazy(() => import('./components/LivestreamTab'));
const LiveAiHubTab = lazy(() => import('./components/LiveAiHubTab')); // gom M4 + M5 + Studio
const LandingOrders = lazy(() => import('./components/LandingOrders'));
const AIChat = lazy(() => import('./components/AIChat'));
const CampRegistrationTab = lazy(() => import('./components/CampRegistrationTab'));
const TaskNoteTab = lazy(() => import('./components/TaskNoteTab'));
const ListedPriceTab = lazy(() => import('./components/ListedPriceTab'));
const TikTokOrdersTab = lazy(() => import('./components/TikTokOrdersTab'));
const CostingTab = lazy(() => import('./components/CostingTab'));
const CrmTab = lazy(() => import('./components/CrmTab'));
const ShopAnalyticsTab = lazy(() => import('./components/ShopAnalyticsTab'));
const ReportTab = lazy(() => import('./components/ReportTab'));
const FlashSaleTab = lazy(() => import('./components/FlashSaleTab'));
const TopPicksTab = lazy(() => import('./components/TopPicksTab'));
const ReviewsTab = lazy(() => import('./components/ReviewsTab'));
const ShopeeAdsDashboard = lazy(() => import('./components/ShopeeAdsDashboard'));
const ShopeeAutoReplyTab = lazy(() => import('./components/ShopeeAutoReplyTab'));

const SESSION_KEY = 'sk_session';

// Lưới an toàn: lỗi render trong 1 tab chỉ hiện báo lỗi tại chỗ, không kéo trắng cả app.
class AppErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('[App ErrorBoundary]', error, info?.componentStack); }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', fontFamily: "'Outfit', sans-serif", maxWidth: 560, margin: '40px auto' }}>
        <div style={{ fontSize: '2.6rem', marginBottom: 14 }}>⚠️</div>
        <h2 style={{ margin: '0 0 8px', fontWeight: 800, color: '#dc2626', fontSize: '1.2rem' }}>Mục này gặp lỗi</h2>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: 6 }}>Phần còn lại của web vẫn dùng bình thường. Thử lại hoặc tải lại trang.</p>
        <p style={{ color: '#94a3b8', fontSize: '0.78rem', marginBottom: 20, wordBreak: 'break-word' }}>{this.state.error?.message || 'Unknown error'}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={() => this.setState({ hasError: false, error: null })}
            style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>🔄 Thử lại</button>
          <button onClick={() => window.location.reload()}
            style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: '#ff6a2c', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>↻ Tải lại trang</button>
        </div>
      </div>
    );
  }
}

// Spinner nhẹ hiển thị trong lúc code của 1 tab (lazy) đang được tải
function TabLoadingFallback() {
  return (
    <div style={{ padding: '40px 24px', fontFamily: "'Outfit', sans-serif" }}>
      <RunnerLoader label="Đang tải…" />
    </div>
  );
}

function App() {
  // Domain công ty (appcash.app) → web doanh nghiệp công khai (cho TikTok Business API),
  // tách hẳn tool nội bộ ở stellakinetics.space / koc-tool.vercel.app.
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('appcash.app')) {
    return <CompanySite />;
  }
  if (window.location.pathname === '/tiktok-shop/callback') {
    return <TikTokShopCallback />;
  }

  // ── AUTH STATE — ưu tiên localStorage (ghi nhớ), fallback sessionStorage ──
  const [user, setUser] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SESSION_KEY))
          || JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (!saved) return null;
      // Đồng bộ lại role/name từ ACCOUNTS theo username — role có thể đã được nâng cấp
      // sau lần đăng nhập trước (vd: thêm quyền 'đề xuất gán' cho ecom). Không bắt đăng nhập lại.
      const fresh = ACCOUNTS.find(a => a.username === saved.username);
      return fresh ? { ...saved, role: fresh.role, name: fresh.name } : saved;
    } catch { return null; }
  });

  const handleLogin = (account, remember) => {
    if (remember) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(account));
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(account));
      localStorage.removeItem(SESSION_KEY);
    }
    setUser(account);
  };
  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  const [showLogin, setShowLogin] = useState(false);

  if (!user && !showLogin) return <PublicLandingPage onGoLogin={() => setShowLogin(true)} />;
  if (!user) return <LoginPage onLogin={handleLogin} />;

  const allowedViews = ROLE_VIEWS[user.role] || [];

  // ── MAIN APP ──
  return <AppMain user={user} onLogout={handleLogout} allowedViews={allowedViews} />;
}

function AppMain({ user, onLogout, allowedViews }) {
  const defaultView = allowedViews[0] || 'dashboard';
  const [currentView, setCurrentView]   = useState(defaultView);
  const [openGroups, setOpenGroups]     = useState({ shopee: true, tiktok: true, ecom: true, crm: true, cskh: true, livestream: true, booking: true, archive: true, camp: true, tools: true });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarHovered,   setSidebarHovered]   = useState(false);
  const [pwModalOpen, setPwModalOpen]   = useState(false);
  const toggleGroup = (key) => setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));

  const canView = (v) => allowedViews.includes(v);

  // ── Force-logout polling: Admin đổi password → bump force_logout_at → mọi user khác bị kick ──
  useEffect(() => {
    const loginAt = user?.login_at ? new Date(user.login_at).getTime() : 0;
    if (!loginAt) return;

    let cancelled = false;
    const check = async () => {
      try {
        const { data, error } = await supabase
          .from('app_security')
          .select('value')
          .eq('key', 'force_logout_at')
          .maybeSingle();
        if (cancelled || error || !data?.value) return;
        const forceAt = new Date(data.value).getTime();
        if (Number.isFinite(forceAt) && forceAt > loginAt) {
          // Admin đang đổi password → user khác phải logout (admin được miễn)
          if (user.role !== 'admin') {
            alert('⚠️ Phiên đăng nhập đã hết hạn (Admin đã đổi mật khẩu). Vui lòng đăng nhập lại.');
            onLogout();
          }
        }
      } catch { /* silent */ }
    };
    // Kiểm tra ngay khi mount + định kỳ 20s
    check();
    const id = setInterval(check, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user?.login_at, user?.role, onLogout]);

  const SIDEBAR_WIDTH   = '280px';
  const COLLAPSED_WIDTH = '64px';
  // Sidebar mở ra khi: không collapse, hoặc đang hover
  const isExpanded = !sidebarCollapsed || sidebarHovered;

  // --- STYLES ---
  const sidebarStyle = {
    width: isExpanded ? SIDEBAR_WIDTH : COLLAPSED_WIDTH,
    background: 'linear-gradient(170deg, #ff8c42 0%, #ff6a2c 45%, #f5591a 100%)',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    position: 'fixed',
    left: 0,
    top: 0,
    zIndex: 1000,
    fontFamily: "'Outfit', sans-serif",
    borderRight: 'none',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: (sidebarCollapsed && sidebarHovered)
      ? '6px 0 24px rgba(15,23,42,0.13)'
      : '1px 0 0 rgba(15,23,42,0.02)',
  };

  const menuItemStyle = (isActive) => ({
    justifyContent: 'flex-start',
    margin: '2px 14px',
    padding: '10px 12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: isActive ? '#ffffff' : 'transparent',
    borderRadius: '8px',
    color: isActive ? '#f0560f' : 'rgba(255,255,255,0.92)',
    fontWeight: isActive ? '700' : '500',
    transition: 'background 0.18s ease, color 0.18s ease, border-color 0.18s ease',
    fontSize: '0.83rem',
    border: '1px solid transparent',
    borderLeft: '3px solid transparent',
    boxShadow: isActive ? '0 4px 12px rgba(0,0,0,0.14)' : 'none',
    letterSpacing: 0,
  });

  const mainContentStyle = {
    marginLeft: sidebarCollapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH,
    background: '#f6f7f9',
    minHeight: '100vh',
    padding: '28px 32px',
    position: 'relative',
    flex: 1,
    transition: 'margin-left 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
  };

  // --- TET COUNTDOWN LOGIC ---
  const today = new Date();
  const tetDate = new Date('2026-02-17T00:00:00'); // Mùng 1 Tết Bính Ngọ 2026
  const diffTime = tetDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return (
    <AppDataProvider>
      <Suspense fallback={null}><AIChat /></Suspense>

      <div style={{ display: 'flex' }}>
        {/* --- SIDEBAR --- */}
        <div
          style={sidebarStyle}
          onMouseEnter={() => sidebarCollapsed && setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
        >
          {/* Header — logo + toggle button */}
          <div style={{ padding: isExpanded ? '20px 0' : '20px 0', textAlign: 'center', minHeight: isExpanded ? '110px' : '72px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid rgba(255,255,255,0.18)', background: 'transparent', position: 'relative', transition: 'min-height 0.22s', flexShrink: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isExpanded ? '8px' : '0' }}>
              {/* Logo icon — nút toggle collapse */}
              <div
                onClick={() => { setSidebarCollapsed(p => !p); setSidebarHovered(false); }}
                title={sidebarCollapsed ? 'Mở sidebar' : 'Thu gọn sidebar'}
                style={{ width: '46px', height: '46px', background: '#ffffff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff6a2c', fontWeight: '900', fontSize: '1.45rem', boxShadow: '0 6px 16px rgba(0,0,0,0.20)', cursor: 'pointer', transition: 'transform 0.18s', userSelect: 'none' }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                {sidebarCollapsed && !sidebarHovered ? '▶' : '✦'}
              </div>
              {/* Text — ẩn khi collapsed */}
              {isExpanded && (
                <>
                  <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.85)', fontStyle: 'italic', letterSpacing: '2px', textTransform: 'uppercase' }}>powered by</span>
                  <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#ffffff', letterSpacing: '1.4px', textTransform: 'uppercase', lineHeight: '1.1', fontFamily: "'Outfit', sans-serif" }}>
                    STELLA KINETICS
                  </h2>
                </>
              )}
            </div>
          </div>

          {/* Menu Items */}
          <div style={{ flex: 1, paddingTop: '8px', overflowY: 'auto', overflowX: 'hidden' }}>
            {[
              { key: 'ecom', label: '🛍️ Ecom', emoji: '🛍️', items: [
                { view: 'shop_analytics',    icon: '📊', name: 'Dashboard Ecom' },
                { view: 'overview_report',   icon: '📈', name: 'Báo cáo tổng quan' },
                { view: 'listed_price',      icon: '🏷️', name: 'Bảng giá niêm yết' },
                { view: 'costing',           icon: '💰', name: 'Giá Cost' },
              ]},
              { key: 'shopee', label: '🟠 Shopee', emoji: '🟠', items: [
                { view: 'shopee_database',      icon: '🗄️', name: 'Database' },
                { view: 'shopee_ads_dashboard', icon: '📊', name: 'Dashboard' },
                { view: 'flash_sale',           icon: '⚡', name: 'Module 1: Đăng kí Flashsale in shop' },
                { view: 'top_picks',            icon: '🚀', name: 'Module 2: Đẩy sản phẩm' },
                // { view: 'shopee_livestream', icon: '📺', name: 'Livestream' }, // tạm ẩn — chờ setup tài khoản Creator cho Shopee Video/Live
                { view: 'shopee_autoreply',     icon: '💬', name: 'Module 3: Trả lời đánh giá khách hàng tự động' },
                { view: 'shopee_live_ai',       icon: '🤖', name: 'Live AI (kho câu hỏi · xưởng clip · studio)' },
              ]},
              { key: 'tiktok', label: '🎵 TikTok', emoji: '🎵', items: [
                { view: 'camp_registration', icon: '🎪', name: 'Đăng Kí Camp' },
              ]},
              { key: 'crm', label: '👥 CRM', emoji: '👥', items: [
                { view: 'crm', icon: '👥', name: 'CRM' },
              ]},
              { key: 'cskh', label: '📋 CSKH', emoji: '📋', items: [
                { view: 'cskh', icon: '📋', name: 'CSKH' },
                { view: 'reviews', icon: '⭐', name: 'Đánh giá sàn' },
              ]},
              { key: 'livestream', label: '🎬 Livestream', emoji: '🎬', items: [
                { view: 'livestream', icon: '🎬', name: 'Livestream' },
              ]},
              { key: 'booking', label: '📅 Booking', emoji: '📅', items: [
                { view: 'koc_performance',     icon: '🌟', name: 'Hiệu suất KOC' },
                { view: 'booking_performance', icon: '📈', name: 'Dashboard booking' },
                { view: 'staff_report',        icon: '📑', name: 'Báo cáo nhân sự' },
                { view: 'order',               icon: '🛒', name: 'Module 1: Order đơn hàng' },
                { view: 'contract',            icon: '📝', name: 'Module 2: Hợp đồng tự động' },
                { view: 'koc_payment',         icon: '💸', name: 'Module 3: Thanh toán KOC' },
                { view: 'booking_material',    icon: '🎁', name: 'Module 4: Material bán hàng' },
                { view: 'airlinks',            icon: '🔗', name: 'Module 5: Quản lý link air' },
                { view: 'koc_blacklist',       icon: '🚫', name: 'Module 6: Blacklist KOC' },
                { view: 'booking_budget',      icon: '💰', name: 'Tạm đối chiếu' },
                { view: 'koc_hunt',            icon: '🔍', name: 'Module 8: Săn KOC (Marketplace)' },
              ]},
              { key: 'archive', label: '🗄️ Lưu trữ', emoji: '🗄️', items: [
                { view: 'data_archive', icon: '🗄️', name: 'Lưu Trữ Data' },
                { view: 'nhanh_products', icon: '📦', name: 'File Nhanh' },
                { view: 'expense',      icon: '💸', name: 'Ngân Sách Ecom' },
              ]},
              { key: 'tools', label: '🛠️ Công Cụ', emoji: '🛠️', items: [
                { view: 'task_notes', icon: '📝', name: 'Task & Notes' },
              ]},
            ].map(group => {
              const visibleItems = group.items.filter(i => canView(i.view));
              if (visibleItems.length === 0) return null;
              const groupHasActive = visibleItems.some(i => i.view === currentView);

              if (!isExpanded) {
                // ── Collapsed mode: chỉ hiện icon group + icon items ──
                return (
                  <div key={group.key} style={{ marginBottom: 2 }}>
                    {/* Group emoji */}
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 2px', fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)', fontWeight: 700 }}>
                      <span title={group.label} style={{ fontSize: '1rem' }}>{group.emoji}</span>
                    </div>
                    {/* Items — icon only */}
                    {visibleItems.map(({ view, icon, name }) => (
                      <div key={view}
                        title={name}
                        onClick={() => setCurrentView(view)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          margin: '2px 8px', padding: '9px 0',
                          borderRadius: 8, cursor: 'pointer',
                          background: currentView === view ? '#ffffff' : 'transparent',
                          border: currentView === view ? '1px solid #ffffff' : '1px solid transparent',
                          fontSize: '1.1rem',
                          transition: 'background 0.15s, border-color 0.15s',
                        }}
                        onMouseEnter={e => { if (currentView !== view) e.currentTarget.style.background = 'rgba(255,255,255,0.16)'; }}
                        onMouseLeave={e => { if (currentView !== view) e.currentTarget.style.background = 'transparent'; }}
                      >
                        {icon}
                      </div>
                    ))}
                  </div>
                );
              }

              // ── Expanded mode: full labels ──
              return (
                <div key={group.key} style={{ marginBottom: 4 }}>
                  <div onClick={() => toggleGroup(group.key)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 14px 4px', padding: '10px 12px', cursor: 'pointer', userSelect: 'none', borderRadius: 8, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.24)' }}>
                    <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#ffffff', letterSpacing: 0 }}>{group.label}</span>
                    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.85)', transition: 'transform 0.2s', display: 'inline-block', transform: openGroups[group.key] ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                  </div>
                  {openGroups[group.key] && visibleItems.map(({ view, name }) => (
                    <div key={view}
                      style={menuItemStyle(currentView === view)}
                      onClick={() => setCurrentView(view)}
                      onMouseEnter={(e) => { if (currentView !== view) { e.currentTarget.style.background = 'rgba(255,255,255,0.16)'; e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.borderColor = 'transparent'; } }}
                      onMouseLeave={(e) => { if (currentView !== view) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.92)'; e.currentTarget.style.borderColor = 'transparent'; } }}>
                      <span style={{ display: 'inline-block', width: 16, textAlign: 'center', opacity: 0.4, flexShrink: 0 }}>•</span>
                      <span>{name}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* User info + logout */}
          <div style={{ padding: isExpanded ? '12px 14px' : '10px 8px', borderTop: '1px solid rgba(255,255,255,0.18)', background: 'rgba(0,0,0,0.06)', flexShrink: 0 }}>
            {isExpanded ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.16)', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.28)' }}>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ffffff' }}>👤 {user.name}</div>
                  <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.78)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{user.role}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {user.role === 'admin' && (
                    <button onClick={() => setPwModalOpen(true)} title="Đổi mật khẩu (sẽ thu hồi phiên của các tài khoản khác)"
                      style={{ padding: '5px 9px', background: '#fff', border: '1px solid #fed7aa', borderRadius: 7, color: '#e85518', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>
                      🔐
                    </button>
                  )}
                  <button onClick={onLogout} style={{ padding: '5px 10px', background: '#fff', border: '1px solid #fecaca', borderRadius: 7, color: '#dc2626', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>
                    Đăng xuất
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                {user.role === 'admin' && (
                  <button onClick={() => setPwModalOpen(true)} title="Đổi mật khẩu"
                    style={{ width: 36, height: 36, borderRadius: 8, background: '#fff', border: '1px solid #fed7aa', color: '#e85518', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    🔐
                  </button>
                )}
                <button onClick={onLogout} title="Đăng xuất" style={{ width: 36, height: 36, borderRadius: 8, background: '#fff', border: '1px solid #fecaca', color: '#dc2626', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ⏻
                </button>
              </div>
            )}
          </div>
        </div>

        {/* --- MAIN CONTENT --- */}
        <div style={mainContentStyle}>

          {/* Tabs render bình thường (mount/unmount theo active).
              Bọc Error Boundary key theo view → đổi tab là reset, 1 tab lỗi không kéo trắng cả app. */}
          <AppErrorBoundary key={currentView}>
          <Suspense fallback={<TabLoadingFallback />}>
          {currentView === 'dashboard' && <DashboardTab />}
          {currentView === 'staff_report' && <BookingStaffReportTab />}
          {currentView === 'order' && <OrderTab currentUser={user} />}
          {currentView === 'contract' && <ContractTab />}
          {currentView === 'airlinks' && <AirLinksTab currentUser={user} />}
          {currentView === 'booking_material' && <BookingMaterialTab />}
          {currentView === 'booking_budget' && <BookingBudgetTab />}
          {currentView === 'koc_hunt' && <KocHuntTab currentUser={user} />}
          {currentView === 'expense' && <ExpenseEcomTab />}
          {currentView === 'booking' && <BookingManagerTab />}
          {currentView === 'data_archive' && <DataArchiveTab />}
          {currentView === 'nhanh_products' && <NhanhProductsTab />}
          {currentView === 'gmv_realtime' && <GmvRealtimeTab />}
          {currentView === 'stella_dashboard' && <StellaDashboardTab />}
          {currentView === 'listed_price' && <ListedPriceTab user={user} />}
          {currentView === 'costing' && <CostingTab />}
          {currentView === 'tiktok_orders' && <TikTokOrdersTab />}
          {currentView === 'cskh' && <CSKHTab />}
          {currentView === 'livestream' && <LivestreamTab />}
          {currentView === 'landing_orders' && <LandingOrders />}
          {currentView === 'camp_registration' && <CampRegistrationTab />}
          {currentView === 'task_notes' && <TaskNoteTab />}
          {currentView === 'crm' && <CrmTab />}
          {currentView === 'koc_blacklist' && <KocBlacklistTab />}
          {currentView === 'koc_payment' && <KocPaymentTab />}
          {currentView === 'koc_performance' && <KocPerformanceTab />}
          {currentView === 'shop_analytics' && <ShopAnalyticsTab />}
          {currentView === 'overview_report' && <ReportTab />}
          {currentView === 'flash_sale' && <FlashSaleTab />}
          {currentView === 'top_picks' && <TopPicksTab />}
          {currentView === 'reviews' && <ReviewsTab />}
          {currentView === 'shopee_livestream' && (
            <ComingSoonPlaceholder icon="📺" title="Shopee Livestream" description="Quản lý phiên livestream, theo dõi GMV, đơn hàng, người xem trực tiếp" />
          )}
          {currentView === 'shopee_ads_dashboard' && (
            <>
              <ShopAnalyticsTab lockPlatform="shopee" />
              <ShopeeAdsDashboard />
            </>
          )}
          {currentView === 'shopee_autoreply' && <ShopeeAutoReplyTab />}
          {currentView === 'shopee_database' && (
            <ComingSoonPlaceholder icon="🗄️" title="Database Shopee" description="Đang bảo trì — sẽ cập nhật sau" />
          )}
          {currentView === 'shopee_live_ai' && <LiveAiHubTab />}
          {/* view cũ (bookmark/localStorage) vẫn vào đúng tab con tương ứng */}
          {currentView === 'shopee_clip_factory' && <LiveAiHubTab initial="factory" />}
          {currentView === 'shopee_live_studio' && <LiveAiHubTab initial="studio" />}
          </Suspense>
          </AppErrorBoundary>

          {/* BookingPerformanceTab luôn mounted, chỉ ẩn/hiện bằng display
              → state và data cache không mất khi đổi tab */}
          {canView('booking_performance') && (
            <div style={{ display: currentView === 'booking_performance' ? 'block' : 'none' }}>
              <AppErrorBoundary>
                <Suspense fallback={<TabLoadingFallback />}>
                  <BookingPerformanceTab currentUser={user} />
                </Suspense>
              </AppErrorBoundary>
            </div>
          )}

        </div>
      </div>

      {/* Admin Password Change Modal */}
      {pwModalOpen && user.role === 'admin' && (
        <AdminPasswordModal onClose={() => setPwModalOpen(false)} onLogout={onLogout} />
      )}
    </AppDataProvider>
  );
}

// ── Coming Soon Placeholder ────────────────────────────────────────
function ComingSoonPlaceholder({ icon, title, description }) {
  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 800, margin: '0 auto', textAlign: 'center', padding: '80px 40px' }}>
      <div style={{
        width: 80, height: 80, borderRadius: 20, background: '#fff7ed', border: '2px solid #fed7aa',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.2rem',
        margin: '0 auto 24px', boxShadow: '0 8px 24px rgba(255,106,44,0.1)',
      }}>{icon}</div>
      <h1 style={{ margin: '0 0 8px', fontSize: '1.6rem', fontWeight: 900, color: '#0f172a' }}>{title}</h1>
      <p style={{ margin: '0 0 24px', fontSize: '0.92rem', color: '#64748b', lineHeight: 1.6 }}>{description}</p>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '12px 28px', borderRadius: 12, background: '#f8fafc',
        border: '1.5px solid #e5e7eb', color: '#94a3b8', fontWeight: 700, fontSize: '0.88rem',
      }}>
        🚧 Đang phát triển — Sắp ra mắt
      </div>
      <p style={{ marginTop: 16, fontSize: '0.72rem', color: '#c4b5a0', fontStyle: 'italic' }}>
        Built by Quốc Khánh
      </p>
    </div>
  );
}

// ── Admin Password Change Modal ──────────────────────────────────────
function AdminPasswordModal({ onClose, onLogout }) {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!currentPw || !newPw || !confirmPw) { setError('Vui lòng điền đầy đủ các trường.'); return; }
    if (newPw !== confirmPw)                 { setError('Mật khẩu mới và xác nhận không khớp.'); return; }
    if (newPw.length < 6)                    { setError('Mật khẩu mới phải có ít nhất 6 ký tự.'); return; }

    setLoading(true);
    try {
      // Verify current password from Supabase
      const { data: cur, error: e1 } = await supabase
        .from('app_security')
        .select('value')
        .eq('key', 'admin_password')
        .maybeSingle();
      if (e1) throw e1;
      const currentDbPw = cur?.value || 'Admin@SK2025';
      if (currentDbPw !== currentPw) { setError('Mật khẩu hiện tại không đúng.'); setLoading(false); return; }

      // Update password
      const { error: e2 } = await supabase
        .from('app_security')
        .upsert({ key: 'admin_password', value: newPw, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (e2) throw e2;

      // Bump force_logout_at → kick all other sessions
      const { error: e3 } = await supabase
        .from('app_security')
        .upsert({ key: 'force_logout_at', value: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (e3) throw e3;

      setSuccess('✅ Đổi mật khẩu thành công! Tất cả phiên đăng nhập khác đã bị thu hồi. Bạn sẽ được đăng xuất sau 3 giây.');
      setTimeout(() => { onLogout(); }, 3000);
    } catch (err) {
      console.error(err);
      setError('Lỗi cập nhật mật khẩu: ' + (err.message || 'unknown'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)'
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(440px, 92vw)', background: '#fff', borderRadius: 16,
        padding: '24px 26px', boxShadow: '0 30px 80px rgba(15,23,42,0.3)',
        border: '1px solid #fee2e2', fontFamily: "'Outfit', sans-serif"
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: '#0f172a' }}>🔐 Đổi mật khẩu Admin</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', padding: '10px 12px', borderRadius: 10, marginBottom: 16, fontSize: '0.78rem', color: '#cc4a16' }}>
          ⚠️ Sau khi đổi mật khẩu, <strong>toàn bộ phiên đăng nhập của các tài khoản khác sẽ bị thu hồi</strong> và bạn cũng sẽ phải đăng nhập lại.
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'Mật khẩu hiện tại', value: currentPw, setter: setCurrentPw },
            { label: 'Mật khẩu mới',       value: newPw,     setter: setNewPw    },
            { label: 'Xác nhận mật khẩu mới', value: confirmPw, setter: setConfirmPw },
          ].map((f, i) => (
            <div key={i}>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                {f.label}
              </label>
              <input type="password" value={f.value} onChange={e => f.setter(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8, boxSizing: 'border-box',
                  border: '2px solid #e5e7eb', fontSize: '0.88rem', outline: 'none',
                  fontFamily: 'inherit', transition: 'border 0.2s',
                }}
                onFocus={e => e.target.style.border = '2px solid #ff6a2c'}
                onBlur={e => e.target.style.border = '2px solid #e5e7eb'} />
            </div>
          ))}
          {error && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: '0.78rem', fontWeight: 600 }}>⚠️ {error}</div>}
          {success && <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '8px 12px', color: '#15803d', fontSize: '0.78rem', fontWeight: 600 }}>{success}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: '11px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}>
              Hủy
            </button>
            <button type="submit" disabled={loading || !!success}
              style={{ flex: 1, padding: '11px', borderRadius: 8, border: 'none',
                background: loading || success ? '#d1d5db' : '#ff6a2c',
                color: '#fff', fontWeight: 800, fontSize: '0.86rem',
                cursor: (loading || success) ? 'default' : 'pointer',
                boxShadow: (loading || success) ? 'none' : '0 6px 14px rgba(255,106,44,0.22)' }}>
              {loading ? '⏳ Đang xử lý...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;
