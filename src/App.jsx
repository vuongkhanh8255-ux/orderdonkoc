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
import AIChat from './components/AIChat';

function App() {
  // Đổi mặc định thành 'dashboard' để mở lên là thấy ngay báo cáo mới
  const [currentView, setCurrentView] = useState('dashboard');

  // Cấu hình độ rộng Sidebar - FIXED
  const SIDEBAR_WIDTH = '280px';

  // --- STYLES --- STELLA KINETICS COSMIC THEME
  const sidebarStyle = {
    width: SIDEBAR_WIDTH,
    background: 'linear-gradient(180deg, #0A1628 0%, #0F2544 50%, #1A3A5C 100%)',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    position: 'fixed',
    left: 0,
    top: 0,
    zIndex: 1000,
    fontFamily: "'Outfit', sans-serif",
    borderRight: '1px solid rgba(0, 212, 255, 0.15)',
    whiteSpace: 'nowrap',
    boxShadow: '4px 0 30px rgba(0, 0, 0, 0.3), 0 0 60px rgba(0, 212, 255, 0.1)'
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
      ? 'linear-gradient(135deg, #00D4FF 0%, #0099CC 100%)'
      : 'transparent',
    borderRadius: '12px',
    color: isActive ? '#0A1628' : 'rgba(255, 255, 255, 0.6)',
    fontWeight: isActive ? '700' : '500',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    height: '50px',
    fontSize: '0.95rem',
    border: isActive ? 'none' : '1px solid transparent',
    boxShadow: isActive ? '0 4px 20px rgba(0, 212, 255, 0.35)' : 'none',
    letterSpacing: '0.3px'
  });

  const mainContentStyle = {
    marginLeft: SIDEBAR_WIDTH,
    background: 'linear-gradient(135deg, #0A1628 0%, #0F2544 50%, #0A1628 100%)',
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
          {/* Header Sidebar - STELLA KINETICS COSMIC THEME */}
          <div style={{ padding: '28px 0', textAlign: 'center', minHeight: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid rgba(0, 212, 255, 0.1)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '50px', height: '50px', background: 'linear-gradient(135deg, #00D4FF 0%, #0099CC 100%)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0A1628', fontWeight: '900', fontSize: '1.6rem', marginBottom: '5px', boxShadow: '0 4px 25px rgba(0, 212, 255, 0.4)' }}>✦</div>
              <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', letterSpacing: '2px', textTransform: 'uppercase' }}>powered by</span>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', background: 'linear-gradient(135deg, #FFFFFF 0%, #00D4FF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '2px', textTransform: 'uppercase', lineHeight: '1.1', fontFamily: "'Space Grotesk', sans-serif" }}>
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
              onMouseEnter={(e) => { if (currentView !== 'dashboard') { e.currentTarget.style.background = 'rgba(0, 212, 255, 0.1)'; e.currentTarget.style.color = '#00D4FF'; e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.3)'; } }}
              onMouseLeave={(e) => { if (currentView !== 'dashboard') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'; e.currentTarget.style.borderColor = 'transparent'; } }}
            >
              <span>📊</span>
              <span>Dashboard</span>
            </div>

            <div
              style={menuItemStyle(currentView === 'booking_performance')}
              onClick={() => setCurrentView('booking_performance')}
              onMouseEnter={(e) => { if (currentView !== 'booking_performance') { e.currentTarget.style.background = 'rgba(0, 212, 255, 0.1)'; e.currentTarget.style.color = '#00D4FF'; e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.3)'; } }}
              onMouseLeave={(e) => { if (currentView !== 'booking_performance') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'; e.currentTarget.style.borderColor = 'transparent'; } }}
            >
              <span>📈</span>
              <span>Dashboard Hiệu Suất</span>
            </div>

            <div
              style={menuItemStyle(currentView === 'order')}
              onClick={() => setCurrentView('order')}
              onMouseEnter={(e) => { if (currentView !== 'order') { e.currentTarget.style.background = 'rgba(0, 212, 255, 0.1)'; e.currentTarget.style.color = '#00D4FF'; e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.3)'; } }}
              onMouseLeave={(e) => { if (currentView !== 'order') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'; e.currentTarget.style.borderColor = 'transparent'; } }}
            >
              <span>🛒</span>
              <span>Đơn Hàng KOC</span>
            </div>

            <div
              style={menuItemStyle(currentView === 'airlinks')}
              onClick={() => setCurrentView('airlinks')}
              onMouseEnter={(e) => { if (currentView !== 'airlinks') { e.currentTarget.style.background = 'rgba(0, 212, 255, 0.1)'; e.currentTarget.style.color = '#00D4FF'; e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.3)'; } }}
              onMouseLeave={(e) => { if (currentView !== 'airlinks') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'; e.currentTarget.style.borderColor = 'transparent'; } }}
            >
              <span>🔗</span>
              <span>Quản Lý Link Air</span>
            </div>

            <div
              style={menuItemStyle(currentView === 'booking')}
              onClick={() => setCurrentView('booking')}
              onMouseEnter={(e) => { if (currentView !== 'booking') { e.currentTarget.style.background = 'rgba(0, 212, 255, 0.1)'; e.currentTarget.style.color = '#00D4FF'; e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.3)'; } }}
              onMouseLeave={(e) => { if (currentView !== 'booking') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'; e.currentTarget.style.borderColor = 'transparent'; } }}
            >
              <span>📅</span>
              <span>Booking Manager</span>
            </div>

            <div
              style={menuItemStyle(currentView === 'contract')}
              onClick={() => setCurrentView('contract')}
              onMouseEnter={(e) => { if (currentView !== 'contract') { e.currentTarget.style.background = 'rgba(0, 212, 255, 0.1)'; e.currentTarget.style.color = '#00D4FF'; e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.3)'; } }}
              onMouseLeave={(e) => { if (currentView !== 'contract') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'; e.currentTarget.style.borderColor = 'transparent'; } }}
            >
              <span>📝</span>
              <span>Hợp Đồng</span>
            </div>

            <div
              style={menuItemStyle(currentView === 'expense')}
              onClick={() => setCurrentView('expense')}
              onMouseEnter={(e) => { if (currentView !== 'expense') { e.currentTarget.style.background = 'rgba(0, 212, 255, 0.1)'; e.currentTarget.style.color = '#00D4FF'; e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.3)'; } }}
              onMouseLeave={(e) => { if (currentView !== 'expense') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'; e.currentTarget.style.borderColor = 'transparent'; } }}
            >
              <span>💸</span>
              <span>Ngân Sách Ecom</span>
            </div>
            {/* COSMIC COUNTDOWN WIDGET */}
            <div style={{ margin: '16px', padding: '18px', background: 'rgba(0, 212, 255, 0.08)', borderRadius: '16px', border: '1px solid rgba(0, 212, 255, 0.2)', textAlign: 'center', backdropFilter: 'blur(10px)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🚀</div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: '8px', fontWeight: '500', letterSpacing: '1px', textTransform: 'uppercase' }}>Launch Countdown</div>
              <div style={{ fontSize: '1.1rem', color: '#00D4FF', fontWeight: '700' }}>
                <span style={{ fontSize: '2rem', fontWeight: '900', background: 'linear-gradient(135deg, #00D4FF, #00FF88)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{diffDays}</span> days
              </div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: '500', marginTop: '5px' }}>until TẾT 2026 🐎</div>
            </div>
          </div>

          <div style={{ padding: '16px', borderTop: '1px solid rgba(0, 212, 255, 0.1)', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center', letterSpacing: '1px' }}>
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

        </div>
      </div>
    </AppDataProvider>
  );
}

export default App;