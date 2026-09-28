import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { registerPwaServiceWorker } from './utils/pwaNotifications';

// Inicializar Service Worker do PWA para Cache e Notificações em Segundo Plano
registerPwaServiceWorker();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
