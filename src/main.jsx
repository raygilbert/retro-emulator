import React, { StrictMode } from 'react';
import '../config.js';
import { createRoot } from 'react-dom/client';
import RetroEmulator from '../retro-emulator.jsx';

const root = document.getElementById('root');

createRoot(root).render(
  <StrictMode>
    <RetroEmulator />
  </StrictMode>
);
