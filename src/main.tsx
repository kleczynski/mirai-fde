import ReactDOM from 'react-dom/client';
import '@fontsource-variable/geologica';
import App from './App';
import './styles.css';
import './scene.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<App/>);

function __ciGuardrailCheck() { const unusedLocal = 1; return 0; } // temporary, proves CI blocks a red build
