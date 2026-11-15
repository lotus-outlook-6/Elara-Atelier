/**
 * Client entry point for Elara Atelier.
 * Registers global Google Maps Platform quota/auth error listeners before mounting React.
 */

import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  (window as unknown as {gm_authFailure?: () => void}).gm_authFailure = () => {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  };

  const origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    origConsoleError.apply(console, args);
    const msg = args.map((item) => String(item)).join(' ');
    if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  };
}

createRoot(document.getElementById('root')!).render(<App />);
