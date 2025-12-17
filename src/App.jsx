import { useState } from 'react';
import { AppDataProvider } from './context/AppDataContext';
import OrderTab from './components/OrderTab';
import ContractTab from './components/ContractTab';
import AirLinksTab from './components/AirLinksTab';
import ExpenseEcomTab from './components/ExpenseEcomTab';
import BookingManagerTab from './components/BookingManagerTab'; // [QUAN TRỌNG] Import tab mới
import SnowEffect from './components/SnowEffect';
import AIChat from './components/AIChat';

function App() {
  const [currentView, setCurrentView] = useState('orders');
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);

  // Cấu hình độ rộng Sidebar
  const WIDTH_OPEN = '280px';
  const WIDTH_CLOSE = '90px';
  const currentWidth = isSidebarHovered ? WIDTH_OPEN : WIDTH_CLOSE;

  // --- STYLES ---
  const sidebarStyle = {
    width: currentWidth,
    background: 'linear-gradient(180deg, #8B0000 0%, #5c0000 100%)', 
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    position: 'fixed',
    left: 0,
    top: 0,
    boxShadow: '4px 0 15px rgba(0,0,0,0.5)',
    zIndex: 1000,
    fontFamily: "'Segoe UI', sans-serif",
    transition: 'width 0.3s ease-in-out',
    overflow: 'hidden',
    whiteSpace: 'nowrap'
  };

  const menuItemStyle = (isActive) => ({
    justifyContent: isSidebarHovered ? 'flex-start' : 'center',
    margin: '10px 15px', 
    padding: '15px', 
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    backgroundColor: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.85)', 
    borderRadius: '15px', 
    color: isActive ? '#D42426' : '#333', 
    fontWeight: '700',
    boxShadow: isActive ? '0 4px 10px rgba(0,0,0,0.2)' : 'none',
    transition: 'all 0.2s ease',
    height: '55px', 
  });

  const mainContentStyle = {
    marginLeft: currentWidth, 
    background: 'linear-gradient(135deg, #0f3d24 0%, #165B33 40%, #5c0000 100%)', 
    minHeight: '100vh',
    padding: '30px',
    position: 'relative',
    flex: 1,
    transition: 'margin-left 0.3s ease-in-out'
  };

  return (
    <AppDataProvider>
      <SnowEffect />
      <AIChat />

      <div style={{ display: 'flex' }}>
        {/* --- SIDEBAR --- */}
        <div 
            style={sidebarStyle}
            onMouseEnter={() => setIsSidebarHovered(true)} 
            onMouseLeave={() => setIsSidebarHovered(false)}
        >
            {/* Header Sidebar */}
            <div style={{ padding: '30px 0', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', minHeight: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                {isSidebarHovered ? (
                    <div style={{animation: 'fadeIn 0.3s'}}>
                        <h2 style={{ margin: 0, fontSize: '2rem', fontWeight: '900', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '1px' }}>DATA SYSTEM</h2>
                        <div style={{ marginTop: '5px', fontSize: '0.75rem', color: '#FFD700', fontStyle: 'italic' }}>🔥 Made by Khánh đẹp trai vkl 🔥</div>
                    </div>
                ) : (
                    <div style={{ fontSize: '2.5rem', animation: 'fadeIn 0.3s' }}>🎄</div>
                )}
            </div>

            {/* Menu Items */}
            <div style={{ flex: 1, paddingTop: '20px' }}>
                
                {/* 1. Quản Lý Order */}
                <div style={menuItemStyle(currentView === 'orders')} onClick={() => setCurrentView('orders')} title="Quản Lý Order">
                    <span style={{fontSize: '1.4rem'}}>📦</span> 
                    <span style={{ display: isSidebarHovered ? 'block' : 'none' }}>Quản Lý Order</span>
                </div>

                {/* 2. Tạo Hợp Đồng */}
                <div style={menuItemStyle(currentView === 'contract')} onClick={() => setCurrentView('contract')} title="Tạo Hợp Đồng">
                    <span style={{fontSize: '1.4rem'}}>📝</span>
                    <span style={{ display: isSidebarHovered ? 'block' : 'none' }}>Tạo Hợp Đồng</span>
                </div>

                {/* 3. [MỚI] Quản Lý Booking */}
                <div style={menuItemStyle(currentView === 'booking')} onClick={() => setCurrentView('booking')} title="Quản Lý Booking">
                    <span style={{fontSize: '1.4rem'}}>📅</span>
                    <span style={{ display: isSidebarHovered ? 'block' : 'none' }}>Quản Lý Booking</span>
                </div>

                {/* 4. Quản Lý Link Air */}
                <div style={menuItemStyle(currentView === 'airlinks')} onClick={() => setCurrentView('airlinks')} title="Quản Lý Link Air">
                    <span style={{fontSize: '1.4rem'}}>🎬</span>
                    <span style={{ display: isSidebarHovered ? 'block' : 'none' }}>Quản Lý Link Air</span>
                </div>

                {/* 5. Quản Lý Chi Phí */}
                <div style={menuItemStyle(currentView === 'expenses')} onClick={() => setCurrentView('expenses')} title="Quản Lý Chi Phí">
                    <span style={{fontSize: '1.4rem'}}>💸</span>
                    <span style={{ display: isSidebarHovered ? 'block' : 'none' }}>Quản Lý Chi Phí</span>
                </div>
            </div>

            {/* Footer Sidebar */}
            <div style={{ padding: '20px', fontSize: '0.7rem', textAlign: 'center', opacity: 0.6, display: isSidebarHovered ? 'block' : 'none' }}>
                v2.0 Automation
            </div>
        </div>

        {/* --- MAIN CONTENT --- */}
        <div style={mainContentStyle}>
           {currentView === 'orders' && <OrderTab />}
           {currentView === 'contract' && <ContractTab />}
           {currentView === 'booking' && <BookingManagerTab />} 
           {currentView === 'airlinks' && <AirLinksTab />}
           {currentView === 'expenses' && <ExpenseEcomTab />} 
        </div>
      </div>
    </AppDataProvider>
  );
}

export default App;