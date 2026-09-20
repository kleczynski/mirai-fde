interface LandingProps {
  onStart: () => void
}

export default function Landing({ onStart }: LandingProps) {
  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Content anchored to bottom-left for asymmetric composition */}
      <div className="flex-1 flex flex-col justify-end pb-16 pl-14 pr-8 md:pl-20 md:pb-20">
        <div className="max-w-md">
          {/* Eyebrow */}
          <p
            style={{
              fontWeight: 300,
              fontSize: '11px',
              letterSpacing: '0.22em',
              color: '#6F918B',
              textTransform: 'uppercase',
              marginBottom: '2.5rem',
            }}
          >
            wywiad głosowy
          </p>

          {/* Headline */}
          <h1
            style={{
              fontWeight: 200,
              fontSize: 'clamp(30px, 3.8vw, 52px)',
              lineHeight: 1.12,
              letterSpacing: '-0.02em',
              color: '#15201D',
              marginBottom: '2.8rem',
            }}
          >
            Rozmowa,
            <br />
            która prowadzi
            <br />
            dalej.
          </h1>

          {/* CTA */}
          <div style={{ marginBottom: '1.8rem' }}>
            <button
              onClick={onStart}
              style={{
                fontFamily: "'Geologica', sans-serif",
                fontWeight: 300,
                fontSize: '13px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#15201D',
                background: 'transparent',
                border: '1px solid rgba(111,145,139,0.55)',
                padding: '14px 36px',
                cursor: 'pointer',
                transition: 'background 0.25s ease, border-color 0.25s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(217,226,222,0.45)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#6F918B'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(111,145,139,0.55)'
              }}
              aria-label="Rozpocznij wywiad głosowy z MIRAI"
            >
              Rozpocznij rozmowę
            </button>
          </div>

          {/* Privacy line */}
          <p
            style={{
              fontWeight: 300,
              fontSize: '11px',
              letterSpacing: '0.05em',
              color: '#6F918B',
              lineHeight: 1.7,
            }}
          >
            Twoje odpowiedzi są przetwarzane przez AI&nbsp;&middot;&nbsp;Nie
            przechowujemy nagrań bez zgody
            <br />
            <button
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontFamily: 'inherit',
                fontSize: 'inherit',
                fontWeight: 'inherit',
                letterSpacing: 'inherit',
                color: 'rgba(111,145,139,0.8)',
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
                textDecorationThickness: '1px',
              }}
            >
              Polityka prywatności
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
