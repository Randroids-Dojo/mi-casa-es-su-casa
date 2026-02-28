'use client'

const CRT_GREEN = '#33ff33'
const FONT = '"Share Tech Mono", "Courier New", Courier, monospace'

export function UpdateBanner() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '8px 16px',
        background: 'rgba(0, 0, 0, 0.85)',
        borderBottom: `1px solid ${CRT_GREEN}`,
        fontFamily: FONT,
        fontSize: '13px',
        color: CRT_GREEN,
      }}
    >
      <span>A NEW VERSION IS AVAILABLE</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: CRT_GREEN,
          color: '#000',
          border: 'none',
          padding: '4px 12px',
          fontFamily: FONT,
          fontSize: '13px',
          fontWeight: 'bold',
          cursor: 'pointer',
        }}
      >
        REFRESH
      </button>
    </div>
  )
}
