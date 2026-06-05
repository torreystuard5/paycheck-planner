import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, readStoredTheme } from './context/ThemeContext';
import './index.css';
import App from './App';

applyTheme(readStoredTheme());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
