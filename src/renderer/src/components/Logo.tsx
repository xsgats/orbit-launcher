import { useId } from 'react'





export function Logo({ size = 28, glow = true }: { size?: number; glow?: boolean }): React.JSX.Element {
  const id = useId().replace(/:/g, '')

  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="Orbit Launcher">
      <defs>
        <linearGradient id={`${id}-back`} x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0" stopColor="var(--cyan)" stopOpacity="0.4" />
          <stop offset="0.5" stopColor="var(--accent)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--violet)" stopOpacity="0.38" />
        </linearGradient>

        <linearGradient id={`${id}-front`} x1="0" y1="0.2" x2="1" y2="0.9">
          <stop offset="0" stopColor="var(--cyan)" />
          <stop offset="0.48" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--violet)" />
        </linearGradient>

        <radialGradient id={`${id}-core`} cx="0.34" cy="0.26" r="0.92">
          <stop offset="0" stopColor="#C3CCFF" />
          <stop offset="0.28" stopColor="#8391FF" />
          <stop offset="0.62" stopColor="var(--accent)" />
          <stop offset="1" stopColor="#33197A" />
        </radialGradient>

        <radialGradient id={`${id}-shade`} cx="0.72" cy="0.78" r="0.72">
          <stop offset="0" stopColor="#07040F" stopOpacity="0.5" />
          <stop offset="0.55" stopColor="#07040F" stopOpacity="0.16" />
          <stop offset="1" stopColor="#07040F" stopOpacity="0" />
        </radialGradient>

        <radialGradient id={`${id}-spec`} cx="0.32" cy="0.22" r="0.3">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.72" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>

        {glow && (
          <filter id={`${id}-glow`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="11" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      { }
      <g transform="rotate(-28 256 256)">
        <path
          d="M 60 256 A 196 92 0 0 1 452 256"
          fill="none"
          stroke={`url(#${id}-back)`}
          strokeWidth="26"
          strokeLinecap="round"
        />
      </g>

      { }
      <g filter={glow ? `url(#${id}-glow)` : undefined}>
        <circle cx="256" cy="256" r="84" fill={`url(#${id}-core)`} />
      </g>
      <circle cx="256" cy="256" r="84" fill={`url(#${id}-shade)`} />
      <circle cx="256" cy="256" r="84" fill={`url(#${id}-spec)`} />
      <path
        d="M 197 315 a 84 84 0 0 0 118 -118"
        fill="none"
        stroke="var(--cyan)"
        strokeOpacity="0.5"
        strokeWidth="5"
        strokeLinecap="round"
      />

      { }
      <g transform="rotate(-28 256 256)">
        <path
          d="M 452 256 A 196 92 0 0 1 60 256"
          fill="none"
          stroke={`url(#${id}-front)`}
          strokeWidth="26"
          strokeLinecap="round"
        />
        <circle cx="130" cy="326" r="19" fill="#E4FCFF" />
        <circle cx="130" cy="326" r="19" fill="none" stroke="var(--cyan)" strokeWidth="4" strokeOpacity="0.85" />
      </g>
    </svg>
  )
}


export function LogoSpinner({ size = 64 }: { size?: number }): React.JSX.Element {
  return (
    <div
      style={{
        width: size,
        height: size,
        animation: 'orbit-float 3.4s var(--ease-in-out) infinite alternate'
      }}
    >
      <Logo size={size} />
    </div>
  )
}
