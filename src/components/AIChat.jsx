// src/components/AIChat.jsx

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { useAppData } from '../context/AppDataContext';
import { supabase } from '../supabaseClient';

const AIChat = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'model', text: 'Chào sếp! Em là trợ lý AI. Sếp cần tra cứu số liệu gì (ví dụ: "Doanh số Tường Vi tháng 10") cứ hỏi em nhé!' }
  ]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef(null);

  const { nhanSus, brands } = useAppData();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const question = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: question }]);
    setIsThinking(true);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Chưa tìm thấy API Key! Bạn nhớ tạo file .env và khởi động lại server nhé.");
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      
      // --- SỬA LẠI MODEL CHUẨN NHẤT HIỆN TẠI ---
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      // --- PHÂN TÍCH CÂU HỎI ---
      const listNhanSu = nhanSus.map(n => n.ten_nhansu).join(", ");
      const listBrand = brands.map(b => b.ten_brand).join(", ");

      const analyzePrompt = `
        Bạn là một chuyên gia SQL. Nhiệm vụ: Phân tích câu hỏi tiếng Việt thành JSON.
        Dữ liệu tham khảo: Nhân sự: [${listNhanSu}], Brand: [${listBrand}].
        Câu hỏi: "${question}"
        Yêu cầu: CHỈ TRẢ VỀ JSON, KHÔNG MARKDOWN.
        Format: { "intent": "count_video"|"sum_cast"|"greeting"|"other", "nhansu_name": "tên hoặc null", "brand_name": "tên hoặc null", "month": số, "year": số (mặc định 2025) }
      `;

      const result = await model.generateContent(analyzePrompt);
      let jsonText = result.response.text();
      jsonText = jsonText.replace(/```json|```/g, '').trim();
      
      let intentData;
      try {
        intentData = JSON.parse(jsonText);
      } catch (e) {
        intentData = { intent: "other" };
      }

      // --- XỬ LÝ LOGIC ---
      let finalResponseText = "";

      if (intentData.intent === 'greeting') {
        finalResponseText = "Chào sếp! Chúc sếp một ngày làm việc hiệu quả. Sếp cần xem số liệu nào không?";
      } else if (intentData.intent === 'other') {
        finalResponseText = "Câu hỏi này em chưa hiểu rõ. Sếp hỏi cụ thể hơn về 'số lượng video' hoặc 'chi phí' nhé!";
      } else {
        let query = supabase.from('air_links').select('id, "cast", ngay_booking', { count: 'exact' });

        if (intentData.nhansu_name) {
          const ns = nhanSus.find(n => n.ten_nhansu.toLowerCase() === intentData.nhansu_name.toLowerCase());
          if (ns) query = query.eq('nhansu_id', ns.id);
        }
        if (intentData.brand_name) {
          const br = brands.find(b => b.ten_brand.toLowerCase() === intentData.brand_name.toLowerCase());
          if (br) query = query.eq('brand_id', br.id);
        }
        if (intentData.month) {
          const year = intentData.year || 2025;
          const startDate = `${year}-${String(intentData.month).padStart(2, '0')}-01`;
          const endDate = new Date(year, intentData.month, 0).toISOString().split('T')[0];
          query = query.gte('ngay_booking', startDate).lte('ngay_booking', endDate);
        }

        const { data, count, error } = await query;

        if (error) throw error;

        if (intentData.intent === 'count_video') {
          finalResponseText = `Dạ, tìm thấy tổng cộng **${count} video**`;
          if (intentData.nhansu_name) finalResponseText += ` của ${intentData.nhansu_name}`;
          if (intentData.month) finalResponseText += ` trong tháng ${intentData.month}`;
          finalResponseText += ".";
        } else if (intentData.intent === 'sum_cast') {
          const totalCast = data.reduce((sum, item) => {
             const castNum = parseFloat((item.cast || '0').replace(/\./g, '').replace(/,/g, ''));
             return sum + (isNaN(castNum) ? 0 : castNum);
          }, 0);
          finalResponseText = `Tổng chi phí Cast là: **${totalCast.toLocaleString('vi-VN')} đ**`;
          if (intentData.nhansu_name) finalResponseText += ` cho ${intentData.nhansu_name}`;
          finalResponseText += ".";
        }
      }

      setMessages(prev => [...prev, { role: 'model', text: finalResponseText }]);

    } catch (error) {
      console.error("Lỗi:", error);
      // Hiện lỗi chi tiết để dễ debug
      setMessages(prev => [...prev, { role: 'model', text: `Lỗi API: ${error.message}. (Sếp nhớ tạo Key mới và restart server nha!)` }]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleKeyPress = (e) => { if (e.key === 'Enter') handleSend(); };

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)} style={{ position: 'fixed', bottom: '20px', right: '20px', width: '60px', height: '60px', borderRadius: '50%', background: 'linear-gradient(135deg, #D42426, #ff4d4d)', color: 'white', border: '2px solid white', boxShadow: '0 4px 15px rgba(0,0,0,0.4)', zIndex: 10000, fontSize: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.2s' }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
        {isOpen ? '✕' : '🤖'}
      </button>
      {isOpen && (
        <div style={{ position: 'fixed', bottom: '90px', right: '20px', width: '380px', height: '550px', backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', zIndex: 10000, display: 'flex', flexDirection: 'column', border: '1px solid #eee', overflow: 'hidden', animation: 'slideUp 0.3s ease-out' }}>
          <div style={{ padding: '15px', background: 'linear-gradient(90deg, #165B33, #D42426)', color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
            <span style={{fontSize: '1.5rem'}}>🤖</span> <span>Trợ Lý KOC (AI)</span>
          </div>
          <div style={{ flex: 1, padding: '15px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px', backgroundColor: '#f4f7f6' }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', backgroundColor: msg.role === 'user' ? '#D42426' : 'white', color: msg.role === 'user' ? 'white' : '#333', padding: '12px 16px', borderRadius: '12px', maxWidth: '80%', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', borderBottomRightRadius: msg.role === 'user' ? '2px' : '12px', borderBottomLeftRadius: msg.role === 'model' ? '2px' : '12px', fontSize: '14px', lineHeight: '1.5' }}>
                {msg.text}
              </div>
            ))}
            {isThinking && <div style={{ alignSelf: 'flex-start', color: '#666', fontSize: '13px', fontStyle: 'italic' }}>⚡ Đang suy nghĩ...</div>}
            <div ref={messagesEndRef} />
          </div>
          <div style={{ padding: '15px', borderTop: '1px solid #eee', display: 'flex', gap: '10px', backgroundColor: 'white' }}>
            <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyPress={handleKeyPress} placeholder="Hỏi gì đi..." style={{ flex: 1, padding: '10px 15px', borderRadius: '25px', border: '1px solid #ddd', outline: 'none', fontSize: '14px', backgroundColor: '#f9f9f9' }} />
            <button onClick={handleSend} disabled={isThinking} style={{ padding: '10px 20px', background: '#165B33', color: 'white', borderRadius: '25px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>Gửi</button>
          </div>
        </div>
      )}
    </>
  );
};

export default AIChat;