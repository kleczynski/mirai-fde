interface ThanksProps {
  onRestart: () => void
}

export default function Thanks({ onRestart }: ThanksProps) {
  return (
    <div className="relative min-h-screen flex flex-col justify-end pb-20 pl-14 md:pl-20">
      <div className="max-w-sm">
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
          wywiad głosowy zakończony
        </p>

        <h2
          style={{
            fontWeight: 200,
            fontSize: 'clamp(26px, 3.2vw, 44px)',
            letterSpacing: '-0.018em',
            color: '#15201D',
            lineHeight: 1.15,
            marginBottom: '1.8rem',
          }}
        >
          Dziękuję
          <br />
          za rozmowę.
        </h2>

        <p
          style={{
            fontWeight: 300,
            fontSize: '14px',
            color: '#6F918B',
            lineHeight: 1.75,
            marginBottom: '3rem',
            maxWidth: '320px',
          }}
        >
          Twoje odpowiedzi zostały zapisane.
          <br />
          Wyniki będą dostępne po przetworzeniu.
        </p>

        <button
          onClick={onRestart}
          style={{
            fontFamily: "'Geologica', sans-serif",
            fontWeight: 300,
            fontSize: '12px',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'rgba(21,32,29,0.5)',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            transition: 'color 0.2s ease',
            textDecoration: 'underline',
            textUnderlineOffset: '4px',
            textDecorationThickness: '1px',
            textDecorationColor: 'rgba(21,32,29,0.25)',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.color = '#15201D'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(21,32,29,0.5)'
          }}
        >
          Wróć do strony głównej
        </button>
      </div>
    </div>
  )
}
