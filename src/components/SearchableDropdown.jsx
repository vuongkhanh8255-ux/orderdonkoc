import React, { useState, useEffect, useRef } from 'react';

// --- HELPER COMPONENT: SEARCHABLE DROPDOWN (MULTI-SELECT SUPPORT) ---
const SearchableDropdown = ({ options, value, onChange, placeholder, style, isMulti = false, showSearch = true }) => {
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
            {/* TRIGGER AREA - COSMIC THEME */}
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid rgba(0, 212, 255, 0.3)',
                    backgroundColor: 'rgba(15, 37, 68, 0.8)',
                    color: (isMulti ? value.length > 0 : value) ? '#FFFFFF' : 'rgba(255,255,255,0.5)',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    minHeight: '40px',
                    backdropFilter: 'blur(10px)'
                }}
            >
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px', fontWeight: (isMulti ? value.length > 0 : value) ? '600' : '400' }}>
                    {getDisplayValue()}
                </span>
                <span style={{ fontSize: '10px', color: '#00D4FF' }}>▼</span>
            </div>

            {/* DROPDOWN MENU - COSMIC THEME */}
            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '105%',
                    left: 0,
                    width: '100%',
                    minWidth: '250px',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    backgroundColor: '#0F2544',
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px rgba(0, 212, 255, 0.1)',
                    border: '1px solid rgba(0, 212, 255, 0.2)',
                    zIndex: 1000,
                    animation: 'fadeIn 0.2s'
                }}>
                    {showSearch && (
                        <div style={{ position: 'sticky', top: 0, padding: '10px', backgroundColor: '#0A1628', borderBottom: '1px solid rgba(0, 212, 255, 0.1)' }}>
                            <input
                                type="text"
                                placeholder="🔍 Tìm..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                autoFocus
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(0, 212, 255, 0.3)',
                                    backgroundColor: 'rgba(26, 58, 92, 0.5)',
                                    color: '#FFFFFF',
                                    fontSize: '13px',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    )}
                    <div>
                        {!isMulti && (
                            <div
                                onClick={() => handleSelect('')}
                                style={{
                                    padding: '10px 14px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    color: 'rgba(255,255,255,0.5)',
                                    borderBottom: '1px dashed rgba(0, 212, 255, 0.1)',
                                    fontStyle: 'italic'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0, 212, 255, 0.1)'}
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
                                        padding: '10px 6px',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        color: isSelected ? '#00D4FF' : 'rgba(255,255,255,0.8)',
                                        backgroundColor: isSelected ? 'rgba(0, 212, 255, 0.15)' : 'transparent',
                                        fontWeight: isSelected ? '600' : '400',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'flex-start',
                                        gap: '8px'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0, 212, 255, 0.1)'}
                                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                >
                                    {isMulti && (
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => { }}
                                            style={{ cursor: 'pointer', accentColor: '#00D4FF' }}
                                        />
                                    )}
                                    {opt.label}
                                </div>
                            );
                        }) : (
                            <div style={{ padding: '12px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>
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
