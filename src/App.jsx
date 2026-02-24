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
import AIChat from './components/AIChat';

function App() {
  // Đổi mặc định thành 'dashboard' để mở lên là thấy ngay báo cáo mới
  const [currentView, setCurrentView] = useState('dashboard');

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
    margin: '6px 16px',
    padding: '14px 18px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    background: isActive
      ? 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)'
      : 'transparent',
    borderRadius: '12px',
    color: isActive ? '#fff' : '#666',
    fontWeight: isActive ? '700' : '600',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    height: '50px',
    fontSize: '0.95rem',
    border: isActive ? 'none' : '1px solid transparent',
    boxShadow: isActive ? '0 4px 10px rgba(234, 88, 12, 0.2)' : 'none',
    letterSpacing: '0.3px',
    textTransform: 'uppercase'
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
          <div style={{ flex: 1, paddingTop: '16px', overflowY: 'auto' }}>

            {/* 0. [MỚI] BÁO CÁO TỔNG (DASHBOARD) - Thêm vào đầu tiên */}
            <div
              style={menuItemStyle(currentView === 'dashboard')}
              onClick={() => setCurrentView('dashboard')}
              onMouseEnter={(e) => { if (currentView !== 'dashboard') { e.currentTarget.style.background = '#fff7ed'; e.currentTarget.style.color = '#ea580c'; } }}
              onMouseLeave={(e) => { if (currentView !== 'dashboard') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666'; } }}
            >
              <span>📊</span>
              <span>Dashboard</span>
            </div>

            <div
              style={menuItemStyle(currentView === 'booking_performance')}
              onClick={() => setCurrentView('booking_performance')}
              onMouseEnter={(e) => { if (currentView !== 'booking_performance') { e.currentTarget.style.background = '#fff7ed'; e.currentTarget.style.color = '#ea580c'; } }}
              onMouseLeave={(e) => { if (currentView !== 'booking_performance') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666'; } }}
            >
              <span>📈</span>
              <span>Báo Cáo Hiệu Suất</span>
            </div>

            <div
              style={menuItemStyle(currentView === 'order')}
              onClick={() => setCurrentView('order')}
              onMouseEnter={(e) => { if (currentView !== 'order') { e.currentTarget.style.background = '#fff7ed'; e.currentTarget.style.color = '#ea580c'; } }}
              onMouseLeave={(e) => { if (currentView !== 'order') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666'; } }}
            >
              <span>🛒</span>
              <span>Đơn Hàng KOC</span>
            </div>

            <div
              style={menuItemStyle(currentView === 'airlinks')}
              onClick={() => setCurrentView('airlinks')}
              onMouseEnter={(e) => { if (currentView !== 'airlinks') { e.currentTarget.style.background = '#fff7ed'; e.currentTarget.style.color = '#ea580c'; } }}
              onMouseLeave={(e) => { if (currentView !== 'airlinks') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666'; } }}
            >
              <span>🔗</span>
              <span>Quản Lý Link Air</span>
            </div>

            <div
              style={menuItemStyle(currentView === 'booking')}
              onClick={() => setCurrentView('booking')}
              onMouseEnter={(e) => { if (currentView !== 'booking') { e.currentTarget.style.background = '#fff7ed'; e.currentTarget.style.color = '#ea580c'; } }}
              onMouseLeave={(e) => { if (currentView !== 'booking') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666'; } }}
            >
              <span>📅</span>
              <span>Booking Manager</span>
            </div>

            <div
              style={menuItemStyle(currentView === 'contract')}
              onClick={() => setCurrentView('contract')}
              onMouseEnter={(e) => { if (currentView !== 'contract') { e.currentTarget.style.background = '#fff7ed'; e.currentTarget.style.color = '#ea580c'; } }}
              onMouseLeave={(e) => { if (currentView !== 'contract') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666'; } }}
            >
              <span>📝</span>
              <span>Hợp Đồng</span>
            </div>

            <div
              style={menuItemStyle(currentView === 'expense')}
              onClick={() => setCurrentView('expense')}
              onMouseEnter={(e) => { if (currentView !== 'expense') { e.currentTarget.style.background = '#fff7ed'; e.currentTarget.style.color = '#ea580c'; } }}
              onMouseLeave={(e) => { if (currentView !== 'expense') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666'; } }}
            >
              <span>💸</span>
              <span>Ngân Sách Ecom</span>
            </div>

            <div
              style={menuItemStyle(currentView === 'data_archive')}
              onClick={() => setCurrentView('data_archive')}
              onMouseEnter={(e) => { if (currentView !== 'data_archive') { e.currentTarget.style.background = '#fff7ed'; e.currentTarget.style.color = '#ea580c'; } }}
              onMouseLeave={(e) => { if (currentView !== 'data_archive') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666'; } }}
            >
              <span>🗄️</span>
              <span>Lưu Trữ Data</span>
            </div>
            {/* LIGHT COUNTDOWN WIDGET */}
            <div style={{ margin: '16px', padding: '18px', background: '#fff7ed', borderRadius: '16px', border: '1px solid #fed7aa', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🎉</div>
              <div style={{ fontSize: '0.75rem', color: '#ea580c', marginBottom: '8px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase' }}>Launch Countdown</div>
              <div style={{ fontSize: '1.1rem', color: '#ea580c', fontWeight: '700' }}>
                <span style={{ fontSize: '2rem', fontWeight: '900', color: '#ea580c' }}>{diffDays}</span> days
              </div>
              <div style={{ fontSize: '0.8rem', color: '#999', fontWeight: '500', marginTop: '5px' }}>until TẾT 2026 🐎</div>
            </div>
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

        </div>
      </div>
    </AppDataProvider>
  );
}

export default App;