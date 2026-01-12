import React, { useState, useEffect, useRef } from 'react';

// --- HELPER COMPONENT: SEARCHABLE DROPDOWN (MULTI-SELECT SUPPORT) ---
const SearchableDropdown = ({ options, value, onChange, placeholder, style, isMulti = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef(null);

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSelect = (selectedValue) => {
        if (isMulti) {
            const newValue = value.includes(selectedValue)
                ? value.filter(v => v !== selectedValue)
                : [...value, selectedValue];
            onChange(newValue);
        } else {
            onChange(selectedValue);
            setIsOpen(false);
            setSearchTerm('');
        }
    };

    const getDisplayValue = () => {
        if (isMulti) {
            if (!value || value.length === 0) return placeholder;
            if (value.length === 1) return value[0];
            return `${value.length} sản phẩm đã chọn`;
        }
        return value ? options.find(o => o.value === value)?.label || value : placeholder;
    };

    return (
        <div ref={wrapperRef} style={{ position: 'relative', ...style, padding: 0, border: 'none', background: 'transparent' }}>
            {/* TRIGGER AREA */}
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    backgroundColor: '#fff',
                    color: (isMulti ? value.length > 0 : value) ? '#374151' : '#10B981', // Highlight color
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    minHeight: '38px' // Match other inputs
                }}
            >
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px', fontWeight: (isMulti ? value.length > 0 : value) ? '600' : '400', color: (isMulti ? value.length > 0 : value) ? '#374151' : '#9CA3AF' }}>
                    {getDisplayValue()}
                </span>
                <span style={{ fontSize: '10px', color: '#666' }}>▼</span>
            </div>

            {/* DROPDOWN MENU */}
            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '105%',
                    left: 0,
                    width: '100%',
                    minWidth: '250px',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
                    border: '1px solid #e5e7eb',
                    zIndex: 1000,
                    animation: 'fadeIn 0.2s'
                }}>
                    <div style={{ position: 'sticky', top: 0, padding: '8px', backgroundColor: '#fff', borderBottom: '1px solid #f3f4f6' }}>
                        <input
                            type="text"
                            placeholder="🔍 Tìm..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            autoFocus
                            style={{
                                width: '100%',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: '1px solid #ddd',
                                fontSize: '13px',
                                outline: 'none'
                            }}
                        />
                    </div>
                    <div>
                        {!isMulti && (
                            <div
                                onClick={() => handleSelect('')}
                                style={{
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    color: '#666',
                                    borderBottom: '1px dashed #eee',
                                    fontStyle: 'italic'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                -- {placeholder} --
                            </div>
                        )}
                        {filteredOptions.length > 0 ? filteredOptions.map(opt => {
                            const isSelected = isMulti ? value.includes(opt.value) : value === opt.value;
                            return (
                                <div
                                    key={opt.value}
                                    onClick={() => handleSelect(opt.value)}
                                    style={{
                                        padding: '8px 4px', // Tighter left padding for alignment
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        color: isSelected ? '#FF6600' : '#374151',
                                        backgroundColor: isSelected ? '#FFF7ED' : 'transparent',
                                        fontWeight: isSelected ? '600' : '400',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'flex-start',
                                        gap: '8px'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#FFF7ED'}
                                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                >
                                    {isMulti && (
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => { }}
                                            style={{ cursor: 'pointer', accentColor: '#FF6600' }}
                                        />
                                    )}
                                    {opt.label}
                                </div>
                            );
                        }) : (
                            <div style={{ padding: '10px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                                Không tìm thấy
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchableDropdown;
