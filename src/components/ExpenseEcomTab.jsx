// src/components/ExpenseEcomTab.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// --- HÀM HELPER (ĐÃ FIX LỖI NHẬP SỐ) ---
const formatCurrency = (value) => {
  if (!value) return '';
  // 1. Xóa tất cả ký tự không phải số (để tránh lỗi Math.abs cũ)
  const rawNumber = String(value).replace(/\D/g, ''); 
  // 2. Chèn dấu chấm
  return rawNumber.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const parseMoney = (str) => {
    if (!str) return 0;
    return parseFloat(String(str).replace(/[^\d]/g, '')) || 0;
};

const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('vi-VN');
};

const DEPARTMENT_OPTIONS = [ "Livestream", "Ecom", "Marketing", "Design", "Abm", "Cs" ];
const COLORS = ['#4CAF50', '#FF9800', '#D42426', '#999999']; 

// --- MẬT KHẨU BẢO MẬT ---
const PASS_BUDGET = "211315"; // Pass cho Ngân sách
const PASS_APPROVE = "QuocKhanhalphamale"; // Pass duyệt chi

const ExpenseEcomTab = () => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [budget, setBudget] = useState(0);
  
  // State nạp thêm ngân sách
  const [addBudgetAmount, setAddBudgetAmount] = useState('');

  // State nhập mới
  const [newExpense, setNewExpense] = useState({
      ngay_chi: new Date().toISOString().split('T')[0],
      ho_ten: '', 
      khoan_chi: '', phong_ban: '', noi_dung: '', link_chung_tu: '', vat: false
  });
  const [fileQR, setFileQR] = useState(null); 
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State sửa & Lịch sử
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [editFileQR, setEditFileQR] = useState(null); 
  const [historyModalData, setHistoryModalData] = useState(null);

  // --- STATE BỘ LỌC ---
  const [filterMonth, setFilterMonth] = useState('');     
  const [filterDept, setFilterDept] = useState('');
  const [filterName, setFilterName] = useState('');       
  const [filterStatus, setFilterStatus] = useState('all');

  // --- 1. LOAD DỮ LIỆU ---
  const loadData = async () => {
      setLoading(true);
      try {
          const { data: expData, error: expError } = await supabase
              .from('expenses_ecom')
              .select('*')
              .order('created_at', { ascending: false });
          if (expError) throw expError;
          setExpenses(expData || []);

          const { data: budgetData, error: budgetError } = await supabase
              .from('ecom_budget')
              .select('total_amount')
              .eq('id', 1)
              .single();
          if (!budgetError && budgetData) {
              setBudget(budgetData.total_amount);
          }
      } catch (error) {
          console.error("Lỗi tải dữ liệu:", error);
      } finally {
          setLoading(false);
      }
  };
  useEffect(() => { loadData(); }, []);

  // --- LOGIC LỌC DỮ LIỆU ---
  const filteredExpenses = useMemo(() => {
      return expenses.filter(item => {
          if (filterMonth) {
              const itemMonth = item.ngay_chi ? item.ngay_chi.substring(0, 7) : '';
              if (itemMonth !== filterMonth) return false;
          }
          if (filterDept && item.phong_ban !== filterDept) return false;
          if (filterName) {
              const searchName = filterName.toLowerCase();
              const itemName = item.ho_ten ? item.ho_ten.toLowerCase() : '';
              if (!itemName.includes(searchName)) return false;
          }
          if (filterStatus === 'pending') {
              const isDone = item.confirm_thuchi && item.confirm_nguoichuyen;
              if (isDone) return false;
          }
          if (filterStatus === 'done') {
              const isDone = item.confirm_thuchi && item.confirm_nguoichuyen;
              if (!isDone) return false;
          }
          return true;
      });
  }, [expenses, filterMonth, filterDept, filterName, filterStatus]);

  const clearFilters = () => {
      setFilterMonth('');
      setFilterDept('');
      setFilterName('');
      setFilterStatus('all');
  };

  // --- 2. TÍNH TOÁN THỐNG KÊ ---
  const stats = useMemo(() => {
      let daChi = 0;   
      let choChi = 0;  
      
      expenses.forEach(item => {
          const amount = item.khoan_chi || 0;
          if (item.confirm_nguoichuyen) {
              daChi += amount;
          } else if (item.confirm_thuchi) {
              choChi += amount;
          }
      });

      const conLai = budget - daChi; 
      return { daChi, choChi, conLai };
  }, [expenses, budget]);

  const chartData = [
      { name: 'Còn Lại', value: stats.conLai > 0 ? stats.conLai : 0 },
      { name: 'Chờ Giải Ngân', value: stats.choChi },
      { name: 'Đã Chi (Bank)', value: stats.daChi },
  ];

  // --- HÀM UPLOAD ẢNH ---
  const uploadImage = async (file) => {
      if (!file) return null;
      try {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
          const filePath = `qr_codes/${fileName}`;

          const { error: uploadError } = await supabase.storage
              .from('expense-files')
              .upload(filePath, file);

          if (uploadError) throw uploadError;

          const { data } = supabase.storage
              .from('expense-files')
              .getPublicUrl(filePath);
          
          return data.publicUrl;
      } catch (error) {
          console.error("Lỗi upload ảnh:", error);
          alert("Lỗi upload ảnh QR: " + error.message);
          return null;
      }
  };

  // --- 3. CẬP NHẬT NGÂN SÁCH ---
  
  // NẠP THÊM TIỀN (Bấm nút mới hỏi mật khẩu)
  const handleAddBudget = async () => {
      if (!addBudgetAmount || addBudgetAmount === '0') {
          alert("Vui lòng nhập số tiền cần nạp!");
          return;
      }
      
      const inputPass = prompt("🔒 Nhập mật khẩu (211315) để NẠP THÊM ngân sách:");
      
      if (inputPass === PASS_BUDGET) {
          const amountToAdd = parseMoney(addBudgetAmount);
          const newTotal = budget + amountToAdd; // Cộng dồn
          
          const { error } = await supabase.from('ecom_budget').upsert({ id: 1, total_amount: newTotal });
          
          if (error) {
              alert("Lỗi cập nhật: " + error.message);
          } else {
              setBudget(newTotal);
              setAddBudgetAmount(''); // Reset ô nhập
              alert(`✅ Đã nạp thêm ${formatCurrency(amountToAdd)} đ.\n💰 Tổng ngân sách mới: ${formatCurrency(newTotal)} đ`);
          }
      } else if (inputPass !== null) {
          alert("❌ Sai mật khẩu! Không được phép nạp.");
      }
  };

  // SỬA TRỰC TIẾP TỔNG
  const handleSetTotalBudget = async () => {
      const inputPass = prompt("🔒 Nhập mật khẩu (211315) để ĐẶT LẠI tổng ngân sách:");
      if (inputPass === PASS_BUDGET) {
          const newBudgetStr = prompt("Nhập tổng ngân sách MỚI (Số này sẽ thay thế số cũ):", budget);
          if (newBudgetStr !== null) {
              const val = parseMoney(newBudgetStr);
              setBudget(val); 
              await supabase.from('ecom_budget').upsert({ id: 1, total_amount: val });
              alert("✅ Đã đặt lại ngân sách thành công!");
          }
      } else if (inputPass !== null) {
          alert("❌ Sai mật khẩu!");
      }
  };

  // --- 4. THÊM KHOẢN CHI ---
  const handleAddExpense = async (e) => {
      e.preventDefault();
      if (!newExpense.ho_ten || !newExpense.khoan_chi || !newExpense.phong_ban || !newExpense.noi_dung) {
          alert("Thiếu thông tin cơ bản rồi sếp ơi!");
          return;
      }
      setIsSubmitting(true);
      try {
          let qrUrl = '';
          if (fileQR) {
              qrUrl = await uploadImage(fileQR);
              if (!qrUrl) throw new Error("Không lấy được link ảnh QR");
          }

          const dataToInsert = {
              ...newExpense,
              khoan_chi: parseMoney(newExpense.khoan_chi),
              link_qr: qrUrl,
              history_log: []
          };
          const { error } = await supabase.from('expenses_ecom').insert([dataToInsert]);
          if (error) throw error;
          alert("Đã thêm khoản chi!");
          
          setNewExpense({ 
              ngay_chi: new Date().toISOString().split('T')[0], 
              ho_ten: '', 
              khoan_chi: '', phong_ban: '', noi_dung: '', link_chung_tu: '', vat: false 
          });
          setFileQR(null);
          document.getElementById('fileInputQR').value = ""; 

          loadData();
      } catch (error) { alert("Lỗi: " + error.message); } finally { setIsSubmitting(false); }
  };

  // --- 5. SỬA & GHI LOG ---
  const handleEditClick = (item) => { 
      setEditingId(item.id);
      setEditFormData({ ...item, khoan_chi: formatCurrency(item.khoan_chi) });
      setEditFileQR(null);
  };

  const handleSaveEdit = async () => {
      try {
          const oldData = expenses.find(e => e.id === editingId);
          let newData = { ...editFormData, khoan_chi: parseMoney(editFormData.khoan_chi) };
          
          if (editFileQR) {
              const newQrUrl = await uploadImage(editFileQR);
              if (newQrUrl) {
                  newData.link_qr = newQrUrl;
              }
          }

          const changes = [];
          if (oldData.khoan_chi !== newData.khoan_chi) changes.push(`Tiền: ${formatCurrency(oldData.khoan_chi)} -> ${formatCurrency(newData.khoan_chi)}`);
          if (oldData.noi_dung !== newData.noi_dung) changes.push(`Nội dung: ${oldData.noi_dung} -> ${newData.noi_dung}`);
          if (oldData.link_qr !== newData.link_qr) changes.push(`Cập nhật ảnh QR Code mới`);
          
          if (changes.length > 0) {
            const newLog = { timestamp: new Date().toISOString(), detail: changes.join('; ') };
            const updatedLogs = [newLog, ...(oldData.history_log || [])];
            await supabase.from('expenses_ecom').update({ ...newData, history_log: updatedLogs }).eq('id', editingId);
          } else {
            await supabase.from('expenses_ecom').update(newData).eq('id', editingId);
          }
          alert("Đã lưu sửa đổi!"); setEditingId(null); loadData();
      } catch (err) { alert("Lỗi: " + err.message); }
  };

  // --- 6. DUYỆT (BẢO MẬT) ---
  const handleToggleConfirm = async (id, field, currentValue) => {
      const inputPass = prompt(`Nhập mật khẩu để duyệt/hủy duyệt ${field === 'confirm_thuchi' ? 'THỦ CHI' : 'BANK'}:`);
      if (inputPass === PASS_APPROVE) {
          await supabase.from('expenses_ecom').update({ [field]: !currentValue }).eq('id', id);
          loadData();
      } else if (inputPass !== null) {
          alert("Sai mật khẩu duyệt!");
      }
  };

  // --- STYLES ---
  const cardStyle = { backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', marginBottom: '20px' };
  const statCardStyle = (bgColor, textColor) => ({
      flex: 1, padding: '15px', borderRadius: '10px', backgroundColor: bgColor, color: textColor,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)', minWidth: '180px'
  });
  const inputStyle = { 
      width: '100%', height: '45px', padding: '0 10px', borderRadius: '6px', 
      border: '1px solid #ddd', outline: 'none', boxSizing: 'border-box', fontSize: '0.95rem'
  };
  const badgeStyle = (active, color) => ({
      padding:'4px 8px', borderRadius:'15px', fontSize:'11px', fontWeight:'bold', cursor:'pointer',
      border: `1px solid ${active ? color : '#ccc'}`, backgroundColor: active ? color : '#eee', color: active ? '#fff' : '#888',
      marginRight:'4px', minWidth:'60px', textAlign:'center', display:'inline-block'
  });

  return (
    <div style={{ padding: '20px' }}>
        {/* MODAL LỊCH SỬ */}
        {historyModalData && (
            <div style={{position:'fixed', inset:0, zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor: 'rgba(0,0,0,0.5)'}}>
                <div style={{background:'white', padding:'20px', borderRadius:'10px', width:'500px', maxHeight:'80vh', overflow:'auto'}}>
                    <h3>Lịch sử chỉnh sửa</h3>
                    {historyModalData.logs?.map((l, i) => <div key={i} style={{borderBottom:'1px solid #eee', padding:'5px'}}><b>{formatDate(l.timestamp)}</b>: {l.detail}</div>)}
                    <button onClick={() => setHistoryModalData(null)} style={{marginTop:'10px', width:'100%', padding:'10px'}}>Đóng</button>
                </div>
            </div>
        )}

        <h1 style={{ color: '#333', margin: '0 0 20px 0' }}>💸 QUẢN LÝ NGÂN SÁCH ECOM</h1>

        {/* --- KHU VỰC THỐNG KÊ --- */}
        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', alignItems: 'stretch' }}>
            {/* Cột trái: Ngân sách + Thẻ thống kê */}
            <div style={{ flex: 3, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* KHUNG NHẬP NGÂN SÁCH MỚI */}
                <div style={{ ...cardStyle, borderLeft: '5px solid #165B33', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 0 }}>
                    <div>
                        <h3 style={{ margin: 0, color: '#165B33' }}>💰 TỔNG NGÂN SÁCH</h3>
                        <p style={{ margin: '5px 0 0 0', fontSize: '0.8rem', color: '#666', fontStyle: 'italic' }}>
                            (Số cũ: <b>{formatCurrency(budget)} đ</b>)
                        </p>
                    </div>
                    
                    <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                        {/* Ô nhập tiền nạp thêm */}
                        <div style={{display:'flex', alignItems:'center'}}>
                            <input 
                                type="text" 
                                value={addBudgetAmount} 
                                onChange={e => setAddBudgetAmount(formatCurrency(e.target.value))} 
                                placeholder="Nhập tiền nạp thêm..."
                                style={{
                                    height: '40px', padding: '0 15px', borderRadius: '20px 0 0 20px', 
                                    border: '1px solid #165B33', borderRight: 'none', outline: 'none',
                                    fontWeight: 'bold', width: '180px', color: '#165B33'
                                }} 
                            />
                            <button 
                                onClick={handleAddBudget}
                                style={{
                                    height: '42px', padding: '0 20px', backgroundColor: '#165B33', color: 'white',
                                    border: 'none', borderRadius: '0 20px 20px 0', cursor: 'pointer', fontWeight: 'bold'
                                }}
                            >
                                + NẠP
                            </button>
                        </div>

                        {/* Số hiển thị tổng (Click vào để sửa thủ công nếu sai) */}
                        <div onClick={handleSetTotalBudget} style={{cursor:'pointer', marginLeft: '10px'}} title="Click để đặt lại số tổng (nếu cần)">
                            <div style={{ 
                                    fontSize: '1.8rem', fontWeight: 'bold', color: '#165B33', 
                                    padding: '0 20px', height: '50px', lineHeight: '50px',
                                    border: '2px solid #165B33', borderRadius: '10px', minWidth: '200px', 
                                    textAlign: 'right', backgroundColor: '#fff'
                                }}>
                                {formatCurrency(budget)} đ
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '15px', flex: 1 }}>
                    <div style={statCardStyle('#e8f5e9', '#2e7d32')}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', textTransform: 'uppercase' }}>🔋 CÒN LẠI (DƯ)</span>
                        <span style={{ fontSize: '1.6rem', fontWeight: '900', marginTop: '5px', color: stats.conLai < 0 ? 'red' : '#2e7d32' }}>
                            {stats.conLai < 0 ? '-' : ''}{formatCurrency(stats.conLai)} đ
                        </span>
                        {stats.conLai < 0 && <span style={{color:'red', fontWeight:'bold', fontSize:'0.8rem'}}>⚠️ VƯỢT NGÂN SÁCH!</span>}
                    </div>
                    <div style={statCardStyle('#fff3e0', '#ef6c00')}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', textTransform: 'uppercase' }}>⏳ CHỜ GIẢI NGÂN</span>
                        <span style={{ fontSize: '1.6rem', fontWeight: '900', marginTop: '5px' }}>{formatCurrency(stats.choChi)} đ</span>
                        <span style={{ fontSize: '0.75rem' }}>(TC đã duyệt)</span>
                    </div>
                    <div style={statCardStyle('#ffebee', '#c62828')}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', textTransform: 'uppercase' }}>✅ ĐÃ CHI (BANK)</span>
                        <span style={{ fontSize: '1.6rem', fontWeight: '900', marginTop: '5px' }}>{formatCurrency(stats.daChi)} đ</span>
                        <span style={{ fontSize: '0.75rem' }}>(Hoàn tất)</span>
                    </div>
                </div>
            </div>

            <div style={{ flex: 1, ...cardStyle, marginBottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#555', fontSize: '0.95rem' }}>TỶ TRỌNG NGÂN SÁCH</h4>
                <div style={{ width: '100%', height: '180px' }}>
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie 
                                data={chartData} 
                                innerRadius={50} 
                                outerRadius={70} 
                                paddingAngle={5} 
                                dataKey="value"
                            >
                                <Cell fill={stats.conLai >= 0 ? COLORS[0] : '#ff0000'} /> 
                                <Cell fill={COLORS[1]} /> 
                                <Cell fill={COLORS[2]} /> 
                            </Pie>
                            <Tooltip formatter={(val) => formatCurrency(val) + ' đ'} />
                            <Legend verticalAlign="bottom" height={36} iconSize={10}/>
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>

        {/* FORM NHẬP */}
        <div style={cardStyle}>
            <h3 style={{color: '#D42426', borderBottom:'1px solid #eee', paddingBottom:'10px'}}>✏️ NHẬP KHOẢN CHI MỚI</h3>
            <form onSubmit={handleAddExpense} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px' }}>
                <input type="date" value={newExpense.ngay_chi} onChange={e => setNewExpense({...newExpense, ngay_chi: e.target.value})} style={inputStyle} />
                <input placeholder="Họ tên (*)" value={newExpense.ho_ten} onChange={e => setNewExpense({...newExpense, ho_ten: e.target.value})} style={inputStyle} />
                
                {/* Input File QR Code */}
                <div style={{...inputStyle, padding: '5px', display: 'flex', alignItems: 'center'}}>
                    <span style={{marginRight: '10px', fontSize: '0.8rem', color: '#666'}}>QR Bank:</span>
                    <input 
                        id="fileInputQR"
                        type="file" 
                        accept="image/*" 
                        onChange={e => setFileQR(e.target.files[0])}
                        style={{border: 'none', outline: 'none', width: '100%'}} 
                    />
                </div>
                <div style={inputStyle}></div> 

                <select value={newExpense.phong_ban} onChange={e => setNewExpense({...newExpense, phong_ban: e.target.value})} style={inputStyle}><option value="">-Phòng ban-</option>{DEPARTMENT_OPTIONS.map(d=><option key={d} value={d}>{d}</option>)}</select>
                <input placeholder="Số tiền (*)" value={newExpense.khoan_chi} onChange={e => setNewExpense({...newExpense, khoan_chi: formatCurrency(e.target.value)})} style={{...inputStyle, fontWeight:'bold', color:'#D42426'}} />
                <input placeholder="Nội dung chi (*)" value={newExpense.noi_dung} onChange={e => setNewExpense({...newExpense, noi_dung: e.target.value})} style={{...inputStyle, gridColumn:'span 2'}} />
                <input placeholder="Link chứng từ" value={newExpense.link_chung_tu} onChange={e => setNewExpense({...newExpense, link_chung_tu: e.target.value})} style={{...inputStyle, gridColumn:'span 4'}} />
                
                <div style={{ gridColumn: 'span 4', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '30px', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #f9f9f9' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', color: '#333', userSelect: 'none' }}>
                        <input type="checkbox" checked={newExpense.vat} onChange={e => setNewExpense({...newExpense, vat: e.target.checked})} style={{ width: '20px', height: '20px', margin: '0 10px 0 0', cursor: 'pointer' }} /> 
                        Xuất hóa đơn VAT
                    </label>
                    <button type="submit" disabled={isSubmitting} style={{ backgroundColor: '#D42426', color: 'white', padding: '12px 60px', border: 'none', borderRadius: '30px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem', boxShadow: '0 4px 12px rgba(212, 36, 38, 0.3)', transition: 'all 0.2s' }}>
                        {isSubmitting ? 'ĐANG LƯU...' : 'LƯU KHOẢN CHI'}
                    </button>
                </div>
            </form>
        </div>

        {/* DANH SÁCH CHI TIẾT */}
        <div style={cardStyle}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '15px'}}>
                <h3 style={{color: '#333', margin: 0}}>DANH SÁCH CHI TIẾT</h3>
                <div style={{fontSize: '0.9rem', color: '#666'}}>Tìm thấy: <b>{filteredExpenses.length}</b> khoản chi</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #eee' }}>
                <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={inputStyle} title="Lọc theo tháng"/>
                <input type="text" placeholder="🔍 Tên người đề xuất..." value={filterName} onChange={e => setFilterName(e.target.value)} style={inputStyle} />
                <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={inputStyle}><option value="">-- Tất cả Phòng --</option>{DEPARTMENT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}</select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{...inputStyle, fontWeight: 'bold', color: filterStatus === 'pending' ? '#FF9800' : '#333'}}><option value="all">📝 Tất cả trạng thái</option><option value="pending">⏳ Chưa hoàn tất</option><option value="done">✅ Đã hoàn tất</option></select>
                <button onClick={clearFilters} style={{ ...inputStyle, backgroundColor: '#eee', color: '#555', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Xóa Lọc ✖</button>
            </div>

            <div style={{overflowX:'auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.9rem'}}>
                    <thead style={{backgroundColor:'#f5f5f5'}}>
                        <tr>
                            <th style={{padding:'10px', width: '50px'}}>STT</th>
                            <th style={{padding:'10px'}}>Ngày</th>
                            <th style={{padding:'10px', textAlign:'left'}}>Họ tên</th>
                            <th style={{padding:'10px', textAlign:'center'}}>QR Code</th>
                            <th style={{padding:'10px'}}>Phòng</th>
                            <th style={{padding:'10px', textAlign:'left', width: '20%'}}>Nội dung</th>
                            <th style={{padding:'10px', textAlign:'right'}}>Tiền</th>
                            <th style={{padding:'10px'}}>VAT</th>
                            <th style={{padding:'10px'}}>Link</th>
                            <th style={{padding:'10px'}}>Duyệt</th>
                            <th style={{padding:'10px'}}>Hành động</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredExpenses.map((item, index) => {
                            const isEdit = editingId === item.id;
                            const stt = filteredExpenses.length - index;

                            return (
                                <tr key={item.id} style={{borderBottom:'1px solid #eee', backgroundColor: isEdit ? '#f0f8ff' : 'white'}}>
                                    <td style={{padding:'10px', textAlign:'center', fontWeight:'bold', color: '#888'}}>{stt}</td>
                                    <td style={{padding:'10px', textAlign:'center'}}>{isEdit?<input type="date" value={editFormData.ngay_chi} onChange={e=>setEditFormData({...editFormData, ngay_chi:e.target.value})} style={inputStyle} />:item.ngay_chi}</td>
                                    <td style={{padding:'10px'}}><b>{isEdit?<input value={editFormData.ho_ten} onChange={e=>setEditFormData({...editFormData, ho_ten:e.target.value})} style={inputStyle} />:item.ho_ten}</b></td>
                                    
                                    <td style={{padding:'10px', textAlign:'center'}}>
                                        {isEdit ? (
                                            <input type="file" accept="image/*" onChange={e => setEditFileQR(e.target.files[0])} style={{width:'120px'}} />
                                        ) : (
                                            item.link_qr ? (
                                                <a href={item.link_qr} target="_blank" rel="noreferrer">
                                                    <img src={item.link_qr} alt="QR" style={{width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ddd'}} />
                                                </a>
                                            ) : <span style={{color:'#ccc', fontSize:'0.8rem'}}>No QR</span>
                                        )}
                                    </td>

                                    <td style={{padding:'10px', textAlign:'center'}}>{isEdit?<select value={editFormData.phong_ban} onChange={e=>setEditFormData({...editFormData, phong_ban:e.target.value})} style={inputStyle}>{DEPARTMENT_OPTIONS.map(d=><option key={d} value={d}>{d}</option>)}</select>:item.phong_ban}</td>
                                    <td style={{padding:'10px'}}>{isEdit?<input value={editFormData.noi_dung} onChange={e=>setEditFormData({...editFormData, noi_dung:e.target.value})} style={inputStyle} />:item.noi_dung}</td>
                                    <td style={{padding:'10px', textAlign:'right', color:'#D42426', fontWeight:'bold'}}>{isEdit?<input value={editFormData.khoan_chi} onChange={e=>setEditFormData({...editFormData, khoan_chi:formatCurrency(e.target.value)})} style={inputStyle} />:formatCurrency(item.khoan_chi)}</td>
                                    <td style={{padding:'10px', textAlign:'center'}}>{isEdit?<input type="checkbox" checked={editFormData.vat} onChange={e=>setEditFormData({...editFormData, vat:e.target.checked})}/>:(item.vat?<span style={{color:'green'}}>✔</span>:'-')}</td>
                                    <td style={{padding:'10px', textAlign:'center'}}>{isEdit?<input value={editFormData.link_chung_tu} onChange={e=>setEditFormData({...editFormData, link_chung_tu:e.target.value})} style={inputStyle} />:(item.link_chung_tu?<a href={item.link_chung_tu} target="_blank" rel="noreferrer" style={{color:'#1976D2'}}>Link</a>:'-')}</td>
                                    
                                    <td style={{padding:'10px', textAlign:'center', whiteSpace:'nowrap'}}>
                                        {!isEdit && (
                                            <>
                                                <div onClick={() => handleToggleConfirm(item.id, 'confirm_thuchi', item.confirm_thuchi)} style={badgeStyle(item.confirm_thuchi, '#FF9800')}>TC</div>
                                                <div onClick={() => handleToggleConfirm(item.id, 'confirm_nguoichuyen', item.confirm_nguoichuyen)} style={badgeStyle(item.confirm_nguoichuyen, '#4CAF50')}>Bank</div>
                                            </>
                                        )}
                                    </td>
                                    <td style={{padding:'10px', textAlign:'center'}}>
                                        {isEdit ?
                                            <><button onClick={handleSaveEdit} style={{marginRight:'5px'}}>Lưu</button> <button onClick={()=>setEditingId(null)}>Hủy</button></> : 
                                            <><button onClick={()=>handleEditClick(item)} style={{marginRight:'5px', cursor:'pointer'}}>Sửa</button> {item.history_log?.length>0 && <button onClick={()=>setHistoryModalData({logs:item.history_log})} style={{cursor:'pointer'}}>🕒</button>}</>
                                        }
                                    </td>
                                </tr>
                            )
                        })}
                        {filteredExpenses.length === 0 && (
                            <tr><td colSpan="11" style={{textAlign:'center', padding:'20px', color:'#999'}}>Không tìm thấy kết quả nào phù hợp.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  );
};

export default ExpenseEcomTab;