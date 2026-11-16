import {createRoot} from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App.tsx';
import './index.css';
import { testFirestoreConnection } from './services/firebase';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (Capacitor.isNativePlatform()) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
  } else if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        console.warn('PWA Service Worker registration failed:', err);
      });
    });
  }
}

testFirestoreConnection().catch((err) => {
  console.warn('Firestore initial connection check:', err);
});

createRoot(document.getElementById('root')!).render(<App />);
