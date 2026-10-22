/* FeedOS 16 · avvio. Al primo avvio carica il mangimificio dimostrativo (dati inventati, dichiarati come tali). */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.jsx';
import { initStore } from './core/store.js';
import { demoData, upgradeDemo } from './data/demo/index.js';

initStore(async () => demoData(), upgradeDemo);
createRoot(document.getElementById('root')).render(<App />);
