import React from 'react'

export const DustOverlay: React.FC<{ opacity?: number }> = ({ opacity = 0.08 }) => (
  <div
    className="absolute inset-0 pointer-events-none rounded-lg"
    style={{
      opacity,
      background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.5'/%3E%3C/svg%3E")`,
      mixBlendMode: 'overlay'
    }}
    aria-hidden="true"
  />
)

export const CobwebCorner: React.FC<{ 
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  opacity?: number 
}> = ({ position, opacity = 0.2 }) => {
  const transformMap = {
    'top-left': '',
    'top-right': 'scaleX(-1)',
    'bottom-left': 'scaleY(-1)',
    'bottom-right': 'scale(-1)',
  }

  const positionMap = {
    'top-left': 'top-0 left-0',
    'top-right': 'top-0 right-0',
    'bottom-left': 'bottom-0 left-0',
    'bottom-right': 'bottom-0 right-0',
  }

  return (
    <svg
      className={`absolute ${positionMap[position]} w-12 h-12 pointer-events-none`}
      style={{ opacity, transform: transformMap[position] }}
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <path
        d="M0 0 
           Q20 8, 28 28 
           Q8 20, 0 0
           M0 0 
           Q12 4, 16 16 
           Q4 12, 0 0
           M0 0 
           Q8 12, 0 48
           M0 0
           C8 12, 12 8, 24 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        className="text-gray-600 dark:text-gray-300"
      />
    </svg>
  )
}

function DustLayer({ level }: { level: 2 | 3 }) {
  return <DustOverlay opacity={level === 2 ? 0.12 : 0.18} />
}

export const AgingDecorations: React.FC<{ level: 0 | 1 | 2 | 3 }> = ({ level }) => {
  if (level < 2) return null

  return (
    <div className={`absolute inset-0 overflow-hidden rounded-lg pointer-events-none ${level === 3 ? 'bg-gray-300/30 dark:bg-gray-400/45' : ''}`}>
      <DustLayer level={level as 2 | 3} />
      {level >= 2 && (
        <>
          <CobwebCorner position="top-left" opacity={level === 2 ? 0.45 : 0.45} />
          <CobwebCorner position="bottom-right" opacity={level === 2 ? 0.40 : 0.40} />
        </>
      )}
      {level >= 3 && (
        <>
          <CobwebCorner position="bottom-left" opacity={0.35} />
          <CobwebCorner position="top-right" opacity={0.28} />
        </>
      )}
    </div>
  )
}