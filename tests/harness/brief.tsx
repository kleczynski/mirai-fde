import { createRoot } from 'react-dom/client';
import { BriefStudioPanel } from '../../src/components/BriefStudioPanel';
import '@fontsource-variable/geologica';
import '../../src/styles.css';
import '../../src/components/admin.css';
const config = await (await fetch('/fixture-config')).json();
async function request(path: string, method = 'POST', body?: object) {
 const response = await fetch(path, { method, headers: {'Content-Type':'application/json', Authorization:`Bearer ${config.token}`}, ...(body ? {body:JSON.stringify(body)} : {}) });
 const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}
createRoot(document.getElementById('root')!).render(<main className="admin-shell"><h1>Brief Studio — syntetyczna Julka</h1><p>Test lokalny: zapisany wynik OpenAI, bez nowych płatnych wywołań.</p><BriefStudioPanel sessionId={config.sessionId} eligible request={request}/></main>);
