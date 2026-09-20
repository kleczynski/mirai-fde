import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  // AudioWorklet.addModule() rejects data: URLs under the production CSP. Keep
  // ElevenLabs' worklet modules as same-origin files rather than inlining them.
  build: { assetsInlineLimit: 0 },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } },
});
