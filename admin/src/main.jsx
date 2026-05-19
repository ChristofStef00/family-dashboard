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

setupTwemoji();
