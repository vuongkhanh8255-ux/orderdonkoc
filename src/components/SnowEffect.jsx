// src/components/SnowEffect.jsx
import React from 'react';
import '../App.css';

const SnowEffect = () => {
  const snowflakes = Array.from({ length: 50 }); // 50 bông tuyết

  return (
    <div className="snow-container">
      {snowflakes.map((_, index) => {
        const randomLeft = Math.random() * 100;
        const randomDelay = Math.random() * 5;
        const randomDuration = 5 + Math.random() * 5;
        const randomSize = 8 + Math.random() * 12;

        return (
          <div
            key={index}
            className="snowflake"
            style={{
              left: `${randomLeft}%`,
              animationDelay: `${randomDelay}s`,
              animationDuration: `${randomDuration}s`,
              fontSize: `${randomSize}px`,
            }}
          >
            ❄
          </div>
        );
      })}
    </div>
  );
};

export default SnowEffect;