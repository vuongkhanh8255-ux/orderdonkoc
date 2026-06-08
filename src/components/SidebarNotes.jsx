import React, { useState, useRef, useEffect } from 'react';

const STORAGE_KEY = 'sk_sidebar_notes';

const loadNotes = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
};
const saveNotes = (notes) => localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));

export default function SidebarNotes() {
    const [open,    setOpen]    = useState(false);
    const [notes,   setNotes]   = useState(loadNotes);
    const [adding,  setAdding]  = useState(false);
    const [text,    setText]    = useState('');
    const [imgSrc,  setImgSrc]  = useState(null);   // base64
    const [editId,  setEditId]  = useState(null);
    const fileRef  = useRef();
    const listRef  = useRef();

    // persist
    useEffect(() => saveNotes(notes), [notes]);

    const handleImage = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setImgSrc(ev.target.result);
        reader.readAsDataURL(file);
    };

    const handleSave = () => {
        if (!text.trim() && !imgSrc) return;
        if (editId !== null) {
            setNotes(prev => prev.map(n => n.id === editId ? { ...n, text, imgSrc } : n));
            setEditId(null);
        } else {
            const newNote = { id: Date.now(), text: text.trim(), imgSrc, createdAt: new Date().toLocaleDateString('vi-VN') };
            setNotes(prev => [newNote, ...prev]);
        }
        setText(''); setImgSrc(null); setAdding(false);
        fileRef.current && (fileRef.current.value = '');
    };

    const handleEdit = (note) => {
        setEditId(note.id); setText(note.text); setImgSrc(note.imgSrc || null);
        setAdding(true);
    };

    const handleDelete = (id) => {
        if (window.confirm('Xoá task này?')) setNotes(prev => prev.filter(n => n.id !== id));
    };

    const scrollBy = (dir) => {
        if (listRef.current) listRef.current.scrollTop += dir * 90;
    };

    const cancelAdd = () => { setAdding(false); setText(''); setImgSrc(null); setEditId(null); fileRef.current && (fileRef.current.value = ''); };

    return (
        <div style={{ borderTop: '1px solid #eee', background: '#fff' }}>
            {/* Header toggle */}
            <div
                onClick={() => setOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', cursor: 'pointer', userSelect: 'none', background: open ? '#fff7ed' : '#fff', transition: 'background 0.2s' }}
            >
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ff6a2c', display: 'flex', alignItems: 'center', gap: 6 }}>
                    📝 Take Note
                    {notes.length > 0 && <span style={{ background: '#ff6a2c', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: '0.65rem', fontWeight: 700 }}>{notes.length}</span>}
                </span>
                <span style={{ fontSize: '0.65rem', color: '#ff7a30', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
            </div>

            {open && (
                <div style={{ padding: '0 10px 10px' }}>
                    {/* Add/Edit form */}
                    {adding ? (
                        <div style={{ background: '#fffbf5', border: '1px solid #fed7aa', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                            <textarea
                                value={text}
                                onChange={e => setText(e.target.value)}
                                placeholder="Nội dung task..."
                                rows={3}
                                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: 7, padding: '7px 9px', fontSize: '0.78rem', resize: 'vertical', fontFamily: "'Outfit', sans-serif", outline: 'none' }}
                            />
                            {/* Image preview */}
                            {imgSrc && (
                                <div style={{ position: 'relative', display: 'inline-block', marginTop: 6 }}>
                                    <img src={imgSrc} alt="preview" style={{ maxWidth: '100%', maxHeight: 100, borderRadius: 7, display: 'block' }} />
                                    <button onClick={() => { setImgSrc(null); fileRef.current && (fileRef.current.value = ''); }}
                                        style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                                </div>
                            )}
                            <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} style={{ display: 'none' }} />
                            <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                                <button onClick={() => fileRef.current?.click()}
                                    style={{ flex: 1, padding: '5px 0', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: '0.72rem', cursor: 'pointer', color: '#555' }}>
                                    🖼️ Ảnh
                                </button>
                                <button onClick={handleSave}
                                    style={{ flex: 2, padding: '5px 0', background: 'linear-gradient(135deg,#f59e0b,#ff6a2c)', color: '#fff', border: 'none', borderRadius: 7, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
                                    {editId !== null ? '💾 Cập nhật' : '➕ Thêm'}
                                </button>
                                <button onClick={cancelAdd}
                                    style={{ padding: '5px 8px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: '0.72rem', cursor: 'pointer', color: '#888' }}>✕</button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => setAdding(true)}
                            style={{ width: '100%', padding: '7px 0', background: '#fff7ed', border: '1px dashed #fed7aa', borderRadius: 8, fontSize: '0.75rem', color: '#ff6a2c', fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
                            ➕ Thêm task mới
                        </button>
                    )}

                    {/* Task list */}
                    {notes.length > 0 && (
                        <div style={{ position: 'relative' }}>
                            {/* Scroll buttons */}
                            {notes.length > 2 && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginBottom: 4 }}>
                                    <button onClick={() => scrollBy(-1)} style={scrollBtnStyle}>↑</button>
                                    <button onClick={() => scrollBy(1)}  style={scrollBtnStyle}>↓</button>
                                </div>
                            )}
                            {/* List */}
                            <div ref={listRef} style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7, scrollBehavior: 'smooth' }}>
                                {notes.map((note, idx) => (
                                    <div key={note.id} style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 9, padding: '8px 10px', position: 'relative' }}>
                                        {/* Index + date */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: note.text || note.imgSrc ? 5 : 0 }}>
                                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#ff6a2c', background: '#fff7ed', padding: '1px 6px', borderRadius: 5 }}>#{idx + 1}</span>
                                            <span style={{ fontSize: '0.6rem', color: '#bbb' }}>{note.createdAt}</span>
                                        </div>
                                        {/* Image */}
                                        {note.imgSrc && (
                                            <img src={note.imgSrc} alt="task" style={{ width: '100%', borderRadius: 6, marginBottom: note.text ? 5 : 0, maxHeight: 120, objectFit: 'cover' }} />
                                        )}
                                        {/* Text */}
                                        {note.text && (
                                            <div style={{ fontSize: '0.75rem', color: '#333', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{note.text}</div>
                                        )}
                                        {/* Action buttons */}
                                        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                                            <button onClick={() => handleEdit(note)} style={{ flex: 1, padding: '3px 0', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 5, fontSize: '0.65rem', color: '#0369a1', cursor: 'pointer', fontWeight: 600 }}>✏️ Sửa</button>
                                            <button onClick={() => handleDelete(note.id)} style={{ flex: 1, padding: '3px 0', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 5, fontSize: '0.65rem', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>🗑️ Xoá</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {notes.length === 0 && !adding && (
                        <div style={{ textAlign: 'center', color: '#ccc', fontSize: '0.72rem', padding: '10px 0' }}>Chưa có task nào</div>
                    )}
                </div>
            )}
        </div>
    );
}

const scrollBtnStyle = {
    padding: '2px 8px', background: '#f3f4f6', border: '1px solid #e5e7eb',
    borderRadius: 5, fontSize: '0.7rem', cursor: 'pointer', color: '#555',
    lineHeight: 1.4, fontWeight: 700,
};
