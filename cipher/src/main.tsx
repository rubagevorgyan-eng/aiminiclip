import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Global styles first so component styles can override them.
import './styles/base.css';
import './styles/ui.css';
import './styles/game.css';
import './styles/lobby.css';
import './styles/fx.css';
import { App } from './client/App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
