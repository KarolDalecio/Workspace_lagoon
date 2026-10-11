import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './editor.css';
import './mapmaker.css';
import './screens.css';

createRoot(document.getElementById('root')!).render(<App />);
