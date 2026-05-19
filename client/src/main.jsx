import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { setupTwemoji } from './lib/twemoji-setup.js';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Replace emoji codepoints with Twemoji SVGs after the first paint so admin
// (Mac/Safari) and the kiosk (Pi Chromium) show identical glyphs.
setupTwemoji();
