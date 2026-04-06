// src/App.jsx

import { useState } from 'react';
import { AppDataProvider } from './context/AppDataContext';
import OrderTab from './components/OrderTab';
import ContractTab from './components/ContractTab';
import AirLinksTab from './components/AirLinksTab';
import ExpenseEcomTab from './components/ExpenseEcomTab';
import BookingManagerTab from './components/BookingManagerTab';
// [MỚI] Import DashboardTab để sử dụng
import DashboardTab from './components/DashboardTab';
import BookingPerformanceTab from './components/BookingPerformanceTab';
import DataArchiveTab from './components/DataArchiveTab'; // [MỚI] Thêm DataArchiveTab
import GmvRealtimeTab from './components/GmvRealtimeTab'; // [MỚI] Tab GMV Realtime
import StellaDashboardTab from './components/StellaDashboardTab'; // [MỚI] Tab Dashboard Stella
import CSKHTab from './components/CSKHTab'; // [MỚI] Tab CSKH Đánh giá
// ReportCSTab is now imported inside CSKHTab
import LivestreamTab from './components/LivestreamTab'; // [MỚI] Tab Livestream
import LandingOrders from './components/LandingOrders'; // [MỚI] Tab Đơn hàng Landing Page
import AIChat from './components/AIChat';

function App() {
  // Đổi mặc định thành 'dashboard' để mở lên là thấy ngay báo cáo mới
  const [currentView, setCurrentView] = useState('dashboard');
  const [openGroups, setOpenGroups] = useState({ ecom: true, booking: true, archive: true });
  const toggleGroup = (key) => setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));

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
    borderRight: '1px solid #eee',
    whiteSpace: 'nowrap',
    boxShadow: '4px 0 10px rgba(0, 0, 0, 0.05)'
  };

  const menuItemStyle = (isActive) => ({
    justifyContent: 'flex-start',
    margin: '2px 16px 2px 24px',
    padding: '10px 14px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: isActive
      ? 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)'
      : 'transparent',
    borderRadius: '10px',
    color: isActive ? '#fff' : '#6b7280',
    fontWeight: isActive ? '700' : '500',
    transition: 'all 0.2s',
    fontSize: '0.83rem',
    border: 'none',
    boxShadow: isActive ? '0 3px 8px rgba(234, 88, 12, 0.2)' : 'none',
    letterSpacing: '0.2px',
  });

  const mainContentStyle = {
    marginLeft: SIDEBAR_WIDTH,
    background: '#f9fafb',
    minHeight: '100vh',
    padding: '32px',
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
          <div style={{ padding: '28px 0', textAlign: 'center', minHeight: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #eee' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '50px', height: '50px', background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '900', fontSize: '1.6rem', marginBottom: '5px', boxShadow: '0 4px 10px rgba(234, 88, 12, 0.2)' }}>✦</div>
              <span style={{ fontSize: '0.75rem', color: '#999', fontStyle: 'italic', letterSpacing: '2px', textTransform: 'uppercase' }}>powered by</span>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#ea580c', letterSpacing: '2px', textTransform: 'uppercase', lineHeight: '1.1', fontFamily: "'Outfit', sans-serif" }}>
                STELLA KINETICS
              </h2>
            </div>
          </div>

          {/* Menu Items */}
          <div style={{ flex: 1, paddingTop: '8px', overflowY: 'auto' }}>

            {/* Group label helper */}
            {[
              { key: 'ecom', label: '🛍️ Ecom', items: [
                { view: 'stella_dashboard', icon: '📊', name: 'Stella Dashboard' },
                { view: 'cskh',             icon: '📋', name: 'CSKH' },
                { view: 'livestream',        icon: '🎬', name: 'Livestream' },
              ]},
              { key: 'booking', label: '📅 Booking', items: [
                { view: 'dashboard',           icon: '📊', name: 'Dashboard' },
                { view: 'order',               icon: '🛒', name: 'Đơn Hàng KOC' },
                { view: 'booking_performance', icon: '📈', name: 'Báo Cáo Hiệu Suất' },
                { view: 'contract',            icon: '📝', name: 'Hợp Đồng' },
                { view: 'airlinks',            icon: '🔗', name: 'Quản Lý Link Air' },
                { view: 'booking',             icon: '📅', name: 'Booking Manager' },
              ]},
              { key: 'archive', label: '🗄️ Lưu trữ', items: [
                { view: 'data_archive', icon: '🗄️', name: 'Lưu Trữ Data' },
                { view: 'expense',      icon: '💸', name: 'Ngân Sách Ecom' },
                { view: 'landing_orders', icon: '🛒', name: 'Đơn hàng Landing Page' },
              ]},
            ].map(group => (
              <div key={group.key} style={{ marginBottom: 4 }}>
                {/* Group header — click to toggle */}
                <div
                  onClick={() => toggleGroup(group.key)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 16px 4px', padding: '12px 16px', cursor: 'pointer', userSelect: 'none', borderRadius: 12, background: 'linear-gradient(135deg, #fff7ed, #fef3c7)', border: '1px solid #fed7aa' }}
                >
                  <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#c2410c', letterSpacing: '0.3px' }}>{group.label}</span>
                  <span style={{ fontSize: '0.7rem', color: '#f97316', transition: 'transform 0.2s', display: 'inline-block', transform: openGroups[group.key] ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                </div>
                {/* Items — show/hide */}
                {openGroups[group.key] && group.items.map(({ view, icon, name }) => (
                  <div key={view}
                    style={menuItemStyle(currentView === view)}
                    onClick={() => setCurrentView(view)}
                    onMouseEnter={(e) => { if (currentView !== view) { e.currentTarget.style.background = '#fff7ed'; e.currentTarget.style.color = '#ea580c'; } }}
                    onMouseLeave={(e) => { if (currentView !== view) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666'; } }}
                  >
                    <span>{icon}</span>
                    <span>{name}</span>
                  </div>
                ))}
              </div>
            ))}

          </div>

          <div style={{ padding: '16px', borderTop: '1px solid #eee', fontSize: '0.7rem', color: '#999', fontStyle: 'italic', textAlign: 'center', letterSpacing: '1px', textTransform: 'uppercase' }}>
            v3.0 STELLA KINETICS
          </div>
        </div>

        {/* --- MAIN CONTENT --- */}
        <div style={mainContentStyle}>

          {currentView === 'dashboard' && <DashboardTab />}
          {currentView === 'booking_performance' && <BookingPerformanceTab />}
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

        </div>
      </div>
    </AppDataProvider>
  );
}

export default App;