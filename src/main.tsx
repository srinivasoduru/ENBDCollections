import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

// Fonts are bundled rather than fetched from Google, so the deck keeps its
// typography in a meeting room with no connectivity.
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';

import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
