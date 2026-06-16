import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css' // Dòng này là quan trọng nhất!

// Bản phụ orderdonkoc.vercel.app THIẾU key (API trả shop rỗng → trang trắng).
// Ai lỡ mở link này → tự đẩy về bản chính (stellakinetics.space) cho có data.
if (typeof window !== 'undefined' && window.location.hostname === 'orderdonkoc.vercel.app') {
  window.location.replace('https://stellakinetics.space' + window.location.pathname + window.location.search + window.location.hash)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)