// src/components/LoginPage.jsx
import { useState } from 'react';

const LoginPage = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [remember, setRemember] = useState(true);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setTimeout(() => {
            const found = ACCOUNTS.find(
                a => a.username === username.trim().toLowerCase() && a.password === password
            );
            if (found) {
                onLogin(found, remember);
            } else {
                setError('Sai tên đăng nhập hoặc mật khẩu!');
            }
            setLoading(false);
        }, 400);
    };

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #fff7ed 0%, #fef3c7 50%, #ffedd5 100%)',
            fontFamily: "'Outfit', sans-serif"
        }}>
            <div style={{
                background: '#fff', borderRadius: 24, padding: '48px 40px', width: 400,
                boxShadow: '0 20px 60px rgba(234,88,12,0.15), 0 4px 20px rgba(0,0,0,0.08)',
                border: '1px solid #fed7aa'
            }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{
                        width: 64, height: 64, background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
                        borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 12px', boxShadow: '0 8px 20px rgba(234,88,12,0.3)',
                        fontSize: '2rem', color: '#fff', fontWeight: 900
                    }}>✦</div>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#999', letterSpacing: 2, textTransform: 'uppercase' }}>powered by</p>
                    <h1 style={{ margin: '4px 0 0', fontSize: '1.3rem', fontWeight: 900, color: '#ea580c', letterSpacing: 2, textTransform: 'uppercase' }}>
                        STELLA KINETICS
                    </h1>
                    <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: '#9ca3af' }}>Đăng nhập để tiếp tục</p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Tên đăng nhập
                        </label>
                        <input
                            type="text" value={username} onChange={e => { setUsername(e.target.value); setError(''); }}
                            placeholder="Nhập username..."
                            style={{
                                width: '100%', padding: '12px 14px', borderRadius: 10, boxSizing: 'border-box',
                                border: error ? '2px solid #f87171' : '2px solid #e5e7eb',
                                fontSize: '0.9rem', outline: 'none', transition: 'border 0.2s',
                                fontFamily: "'Outfit', sans-serif"
                            }}
                            onFocus={e => e.target.style.border = '2px solid #ea580c'}
                            onBlur={e => e.target.style.border = error ? '2px solid #f87171' : '2px solid #e5e7eb'}
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Mật khẩu
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showPass ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
                                placeholder="Nhập mật khẩu..."
                                style={{
                                    width: '100%', padding: '12px 44px 12px 14px', borderRadius: 10, boxSizing: 'border-box',
                                    border: error ? '2px solid #f87171' : '2px solid #e5e7eb',
                                    fontSize: '0.9rem', outline: 'none', transition: 'border 0.2s',
                                    fontFamily: "'Outfit', sans-serif"
                                }}
                                onFocus={e => e.target.style.border = '2px solid #ea580c'}
                                onBlur={e => e.target.style.border = error ? '2px solid #f87171' : '2px solid #e5e7eb'}
                            />
                            <button type="button" onClick={() => setShowPass(v => !v)}
                                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#9ca3af' }}>
                                {showPass ? '🙈' : '👁️'}
                            </button>
                        </div>
                    </div>

                    {/* Ghi nhớ đăng nhập */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                        <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                            style={{ width: 16, height: 16, accentColor: '#ea580c', cursor: 'pointer' }} />
                        <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>Ghi nhớ đăng nhập</span>
                    </label>

                    {error && (
                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                            ⚠️ {error}
                        </div>
                    )}

                    <button type="submit" disabled={loading}
                        style={{
                            marginTop: 4, padding: '14px', borderRadius: 12, border: 'none',
                            background: loading ? '#d1d5db' : 'linear-gradient(135deg, #f59e0b, #ea580c)',
                            color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: loading ? 'default' : 'pointer',
                            boxShadow: loading ? 'none' : '0 4px 12px rgba(234,88,12,0.3)',
                            transition: 'all 0.2s', fontFamily: "'Outfit', sans-serif", letterSpacing: '0.5px'
                        }}>
                        {loading ? '⏳ Đang xử lý...' : '🔑 ĐĂNG NHẬP'}
                    </button>
                </form>
            </div>
        </div>
    );
};

// ── ACCOUNTS ──────────────────────────────────────────────
export const ACCOUNTS = [
    { username: 'admin',      password: 'Admin@SK2025',    role: 'admin',      name: 'Admin Tổng'  },
    { username: 'booking',    password: 'Booking@SK2025',  role: 'booking',    name: 'Booking'     },
    { username: 'cs',         password: 'CS@SK2025',       role: 'cs',         name: 'CS'          },
    { username: 'livestream', password: 'Live@SK2025',     role: 'livestream', name: 'Livestream'  },
];

// ── ROLE PERMISSIONS ──────────────────────────────────────
export const ROLE_VIEWS = {
    admin:      ['stella_dashboard','cskh','livestream','dashboard','order','booking_performance','contract','airlinks','booking','data_archive','expense','landing_orders'],
    booking:    ['dashboard','order','booking_performance','contract','airlinks','booking','expense'],
    cs:         ['order','airlinks','expense'],
    livestream: ['stella_dashboard','livestream','expense'],
};

export default LoginPage;
