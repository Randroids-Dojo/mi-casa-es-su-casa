'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function PowerButton() {
  const [showConfirm, setShowConfirm] = useState(false)
  const router = useRouter()

  function handlePowerClick() {
    setShowConfirm(true)
  }

  function handleConfirm() {
    router.push('/')
  }

  function handleCancel() {
    setShowConfirm(false)
  }

  return (
    <>
      <button
        onClick={handlePowerClick}
        aria-label="Power off — return to main menu"
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 50,
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '2px solid #33ff33',
          background: 'rgba(0,0,0,0.7)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          transition: 'box-shadow 0.2s, border-color 0.2s',
          boxShadow: '0 0 6px rgba(51,255,51,0.3)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 0 12px rgba(51,255,51,0.6)'
          e.currentTarget.style.borderColor = '#66ff66'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 0 6px rgba(51,255,51,0.3)'
          e.currentTarget.style.borderColor = '#33ff33'
        }}
      >
        {/* IEC 5009 power symbol */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#33ff33"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M12 3v6" />
          <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64" />
        </svg>
      </button>

      {showConfirm && (
        <div
          onClick={handleCancel}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0a0a0a',
              border: '2px solid #33ff33',
              boxShadow: '0 0 20px rgba(51,255,51,0.2)',
              padding: '24px 32px',
              fontFamily: '"Share Tech Mono", "Courier New", Courier, monospace',
              color: '#33ff33',
              textShadow: '0 0 8px rgba(51,255,51,0.6)',
              textAlign: 'center',
              maxWidth: 320,
            }}
          >
            <p style={{ margin: '0 0 20px', fontSize: 16, letterSpacing: 1 }}>
              POWER OFF?
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 12, opacity: 0.6 }}>
              You will return to the main menu.
            </p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button
                onClick={handleConfirm}
                style={{
                  fontFamily: 'inherit',
                  fontSize: 14,
                  color: '#0a0a0a',
                  background: '#33ff33',
                  border: 'none',
                  padding: '6px 20px',
                  cursor: 'pointer',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                Yes
              </button>
              <button
                onClick={handleCancel}
                style={{
                  fontFamily: 'inherit',
                  fontSize: 14,
                  color: '#33ff33',
                  background: 'transparent',
                  border: '1px solid #33ff33',
                  padding: '6px 20px',
                  cursor: 'pointer',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
