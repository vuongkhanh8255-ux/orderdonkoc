import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// --- HÀM HELPER FORMAT TIỀN ---
const formatCurrency = (value) => {
  if (!value && value !== 0) return '';
  const number = String(value).replace(/\D/g, '');
  return number.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const parseMoney = (str) => {
    if (!str) return 0;
    return parseFloat(String(str).replace(/[^\d]/g, '')) || 0;
};

const DEPARTMENT_OPTIONS = [
    "Livestream",
    "Ecom",
    "Marketing",
    "Design",
    "Abm",
    "Cs"
];

const ExpenseEcomTab = () => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // State form nhập liệu
  const [newExpense, setNewExpense] = useState({
      ngay_chi: new Date().toISOString().split('T')[0],
      ho_ten: '',
      khoan_chi: '',
      phong_ban: '',
      link_chung_tu: '',
      vat: false
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- 1. LOAD DỮ LIỆU ---
  const loadExpenses = async () => {
      setLoading(true);
      try {
          const { data, error } = await supabase
              .from('expenses_ecom')
              .select('*')
              .order('created_at', { ascending: false });
          
          if (error) throw error;
          setExpenses(data || []);
      } catch (error) {
          console.error("Lỗi tải chi phí:", error);
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
      loadExpenses();
  }, []);

  // --- 2. XỬ LÝ NHẬP LIỆU ---
  const handleAddExpense = async (e) => {
      e.preventDefault();
      if (!newExpense.ho_ten || !newExpense.khoan_chi || !newExpense.phong_ban) {
          alert("Vui lòng điền đủ: Họ tên, Khoản chi, Phòng ban!");
          return;
      }

      setIsSubmitting(true);
      try {
          const dataToInsert = {
              ngay_chi: newExpense.ngay_chi,
              ho_ten: newExpense.ho_ten,
              khoan_chi: parseMoney(newExpense.khoan_chi),
              phong_ban: newExpense.phong_ban,
              link_chung_tu: newExpense.link_chung_tu,
              vat: newExpense.vat
          };

          const { error } = await supabase.from('expenses_ecom').insert([dataToInsert]);
          if (error) throw error;

          alert("Đã thêm khoản chi thành công!");
          setNewExpense({
              ngay_chi: new Date().toISOString().split('T')[0],
              ho_ten: '',
              khoan_chi: '',
              phong_ban: '',
              link_chung_tu: '',
              vat: false
          });
          loadExpenses();
      } catch (error) {
          alert("Lỗi: " + error.message);
      } finally {
          setIsSubmitting(false);
      }
  };

  // --- 3. XỬ LÝ CONFIRM (3 CẤP) ---
  const handleToggleConfirm = async (id, field, currentValue) => {
      try {
          const { error } = await supabase
              .from('expenses_ecom')
              .update({ [field]: !currentValue }) // Đảo ngược giá trị true/false
              .eq('id', id);

          if (error) throw error;
          loadExpenses(); // Load lại để cập nhật giao diện
      } catch (error) {
          alert("Lỗi cập nhật trạng thái: " + error.message);
      }
  };

  // --- 4. XÓA ---
  const handleDelete = async (id) => {
      if(!window.confirm("Bạn chắc chắn muốn xóa khoản chi này?")) return;
      try {
          const { error } = await supabase.from('expenses_ecom').delete().eq('id', id);
          if(error) throw error;
          loadExpenses();
      } catch (error) {
          alert("Lỗi xóa: " + error.message);
      }
  };

  // STYLES
  const cardStyle = { backgroundColor: '#ffffff', borderRadius: '12px', padding: '25px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', marginBottom: '2rem', border: '1px solid rgba(0,0,0,0.02)' };
  const inputStyle = { width:'100%', padding:'12px', borderRadius:'6px', border:'1px solid #ddd', outline:'none', fontSize: '1rem' };
  const labelStyle = { display:'block', marginBottom:'8px', fontWeight:'600', fontSize:'0.95rem', color: '#333' };
  
  // Style cho nút duyệt (Badge)
  const getBadgeStyle = (isActive, color) => ({
      padding: '5px 10px',
      borderRadius: '20px',
      fontSize: '11px',
      fontWeight: 'bold',
      cursor: 'pointer',
      border: `1px solid ${isActive ? color : '#ccc'}`,
      backgroundColor: isActive ? color : '#f5f5f5',
      color: isActive ? 'white' : '#999',
      marginRight: '5px',
      transition: '0.2s',
      display: 'inline-block',
      minWidth: '70px',
      textAlign: 'center'
  });

  return (
    <div style={{ padding: '20px' }}>
         {/* HEADER */}
         <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
                <h1 style={{ fontSize: '2.5rem', fontWeight: '800', color: '#333', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>
                   💸 QUẢN LÝ CHI PHÍ ECOM
                </h1>
                <p style={{ color: '#666', marginTop: '8px', fontSize: '1.1rem' }}>
                    Nhập liệu và kiểm duyệt các khoản chi phí vận hành.
                </p>
            </div>
        </div>

        {/* FORM NHẬP LIỆU */}
        <div style={cardStyle}>
            <h3 style={{ borderBottom: '2px solid #f0f0f0', paddingBottom: '15px', marginBottom: '25px', color: '#D42426', fontSize: '1.6rem', fontWeight: '800', textTransform: 'uppercase' }}>
                ✏️ NHẬP KHOẢN CHI MỚI
            </h3>
            <form onSubmit={handleAddExpense}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                    
                    {/* Hàng 1 */}
                    <div>
                        <label style={labelStyle}>Ngày chi</label>
                        <input type="date" value={newExpense.ngay_chi} onChange={e => setNewExpense({...newExpense, ngay_chi: e.target.value})} style={inputStyle} required />
                    </div>
                    <div>
                        <label style={labelStyle}>Họ tên người đề xuất (*)</label>
                        <input type="text" placeholder="Nguyễn Văn A..." value={newExpense.ho_ten} onChange={e => setNewExpense({...newExpense, ho_ten: e.target.value})} style={inputStyle} required />
                    </div>
                    <div>
                        <label style={labelStyle}>Phòng ban (*)</label>
                        <select value={newExpense.phong_ban} onChange={e => setNewExpense({...newExpense, phong_ban: e.target.value})} style={inputStyle} required>
                            <option value="">-- Chọn phòng ban --</option>
                            {DEPARTMENT_OPTIONS.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                        </select>
                    </div>

                    {/* Hàng 2 */}
                    <div>
                        <label style={labelStyle}>Khoản chi (VNĐ) (*)</label>
                        <input 
                            type="text" 
                            placeholder="Ví dụ: 1.500.000" 
                            value={newExpense.khoan_chi} 
                            onChange={e => setNewExpense({...newExpense, khoan_chi: formatCurrency(e.target.value)})} 
                            style={{...inputStyle, fontWeight: 'bold', color: '#D42426'}} 
                            required 
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Link chứng từ (Drive)</label>
                        <input type="text" placeholder="https://..." value={newExpense.link_chung_tu} onChange={e => setNewExpense({...newExpense, link_chung_tu: e.target.value})} style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', marginTop: '30px' }}>
                        <input 
                            type="checkbox" 
                            id="vatCheck" 
                            checked={newExpense.vat} 
                            onChange={e => setNewExpense({...newExpense, vat: e.target.checked})} 
                            style={{ width: '20px', height: '20px', marginRight: '10px', cursor: 'pointer' }} 
                        />
                        <label htmlFor="vatCheck" style={{ fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer' }}>Có xuất hóa đơn VAT</label>
                    </div>
                </div>

                <div style={{ textAlign: 'center', marginTop: '30px' }}>
                    <button type="submit" disabled={isSubmitting} style={{ backgroundColor: '#D42426', color:'white', padding: '12px 50px', fontSize: '1.1rem', fontWeight:'bold', border:'none', borderRadius:'30px', cursor:'pointer', boxShadow:'0 4px 12px rgba(212, 36, 38, 0.3)' }}>
                        {isSubmitting ? 'Đang lưu...' : 'LƯU KHOẢN CHI'}
                    </button>
                </div>
            </form>
        </div>

        {/* BẢNG DANH SÁCH */}
        <div style={cardStyle}>
            <h3 style={{ color: '#333', fontSize:'1.4rem', marginBottom: '1rem', fontWeight:'800' }}>DANH SÁCH CHI PHÍ</h3>
            
            {loading ? <p>Đang tải dữ liệu...</p> : (
                <div style={{ width: '100%', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize:'0.9rem' }}>
                        <thead style={{backgroundColor:'#f0f0f0', borderBottom:'2px solid #ddd'}}>
                            <tr>
                                <th style={{padding:'12px', textAlign:'center'}}>STT</th>
                                <th style={{padding:'12px', textAlign:'center'}}>Ngày</th>
                                <th style={{padding:'12px', textAlign:'left'}}>Họ tên</th>
                                <th style={{padding:'12px', textAlign:'center'}}>Phòng ban</th>
                                <th style={{padding:'12px', textAlign:'right'}}>Khoản chi</th>
                                <th style={{padding:'12px', textAlign:'center'}}>VAT</th>
                                <th style={{padding:'12px', textAlign:'center'}}>Chứng từ</th>
                                <th style={{padding:'12px', textAlign:'center', minWidth: '250px'}}>QUY TRÌNH DUYỆT (Click để xác nhận)</th>
                                <th style={{padding:'12px', textAlign:'center'}}>Hành động</th>
                            </tr>
                        </thead>
                        <tbody>
                            {expenses.map((item, index) => (
                                <tr key={item.id} style={{borderBottom:'1px solid #eee'}}>
                                    <td style={{textAlign:'center', padding:'12px'}}>{index + 1}</td>
                                    <td style={{textAlign:'center', padding:'12px'}}>{item.ngay_chi}</td>
                                    <td style={{textAlign:'left', padding:'12px', fontWeight:'bold'}}>{item.ho_ten}</td>
                                    <td style={{textAlign:'center', padding:'12px'}}>
                                        <span style={{padding:'4px 8px', borderRadius:'4px', backgroundColor:'#e3f2fd', color:'#1976D2', fontSize:'11px', fontWeight:'bold'}}>
                                            {item.phong_ban}
                                        </span>
                                    </td>
                                    <td style={{textAlign:'right', padding:'12px', color:'#D42426', fontWeight:'bold', fontSize:'1rem'}}>
                                        {formatCurrency(item.khoan_chi)} đ
                                    </td>
                                    <td style={{textAlign:'center', padding:'12px'}}>
                                        {item.vat ? <span style={{color:'green'}}>✔</span> : <span style={{color:'#ccc'}}>-</span>}
                                    </td>
                                    <td style={{textAlign:'center', padding:'12px'}}>
                                        {item.link_chung_tu ? (
                                            <a href={item.link_chung_tu} target="_blank" rel="noopener noreferrer" style={{color:'#1976D2', fontWeight:'bold', textDecoration:'none'}}>Xem Link</a>
                                        ) : <span style={{color:'#999', fontSize:'11px'}}>Chưa có</span>}
                                    </td>
                                    
                                    {/* --- CỘT DUYỆT --- */}
                                    <td style={{textAlign:'center', padding:'12px'}}>
                                        <div style={{display:'flex', justifyContent:'center', gap:'5px'}}>
                                            {/* 1. Kế toán */}
                                            <div 
                                                onClick={() => handleToggleConfirm(item.id, 'confirm_ketoan', item.confirm_ketoan)}
                                                style={getBadgeStyle(item.confirm_ketoan, '#2196F3')}
                                                title="Kế toán xác nhận"
                                            >
                                                {item.confirm_ketoan ? '✓ KT Đã Duyệt' : '○ Kế Toán'}
                                            </div>

                                            {/* 2. Thu chi */}
                                            <div 
                                                onClick={() => handleToggleConfirm(item.id, 'confirm_thuchi', item.confirm_thuchi)}
                                                style={getBadgeStyle(item.confirm_thuchi, '#FF9800')}
                                                title="Bộ phận Thu chi xác nhận"
                                            >
                                                {item.confirm_thuchi ? '✓ TC Đã Chi' : '○ Thu Chi'}
                                            </div>

                                            {/* 3. Người chuyển */}
                                            <div 
                                                onClick={() => handleToggleConfirm(item.id, 'confirm_nguoichuyen', item.confirm_nguoichuyen)}
                                                style={getBadgeStyle(item.confirm_nguoichuyen, '#4CAF50')}
                                                title="Người chuyển khoản xác nhận"
                                            >
                                                {item.confirm_nguoichuyen ? '✓ Đã Chuyển' : '○ Chuyển Tiền'}
                                            </div>
                                        </div>
                                    </td>

                                    <td style={{textAlign:'center', padding:'12px'}}>
                                        <button 
                                            onClick={() => handleDelete(item.id)}
                                            style={{backgroundColor:'transparent', border:'1px solid #D42426', color:'#D42426', borderRadius:'4px', padding:'5px 10px', cursor:'pointer', fontSize:'11px', fontWeight:'bold'}}
                                        >
                                            Xóa
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {expenses.length === 0 && (
                                <tr>
                                    <td colSpan="9" style={{textAlign:'center', padding:'20px', color:'#999'}}>Chưa có dữ liệu chi phí nào.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    </div>
  );
};

export default ExpenseEcomTab;