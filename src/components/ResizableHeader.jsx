// src/components/ResizableHeader.jsx

import React from 'react';
import { Resizable } from 'react-resizable';
import 'react-resizable/css/styles.css';

// Component Header có thể kéo thả
const ResizableHeader = ({ onResize, width, children }) => {
    if (!width) {
        return <th style={{ padding: '12px', border: '1px solid #ddd', textAlign: 'left' }}>{children}</th>;
    }
    return (
        <Resizable width={width} height={0} onResize={onResize} draggableOpts={{ enableUserSelectHack: false }} axis="x">
            <th style={{ width: `${width}px`, padding: '12px', border: '1px solid #ddd', textAlign: 'left', position: 'relative', backgroundClip: 'padding-box' }}>
                {children}
            </th>
        </Resizable>
    );
};

export default ResizableHeader;