// Microphone readiness is independent of the conversation provider. Never stores audio.
export async function checkMicrophone(onLevel: (level: number) => void): Promise<() => void> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Mikrofon wymaga bezpiecznego połączenia HTTPS. Możesz wybrać tryb tekstowy.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  let context: AudioContext;
  try { context = new AudioContext(); await context.resume(); } catch (error) { stream.getTracks().forEach(t => t.stop()); throw error; }
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser(); analyser.fftSize = 256; source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  const timer = window.setInterval(() => { analyser.getByteFrequencyData(data); onLevel(Math.min(1, data.reduce((a, b) => a + b, 0) / data.length / 80)); }, 80);
  return () => { clearInterval(timer); source.disconnect(); stream.getTracks().forEach(t => t.stop()); void context.close(); onLevel(0); };
}
