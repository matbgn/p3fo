import React from 'react'

type DustParticle = {
  x: number
  y: number
  size: number
  opacity: number
  shape: string
  ratio: number
  rot: number
}

export const DUST_PARTICLES_LIGHT: DustParticle[] = [
  { x: 22, y: 15, size: 3, opacity: 0.7, shape: '50% 50% 45% 55%', ratio: 0.9, rot: 45 },
  { x: 75, y: 8, size: 4, opacity: 0.8, shape: '55% 45% 50% 50%', ratio: 1.05, rot: 120 },
  { x: 48, y: 82, size: 4, opacity: 0.6, shape: '45% 55% 55% 45%', ratio: 0.85, rot: 210 },
  { x: 5, y: 55, size: 3, opacity: 0.75, shape: '50% 50% 48% 52%', ratio: 1.1, rot: 285 },
  { x: 92, y: 40, size: 3, opacity: 0.65, shape: '52% 48% 50% 50%', ratio: 0.95, rot: 165 },
  { x: 33, y: 28, size: 4, opacity: 0.55, shape: '48% 52% 52% 48%', ratio: 1.15, rot: 330 },
  { x: 68, y: 71, size: 3, opacity: 0.7, shape: '50% 50% 45% 55%', ratio: 0.88, rot: 90 },
  { x: 15, y: 88, size: 3, opacity: 0.68, shape: '55% 45% 48% 52%', ratio: 1.02, rot: 255 },
  { x: 80, y: 62, size: 4, opacity: 0.6, shape: '45% 55% 50% 50%', ratio: 0.92, rot: 150 },
  { x: 55, y: 5, size: 3, opacity: 0.85, shape: '50% 50% 52% 48%', ratio: 1.08, rot: 195 },
]

export const DUST_PARTICLES_HEAVY: DustParticle[] = [
  { x: 12, y: 5, size: 3, opacity: 0.4, shape: '60% 40% 55% 45%', ratio: 0.85, rot: 12 },
  { x: 87, y: 12, size: 4, opacity: 0.3, shape: '45% 55% 60% 40%', ratio: 1.1, rot: 74 },
  { x: 34, y: 78, size: 2, opacity: 0.5, shape: '50% 50% 40% 60%', ratio: 0.9, rot: 185 },
  { x: 56, y: 23, size: 5, opacity: 0.25, shape: '55% 45% 50% 50%', ratio: 1.05, rot: 263 },
  { x: 8, y: 92, size: 3, opacity: 0.35, shape: '40% 60% 55% 45%', ratio: 0.95, rot: 37 },
  { x: 91, y: 67, size: 4, opacity: 0.4, shape: '60% 40% 45% 55%', ratio: 1.15, rot: 148 },
  { x: 23, y: 45, size: 2, opacity: 0.45, shape: '50% 50% 60% 40%', ratio: 0.88, rot: 296 },
  { x: 67, y: 89, size: 3, opacity: 0.3, shape: '55% 45% 50% 50%', ratio: 1.2, rot: 59 },
  { x: 45, y: 34, size: 4, opacity: 0.35, shape: '45% 55% 55% 45%', ratio: 0.92, rot: 211 },
  { x: 78, y: 56, size: 2, opacity: 0.5, shape: '50% 50% 45% 55%', ratio: 1.08, rot: 333 },
  { x: 15, y: 61, size: 3, opacity: 0.28, shape: '58% 42% 52% 48%', ratio: 0.82, rot: 96 },
  { x: 82, y: 28, size: 5, opacity: 0.22, shape: '42% 58% 48% 52%', ratio: 1.12, rot: 177 },
  { x: 3, y: 41, size: 2, opacity: 0.55, shape: '52% 48% 55% 45%', ratio: 0.95, rot: 248 },
  { x: 59, y: 73, size: 4, opacity: 0.32, shape: '48% 52% 45% 55%', ratio: 1.18, rot: 52 },
  { x: 37, y: 9, size: 3, opacity: 0.38, shape: '55% 45% 58% 42%', ratio: 0.87, rot: 129 },
  { x: 96, y: 85, size: 2, opacity: 0.42, shape: '45% 55% 52% 48%', ratio: 1.05, rot: 304 },
  { x: 72, y: 3, size: 4, opacity: 0.26, shape: '50% 50% 48% 52%', ratio: 0.93, rot: 188 },
  { x: 28, y: 94, size: 3, opacity: 0.44, shape: '55% 45% 50% 50%', ratio: 1.1, rot: 67 },
  { x: 5, y: 18, size: 2, opacity: 0.48, shape: '48% 52% 55% 45%', ratio: 0.98, rot: 269 },
  { x: 64, y: 47, size: 5, opacity: 0.3, shape: '52% 48% 50% 50%', ratio: 1.15, rot: 141 },
  { x: 41, y: 82, size: 3, opacity: 0.36, shape: '50% 50% 52% 48%', ratio: 0.85, rot: 326 },
  { x: 19, y: 25, size: 4, opacity: 0.24, shape: '45% 55% 55% 45%', ratio: 1.02, rot: 83 },
  { x: 53, y: 6, size: 2, opacity: 0.52, shape: '55% 45% 48% 52%', ratio: 0.9, rot: 205 },
  { x: 88, y: 39, size: 3, opacity: 0.28, shape: '50% 50% 55% 45%', ratio: 1.12, rot: 157 },
  { x: 31, y: 58, size: 4, opacity: 0.34, shape: '48% 52% 50% 50%', ratio: 0.88, rot: 272 },
]

export const DustOverlay: React.FC<{ opacity?: number; particles?: typeof DUST_PARTICLES_LIGHT }> = ({ opacity = 0.08, particles = DUST_PARTICLES_LIGHT }) => (
  <div className="absolute inset-0 pointer-events-none rounded-lg overflow-hidden" aria-hidden="true">
    {particles.map((p) => (
      <div
        key={`dust-${p.x}-${p.y}-${p.size}`}
        className="absolute bg-gray-500 dark:bg-gray-400"
        style={{
          left: `${p.x}%`,
          top: `${p.y}%`,
          width: p.size,
          height: p.size * p.ratio,
          opacity: opacity * p.opacity,
          borderRadius: p.shape,
          transform: `rotate(${p.rot}deg)`,
        }}
      />
    ))}
  </div>
)

interface CobwebCornerProps {
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  opacity?: number
  variant?: 'light' | 'heavy'
}

export const CobwebCorner: React.FC<CobwebCornerProps> = ({ 
  position, 
  opacity = 0.35,
  variant = 'light'
}) => {
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

  const gradientId = `cobweb-gradient-${position}`
  const filterId = `cobweb-shadow-${position}`

  const lightStrands = [
    { d: 'M0 0 L28 12', strokeWidth: '1.2' },
    { d: 'M0 0 L12 28', strokeWidth: '1.2' },
    { d: 'M0 16 L10 18', strokeWidth: '0.8' },
    { d: 'M8 16 L20 8', strokeWidth: '0.8' },
    { d: 'M20 0 L20 8', strokeWidth: '0.8' },
  ]

  const heavyStrands = [
    { d: 'M0 0 L28 12', strokeWidth: '1.2' },
    { d: 'M0 0 L24 24', strokeWidth: '1.2' },
    { d: 'M0 0 L12 32', strokeWidth: '1.2' },
    { d: 'M8 12 L20 6', strokeWidth: '0.6' },
    { d: 'M12 20 L6 8', strokeWidth: '0.6' },
  ]

  const strands = variant === 'heavy' ? heavyStrands : lightStrands

  return (
    <svg
      className={`absolute ${positionMap[position]} w-12 h-12 pointer-events-none text-gray-500 dark:text-gray-300`}
      style={{ opacity, transform: transformMap[position] }}
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <defs>
        <linearGradient 
          id={gradientId} 
          gradientUnits="userSpaceOnUse"
          x1="0" y1="0" x2="48" y2="48"
        >
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.3" />
        </linearGradient>
        <filter id={filterId}>
          <feDropShadow dx="0" dy="0" stdDeviation="1" floodOpacity="0.5" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`}>
        {strands.map((strand, i) => (
          <path
            key={`strand-${i}-${strand.strokeWidth}`}
            d={strand.d}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={strand.strokeWidth}
          />
        ))}
      </g>
    </svg>
  )
}

function DustLayer({ level }: { level: 1 | 2 | 3 }) {
  const opacity = level === 1 ? 0.5 : level === 2 ? 1 : 0
  const particles = level === 1 ? DUST_PARTICLES_LIGHT : DUST_PARTICLES_HEAVY
  return <DustOverlay opacity={opacity} particles={particles} />
}

export const AgingDecorations: React.FC<{ level: 0 | 1 | 2 | 3 }> = ({ level }) => {
  if (level < 1) return null

  return (
    <div className={`absolute inset-0 overflow-hidden rounded-lg pointer-events-none ${level === 3 ? 'bg-gray-300/30 dark:bg-gray-400/45' : ''}`}>
      <DustLayer level={level as 1 | 2 | 3} />
      {level >= 2 && (
        <>
          <CobwebCorner position="top-left" variant="light" />
          <CobwebCorner position="bottom-right" variant="light" />
        </>
      )}
      {level >= 3 && (
        <>
          <CobwebCorner position="bottom-left" variant="heavy" />
          <CobwebCorner position="top-right" variant="heavy" />
        </>
      )}
    </div>
  )
}