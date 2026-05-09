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

const SESSION_KEY = 'sk_session';

function App() {
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
  const [currentView, setCurrentView] = useState(defaultView);
  const [openGroups, setOpenGroups] = useState({ ecom: true, cskh: true, livestream: true, booking: true, archive: true, camp: true, tools: true });
  const toggleGroup = (key) => setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));

  const canView = (v) => allowedViews.includes(v);

  // Cấu hình độ rộng Sidebar - FIXED
  const SIDEBAR_WIDTH = '280px';

  // --- STYLES --- LIGHT ORANGE THEME
  const sidebarStyle = {
    width: SIDEBAR_WIDTH,
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
    whiteSpace: 'nowrap',
    boxShadow: '1px 0 0 rgba(15, 23, 42, 0.02)'
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
    marginLeft: SIDEBAR_WIDTH,
    background: '#f6f7f9',
    minHeight: '100vh',
    padding: '28px 32px',
    position: 'relative',
    flex: 1,
    transition: 'margin-left 0.3s ease-in-out'
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
        <div style={sidebarStyle}>
          {/* Header Sidebar - LIGHT ORANGE THEME */}
          <div style={{ padding: '24px 0', textAlign: 'center', minHeight: '110px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '46px', height: '46px', background: '#ea580c', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '900', fontSize: '1.45rem', marginBottom: '4px', boxShadow: '0 8px 18px rgba(234, 88, 12, 0.16)' }}>✦</div>
              <span style={{ fontSize: '0.75rem', color: '#999', fontStyle: 'italic', letterSpacing: '2px', textTransform: 'uppercase' }}>powered by</span>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#111827', letterSpacing: '1.4px', textTransform: 'uppercase', lineHeight: '1.1', fontFamily: "'Outfit', sans-serif" }}>
                STELLA KINETICS
              </h2>
            </div>
          </div>

          {/* Menu Items */}
          <div style={{ flex: 1, paddingTop: '8px', overflowY: 'auto' }}>
            {[
              { key: 'ecom', label: '🛍️ Ecom', items: [
                { view: 'stella_dashboard', icon: '📊', name: 'Stella Dashboard' },
              ]},
              { key: 'cskh', label: '📋 CSKH', items: [
                { view: 'cskh', icon: '📋', name: 'CSKH' },
              ]},
              { key: 'livestream', label: '🎬 Livestream', items: [
                { view: 'livestream', icon: '🎬', name: 'Livestream' },
              ]},
              { key: 'booking', label: '📅 Booking', items: [
                { view: 'dashboard',           icon: '📊', name: 'Dashboard' },
                { view: 'order',               icon: '🛒', name: 'Đơn Hàng KOC' },
                { view: 'booking_performance', icon: '📈', name: 'Báo Cáo Hiệu Suất' },
                { view: 'contract',            icon: '📝', name: 'Hợp Đồng' },
                { view: 'airlinks',            icon: '🔗', name: 'Quản Lý Link Air' },
              ]},
              { key: 'archive', label: '🗄️ Lưu trữ', items: [
                { view: 'data_archive', icon: '🗄️', name: 'Lưu Trữ Data' },
                { view: 'expense',      icon: '💸', name: 'Ngân Sách Ecom' },
              ]},
              { key: 'camp', label: '🛒 Camp TikTok', items: [
                { view: 'camp_registration', icon: '🛒', name: 'Đăng Kí Camp' },
              ]},
              { key: 'tools', label: '🛠️ Công Cụ', items: [
                { view: 'task_notes', icon: '📝', name: 'Task & Notes' },
              ]},
            ].map(group => {
              const visibleItems = group.items.filter(i => canView(i.view));
              if (visibleItems.length === 0) return null;
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
          <div style={{ padding: '12px 14px', borderTop: '1px solid #e5e7eb', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', borderRadius: 8, padding: '10px 12px', border: '1px solid #e5e7eb' }}>
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ea580c' }}>👤 {user.name}</div>
                <div style={{ fontSize: '0.68rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{user.role}</div>
              </div>
              <button onClick={onLogout} style={{ padding: '5px 10px', background: '#fff', border: '1px solid #fecaca', borderRadius: 7, color: '#dc2626', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>
                Đăng xuất
              </button>
            </div>
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
