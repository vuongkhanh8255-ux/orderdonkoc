// src/components/LoginPage.jsx
import { useState } from 'react';
import { supabase } from '../supabaseClient';

const LoginPage = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [remember, setRemember] = useState(true);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const uname = username.trim().toLowerCase();

            // Tìm account match trong danh sách hardcoded
            let candidate = ACCOUNTS.find(a => a.username === uname);

            // Với admin: lấy password động từ Supabase app_security (override hardcoded)
            if (candidate && candidate.role === 'admin') {
                try {
                    const { data, error: dbErr } = await supabase
                        .from('app_security')
                        .select('value')
                        .eq('key', 'admin_password')
                        .maybeSingle();
                    if (!dbErr && data?.value) {
                        candidate = { ...candidate, password: data.value };
                    }
                } catch { /* fallback to hardcoded password */ }
            }

            if (candidate && candidate.password === password) {
                // Lưu thêm login_at để check force-logout sau này
                const sessionAccount = { ...candidate, login_at: new Date().toISOString() };
                onLogin(sessionAccount, remember);
            } else {
                setError('Sai tên đăng nhập hoặc mật khẩu!');
            }
        } catch {
            setError('Lỗi đăng nhập. Vui lòng thử lại.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#f6f7f9',
            fontFamily: "'Outfit', sans-serif"
        }}>
            <div style={{
                background: '#fff', borderRadius: 12, padding: '42px 38px', width: 400,
                boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 16px 40px rgba(15,23,42,0.08)',
                border: '1px solid #e5e7eb'
            }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{
                        width: 58, height: 58, background: '#ea580c',
                        borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 12px', boxShadow: '0 10px 22px rgba(234,88,12,0.16)',
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
                            marginTop: 4, padding: '13px', borderRadius: 8, border: 'none',
                            background: loading ? '#d1d5db' : '#ea580c',
                            color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: loading ? 'default' : 'pointer',
                            boxShadow: loading ? 'none' : '0 8px 18px rgba(234,88,12,0.18)',
                            transition: 'all 0.2s', fontFamily: "'Outfit', sans-serif", letterSpacing: 0
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
    // ── ECOM accounts (5 users, propose-only quyền cho phần Định danh KOC) ──
    { username: 'ecom1',      password: 'Ecom1@SK2025',    role: 'ecom',       name: 'Ecom 1'      },
    { username: 'ecom2',      password: 'Ecom2@SK2025',    role: 'ecom',       name: 'Ecom 2'      },
    { username: 'ecom3',      password: 'Ecom3@SK2025',    role: 'ecom',       name: 'Ecom 3'      },
    { username: 'ecom4',      password: 'Ecom4@SK2025',    role: 'ecom',       name: 'Ecom 4'      },
    { username: 'ecom5',      password: 'Ecom5@SK2025',    role: 'ecom',       name: 'Ecom 5'      },
];

// ── ROLE PERMISSIONS ──────────────────────────────────────
export const ROLE_VIEWS = {
    admin:      ['stella_dashboard','listed_price','tiktok_orders','cskh','livestream','dashboard','order','booking_performance','contract','airlinks','booking','data_archive','expense','landing_orders','camp_registration','task_notes'],
    booking:    ['dashboard','order','booking_performance','contract','airlinks','booking','expense','camp_registration','listed_price','tiktok_orders','task_notes'],
    cs:         ['order','airlinks','expense','task_notes'],
    livestream: ['stella_dashboard','livestream','expense','task_notes'],
    // ECOM: full Ecom group + CSKH + Livestream + Booking group (trừ Hợp Đồng) + Ngân Sách Ecom
    //       booking_performance chỉ được "đề xuất" (yellow), admin duyệt mới thành red
    //       KHÔNG có: Hợp Đồng, Lưu Trữ Data, Task & Notes
    ecom:       [
        'stella_dashboard','listed_price','tiktok_orders','camp_registration', // Ecom group
        'cskh',                                                                // CSKH
        'livestream',                                                          // Livestream
        'dashboard','order','booking_performance','airlinks',                  // Booking (no Hợp Đồng)
        'expense',                                                             // Lưu trữ — Ngân Sách Ecom
    ],
};

export default LoginPage;
