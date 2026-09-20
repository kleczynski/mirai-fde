import { useState, useEffect, useCallback } from 'react'
import type { SignalState } from './components/MiraiSignal'
import MiraiSignal from './components/MiraiSignal'
import Landing from './components/screens/Landing'
import Consent from './components/screens/Consent'
import Interview from './components/screens/Interview'
import Thanks from './components/screens/Thanks'

export type Screen = 'landing' | 'consent' | 'interview' | 'thanks'

const mockConversation: Array<{
  state: SignalState
  caption: string
  duration: number
  speaker: 'mirai' | 'user'
}> = [
  {
    state: 'speaking',
    caption: 'Zanim zaczniemy, powiedz kilka słów o swojej dotychczasowej ścieżce zawodowej.',
    duration: 6500,
    speaker: 'mirai',
  },
  { state: 'listening', caption: '', duration: 9000, speaker: 'user' },
  { state: 'thinking', caption: '', duration: 2200, speaker: 'mirai' },
  {
    state: 'speaking',
    caption: 'Co sprawiło ci największą satysfakcję w ostatnim projekcie?',
    duration: 5500,
    speaker: 'mirai',
  },
  { state: 'listening', caption: '', duration: 10000, speaker: 'user' },
  { state: 'thinking', caption: '', duration: 1800, speaker: 'mirai' },
  {
    state: 'speaking',
    caption: 'Jak radzisz sobie z sytuacjami, gdy wymagania zmieniają się w trakcie pracy?',
    duration: 6000,
    speaker: 'mirai',
  },
  { state: 'listening', caption: '', duration: 10000, speaker: 'user' },
  { state: 'thinking', caption: '', duration: 2000, speaker: 'mirai' },
  {
    state: 'speaking',
    caption: 'Opowiedz o momencie, gdy musiałeś podjąć trudną decyzję pod presją czasu.',
    duration: 6000,
    speaker: 'mirai',
  },
  { state: 'listening', caption: '', duration: 9000, speaker: 'user' },
  { state: 'thinking', caption: '', duration: 1600, speaker: 'mirai' },
]

function Nav({ screen, goTo }: { screen: Screen; goTo: (s: Screen) => void }) {
  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '28px 56px',
        pointerEvents: 'none',
      }}
    >
      {/* Wordmark */}
      <button
        onClick={() => goTo('landing')}
        style={{
          fontFamily: "'Geologica', sans-serif",
          fontWeight: 200,
          fontSize: '15px',
          letterSpacing: '0.25em',
          color: '#15201D',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          pointerEvents: 'all',
          textTransform: 'lowercase',
        }}
        aria-label="MIRAI — wróć do strony głównej"
      >
        mirai
      </button>

      {/* Nav links — only on landing */}
      <div
        style={{
          display: 'flex',
          gap: '36px',
          opacity: screen === 'landing' || screen === 'thanks' ? 1 : 0,
          transition: 'opacity 0.4s ease',
          pointerEvents: screen === 'landing' || screen === 'thanks' ? 'all' : 'none',
        }}
      >
        {[
          { label: 'Jak to działa', href: '#' },
          { label: 'Prywatność', href: '#' },
        ].map(({ label }) => (
          <button
            key={label}
            style={{
              fontFamily: "'Geologica', sans-serif",
              fontWeight: 300,
              fontSize: '12px',
              letterSpacing: '0.08em',
              color: 'rgba(21,32,29,0.6)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.color = '#15201D'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(21,32,29,0.6)'
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('landing')
  const [contentVisible, setContentVisible] = useState(true)
  const [interviewState, setInterviewState] = useState<SignalState>('idle')
  const [caption, setCaption] = useState('')
  const [micAllowed, setMicAllowed] = useState<boolean | null>(null)
  const [isDemoMode, setDemoMode] = useState(false)
  const [transcript, setTranscript] = useState<Array<{ speaker: 'mirai' | 'user'; text: string }>>([])

  const goTo = useCallback((next: Screen) => {
    setContentVisible(false)
    setTimeout(() => {
      setScreen(next)
      if (next !== 'interview') {
        setInterviewState('idle')
        setCaption('')
      }
      if (next === 'landing') {
        setTranscript([])
        setMicAllowed(null)
        setDemoMode(false)
      }
      setContentVisible(true)
    }, 500)
  }, [])

  // Interview state machine
  useEffect(() => {
    if (screen !== 'interview') return

    let step = 0
    let timeout: ReturnType<typeof setTimeout>

    const advance = () => {
      const current = mockConversation[step % mockConversation.length]
      setInterviewState(current.state)
      setCaption(current.caption)

      // Accumulate transcript for speaking steps
      if (current.state === 'speaking' && current.caption) {
        setTranscript((prev) => [
          ...prev,
          { speaker: 'mirai', text: current.caption },
        ])
      }

      timeout = setTimeout(() => {
        step++
        advance()
      }, current.duration)
    }

    const startDelay = setTimeout(advance, 500)
    return () => {
      clearTimeout(timeout)
      clearTimeout(startDelay)
    }
  }, [screen])

  const signalState: SignalState =
    screen === 'interview' ? interviewState : 'idle'


  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        background: '#F3F6F4',
        overflowX: 'hidden',
      }}
    >
      <Nav screen={screen} goTo={goTo} />

      {/* One persistent, viewport-sized Canvas. Only scene transforms move. */}
      <MiraiSignal state={signalState} screen={screen} />

      {/* Screen content */}
      <div
        style={{
          opacity: contentVisible ? 1 : 0,
          transform: contentVisible ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
          minHeight: '100vh',
        }}
      >
        {screen === 'landing' && <Landing onStart={() => goTo('consent')} />}
        {screen === 'consent' && (
          <Consent
            micAllowed={micAllowed}
            setMicAllowed={setMicAllowed}
            onStart={() => goTo('interview')}
            isDemoMode={isDemoMode}
            setDemoMode={setDemoMode}
          />
        )}
        {screen === 'interview' && (
          <Interview
            interviewState={interviewState}
            caption={caption}
            transcript={transcript}
            onEnd={() => goTo('thanks')}
          />
        )}
        {screen === 'thanks' && <Thanks onRestart={() => goTo('landing')} />}
      </div>

      {/* Subtle ground texture — thin horizontal rule across lower 1/3 */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          bottom: '30vh',
          left: 0,
          right: 0,
          height: '1px',
          background: 'rgba(217,226,222,0.35)',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
