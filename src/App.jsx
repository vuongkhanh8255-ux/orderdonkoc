// src/App.jsx

import { useState } from 'react';
import { AppDataProvider } from './context/AppDataContext';
import OrderTab from './components/OrderTab';
import ContractTab from './components/ContractTab';
import AirLinksTab from './components/AirLinksTab';
import SnowEffect from './components/SnowEffect';
import AIChat from './components/AIChat'; // <--- IMPORT CHATBOT

function App() {
  // State quản lý tab đang xem
  const [currentView, setCurrentView] = useState('orders'); // 'orders', 'contract', 'airlinks'

  return (
    <AppDataProvider>
      
      {/* --- 1. HIỆU ỨNG TUYẾT --- */}
      <SnowEffect />

      {/* --- 2. TRỢ LÝ ẢO AI (MỚI THÊM) --- */}
      <AIChat />

      {/* --- 3. NỘI DUNG CHÍNH CỦA WEB --- */}
      <div style={{ padding: '2rem', position: 'relative', zIndex: 1 }}>
        
        {/* THANH MENU CHUYỂN TAB */}
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
            <button 
                onClick={() => setCurrentView('orders')} 
                style={{ 
                    padding: '10px 20px', marginRight: '10px', fontSize: '16px', cursor: 'pointer',
                    backgroundColor: currentView === 'orders' ? '#D42426' : '#f8f9fa', 
                    color: currentView === 'orders' ? 'white' : '#D42426',
                    border: '1px solid #D42426', borderRadius: '5px', fontWeight: 'bold',
                }}
            >
                Quản Lý Order
            </button>
            <button 
                onClick={() => setCurrentView('contract')}
                style={{ 
                    padding: '10px 20px', marginRight: '10px', fontSize: '16px', cursor: 'pointer',
                    backgroundColor: currentView === 'contract' ? '#D42426' : '#f8f9fa',
                    color: currentView === 'contract' ? 'white' : '#D42426',
                    border: '1px solid #D42426', borderRadius: '5px', fontWeight: 'bold',
                }}
            >
                Tạo Hợp Đồng
            </button>
            <button 
                onClick={() => setCurrentView('airlinks')}
                style={{ 
                    padding: '10px 20px', fontSize: '16px', cursor: 'pointer',
                    backgroundColor: currentView === 'airlinks' ? '#D42426' : '#f8f9fa',
                    color: currentView === 'airlinks' ? 'white' : '#D42426',
                    border: '1px solid #D42426', borderRadius: '5px', fontWeight: 'bold',
                }}
            >
                Quản lý Link Air
            </button>
        </div>

        {/* HIỂN THỊ NỘI DUNG TAB TƯƠNG ỨNG */}
        {currentView === 'orders' && <OrderTab />}
        {currentView === 'contract' && <ContractTab />}
        {currentView === 'airlinks' && <AirLinksTab />}
    
      </div>
    </AppDataProvider>
  );
 }

export default App;