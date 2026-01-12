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
import AIChat from './components/AIChat';

function App() {
  // Đổi mặc định thành 'dashboard' để mở lên là thấy ngay báo cáo mới
  const [currentView, setCurrentView] = useState('dashboard');

  // Cấu hình độ rộng Sidebar - FIXED
  const SIDEBAR_WIDTH = '280px';

  // --- STYLES ---
  const sidebarStyle = {
    width: SIDEBAR_WIDTH,
    background: '#FFFFFF', // White Sidebar
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    position: 'fixed',
    left: 0,
    top: 0,
    zIndex: 1000,
    fontFamily: "'Inter', sans-serif",
    borderRight: '1px solid #F3F4F6', // Restore border for clean separation
    whiteSpace: 'nowrap',
    boxShadow: '4px 0 24px rgba(0,0,0,0.02)'
  };

  const menuItemStyle = (isActive) => ({
    justifyContent: 'flex-start',
    margin: '8px 16px',
    padding: '12px 16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    backgroundColor: isActive ? '#FF6600' : 'transparent', // Orange Active Block
    borderRadius: '12px',
    color: isActive ? '#FFFFFF' : '#9CA3AF', // White Active, Gray Inactive
    fontWeight: isActive ? '600' : '500',
    transition: 'all 0.2s ease',
    height: '48px',
    fontSize: '0.95rem',
    border: 'none'
  });

  const mainContentStyle = {
    marginLeft: SIDEBAR_WIDTH,
    background: '#FFF7ED', // Warm Beige Background
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
          {/* Header Sidebar - UPDATED DESIGN */}
          <div style={{ padding: '24px 0', textAlign: 'center', minHeight: '100px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '40px', height: '40px', background: '#FF6600', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: '900', fontSize: '1.5rem', marginBottom: '5px' }}>Q</div>
              <span style={{ fontSize: '0.8rem', color: '#6B7280', fontStyle: 'italic' }}>made by</span>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: '#FF6600', letterSpacing: '0.5px', textTransform: 'uppercase', lineHeight: '1.1' }}>
                QUỐC KHÁNH
              </h2>
            </div>
          </div>

          {/* Menu Items */}
          <div style={{ flex: 1, paddingTop: '10px', overflowY: 'auto' }}>

            {/* 0. [MỚI] BÁO CÁO TỔNG (DASHBOARD) - Thêm vào đầu tiên */}
            <div
              style={menuItemStyle(currentView === 'dashboard')}
              onClick={() => setCurrentView('dashboard')}
              onMouseEnter={(e) => { if (currentView !== 'dashboard') { e.currentTarget.style.backgroundColor = '#FFF7ED'; e.currentTarget.style.color = '#FF6600'; } }}
              onMouseLeave={(e) => { if (currentView !== 'dashboard') { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#9CA3AF'; } }}
            >
              <span>📊</span>
              <span>Dashboard</span>
            </div>

            <div
              style={menuItemStyle(currentView === 'order')}
              onClick={() => setCurrentView('order')}
              onMouseEnter={(e) => { if (currentView !== 'order') { e.currentTarget.style.backgroundColor = '#FFF7ED'; e.currentTarget.style.color = '#FF6600'; } }}
              onMouseLeave={(e) => { if (currentView !== 'order') { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#9CA3AF'; } }}
            >
              <span>🛒</span>
              <span>Đơn Hàng KOC</span>
            </div>

            <div
              style={menuItemStyle(currentView === 'airlinks')}
              onClick={() => setCurrentView('airlinks')}
              onMouseEnter={(e) => { if (currentView !== 'airlinks') { e.currentTarget.style.backgroundColor = '#FFF7ED'; e.currentTarget.style.color = '#FF6600'; } }}
              onMouseLeave={(e) => { if (currentView !== 'airlinks') { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#9CA3AF'; } }}
            >
              <span>🔗</span>
              <span>Quản Lý Link Air</span>
            </div>

            <div
              style={menuItemStyle(currentView === 'booking')}
              onClick={() => setCurrentView('booking')}
              onMouseEnter={(e) => { if (currentView !== 'booking') { e.currentTarget.style.backgroundColor = '#FFF7ED'; e.currentTarget.style.color = '#FF6600'; } }}
              onMouseLeave={(e) => { if (currentView !== 'booking') { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#9CA3AF'; } }}
            >
              <span>📅</span>
              <span>Booking Manager</span>
            </div>

            <div
              style={menuItemStyle(currentView === 'contract')}
              onClick={() => setCurrentView('contract')}
              onMouseEnter={(e) => { if (currentView !== 'contract') { e.currentTarget.style.backgroundColor = '#FFF7ED'; e.currentTarget.style.color = '#FF6600'; } }}
              onMouseLeave={(e) => { if (currentView !== 'contract') { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#9CA3AF'; } }}
            >
              <span>📝</span>
              <span>Hợp Đồng</span>
            </div>

            <div
              style={menuItemStyle(currentView === 'expense')}
              onClick={() => setCurrentView('expense')}
              onMouseEnter={(e) => { if (currentView !== 'expense') { e.currentTarget.style.backgroundColor = '#FFF7ED'; e.currentTarget.style.color = '#FF6600'; } }}
              onMouseLeave={(e) => { if (currentView !== 'expense') { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#9CA3AF'; } }}
            >
              <span>💸</span>
              <span>Ngân Sách Ecom</span>
            </div>
            {/* TET COUNTDOWN WIDGET */}
            <div style={{ margin: '16px', padding: '15px', backgroundColor: '#FFF7ED', borderRadius: '16px', border: '2px solid #FFEDD5', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '5px' }}>🌸</div>
              <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '5px', fontWeight: '500' }}>Cùng đếm ngược nào!</div>
              <div style={{ fontSize: '1.2rem', color: '#D42426', fontWeight: '900' }}>
                Còn <span style={{ fontSize: '1.8rem', color: '#FF6600' }}>{diffDays}</span> ngày
              </div>
              <div style={{ fontSize: '0.9rem', color: '#D42426', fontWeight: '700' }}>nữa là đến TẾT 🐎</div>
            </div>
          </div>

          <div style={{ padding: '16px', borderTop: '1px solid #F3F4F6', fontSize: '0.75rem', color: '#9CA3AF', textAlign: 'center' }}>
            v2.6 Mirinda Edition
          </div>
        </div>

        {/* --- MAIN CONTENT --- */}
        <div style={mainContentStyle}>

          {currentView === 'dashboard' && <DashboardTab />}
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