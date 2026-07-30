import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { installHeadlessApi } from './lib/headless';

// Deliberately not wrapped in StrictMode: the double mount tears down and
// rebuilds the WebGL map on every dev refresh for no benefit here.
installHeadlessApi();
createRoot(document.getElementById('root')!).render(<App />);
