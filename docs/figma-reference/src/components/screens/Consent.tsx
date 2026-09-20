import { useState } from 'react'

interface ConsentProps {
  micAllowed: boolean | null
  setMicAllowed: (v: boolean) => void
  onStart: () => void
  isDemoMode: boolean
  setDemoMode: (v: boolean) => void
}

// Exported so App can optionally surface it
export type ConsentMode = 'real' | 'demo'

const disclosures = [
  {
    label: 'Czas trwania',
    value: '20–35 minut, w zależności od tempa rozmowy',
  },
  {
    label: 'Mikrofon',
    value: 'Wymagany. Nie jest potrzebna kamera.',
  },
  {
    label: 'Nagrywanie',
    value: 'Rozmowa nie jest nagrywana ani przechowywana.',
  },
  {
    label: 'Twoje dane',
    value: 'Odpowiedzi są anonimizowane przed analizą.',
  },
  {
    label: 'System AI',
    value: 'Pytania generuje MIRAI na bazie modelu językowego.',
  },
]

export default function Consent({ micAllowed, setMicAllowed, onStart, isDemoMode, setDemoMode }: ConsentProps) {
  const [accepted, setAccepted] = useState(false)
  const [micError, setMicError] = useState(false)
  const [requesting, setRequesting] = useState(false)

  const requestMic = async () => {
    if (micAllowed) return
    setRequesting(true)
    setMicError(false)
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      setMicAllowed(true)
    } catch {
      setMicError(true)
      setMicAllowed(false)
    } finally {
      setRequesting(false)
    }
  }

  const canStart = accepted && micAllowed === true

  return (
    <div className="relative min-h-screen flex flex-col pt-28 md:pt-32">
      <div className="pl-14 pr-8 md:pl-20 max-w-lg">
        {/* Section title */}
        <p
          style={{
            fontWeight: 300,
            fontSize: '11px',
            letterSpacing: '0.22em',
            color: '#6F918B',
            textTransform: 'uppercase',
            marginBottom: '2rem',
          }}
        >
          wywiad głosowy
        </p>

        <h2
          style={{
            fontWeight: 200,
            fontSize: 'clamp(22px, 2.8vw, 36px)',
            letterSpacing: '-0.015em',
            color: '#15201D',
            marginBottom: '2.8rem',
            lineHeight: 1.2,
          }}
        >
          Kilka rzeczy,
          <br />
          które warto wiedzieć.
        </h2>

        {/* Disclosures */}
        <dl style={{ marginBottom: '2.8rem' }}>
          {disclosures.map(({ label, value }) => (
            <div
              key={label}
              style={{
                display: 'grid',
                gridTemplateColumns: '110px 1fr',
                gap: '0 1.5rem',
                padding: '14px 0',
                borderBottom: '1px solid rgba(217,226,222,0.55)',
              }}
            >
              <dt
                style={{
                  fontWeight: 400,
                  fontSize: '11px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#6F918B',
                  paddingTop: '1px',
                }}
              >
                {label}
              </dt>
              <dd
                style={{
                  fontWeight: 300,
                  fontSize: '13px',
                  color: '#15201D',
                  lineHeight: 1.65,
                  margin: 0,
                }}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {/* Mic permission */}
        <div style={{ marginBottom: '2rem' }}>
          {micAllowed === null && (
            <button
              onClick={requestMic}
              disabled={requesting}
              style={{
                fontFamily: "'Geologica', sans-serif",
                fontWeight: 300,
                fontSize: '12px',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: '#6F918B',
                background: 'transparent',
                border: '1px solid rgba(111,145,139,0.4)',
                padding: '11px 26px',
                cursor: requesting ? 'wait' : 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <rect x="5" y="1" width="4" height="7" rx="2" stroke="#6F918B" strokeWidth="1.2" />
                <path d="M2.5 7.5C2.5 10.0 4.5 12 7 12s4.5-2 4.5-4.5" stroke="#6F918B" strokeWidth="1.2" strokeLinecap="round" />
                <line x1="7" y1="12" x2="7" y2="13.5" stroke="#6F918B" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              {requesting ? 'Proszę czekać…' : 'Zezwól na mikrofon'}
            </button>
          )}

          {micAllowed === true && (
            <p
              style={{
                fontWeight: 300,
                fontSize: '12px',
                color: isDemoMode ? 'rgba(21,32,29,0.45)' : '#6F918B',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle
                  cx="7" cy="7" r="6"
                  stroke={isDemoMode ? 'rgba(21,32,29,0.4)' : '#6F918B'}
                  strokeWidth="1.1"
                />
                <path
                  d="M4.5 7l2 2 3-3"
                  stroke={isDemoMode ? 'rgba(21,32,29,0.4)' : '#6F918B'}
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {isDemoMode ? 'Tryb demonstracyjny' : 'Mikrofon aktywny'}
            </p>
          )}

          {micError && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p
                style={{
                  fontWeight: 300,
                  fontSize: '12px',
                  color: '#D49374',
                  lineHeight: 1.65,
                }}
              >
                Brak dostępu do mikrofonu. Sprawdź ustawienia przeglądarki.
              </p>
              {/* Retry — same level as original request */}
              <button
                onClick={requestMic}
                style={{
                  fontFamily: "'Geologica', sans-serif",
                  fontWeight: 300,
                  fontSize: '11px',
                  letterSpacing: '0.12em',
                  color: 'rgba(212,147,116,0.75)',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                  textDecorationThickness: '1px',
                  textAlign: 'left',
                }}
              >
                Spróbuj ponownie
              </button>
              {/* Demo mode — clearly secondary, lower contrast */}
              <button
                onClick={() => {
                  setDemoMode(true)
                  setMicError(false)
                  setMicAllowed(true)
                }}
                style={{
                  fontFamily: "'Geologica', sans-serif",
                  fontWeight: 300,
                  fontSize: '11px',
                  letterSpacing: '0.10em',
                  color: 'rgba(21,32,29,0.40)',
                  background: 'none',
                  border: '1px solid rgba(21,32,29,0.15)',
                  padding: '8px 18px',
                  cursor: 'pointer',
                  marginTop: '4px',
                  transition: 'color 0.2s ease, border-color 0.2s ease',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(21,32,29,0.65)'
                  ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(21,32,29,0.30)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(21,32,29,0.40)'
                  ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(21,32,29,0.15)'
                }}
              >
                Kontynuuj w trybie demonstracyjnym
              </button>
            </div>
          )}
        </div>

        {/* Consent checkbox */}
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            cursor: 'pointer',
            marginBottom: '2.5rem',
          }}
        >
          <span
            role="checkbox"
            aria-checked={accepted}
            tabIndex={0}
            onClick={() => setAccepted(!accepted)}
            onKeyDown={(e) => e.key === ' ' && setAccepted(!accepted)}
            style={{
              width: '18px',
              height: '18px',
              minWidth: '18px',
              border: `1px solid ${accepted ? '#6F918B' : 'rgba(111,145,139,0.45)'}`,
              background: accepted ? 'rgba(111,145,139,0.12)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: '1px',
              transition: 'all 0.2s ease',
            }}
          >
            {accepted && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 5l2.5 2.5 3.5-4" stroke="#6F918B" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <span
            style={{
              fontWeight: 300,
              fontSize: '13px',
              color: '#15201D',
              lineHeight: 1.65,
            }}
          >
            Rozumiem powyższe informacje i wyrażam zgodę na udział w rozmowie prowadzonej przez system AI.
          </span>
        </label>

        {/* CTA */}
        <button
          onClick={canStart ? onStart : undefined}
          disabled={!canStart}
          aria-disabled={!canStart}
          style={{
            fontFamily: "'Geologica', sans-serif",
            fontWeight: 300,
            fontSize: '13px',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: canStart ? '#15201D' : 'rgba(21,32,29,0.3)',
            background: 'transparent',
            border: `1px solid ${canStart ? 'rgba(111,145,139,0.55)' : 'rgba(111,145,139,0.2)'}`,
            padding: '14px 36px',
            cursor: canStart ? 'pointer' : 'default',
            transition: 'all 0.25s ease',
          }}
          onMouseEnter={(e) => {
            if (!canStart) return
            ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(217,226,222,0.45)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          }}
        >
          Rozpocznij wywiad
        </button>

        <p
          style={{
            fontWeight: 300,
            fontSize: '11px',
            color: 'rgba(111,145,139,0.7)',
            marginTop: '1.2rem',
            letterSpacing: '0.04em',
          }}
        >
          {!micAllowed && 'Wymagana zgoda na mikrofon i akceptacja warunków.'}
          {micAllowed && !accepted && 'Zaznacz zgodę, aby kontynuować.'}
          {micAllowed && accepted && 'Gotowy.'}
        </p>
      </div>
    </div>
  )
}
