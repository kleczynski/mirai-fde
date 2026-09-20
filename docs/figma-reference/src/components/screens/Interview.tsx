import { useState } from 'react'
import type { SignalState } from '../MiraiSignal'

interface InterviewProps {
  interviewState: SignalState
  caption: string
  transcript: Array<{ speaker: 'mirai' | 'user'; text: string }>
  onEnd: () => void
}

const stateLabel: Record<SignalState, string> = {
  idle: '',
  listening: 'Słucham',
  thinking: 'Zastanawiam się',
  speaking: 'Mówię',
}

const stateHint: Record<SignalState, string> = {
  idle: '',
  listening: 'mów teraz',
  thinking: '',
  speaking: '',
}

export default function Interview({ interviewState, caption, transcript, onEnd }: InterviewProps) {
  const [showTranscript, setShowTranscript] = useState(false)
  const [captionsOn, setCaptionsOn] = useState(true)
  const [micMuted, setMicMuted] = useState(false)

  const label = stateLabel[interviewState]
  const hint = stateHint[interviewState]

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* State indicator — centered, upper portion */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          paddingLeft: '14vw',
          paddingRight: '32vw',
          paddingTop: '80px',
        }}
      >
        {/* State label */}
        <div style={{ marginBottom: '1.2rem', minHeight: '48px' }}>
          {label && (
            <p
              key={label}
              style={{
                fontWeight: 200,
                fontSize: 'clamp(20px, 2.8vw, 34px)',
                letterSpacing: '-0.01em',
                color: '#15201D',
                lineHeight: 1,
                animation: 'fadeUp 0.5s ease forwards',
              }}
            >
              {label}
              {hint && (
                <span
                  style={{
                    fontWeight: 300,
                    fontSize: '12px',
                    letterSpacing: '0.15em',
                    color: '#6F918B',
                    textTransform: 'uppercase',
                    marginLeft: '16px',
                    verticalAlign: 'middle',
                  }}
                >
                  — {hint}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Caption */}
        {captionsOn && caption && (
          <p
            key={caption.slice(0, 20)}
            style={{
              fontWeight: 300,
              fontSize: 'clamp(14px, 1.6vw, 18px)',
              color: '#15201D',
              lineHeight: 1.65,
              maxWidth: '460px',
              letterSpacing: '-0.005em',
              animation: 'fadeUp 0.5s ease forwards',
            }}
          >
            "{caption}"
          </p>
        )}

        {/* Listening indicator — single pulsing dot, not an equalizer */}
        {interviewState === 'listening' && (
          <div
            style={{
              marginTop: caption ? '1.5rem' : '0',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span
              style={{
                display: 'block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: micMuted ? 'rgba(111,145,139,0.3)' : '#6F918B',
                animation: micMuted ? 'none' : 'listenPulse 1.6s ease-in-out infinite',
              }}
            />
            <span
              style={{
                fontWeight: 300,
                fontSize: '11px',
                letterSpacing: '0.14em',
                color: '#6F918B',
                textTransform: 'uppercase',
              }}
            >
              {micMuted ? 'wyciszony' : 'nagrywanie'}
            </span>
          </div>
        )}

        {/* Transcript panel */}
        {showTranscript && transcript.length > 0 && (
          <div
            style={{
              marginTop: '2rem',
              maxWidth: '480px',
              maxHeight: '200px',
              overflowY: 'auto',
              borderTop: '1px solid rgba(217,226,222,0.6)',
              paddingTop: '1rem',
            }}
          >
            {transcript.map((entry, i) => (
              <div key={i} style={{ marginBottom: '0.8rem' }}>
                <span
                  style={{
                    fontWeight: 400,
                    fontSize: '10px',
                    letterSpacing: '0.18em',
                    color: '#6F918B',
                    textTransform: 'uppercase',
                    marginRight: '8px',
                  }}
                >
                  {entry.speaker === 'mirai' ? 'MIRAI' : 'TY'}
                </span>
                <span
                  style={{
                    fontWeight: 300,
                    fontSize: '12px',
                    color: '#15201D',
                    lineHeight: 1.6,
                  }}
                >
                  {entry.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Controls bar — bottom */}
      <div
        style={{
          padding: '20px 14vw 32px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          borderTop: '1px solid rgba(217,226,222,0.45)',
        }}
      >
        {/* Mic toggle */}
        <ControlBtn
          active={!micMuted}
          onClick={() => setMicMuted(!micMuted)}
          label={micMuted ? 'Włącz mikrofon' : 'Wycisz mikrofon'}
          aria={micMuted ? 'Włącz mikrofon' : 'Wycisz mikrofon'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="6" y="1" width="4" height="8" rx="2" stroke="currentColor" strokeWidth="1.2" />
            <path d="M3 8.5C3 11.5 5.2 13.5 8 13.5s5-2 5-5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="8" y1="13.5" x2="8" y2="15.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            {micMuted && <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />}
          </svg>
        </ControlBtn>

        {/* Captions toggle */}
        <ControlBtn
          active={captionsOn}
          onClick={() => setCaptionsOn(!captionsOn)}
          label={captionsOn ? 'Ukryj napisy' : 'Pokaż napisy'}
          aria={captionsOn ? 'Ukryj napisy' : 'Pokaż napisy'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="4" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <line x1="4" y1="8" x2="8" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="4" y1="10.5" x2="12" y2="10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </ControlBtn>

        {/* Transcript toggle */}
        <ControlBtn
          active={showTranscript}
          onClick={() => setShowTranscript(!showTranscript)}
          label={showTranscript ? 'Ukryj transkrypcję' : 'Pokaż transkrypcję'}
          aria={showTranscript ? 'Ukryj transkrypcję' : 'Pokaż transkrypcję'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="2" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="2" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </ControlBtn>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* End interview */}
        <button
          onClick={onEnd}
          style={{
            fontFamily: "'Geologica', sans-serif",
            fontWeight: 300,
            fontSize: '12px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'rgba(21,32,29,0.55)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '10px 0',
            transition: 'color 0.2s ease',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.color = '#15201D'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(21,32,29,0.55)'
          }}
          aria-label="Zakończ wywiad"
        >
          Zakończ
        </button>
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes listenPulse {
          0%, 100% { transform: scale(1);   opacity: 0.8; }
          50%       { transform: scale(1.5); opacity: 1;   }
        }
      `}</style>
    </div>
  )
}

function ControlBtn({
  children,
  active,
  onClick,
  label,
  aria,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  label: string
  aria: string
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={aria}
      style={{
        color: active ? '#15201D' : 'rgba(21,32,29,0.35)',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'color 0.2s ease',
        borderRadius: 0,
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.color = '#15201D'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.color = active
          ? '#15201D'
          : 'rgba(21,32,29,0.35)'
      }}
    >
      {children}
    </button>
  )
}
