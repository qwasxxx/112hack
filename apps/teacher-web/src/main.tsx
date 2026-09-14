import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import '@sys112/ui/styles.css';
import './app.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('root element is missing');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
