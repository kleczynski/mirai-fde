# Voice orb implementation status

Date: 2026-09-17

## Implemented

The persistent Three.js signal now has a `voice` layout. Its existing mesh closes into a central green sphere by interpolating the same vertex buffer, so the canvas and renderer stay alive while the view changes. The transition, placement, scale, peach illumination, reduced motion mode, WebGL context recovery, DPR cap, and 30 fps mobile path remain in the scene.

`src/components/ImmersiveVoice.tsx` supplies the focused voice surface. It keeps microphone, interrupt, captions, pause or resume, and end controls keyboard reachable. Desktop shows only the two most recent turns at the left. Mobile moves them below the orb. Turning captions off only hides this display, it never changes session turns or their persistence. The normal text interview remains unchanged.

## Files

* `src/scene/types.ts`, `src/scene/geometry.ts`, `src/scene/createScene.ts`
* `src/components/Scene.tsx`, `src/components/MiraiSignal.tsx`, `src/components/SignalFallback.tsx`
* `src/components/ImmersiveVoice.tsx`
* `src/scene.css`, `src/App.tsx`
* `tests/scene.test.ts`, `tests/scene-transitions.test.ts`

## Audio energy contract

The scene accepts optional `energy` in the range 0 to 1 and deliberately has no provider or microphone imports. It smooths supplied values locally, uses them only when the relevant party is speaking, and settles to zero for silence, pause, error, and disconnect.

No synthetic state value is passed to this prop. `src/voice/elevenlabs.ts` now exposes the active SDK analyser through `getAudioEnergy(channel)`: `getInputVolume()` while listening and `getOutputVolume()` while speaking. `src/voice/energy.ts` clamps and smooths it locally; `src/voice/useVoiceEnergy.ts` samples it only while the provider is active, and cancels its animation frame plus resets energy on pause, disconnect, status change, and unmount. It creates no microphone stream, recorder, storage, or telemetry.

`useInterview` now holds the connected ElevenLabs provider as `VoiceEnergySource | null`, calls `useVoiceEnergy(source, voiceStatus, muted)`, and returns its `voiceEnergy`. `App.tsx` passes it into `Scene`. The source is removed before pause, finish, deletion, disconnect, provider error, and unmount.

## Verification

`npm test -- --run tests/scene.test.ts tests/scene-transitions.test.ts` passed, 43 tests. These include finite closed geometry, central desktop and mobile placement, the energy path, and a frame by frame continuous transition.

`npm run build` passed. Vite reports existing large bundle warnings for the Three.js and ElevenLabs chunks.

`npx vitest run tests/voice-energy.test.ts` passed, 2 tests. The combined focused suite passed 45 tests. It checks channel selection, bounds, silence, pause or disconnect settling, and reset cleanup.

Local browser inspection verified the landing and consent flow. Voice mode is unavailable in the local configuration, so a live microphone, real ElevenLabs volume, interruption, reconnect, and mobile device pass still require a configured voice environment. No browser microphone permission was requested during this verification.
