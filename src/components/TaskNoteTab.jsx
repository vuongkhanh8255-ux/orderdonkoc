// src/components/TaskNoteTab.jsx
import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const STORAGE_KEY = 'sk_task_notes_v2';
const DB_NAME = 'sk_task_notes_db';
const DB_VERSION = 1;
const DB_STORE = 'kv';
const DB_TASKS_KEY = 'tasks';
const SUPABASE_TABLE = 'task_notes';

const STATUS_CONFIG = {
    'Mới':              { color: '#6366f1', bg: '#eef2ff', border: '#c7d2fe' },
    'Đang thực hiện':   { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
    'Hoàn thành':       { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
    'Tạm hoãn':         { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
};
const STATUS_LIST = Object.keys(STATUS_CONFIG);

const normalizeTaskList = (value) => Array.isArray(value) ? value : [];

const loadTasks = () => {
    try { return normalizeTaskList(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
    catch { return []; }
};

const openTaskDb = () => new Promise((resolve, reject) => {
    if (!window.indexedDB) {
        reject(new Error('IndexedDB is not supported'));
        return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const loadTasksFromDb = async () => {
    try {
        const db = await openTaskDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, 'readonly');
            const store = tx.objectStore(DB_STORE);
            const request = store.get(DB_TASKS_KEY);
            request.onsuccess = () => resolve(normalizeTaskList(request.result));
            request.onerror = () => reject(request.error);
            tx.oncomplete = () => db.close();
        });
    } catch {
        return null;
    }
};

const saveTasksToDb = async (tasks) => {
    try {
        const db = await openTaskDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, 'readwrite');
            tx.objectStore(DB_STORE).put(tasks, DB_TASKS_KEY);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        });
    } catch (error) {
        console.warn('Không lưu được task vào IndexedDB:', error);
    }
};

const saveTasks = (tasks) => {
    saveTasksToDb(tasks);

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
        // Base64 ảnh có thể vượt quota localStorage; IndexedDB phía trên vẫn là nơi lưu chính.
        try {
            const lightweightTasks = tasks.map(({ imgSrc, ...task }) => ({
                ...task,
                imgSrc: imgSrc ? null : imgSrc,
                hasImageBackup: Boolean(imgSrc)
            }));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweightTasks));
        } catch {
            // Ignore localStorage fallback errors.
        }
    }
};

const mapDbTask = (row) => ({
    id: row.id,
    title: row.title || '',
    desc: row.description || '',
    imgSrc: row.image_src || null,
    ngayYeuCau: row.requested_date || todayStr(),
    deadline: row.deadline || '',
    tienDo: Number(row.progress) || 0,
    status: row.status || 'Mới'
});

const mapTaskPayload = (task) => ({
    id: String(task.id),
    title: task.title || '',
    description: task.desc || '',
    image_src: task.imgSrc || null,
    requested_date: task.ngayYeuCau || null,
    deadline: task.deadline || null,
    progress: Number(task.tienDo) || 0,
    status: task.status || 'Mới',
    updated_at: new Date().toISOString()
});

const loadTasksFromSupabase = async () => {
    const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .select('*')
        .order('updated_at', { ascending: false });

    if (error) throw error;
    return normalizeTaskList(data).map(mapDbTask);
};

const upsertTasksToSupabase = async (tasks) => {
    if (!tasks.length) return;
    const { error } = await supabase
        .from(SUPABASE_TABLE)
        .upsert(tasks.map(mapTaskPayload), { onConflict: 'id' });
    if (error) throw error;
};

const deleteTaskFromSupabase = async (id) => {
    const { error } = await supabase.from(SUPABASE_TABLE).delete().eq('id', String(id));
    if (error) throw error;
};

const isMissingTaskTable = (error) => ['42P01', 'PGRST205'].includes(error?.code);

const todayStr = () => new Date().toISOString().slice(0, 10);

function daysDiff(dateStr) {
    if (!dateStr) return null;
    const diff = new Date(dateStr) - new Date(todayStr());
    return Math.ceil(diff / 86400000);
}

function DeadlineBadge({ deadline, status }) {
    if (!deadline) return null;
    const d = daysDiff(deadline);
    const done = status === 'Hoàn thành';
    if (done) return <span style={{ fontSize: '0.68rem', color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 5, padding: '1px 6px' }}>✅ Xong</span>;
    if (d < 0)   return <span style={{ fontSize: '0.68rem', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, padding: '1px 6px' }}>⚠️ Quá hạn {Math.abs(d)} ngày</span>;
    if (d === 0) return <span style={{ fontSize: '0.68rem', color: '#ea580c', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 5, padding: '1px 6px' }}>🔥 Hôm nay</span>;
    if (d <= 3)  return <span style={{ fontSize: '0.68rem', color: '#d97706', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, padding: '1px 6px' }}>⏳ Còn {d} ngày</span>;
    return <span style={{ fontSize: '0.68rem', color: '#6b7280', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 5, padding: '1px 6px' }}>📅 Còn {d} ngày</span>;
}

const EMPTY_FORM = { title: '', desc: '', imgSrc: null, ngayYeuCau: todayStr(), deadline: '', tienDo: 0, status: 'Mới' };

export default function TaskNoteTab() {
    const [tasks,    setTasks]    = useState(loadTasks);
    const [dbReady,  setDbReady]  = useState(false);
    const [syncStatus, setSyncStatus] = useState('Đang đồng bộ...');
    const [filter,   setFilter]   = useState('Tất cả');
    const [modal,    setModal]    = useState(false);
    const [form,     setForm]     = useState(EMPTY_FORM);
    const [editId,   setEditId]   = useState(null);
    const [lightbox, setLightbox] = useState(null);
    const fileRef = useRef();

    useEffect(() => {
        let mounted = true;
        const hydrateTasks = async () => {
            const localTasks = await loadTasksFromDb();
            if (!mounted) return;
            const fallbackTasks = localTasks && localTasks.length > 0 ? localTasks : loadTasks();
            if (fallbackTasks.length > 0) setTasks(fallbackTasks);
            setDbReady(true);

            try {
                const remoteTasks = await loadTasksFromSupabase();
                if (!mounted) return;

                if (remoteTasks.length > 0) {
                    setTasks(remoteTasks);
                    saveTasks(remoteTasks);
                    setSyncStatus('Đã đồng bộ Supabase');
                    return;
                }

                if (fallbackTasks.length > 0) {
                    await upsertTasksToSupabase(fallbackTasks);
                    setSyncStatus('Đã đưa note local lên Supabase');
                    return;
                }

                setSyncStatus('Đã đồng bộ Supabase');
            } catch (error) {
                console.warn('Không đồng bộ được Task & Notes với Supabase:', error);
                if (!mounted) return;
                setSyncStatus(isMissingTaskTable(error)
                    ? 'Chưa có bảng task_notes trên Supabase'
                    : 'Đang lưu local, Supabase lỗi');
            }
        };
        hydrateTasks();
        return () => { mounted = false; };
    }, []);

    useEffect(() => {
        if (!dbReady) return;
        saveTasks(tasks);
    }, [tasks, dbReady]);

    /* ── helpers ── */
    const openAdd  = () => { setForm({ ...EMPTY_FORM, ngayYeuCau: todayStr() }); setEditId(null); setModal(true); };
    const openEdit = (t) => { setForm({ ...t }); setEditId(t.id); setModal(true); };
    const closeModal = () => { setModal(false); setForm(EMPTY_FORM); setEditId(null); if (fileRef.current) fileRef.current.value = ''; };

    const handleImage = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setForm(f => ({ ...f, imgSrc: ev.target.result }));
        reader.readAsDataURL(file);
    };

    const handleSave = () => {
        if (!form.title.trim()) return;
        if (editId !== null) {
            setTasks(prev => {
                const savedTask = { ...form, id: editId, title: form.title.trim() };
                const next = prev.map(t => t.id === editId ? savedTask : t);
                saveTasks(next);
                upsertTasksToSupabase([savedTask])
                    .then(() => setSyncStatus('Đã lưu Supabase'))
                    .catch(error => {
                        console.warn('Lưu task lên Supabase lỗi:', error);
                        setSyncStatus(isMissingTaskTable(error) ? 'Chưa có bảng task_notes trên Supabase' : 'Lưu local, Supabase lỗi');
                    });
                return next;
            });
        } else {
            setTasks(prev => {
                const savedTask = { ...form, id: String(Date.now()), title: form.title.trim() };
                const next = [savedTask, ...prev];
                saveTasks(next);
                upsertTasksToSupabase([savedTask])
                    .then(() => setSyncStatus('Đã lưu Supabase'))
                    .catch(error => {
                        console.warn('Lưu task lên Supabase lỗi:', error);
                        setSyncStatus(isMissingTaskTable(error) ? 'Chưa có bảng task_notes trên Supabase' : 'Lưu local, Supabase lỗi');
                    });
                return next;
            });
        }
        closeModal();
    };

    const handleDelete = (id) => {
        if (window.confirm('Xoá task này?')) {
            setTasks(prev => {
                const next = prev.filter(t => t.id !== id);
                saveTasks(next);
                deleteTaskFromSupabase(id)
                    .then(() => setSyncStatus('Đã xoá trên Supabase'))
                    .catch(error => {
                        console.warn('Xoá task trên Supabase lỗi:', error);
                        setSyncStatus(isMissingTaskTable(error) ? 'Chưa có bảng task_notes trên Supabase' : 'Xoá local, Supabase lỗi');
                    });
                return next;
            });
        }
    };

    /* ── filter ── */
    const filtered  = filter === 'Tất cả' ? tasks : tasks.filter(t => t.status === filter);
    const countOf   = (s) => tasks.filter(t => t.status === s).length;
    const isOverdue = (t) => t.deadline && daysDiff(t.deadline) < 0 && t.status !== 'Hoàn thành';

    /* ── dashboard stats ── */
    const total      = tasks.length;
    const cntMoi     = countOf('Mới');
    const cntDang    = countOf('Đang thực hiện');
    const cntXong    = countOf('Hoàn thành');
    const cntHoan    = countOf('Tạm hoãn');
    const cntOverdue = tasks.filter(isOverdue).length;
    const avgTienDo  = total > 0 ? Math.round(tasks.reduce((s, t) => s + (t.tienDo || 0), 0) / total) : 0;

    const DASH_CARDS = [
        { icon: '📋', label: 'Tổng Tasks',       value: total,      accent: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
        { icon: '🆕', label: 'Mới',              value: cntMoi,     accent: '#6366f1', bg: '#eef2ff', border: '#c7d2fe' },
        { icon: '⚙️', label: 'Đang thực hiện',  value: cntDang,    accent: '#d97706', bg: '#fffbeb', border: '#fde68a' },
        { icon: '✅', label: 'Hoàn thành',       value: cntXong,    accent: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
        { icon: '⏸️', label: 'Tạm hoãn',        value: cntHoan,    accent: '#9ca3af', bg: '#f9fafb', border: '#e5e7eb' },
        { icon: '⚠️', label: 'Quá hạn',         value: cntOverdue, accent: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    ];

    return (
        <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 1200, margin: '0 auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                    <h1 className="page-header" style={{ margin: 0 }}>📝 TASK & NOTES</h1>
                    <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#9ca3af' }}>Quản lý công việc và ghi chú nội bộ</p>
                    <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: syncStatus.includes('lỗi') || syncStatus.includes('Chưa') ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                        {syncStatus}
                    </p>
                </div>
                <button onClick={openAdd} style={{
                    padding: '10px 20px', background: 'linear-gradient(135deg,#f59e0b,#ea580c)',
                    color: '#fff', border: 'none', borderRadius: 12, fontWeight: 800,
                    fontSize: '0.88rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(234,88,12,0.3)',
                    fontFamily: "'Outfit', sans-serif"
                }}>➕ Thêm Task</button>
            </div>

            {/* ── Dashboard ── */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', padding: '20px 24px', marginBottom: 24 }}>

                {/* Stat cards row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
                    {DASH_CARDS.map(card => (
                        <div key={card.label}
                            onClick={() => setFilter(card.label === 'Tổng Tasks' ? 'Tất cả' : card.label === 'Quá hạn' ? filter : card.label)}
                            style={{
                                background: card.bg, border: `1px solid ${card.border}`,
                                borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
                                transition: 'transform 0.15s, box-shadow 0.15s',
                                borderTop: `3px solid ${card.accent}`,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.1)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                            <div style={{ fontSize: '1.4rem', marginBottom: 6 }}>{card.icon}</div>
                            <div style={{ fontSize: '1.7rem', fontWeight: 900, color: card.accent, lineHeight: 1 }}>{card.value}</div>
                            <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 4, fontWeight: 600 }}>{card.label}</div>
                        </div>
                    ))}
                </div>

                {/* Overall progress bar */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151' }}>📊 Tiến độ trung bình toàn bộ tasks</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 900, color: avgTienDo >= 100 ? '#16a34a' : '#ea580c' }}>{avgTienDo}%</span>
                    </div>
                    <div style={{ height: 10, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{
                            height: '100%', borderRadius: 99,
                            width: `${avgTienDo}%`, transition: 'width 0.6s ease',
                            background: avgTienDo >= 100
                                ? 'linear-gradient(90deg,#22c55e,#16a34a)'
                                : avgTienDo >= 60
                                    ? 'linear-gradient(90deg,#f59e0b,#ea580c)'
                                    : 'linear-gradient(90deg,#f59e0b,#ea580c)',
                        }} />
                    </div>
                    {/* Completion rate */}
                    {total > 0 && (
                        <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                            {[
                                { label: 'Tỉ lệ hoàn thành', value: `${Math.round(cntXong / total * 100)}%`, color: '#16a34a' },
                                { label: 'Đang xử lý', value: `${Math.round(cntDang / total * 100)}%`, color: '#d97706' },
                                { label: 'Cần chú ý', value: `${cntOverdue} quá hạn`, color: cntOverdue > 0 ? '#dc2626' : '#9ca3af' },
                            ].map(s => (
                                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.74rem' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block', flexShrink: 0 }} />
                                    <span style={{ color: '#6b7280' }}>{s.label}:</span>
                                    <span style={{ fontWeight: 700, color: s.color }}>{s.value}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Filter bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
                {['Tất cả', ...STATUS_LIST].map(s => {
                    const active = filter === s;
                    const cfg    = STATUS_CONFIG[s];
                    const cnt    = s === 'Tất cả' ? tasks.length : countOf(s);
                    return (
                        <button key={s} onClick={() => setFilter(s)} style={{
                            padding: '7px 14px', borderRadius: 20,
                            border: active ? `2px solid ${cfg?.color || '#ea580c'}` : '2px solid #e5e7eb',
                            background: active ? (cfg?.bg || '#fff7ed') : '#fff',
                            color: active ? (cfg?.color || '#ea580c') : '#6b7280',
                            fontWeight: active ? 800 : 500, fontSize: '0.8rem',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                            fontFamily: "'Outfit', sans-serif", transition: 'all 0.15s'
                        }}>
                            {s}
                            <span style={{
                                background: active ? (cfg?.color || '#ea580c') : '#e5e7eb',
                                color: active ? '#fff' : '#6b7280',
                                borderRadius: 10, padding: '0 6px', fontSize: '0.7rem', fontWeight: 800
                            }}>{cnt}</span>
                        </button>
                    );
                })}
            </div>

            {/* Card Grid */}
            {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#d1d5db' }}>
                    <div style={{ fontSize: '3rem', marginBottom: 12 }}>📭</div>
                    <div style={{ fontSize: '0.9rem' }}>
                        Chưa có task nào{filter !== 'Tất cả' ? ` cho "${filter}"` : ''}
                    </div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 16 }}>
                    {filtered.map(task => {
                        const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG['Mới'];
                        const overdue = isOverdue(task);
                        return (
                            <div key={task.id} style={{
                                background: '#fff', borderRadius: 14,
                                border: overdue ? '2px solid #fca5a5' : '1px solid #f0f0f0',
                                boxShadow: overdue
                                    ? '0 4px 16px rgba(220,38,38,0.1)'
                                    : '0 2px 8px rgba(0,0,0,0.06)',
                                overflow: 'hidden', display: 'flex', flexDirection: 'column',
                                transition: 'box-shadow 0.2s'
                            }}>
                                {/* Image */}
                                {task.imgSrc && (
                                    <div style={{ cursor: 'zoom-in', overflow: 'hidden', maxHeight: 160 }}
                                        onClick={() => setLightbox(task.imgSrc)}>
                                        <img src={task.imgSrc} alt="" style={{ width: '100%', objectFit: 'cover', display: 'block', maxHeight: 160 }} />
                                    </div>
                                )}

                                <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {/* Status badge */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        <span style={{
                                            fontSize: '0.7rem', fontWeight: 700, color: cfg.color,
                                            background: cfg.bg, border: `1px solid ${cfg.border}`,
                                            borderRadius: 6, padding: '2px 8px'
                                        }}>{task.status}</span>
                                        {overdue && (
                                            <span style={{ fontSize: '0.68rem', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, padding: '1px 6px' }}>⚠️ Quá hạn</span>
                                        )}
                                    </div>

                                    {/* Title */}
                                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#1f2937', lineHeight: 1.4 }}>{task.title}</div>

                                    {/* Description */}
                                    {task.desc && (
                                        <div style={{ fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{task.desc}</div>
                                    )}

                                    {/* Dates */}
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: '0.72rem', color: '#9ca3af' }}>
                                        {task.ngayYeuCau && <span>📋 Yêu cầu: <b style={{ color: '#6b7280' }}>{task.ngayYeuCau}</b></span>}
                                        {task.deadline   && <span>🗓️ Hạn: <b style={{ color: '#6b7280' }}>{task.deadline}</b></span>}
                                    </div>

                                    {/* Countdown */}
                                    <DeadlineBadge deadline={task.deadline} status={task.status} />

                                    {/* Progress */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#9ca3af', marginBottom: 4 }}>
                                            <span>Tiến độ</span>
                                            <span style={{ fontWeight: 700, color: task.tienDo >= 100 ? '#16a34a' : '#ea580c' }}>{task.tienDo}%</span>
                                        </div>
                                        <div style={{ height: 7, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                                            <div style={{
                                                height: '100%', borderRadius: 99, transition: 'width 0.4s ease',
                                                width: `${task.tienDo}%`,
                                                background: task.tienDo >= 100
                                                    ? 'linear-gradient(90deg,#22c55e,#16a34a)'
                                                    : 'linear-gradient(90deg,#f59e0b,#ea580c)'
                                            }} />
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                        <button onClick={() => openEdit(task)} style={{ flex: 1, padding: '6px 0', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: '0.73rem', color: '#0369a1', cursor: 'pointer', fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>✏️ Sửa</button>
                                        <button onClick={() => handleDelete(task.id)} style={{ flex: 1, padding: '6px 0', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: '0.73rem', color: '#dc2626', cursor: 'pointer', fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>🗑️ Xoá</button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Modal Add / Edit ── */}
            {modal && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                    onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
                >
                    <div style={{ background: '#fff', borderRadius: 18, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
                        <h3 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 800, color: '#ea580c' }}>
                            {editId !== null ? '✏️ Chỉnh sửa task' : '➕ Thêm task mới'}
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                            <Field label="Tiêu đề *">
                                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                    placeholder="Nhập tiêu đề task..." style={inputStyle} />
                            </Field>

                            <Field label="Mô tả">
                                <textarea value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))}
                                    placeholder="Nội dung chi tiết..." rows={3}
                                    style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }} />
                            </Field>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <Field label="Ngày yêu cầu">
                                    <input type="date" value={form.ngayYeuCau}
                                        onChange={e => setForm(f => ({ ...f, ngayYeuCau: e.target.value }))} style={inputStyle} />
                                </Field>
                                <Field label="Deadline">
                                    <input type="date" value={form.deadline}
                                        onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} style={inputStyle} />
                                </Field>
                            </div>

                            <Field label="Trạng thái">
                                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inputStyle}>
                                    {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </Field>

                            <Field label={`Tiến độ hoàn thành: ${form.tienDo}%`}>
                                <input type="range" min={0} max={100} step={5} value={form.tienDo}
                                    onChange={e => setForm(f => ({ ...f, tienDo: Number(e.target.value) }))}
                                    style={{ width: '100%', accentColor: '#ea580c', cursor: 'pointer', marginTop: 4 }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#9ca3af', marginTop: 2 }}>
                                    <span>0%</span><span>50%</span><span>100%</span>
                                </div>
                            </Field>

                            <Field label="Ảnh đính kèm">
                                {form.imgSrc ? (
                                    <div style={{ position: 'relative', display: 'inline-block' }}>
                                        <img src={form.imgSrc} alt="preview" style={{ maxWidth: '100%', maxHeight: 150, borderRadius: 8, display: 'block' }} />
                                        <button onClick={() => { setForm(f => ({ ...f, imgSrc: null })); if (fileRef.current) fileRef.current.value = ''; }}
                                            style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                                    </div>
                                ) : (
                                    <button onClick={() => fileRef.current?.click()}
                                        style={{ padding: '8px 16px', background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 8, fontSize: '0.78rem', color: '#6b7280', cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}>
                                        🖼️ Chọn ảnh
                                    </button>
                                )}
                                <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} style={{ display: 'none' }} />
                            </Field>
                        </div>

                        {/* Buttons */}
                        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                            <button onClick={handleSave} style={{
                                flex: 2, padding: '11px 0', background: 'linear-gradient(135deg,#f59e0b,#ea580c)',
                                color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800,
                                fontSize: '0.88rem', cursor: 'pointer', fontFamily: "'Outfit', sans-serif"
                            }}>
                                {editId !== null ? '💾 Cập nhật' : '➕ Thêm'}
                            </button>
                            <button onClick={closeModal} style={{
                                flex: 1, padding: '11px 0', background: '#f3f4f6', border: '1px solid #e5e7eb',
                                borderRadius: 10, fontSize: '0.88rem', color: '#6b7280', cursor: 'pointer',
                                fontFamily: "'Outfit', sans-serif"
                            }}>Hủy</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Lightbox */}
            {lightbox && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
                    onClick={() => setLightbox(null)}
                >
                    <img src={lightbox} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }} />
                </div>
            )}
        </div>
    );
}

/* ── Field wrapper ── */
function Field({ label, children }) {
    return (
        <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                {label}
            </label>
            {children}
        </div>
    );
}

const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '9px 12px', border: '1.5px solid #e5e7eb',
    borderRadius: 8, fontSize: '0.85rem', outline: 'none',
    fontFamily: "'Outfit', sans-serif", background: '#fafafa',
    color: '#1f2937',
};
