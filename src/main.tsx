import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { followSystemTheme } from './theme';
import './index.css';

followSystemTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
