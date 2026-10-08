import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { followSystemTheme } from './theme';
import './index.css';

followSystemTheme();

// Without a Supabase project configured, run the device-only preview.
const configured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);

let app: ReactNode;
if (configured) {
  const [{ App }, { supabase }] = await Promise.all([
    import('./App'),
    import('./sync/supabaseClient'),
  ]);
  app = <App sb={supabase} />;
} else {
  const { Preview } = await import('./Preview');
  app = <Preview />;
}

createRoot(document.getElementById('root')!).render(<StrictMode>{app}</StrictMode>);
