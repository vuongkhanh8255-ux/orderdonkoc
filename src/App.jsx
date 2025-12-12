import { useState } from 'react';
import { AppDataProvider } from './context/AppDataContext';
import OrderTab from './components/OrderTab';
import ContractTab from './components/ContractTab';
import AirLinksTab from './components/AirLinksTab';
import ExpenseEcomTab from './components/ExpenseEcomTab'; // [THÊM MỚI]
import SnowEffect from './components/SnowEffect';
import AIChat from './components/AIChat';

function App() {
  const [currentView, setCurrentView] = useState('orders');
  // Mặc định là FALSE (Thu nhỏ)
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);

  // --- CẤU HÌNH KÍCH THƯỚC ---
  const WIDTH_OPEN = '280px';
  const WIDTH_CLOSE = '90px';

  // Đủ rộng để chứa icon trong hộp trắng
  const currentWidth = isSidebarHovered ? WIDTH_OPEN : WIDTH_CLOSE;

  // --- STYLE SIDEBAR (NỀN ĐỎ ĐẬM) ---
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
    transition: 'width 0.3s ease-in-out', // Hiệu ứng trượt mượt mà
    overflow: 'hidden',
    whiteSpace: 'nowrap'
  };

  // --- STYLE NÚT MENU (KHUNG TRẮNG BO TRÒN) ---
  const menuItemStyle = (isActive) => ({
    // Khi đóng: căn giữa | Khi mở: căn trái
    justifyContent: isSidebarHovered ? 'flex-start' : 'center',
    margin: '10px 15px', 
    padding: '15px', // Padding đều
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    
    // --- KHUNG MÀU TRẮNG ---
    backgroundColor: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.85)', 
    borderRadius: '15px', 
    
    // Chữ/Icon: Đỏ khi chọn, Đen khi không chọn
    color: isActive ? '#D42426' : '#333', 
    fontWeight: '700',
    boxShadow: isActive ? '0 4px 10px rgba(0,0,0,0.2)' : 'none',
    transition: 'all 0.2s ease',
    height: '55px', // Cố định chiều cao cho đẹp
  });

  const mainContentStyle = {
    marginLeft: currentWidth, // Nội dung tự động đẩy ra/vào
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
            onMouseEnter={() => setIsSidebarHovered(true)} // Chuột vào -> MỞ
            onMouseLeave={() => setIsSidebarHovered(false)} // Chuột ra -> ĐÓNG
        >
            {/* Header Sidebar */}
            <div style={{ padding: '30px 0', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', minHeight: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                
                {/* LOGO / TEXT: Ẩn hiện theo trạng thái */}
                {isSidebarHovered ? (
                    // KHI MỞ: HIỆN CHỮ TO
                    <div style={{animation: 'fadeIn 0.3s'}}>
                        <h2 style={{ margin: 0, fontSize: '2rem', fontWeight: '900', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            DATA SYSTEM
                        </h2>
                        <div style={{ marginTop: '5px', fontSize: '0.75rem', color: '#FFD700', fontStyle: 'italic' }}>
                            🔥 Made by Khánh đẹp trai vkl 🔥
                        </div>
                    </div>
                ) : (
                    // KHI ĐÓNG: HIỆN ICON CÂY THÔNG
                    <div style={{ fontSize: '2.5rem', animation: 'fadeIn 0.3s' }}>🎄</div>
                )}
            </div>

            {/* Menu List */}
            <div style={{ flex: 1, paddingTop: '20px' }}>
                {/* TAB 1: ORDER */}
                <div style={menuItemStyle(currentView === 'orders')} onClick={() => setCurrentView('orders')} title="Quản Lý Order">
                    <span style={{fontSize: '1.4rem'}}>📦</span> 
                    <span style={{ display: isSidebarHovered ? 'block' : 'none', whiteSpace: 'nowrap' }}>Quản Lý Order</span>
                </div>

                {/* TAB 2: HỢP ĐỒNG */}
                <div style={menuItemStyle(currentView === 'contract')} onClick={() => setCurrentView('contract')} title="Tạo Hợp Đồng">
                    <span style={{fontSize: '1.4rem'}}>📝</span>
                    <span style={{ display: isSidebarHovered ? 'block' : 'none', whiteSpace: 'nowrap' }}>Tạo Hợp Đồng</span>
                </div>

                {/* TAB 3: LINK AIR */}
                <div style={menuItemStyle(currentView === 'airlinks')} onClick={() => setCurrentView('airlinks')} title="Quản Lý Link Air">
                    <span style={{fontSize: '1.4rem'}}>🎬</span>
                    <span style={{ display: isSidebarHovered ? 'block' : 'none', whiteSpace: 'nowrap' }}>Quản Lý Link Air</span>
                </div>

                {/* TAB 4: CHI PHÍ ECOM [THÊM MỚI] */}
                <div style={menuItemStyle(currentView === 'expenses')} onClick={() => setCurrentView('expenses')} title="Quản Lý Chi Phí">
                    <span style={{fontSize: '1.4rem'}}>💸</span>
                    <span style={{ display: isSidebarHovered ? 'block' : 'none', whiteSpace: 'nowrap' }}>Quản Lý Chi Phí</span>
                </div>
            </div>

            <div style={{ padding: '20px', fontSize: '0.7rem', textAlign: 'center', opacity: 0.6, display: isSidebarHovered ? 'block' : 'none' }}>
                 v1.1.1 Christmas
            </div>
        </div>

        {/* --- MAIN CONTENT --- */}
        <div style={mainContentStyle}>
           {currentView === 'orders' && <OrderTab />}
           {currentView === 'contract' && <ContractTab />}
           {currentView === 'airlinks' && <AirLinksTab />}
           {currentView === 'expenses' && <ExpenseEcomTab />} {/* [HIỂN THỊ COMPONENT MỚI] */}
        </div>

      </div>
    </AppDataProvider>
  );
}

export default App;