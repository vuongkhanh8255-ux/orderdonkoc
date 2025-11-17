// src/App.jsx

import { useState } from 'react';
import { AppDataProvider } from './context/AppDataContext';
import OrderTab from './components/OrderTab';
import ContractTab from './components/ContractTab';
import AirLinksTab from './components/AirLinksTab';

function App() {
  // State duy nhất App.jsx quản lý là "đang xem tab nào"
  const [currentView, setCurrentView] = useState('orders'); // 'orders', 'contract', 'airlinks'

  return (
    // 1. Bọc tất cả bằng "Bộ Não"
    <AppDataProvider>
      <div style={{ padding: '2rem' }}>
        
        {/* 2. Các nút chuyển tab */}
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
            <button 
                onClick={() => setCurrentView('orders')} 
                style={{ 
                    padding: '10px 20px', marginRight: '10px', fontSize: '16px', cursor: 'pointer',
                    backgroundColor: currentView === 'orders' ? '#C0392B' : '#f8f9fa', 
                    color: currentView === 'orders' ? 'white' : '#C0392B',
                    border: '1px solid #C0392B', borderRadius: '5px', fontWeight: 'bold',
                }}
            >
                Quản Lý Order
            </button>
            <button 
                onClick={() => setCurrentView('contract')}
                style={{ 
                    padding: '10px 20px', marginRight: '10px', fontSize: '16px', cursor: 'pointer',
                    backgroundColor: currentView === 'contract' ? '#C0392B' : '#f8f9fa',
                    color: currentView === 'contract' ? 'white' : '#C0392B',
                    border: '1px solid #C0392B', borderRadius: '5px', fontWeight: 'bold',
                }}
            >
                Tạo Hợp Đồng
            </button>
            <button 
                onClick={() => setCurrentView('airlinks')}
                style={{ 
                    padding: '10px 20px', fontSize: '16px', cursor: 'pointer',
                    backgroundColor: currentView === 'airlinks' ? '#C0392B' : '#f8f9fa',
                    color: currentView === 'airlinks' ? 'white' : '#C0392B',
                    border: '1px solid #C0392B', borderRadius: '5px', fontWeight: 'bold',
                }}
            >
                Quản lý Link Air
            </button>
        </div>

        {/* 3. Hiển thị component con tương ứng */}
        {currentView === 'orders' && <OrderTab />}
        {currentView === 'contract' && <ContractTab />}
        {currentView === 'airlinks' && <AirLinksTab />}
    
      </div>
    </AppDataProvider>
  );
 }

export default App;