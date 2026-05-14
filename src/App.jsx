// src/App.jsx

import { useState, useEffect } from 'react';
import { AppDataProvider } from './context/AppDataContext';
import OrderTab from './components/OrderTab';
import ContractTab from './components/ContractTab';
import AirLinksTab from './components/AirLinksTab';
import ExpenseEcomTab from './components/ExpenseEcomTab';
import BookingManagerTab from './components/BookingManagerTab';
import DashboardTab from './components/DashboardTab';
import BookingPerformanceTab from './components/BookingPerformanceTab';
import DataArchiveTab from './components/DataArchiveTab';
import GmvRealtimeTab from './components/GmvRealtimeTab';
import StellaDashboardTab from './components/StellaDashboardTab';
import CSKHTab from './components/CSKHTab';
import LivestreamTab from './components/LivestreamTab';
import LandingOrders from './components/LandingOrders';
import AIChat from './components/AIChat';
import LoginPage, { ROLE_VIEWS } from './components/LoginPage';
import CampRegistrationTab from './components/CampRegistrationTab';
import TaskNoteTab from './components/TaskNoteTab';
import TikTokShopCallback from './components/TikTokShopCallback';
import ListedPriceTab from './components/ListedPriceTab';
import TikTokOrdersTab from './components/TikTokOrdersTab';

const SESSION_KEY = 'sk_session';

function App() {
  if (window.location.pathname === '/tiktok-shop/callback') {
    return <TikTokShopCallback />;
  }

  // ── AUTH STATE — ưu tiên localStorage (ghi nhớ), fallback sessionStorage ──
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY))
          || JSON.parse(sessionStorage.getItem(SESSION_KEY));
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

  if (!user) return <LoginPage onLogin={handleLogin} />;

  const allowedViews = ROLE_VIEWS[user.role] || [];

  // ── MAIN APP ──
  return <AppMain user={user} onLogout={handleLogout} allowedViews={allowedViews} />;
}

function AppMain({ user, onLogout, allowedViews }) {
  const defaultView = allowedViews[0] || 'dashboard';
  const [currentView, setCurrentView]   = useState(defaultView);
  const [openGroups, setOpenGroups]     = useState({ ecom: true, cskh: true, livestream: true, booking: true, archive: true, camp: true, tools: true });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarHovered,   setSidebarHovered]   = useState(false);
  const toggleGroup = (key) => setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));

  const canView = (v) => allowedViews.includes(v);

  const SIDEBAR_WIDTH   = '280px';
  const COLLAPSED_WIDTH = '64px';
  // Sidebar mở ra khi: không collapse, hoặc đang hover
  const isExpanded = !sidebarCollapsed || sidebarHovered;

  // --- STYLES ---
  const sidebarStyle = {
    width: isExpanded ? SIDEBAR_WIDTH : COLLAPSED_WIDTH,
    background: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    position: 'fixed',
    left: 0,
    top: 0,
    zIndex: 1000,
    fontFamily: "'Outfit', sans-serif",
    borderRight: '1px solid #e5e7eb',
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
    background: isActive ? '#fff7ed' : 'transparent',
    borderRadius: '8px',
    color: isActive ? '#c2410c' : '#64748b',
    fontWeight: isActive ? '700' : '500',
    transition: 'background 0.18s ease, color 0.18s ease, border-color 0.18s ease',
    fontSize: '0.83rem',
    border: isActive ? '1px solid #fed7aa' : '1px solid transparent',
    borderLeft: isActive ? '3px solid #ea580c' : '3px solid transparent',
    boxShadow: 'none',
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
      <AIChat />

      <div style={{ display: 'flex' }}>
        {/* --- SIDEBAR --- */}
        <div
          style={sidebarStyle}
          onMouseEnter={() => sidebarCollapsed && setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
        >
          {/* Header — logo + toggle button */}
          <div style={{ padding: isExpanded ? '20px 0' : '20px 0', textAlign: 'center', minHeight: isExpanded ? '110px' : '72px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #e5e7eb', background: '#fff', position: 'relative', transition: 'min-height 0.22s', flexShrink: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isExpanded ? '8px' : '0' }}>
              {/* Logo icon — nút toggle collapse */}
              <div
                onClick={() => { setSidebarCollapsed(p => !p); setSidebarHovered(false); }}
                title={sidebarCollapsed ? 'Mở sidebar' : 'Thu gọn sidebar'}
                style={{ width: '46px', height: '46px', background: '#ea580c', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '900', fontSize: '1.45rem', boxShadow: '0 8px 18px rgba(234,88,12,0.16)', cursor: 'pointer', transition: 'transform 0.18s', userSelect: 'none' }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                {sidebarCollapsed && !sidebarHovered ? '▶' : '✦'}
              </div>
              {/* Text — ẩn khi collapsed */}
              {isExpanded && (
                <>
                  <span style={{ fontSize: '0.75rem', color: '#999', fontStyle: 'italic', letterSpacing: '2px', textTransform: 'uppercase' }}>powered by</span>
                  <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#111827', letterSpacing: '1.4px', textTransform: 'uppercase', lineHeight: '1.1', fontFamily: "'Outfit', sans-serif" }}>
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
                { view: 'stella_dashboard',  icon: '📊', name: 'Stella Dashboard' },
                { view: 'listed_price',      icon: '🏷️', name: 'Bảng giá niêm yết' },
                { view: 'tiktok_orders',     icon: '🛒', name: 'TikTok Shop Orders' },
                { view: 'camp_registration', icon: '🎪', name: 'Đăng Kí Camp' },
              ]},
              { key: 'cskh', label: '📋 CSKH', emoji: '📋', items: [
                { view: 'cskh', icon: '📋', name: 'CSKH' },
              ]},
              { key: 'livestream', label: '🎬 Livestream', emoji: '🎬', items: [
                { view: 'livestream', icon: '🎬', name: 'Livestream' },
              ]},
              { key: 'booking', label: '📅 Booking', emoji: '📅', items: [
                { view: 'dashboard',           icon: '📊', name: 'Phân tích sản phẩm booking' },
                { view: 'order',               icon: '🛒', name: 'Đơn Hàng KOC' },
                { view: 'booking_performance', icon: '📈', name: 'Dashboard booking' },
                { view: 'contract',            icon: '📝', name: 'Hợp Đồng' },
                { view: 'airlinks',            icon: '🔗', name: 'Quản Lý Link Air' },
              ]},
              { key: 'archive', label: '🗄️ Lưu trữ', emoji: '🗄️', items: [
                { view: 'data_archive', icon: '🗄️', name: 'Lưu Trữ Data' },
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
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 2px', fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>
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
                          background: currentView === view ? '#fff7ed' : 'transparent',
                          border: currentView === view ? '1px solid #fed7aa' : '1px solid transparent',
                          fontSize: '1.1rem',
                          transition: 'background 0.15s, border-color 0.15s',
                        }}
                        onMouseEnter={e => { if (currentView !== view) e.currentTarget.style.background = '#f8fafc'; }}
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
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 14px 4px', padding: '10px 12px', cursor: 'pointer', userSelect: 'none', borderRadius: 8, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                    <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#475569', letterSpacing: 0 }}>{group.label}</span>
                    <span style={{ fontSize: '0.7rem', color: '#f97316', transition: 'transform 0.2s', display: 'inline-block', transform: openGroups[group.key] ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                  </div>
                  {openGroups[group.key] && visibleItems.map(({ view, icon, name }) => (
                    <div key={view}
                      style={menuItemStyle(currentView === view)}
                      onClick={() => setCurrentView(view)}
                      onMouseEnter={(e) => { if (currentView !== view) { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#c2410c'; e.currentTarget.style.borderColor = '#e5e7eb'; } }}
                      onMouseLeave={(e) => { if (currentView !== view) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = 'transparent'; } }}>
                      <span>{icon}</span>
                      <span>{name}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* User info + logout */}
          <div style={{ padding: isExpanded ? '12px 14px' : '10px 8px', borderTop: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
            {isExpanded ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', borderRadius: 8, padding: '10px 12px', border: '1px solid #e5e7eb' }}>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ea580c' }}>👤 {user.name}</div>
                  <div style={{ fontSize: '0.68rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{user.role}</div>
                </div>
                <button onClick={onLogout} style={{ padding: '5px 10px', background: '#fff', border: '1px solid #fecaca', borderRadius: 7, color: '#dc2626', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>
                  Đăng xuất
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button onClick={onLogout} title="Đăng xuất" style={{ width: 36, height: 36, borderRadius: 8, background: '#fff', border: '1px solid #fecaca', color: '#dc2626', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ⏻
                </button>
              </div>
            )}
          </div>
        </div>

        {/* --- MAIN CONTENT --- */}
        <div style={mainContentStyle}>

          {/* Tabs render bình thường (mount/unmount theo active) */}
          {currentView === 'dashboard' && <DashboardTab />}
          {currentView === 'order' && <OrderTab />}
          {currentView === 'contract' && <ContractTab />}
          {currentView === 'airlinks' && <AirLinksTab />}
          {currentView === 'expense' && <ExpenseEcomTab />}
          {currentView === 'booking' && <BookingManagerTab />}
          {currentView === 'data_archive' && <DataArchiveTab />}
          {currentView === 'gmv_realtime' && <GmvRealtimeTab />}
          {currentView === 'stella_dashboard' && <StellaDashboardTab />}
          {currentView === 'listed_price' && <ListedPriceTab />}
          {currentView === 'tiktok_orders' && <TikTokOrdersTab />}
          {currentView === 'cskh' && <CSKHTab />}
          {currentView === 'livestream' && <LivestreamTab />}
          {currentView === 'landing_orders' && <LandingOrders />}
          {currentView === 'camp_registration' && <CampRegistrationTab />}
          {currentView === 'task_notes' && <TaskNoteTab />}

          {/* BookingPerformanceTab luôn mounted, chỉ ẩn/hiện bằng display
              → state và data cache không mất khi đổi tab */}
          {canView('booking_performance') && (
            <div style={{ display: currentView === 'booking_performance' ? 'block' : 'none' }}>
              <BookingPerformanceTab />
            </div>
          )}

        </div>
      </div>
    </AppDataProvider>
  );
}

export default App;
