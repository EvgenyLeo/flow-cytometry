import React, { useEffect, useRef, useState, useCallback } from "react"
import { useAnimationFrame } from "framer-motion"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

const SVG_W   = 1040
const SVG_H   = 680

const CH_CX   = 420
const CH_HALF = 22

const LASER_Y  = 340
const LASER_X0 = 50
const LASER_X1 = LASER_X0 + 76
const LASER_X_END = 670
const BEAM_STOP_X = LASER_X_END

const FSC_LEFT = 700

const SSC_HX  = 240
const SSC_HY  = 100
const SSC_W   = 70
const SSC_H   = 92
const INT_X = CH_CX
const INT_Y = LASER_Y

let _id = 0
const mkid = () => ++_id

interface Cell {
  id: number
  cx: number; y: number
  r: number; speed: number
  g: 1 | 2
  scattering: boolean; scatterAge: number
}

interface Photon {
  id: number
  x: number; y: number
  vx: number; vy: number
  kind: "fsc" | "ssc"
  opacity: number; age: number; maxAge: number
}

interface Flash { id: number; x: number; y: number; born: number }

function Defs() {
  return (
    <defs>
      {/* Laser & volumetric effects */}
      <filter id="glow-laser" x="-100%" y="-800%" width="300%" height="1700%">
        <feGaussianBlur stdDeviation="6"  result="b1"/>
        <feGaussianBlur stdDeviation="18" result="b2"/>
        <feGaussianBlur stdDeviation="44" result="b3"/>
        <feMerge>
          <feMergeNode in="b3"/>
          <feMergeNode in="b2"/>
          <feMergeNode in="b1"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>

      <filter id="glow-flash" x="-250%" y="-250%" width="600%" height="600%">
        <feGaussianBlur stdDeviation="10" result="b1"/>
        <feGaussianBlur stdDeviation="28" result="b2"/>
        <feMerge>
          <feMergeNode in="b2"/>
          <feMergeNode in="b1"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>

      <filter id="glow-det" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="11" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>

      <filter id="glow-cell" x="-70%" y="-70%" width="240%" height="240%">
        <feGaussianBlur stdDeviation="3.5" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>

      <filter id="glow-ph" x="-600%" y="-600%" width="1300%" height="1300%">
        <feGaussianBlur stdDeviation="5" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>

      {/* Beam stop */}
      <filter id="glow-beam-stop" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="8" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>

      {/* Channel fill */}
      <linearGradient id="ch-fill" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%"   stopColor="#0a1f35" stopOpacity="0.95"/>
        <stop offset="45%"  stopColor="#0d2a42" stopOpacity="0.4"/>
        <stop offset="100%" stopColor="#0a1f35" stopOpacity="0.95"/>
      </linearGradient>

      {/* Laser beam – userSpaceOnUse for proper line gradients */}
      <linearGradient id="laser-gr" x1={LASER_X1} y1={LASER_Y} x2={LASER_X_END} y2={LASER_Y}
        gradientUnits="userSpaceOnUse">
        <stop offset="0%"   stopColor="#0066ff" stopOpacity="0.05"/>
        <stop offset="8%"   stopColor="#1e7ff9" stopOpacity="1"/>
        <stop offset="32%"  stopColor="#7fd3ff" stopOpacity="1"/>
        <stop offset="50%"  stopColor="#e0f2ff" stopOpacity="1"/>
        <stop offset="68%"  stopColor="#7fd3ff" stopOpacity="1"/>
        <stop offset="92%"  stopColor="#1e7ff9" stopOpacity="1"/>
        <stop offset="100%" stopColor="#0066ff" stopOpacity="0.05"/>
      </linearGradient>

      <linearGradient id="laser-core"
        x1={LASER_X1 + 30} y1={LASER_Y} x2={LASER_X_END - 20} y2={LASER_Y}
        gradientUnits="userSpaceOnUse">
        <stop offset="0%"   stopColor="#ffffff" stopOpacity="0"/>
        <stop offset="15%"  stopColor="#ffffff" stopOpacity="0.88"/>
        <stop offset="85%"  stopColor="#ffffff" stopOpacity="0.88"/>
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0"/>
      </linearGradient>

      {/* Cell fills */}
      <radialGradient id="cg1" cx="35%" cy="30%" r="65%">
        <stop offset="0%"   stopColor="#d4f3ff" stopOpacity="0.98"/>
        <stop offset="48%"  stopColor="#2fa0d6" stopOpacity="0.85"/>
        <stop offset="100%" stopColor="#0a3f72" stopOpacity="0.2"/>
      </radialGradient>
      <radialGradient id="cg2" cx="35%" cy="30%" r="65%">
        <stop offset="0%"   stopColor="#a8e5f7" stopOpacity="0.98"/>
        <stop offset="48%"  stopColor="#1d7eb4" stopOpacity="0.85"/>
        <stop offset="100%" stopColor="#052d54" stopOpacity="0.2"/>
      </radialGradient>

      {/* Detector apertures */}
      <radialGradient id="det-fsc-g" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stopColor="#5fee9a" stopOpacity="1"/>
        <stop offset="55%"  stopColor="#10c981" stopOpacity="0.6"/>
        <stop offset="100%" stopColor="#065f46" stopOpacity="0.08"/>
      </radialGradient>
      <radialGradient id="det-ssc-g" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stopColor="#fde789" stopOpacity="1"/>
        <stop offset="55%"  stopColor="#f59e0b" stopOpacity="0.6"/>
        <stop offset="100%" stopColor="#92400e" stopOpacity="0.08"/>
      </radialGradient>

      {/* Clip path for cells */}
      <clipPath id="channel-clip">
        <rect x={CH_CX - CH_HALF} y={0} width={CH_HALF * 2} height={SVG_H}/>
      </clipPath>
    </defs>
  )
}

function SceneGrid() {
  const items: React.ReactElement[] = []
  for (let x = 65; x < SVG_W; x += 65)
    items.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={SVG_H}/>)
  for (let y = 50; y < SVG_H; y += 50)
    items.push(<line key={`h${y}`} x1={0} y1={y} x2={SVG_W} y2={y}/>)
  return (
    <g stroke="#0a1d30" strokeWidth="0.4" strokeDasharray="3 14" opacity="0.85">
      {items}
    </g>
  )
}

function FlowChannel() {
  const lx = CH_CX - CH_HALF
  const rx = CH_CX + CH_HALF
  return (
    <g>
      {/* outer glow/shadow */}
      <rect x={lx - 24} y={0} width={CH_HALF * 2 + 48} height={SVG_H}
        fill="#050d15" opacity="0.6"/>
      {/* channel body */}
      <rect x={lx} y={0} width={CH_HALF * 2} height={SVG_H}
        fill="url(#ch-fill)"/>
      {/* outer walls – cyan glow */}
      <line x1={lx} y1={0} x2={lx} y2={SVG_H} stroke="#1a7cbb" strokeWidth="2.2" opacity="0.9"/>
      <line x1={rx} y1={0} x2={rx} y2={SVG_H} stroke="#1a7cbb" strokeWidth="2.2" opacity="0.9"/>
      {/* inner highlight */}
      <line x1={lx + 2.5} y1={0} x2={lx + 2.5} y2={SVG_H} stroke="#7fd3ff" strokeWidth="0.7" opacity="0.15"/>
      <line x1={rx - 2.5} y1={0} x2={rx - 2.5} y2={SVG_H} stroke="#7fd3ff" strokeWidth="0.7" opacity="0.15"/>

      {/* flow chevrons */}
      {[60, 180, 410, 500, 570, 640].map(y => (
        <g key={y} opacity="0.18">
          <polyline
            points={`${CH_CX - 9},${y} ${CH_CX},${y + 13} ${CH_CX + 9},${y}`}
            fill="none" stroke="#44c0ff" strokeWidth="1.6"/>
        </g>
      ))}
    </g>
  )
}

function LaserBeam({
  enabled,
  fscEnabled,
  activeCell,
}: {
  enabled: boolean
  fscEnabled: boolean
  activeCell?: Cell
}) {

  if (!enabled) return null

  const y = LASER_Y
  const x1 = LASER_X1
  const x2 = fscEnabled ? LASER_X_END - 8 : SVG_W + 20

  const renderSegment = (sx: number, ex: number) => {
    if (ex <= sx) return null
    return (
      <>
        <line
          x1={sx} y1={y} x2={ex} y2={y}
          stroke="#1066ff" strokeWidth="64" opacity={0.05}
          filter="url(#glow-laser)"
        />
        <line
          x1={sx} y1={y} x2={ex} y2={y}
          stroke="#2e8bff" strokeWidth="24" opacity={0.15}
          filter="url(#glow-laser)"
        />
        <line
          x1={sx} y1={y} x2={ex} y2={y}
          stroke="url(#laser-gr)" strokeWidth="6" opacity={1}
        />
        <line
          x1={sx + 30} y1={y} x2={ex - 20} y2={y}
          stroke="url(#laser-core)" strokeWidth="1.8" opacity={0.92}
          filter="url(#glow-laser)"
        />
      </>
    )
  }

  if (!activeCell) {
    return (
      <g>
        {renderSegment(x1, x2)}
        <circle cx={INT_X} cy={y} r={7} fill="#a0d8ff" opacity="0.45" filter="url(#glow-flash)"/>
        <circle cx={INT_X} cy={y} r={3} fill="#ffffff" opacity="0.85"/>
      </g>
    )
  }

  // Cell is intersecting: beam terminates at the cell's leading edge
  const cellLeftEdge = activeCell.cx - activeCell.r

  return (
    <g>
      {/* Left segment — beam up to the cell */}
      {renderSegment(x1, cellLeftEdge)}

      {/* Termination bloom — bright scatter halo where beam hits the cell */}
      <circle
        cx={cellLeftEdge}
        cy={y}
        r={18}
        fill="#7fd3ff"
        opacity={0.22}
        filter="url(#glow-flash)"
      />
      <circle
        cx={cellLeftEdge}
        cy={y}
        r={7}
        fill="#c8ecff"
        opacity={0.65}
        filter="url(#glow-laser)"
      />
      <circle
        cx={cellLeftEdge}
        cy={y}
        r={2.5}
        fill="#ffffff"
        opacity={0.95}
      />

      {/* Interaction point marker (interrogation zone dot) */}
      <circle cx={INT_X} cy={y} r={7} fill="#a0d8ff" opacity="0.45" filter="url(#glow-flash)"/>
      <circle cx={INT_X} cy={y} r={3} fill="#ffffff" opacity="0.85"/>
    </g>
  )
}

function LaserSource({ enabled }: { enabled: boolean }) {
  const bx = LASER_X0
  const by = LASER_Y - 28
  const c  = enabled ? "#1d5bb9" : "#0f1f35"
  return (
    <g>
      {/* outer glow */}
      {enabled && (
        <rect x={bx - 5} y={by - 5} width={84} height={60} rx="10"
          fill="#0a3a99" opacity="0.16" filter="url(#glow-det)"/>
      )}
      {/* housing – angled top */}
      <path d={`M ${bx+8} ${by} L ${bx+72} ${by-8} L ${bx+80} ${by+12} L ${bx+72} ${by+48} L ${bx+8} ${by+56} Q ${bx+2} ${by+40} ${bx+2} ${by+28} Q ${bx+2} ${by+16} ${bx+8} ${by}`}
        fill="#050d1a" stroke={c} strokeWidth={enabled ? 1.8 : 1.2}/>
      {/* aperture lens – gradient */}
      <g filter={enabled ? "url(#glow-laser)" : undefined}>
        <ellipse cx={bx + 76} cy={by + 24} rx={7} ry={13}
          fill={enabled ? "#7fd3ff" : "#0f1f35"}
          opacity={enabled ? 0.92 : 0.25}/>
        <ellipse cx={bx + 76} cy={by + 24} rx={7} ry={13}
          fill="none" stroke={enabled ? "#e0f2ff" : "none"}
          strokeWidth="0.6" opacity={enabled ? 0.4 : 0}/>
      </g>
      {/* status LEDs */}
      {[0, 1, 2].map(i => (
        <circle key={i} cx={bx + 14 + i * 14} cy={by + 24} r={3}
          fill={enabled ? "#4fa3ff" : "#0a1f35"}
          opacity={enabled ? 0.95 : 0.35}
          filter={enabled ? "url(#glow-laser)" : undefined}/>
      ))}
      {/* label */}
      <text x={bx + 38} y={by - 10} textAnchor="middle"
        fill={enabled ? "#2563eb" : "#0f1f35"}
        fontSize="8" fontFamily="monospace" letterSpacing="0.12em" fontWeight="600">
        488nm LASER
      </text>
    </g>
  )
}

function BeamStop({ visible }: { visible: boolean }) {
  if (!visible) return null
  const x = BEAM_STOP_X
  const y = LASER_Y
  return (
    <g filter="url(#glow-beam-stop)">
      {/* vertical support rail – anodized */}
      <rect x={x - 3.5} y={y - 12} width={7} height={68} rx="2"
        fill="#0d1a28" stroke="#2a4a62" strokeWidth="1.4"/>

      {/* obstruction disc mounting bracket */}
      <ellipse cx={x} cy={y - 32} rx={22} ry={4}
        fill="#051018" stroke="#1a2f42" strokeWidth="1.6"/>

      {/* OBSTRUCTION DISC – prominent, clearly blocking beam */}
      <circle cx={x} cy={y - 34} r={20}
        fill="#000000" opacity="0.98" filter="url(#glow-beam-stop)"/>
      <circle cx={x} cy={y - 34} r={20}
        fill="none" stroke="#1a2a3a" strokeWidth="2.2"/>

      {/* disc surface texture – radial lines showing material */}
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(deg => {
        const rad = (deg * Math.PI) / 180
        const x1 = x + Math.cos(rad) * 8
        const y1 = y - 34 + Math.sin(rad) * 8
        const x2 = x + Math.cos(rad) * 19
        const y2 = y - 34 + Math.sin(rad) * 19
        return (
          <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#051a28" strokeWidth="0.8" opacity="0.6"/>
        )
      })}

      {/* disc edge highlight to emphasize blocking */}
      <circle cx={x} cy={y - 34} r={19.2}
        fill="none" stroke="#0a2a3a" strokeWidth="0.8" opacity="0.4"/>

      {/* mounting collar */}
      <ellipse cx={x} cy={y - 32} rx={21} ry={5}
        fill="#0a1520" stroke="#1a3548" strokeWidth="1.2"/>

      {/* support rod below */}
      <rect x={x - 2} y={y - 30} width={4} height={44} rx="1.5"
        fill="#0d1a28" stroke="#2a4055" strokeWidth="1"/>

      {/* label */}
      <text x={x} y={y + 28} textAnchor="middle"
        fill="#2a5068" fontSize="7.5" fontFamily="monospace" letterSpacing="0.1em" fontWeight="600">
        OBSTRUCTION
      </text>
      <text x={x} y={y + 38} textAnchor="middle"
        fill="#2a5068" fontSize="7.5" fontFamily="monospace" letterSpacing="0.1em" fontWeight="600">
        DISC
      </text>
    </g>
  )
}

function FSCDetector({ enabled }: { enabled: boolean }) {
  const hx = FSC_LEFT
  const y  = LASER_Y
  const c  = enabled ? "#10b981" : "#0d2a1a"
  const cb = enabled ? "#5fee9a" : "#0d2a1a"
  return (
    <g opacity={enabled ? 1 : 0.25}>
      {/* outer glow */}
      {enabled && (
        <ellipse cx={hx + 56} cy={y} rx={68} ry={46}
          fill="#10b981" opacity="0.07" filter="url(#glow-det)"/>
      )}
      {/* housing – cylinder */}
      <g>
        <ellipse cx={hx} cy={y - 36} rx={18} ry={12}
          fill={c} opacity={enabled ? 0.8 : 0.3} stroke={c} strokeWidth="1.8"/>
        <rect x={hx - 18} y={y - 36} width={36} height={72} rx="8"
          fill="#050d1a" stroke={c} strokeWidth={enabled ? 1.9 : 1}/>
        <ellipse cx={hx} cy={y + 36} rx={18} ry={12}
          fill={c} opacity={enabled ? 0.6 : 0.2} stroke={c} strokeWidth="1.8"/>
      </g>
      {/* aperture lens – front facing */}
      <g>
        <ellipse cx={hx - 18} cy={y} rx={8} ry={34}
          fill={enabled ? "url(#det-fsc-g)" : "#0a1a10"}
          filter={enabled ? "url(#glow-det)" : undefined}/>
        <ellipse cx={hx - 18} cy={y} rx={8} ry={34}
          fill="none" stroke={cb} strokeWidth="1.2" opacity={enabled ? 0.5 : 0.2}/>
        <ellipse cx={hx - 18} cy={y} rx={5} ry={25}
          fill="none" stroke={cb} strokeWidth="0.5" opacity={enabled ? 0.25 : 0.1}/>
      </g>
      {/* connector rod */}
      <line x1={hx - 18} y1={y} x2={hx - 50} y2={y}
        stroke={enabled ? "#2a4a5f" : "#0f1f2a"} strokeWidth="2.2"/>
      {/* label */}
      <text x={hx + 52} y={y - 42} textAnchor="middle"
        fill={c} fontSize="13" fontFamily="monospace" fontWeight="700" letterSpacing="0.16em">
        FSC
      </text>
      <text x={hx + 52} y={y + 56} textAnchor="middle"
        fill="#253444" fontSize="7.5" fontFamily="monospace" letterSpacing="0.05em">
        DETECTOR
      </text>
      {/* active indicator */}
      {enabled && (
        <>
          <circle cx={hx + 32} cy={y - 28} r={5} fill={cb} filter="url(#glow-det)"/>
          <circle cx={hx + 32} cy={y - 28} r={10} fill={cb} opacity="0.12"/>
        </>
      )}
    </g>
  )
}

function SSCDetector({ enabled }: { enabled: boolean }) {
  const hx  = SSC_HX - SSC_W / 2
  const hy  = SSC_HY - SSC_H / 2
  const c   = enabled ? "#f59e0b" : "#3a2400"
  const cb  = enabled ? "#fde789" : "#3a2400"
  const apX = hx + SSC_W + 1
  const apY = hy + SSC_H / 2

  return (
    <g opacity={enabled ? 1 : 0.26}>
      {/* arm – dashed, curved toward interrogation */}
      <path
        d={`M ${apX + 2} ${apY} Q ${(apX + INT_X) / 2} ${(apY + INT_Y) / 2 - 30} ${INT_X - 8} ${INT_Y}`}
        stroke={enabled ? "#2c3d50" : "#0f1620"}
        strokeWidth="2" strokeDasharray="6 5" fill="none"/>

      {/* housing glow */}
      {enabled && (
        <ellipse cx={SSC_HX} cy={SSC_HY} rx={48} ry={32}
          fill="#f59e0b" opacity="0.08" filter="url(#glow-det)"/>
      )}
      {/* housing – rounded rectangle with tilt */}
      <rect x={hx} y={hy} width={SSC_W} height={SSC_H} rx="7"
        fill="#070f1c" stroke={c} strokeWidth={enabled ? 1.9 : 1}/>

      {/* aperture – on right side, elliptical lens */}
      <ellipse cx={apX - 3} cy={apY} rx={11} ry={28}
        fill={enabled ? "url(#det-ssc-g)" : "#1e1100"}
        filter={enabled ? "url(#glow-det)" : undefined}/>
      <ellipse cx={apX - 3} cy={apY} rx={11} ry={28}
        fill="none" stroke={cb} strokeWidth="1.2" opacity={enabled ? 0.5 : 0.2}/>
      <ellipse cx={apX - 3} cy={apY} rx={8} ry={22}
        fill="none" stroke={cb} strokeWidth="0.5" opacity={enabled ? 0.25 : 0.1}/>

      {/* labels */}
      <text x={hx - 8} y={hy + SSC_H / 2 - 12} textAnchor="end"
        fill={c} fontSize="13" fontFamily="monospace" fontWeight="700" letterSpacing="0.16em">
        SSC
      </text>
      <text x={hx - 8} y={hy + SSC_H / 2 + 8} textAnchor="end"
        fill="#253444" fontSize="7.5" fontFamily="monospace" letterSpacing="0.05em">
        DETECTOR
      </text>

      {/* active indicator */}
      {enabled && (
        <>
          <circle cx={hx + SSC_W - 12} cy={hy + 16} r={5} fill={cb} filter="url(#glow-det)"/>
          <circle cx={hx + SSC_W - 12} cy={hy + 16} r={10} fill={cb} opacity="0.12"/>
        </>
      )}
    </g>
  )
}

function CellSVG({ cell }: { cell: Cell }) {
  const { cx, y, r, g, scattering, scatterAge } = cell
  const fade = scattering ? Math.max(0, 1 - scatterAge / 26) : 0
  return (
    <g transform={`translate(${cx},${y})`} filter="url(#glow-cell)">
      {scattering && (
        <circle r={r + 18} fill="#a0d8ff" opacity={fade * 0.25}/>
      )}
      <circle r={r}
        fill={`url(#cg${g})`}
        stroke={scattering ? "#d4f3ff" : "#3284be"}
        strokeWidth={scattering ? 2.2 : 1}
        strokeOpacity={scattering ? 0.92 : 0.5}/>
      {/* nucleus */}
      <circle r={r * 0.43} cx={r * 0.10} cy={r * 0.10}
        fill="#0d3f6080" opacity="0.85"/>
      {/* specular highlights */}
      <circle r={r * 0.14} cx={-r * 0.16} cy={-r * 0.17}
        fill="#e0f2ff" opacity="0.55"/>
      <ellipse rx={r * 0.57} ry={r * 0.23}
        cx={-r * 0.08} cy={-r * 0.60}
        fill="#f0f9ff" opacity="0.16"/>
    </g>
  )
}

function PhotonSVG({ p }: { p: Photon }) {
  return (
    <circle cx={p.x} cy={p.y}
      r={p.kind === "fsc" ? 3 : 2.6}
      fill={p.kind === "fsc" ? "#5fee9a" : "#fde789"}
      opacity={p.opacity * 0.90}
      filter="url(#glow-ph)"
    />
  )
}

function FlashSVG({ f, frame }: { f: Flash; frame: number }) {
  const age = frame - f.born

  // short sharp optical pulse
  const t = Math.min(1, age / 6)

  // quick disappearance without lingering glow
  const fade =
    age < 4
      ? 1
      : Math.max(0, 1 - (age - 4) / 2)

  return (
    <g>
      {/* outer optical bloom */}
      <circle
        cx={f.x}
        cy={f.y}
        r={4 + t * 18}
        fill="#7fd3ff"
        opacity={fade * 0.18}
        filter="url(#glow-flash)"
      />

      {/* bright interaction core */}
      <circle
        cx={f.x}
        cy={f.y}
        r={2 + t * 8}
        fill="#dff4ff"
        opacity={fade * 0.55}
      />
    </g>
  )
}

function Annotations({ laserEnabled, fscEnabled, sscEnabled }:
  { laserEnabled: boolean; fscEnabled: boolean; sscEnabled: boolean }) {
  const y  = LASER_Y
  const lx = CH_CX

  return (
    <g fontFamily="monospace" fontSize="7.5" letterSpacing="0.08em">
      {/* Interrogation zone */}
      {laserEnabled && (
        <g>
          <line x1={lx - CH_HALF - 2} y1={y - 26} x2={lx + CH_HALF + 2} y2={y - 26}
            stroke="#164e63" strokeWidth="0.9"/>
          <line x1={lx - CH_HALF - 2} y1={y - 26} x2={lx - CH_HALF - 2} y2={y + 8}
            stroke="#164e63" strokeWidth="0.9"/>
          <line x1={lx + CH_HALF + 2} y1={y - 26} x2={lx + CH_HALF + 2} y2={y + 8}
            stroke="#164e63" strokeWidth="0.9"/>
          <line x1={lx + CH_HALF + 4} y1={y - 22}
            x2={lx + CH_HALF + 76} y2={y - 58}
            stroke="#164e63" strokeWidth="0.8" strokeDasharray="2 5"/>
          <text x={lx + CH_HALF + 80} y={y - 60} fill="#0d3f52" fontSize="7.5" fontWeight="600">
            INTERROGATION ZONE
          </text>
        </g>
      )}

      {/* SSC path */}
      {sscEnabled && laserEnabled && (
        <g>
          <path
            d={`M ${lx - 12} ${y - CH_HALF - 6} Q ${SSC_HX + 20} ${SSC_HY + 25} ${SSC_HX + 40} ${SSC_HY + 46}`}
            stroke="#6b3a00" strokeWidth="0.9" strokeDasharray="3 5" fill="none" opacity="0.7"/>
          <text x={SSC_HX - 2} y={SSC_HY + 58} textAnchor="middle"
            fill="#7c4400" fontSize="7.5" fontWeight="600">
            SIDE SCATTER (90°)
          </text>
        </g>
      )}

      {/* FSC path */}
      {fscEnabled && laserEnabled && (
        <g>
          <line x1={lx + CH_HALF + 4} y1={y + 20}
            x2={BEAM_STOP_X - 28} y2={y + 58}
            stroke="#0b4a35" strokeWidth="0.9" strokeDasharray="3 5" opacity="0.7"/>
          <text x={BEAM_STOP_X - 12} y={y + 72} textAnchor="middle"
            fill="#0a5640" fontSize="7.5" fontWeight="600">
            FORWARD SCATTER
          </text>
        </g>
      )}

      {/* watermark */}
      <text x={10} y={SVG_H - 8} fill="#0a1f35" fontSize="6.5" fontWeight="500">
        Optical bench — 488 nm excitation
      </text>
      <text x={SVG_W - 10} y={SVG_H - 8} textAnchor="end" fill="#0a1f35" fontSize="6.5" fontWeight="500">
        Flow cytometry simulation
      </text>
    </g>
  )
}

function ControlRow({
  label, sublabel, enabled, onChange, color,
}: {
  label: string; sublabel: string; enabled: boolean
  onChange: (v: boolean) => void; color: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-shrink-0 size-2.5">
        {enabled && (
          <div className="absolute inset-0 animate-ping rounded-full opacity-60"
            style={{ backgroundColor: color }}/>
        )}
        <div className="relative size-2.5 rounded-full transition-all duration-500 shadow-lg"
          style={{
            backgroundColor: enabled ? color : "oklch(0.18 0.03 240)",
            boxShadow: enabled ? `0 0 12px ${color}` : "none",
          }}/>
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <Label className="cursor-pointer font-mono text-[11px] font-semibold tracking-widest uppercase"
          style={{ color: enabled ? color : "oklch(0.26 0.04 240)" }}>
          {label}
        </Label>
        <span className="font-mono text-[8.5px]"
          style={{ color: "oklch(0.21 0.04 240)" }}>
          {sublabel}
        </span>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={onChange}
        className="data-[state=checked]:bg-[oklch(0.36_0.12_240)] data-[state=unchecked]:bg-[oklch(0.16_0.03_240)]"
      />
    </div>
  )
}

export function FlowCytometry() {
  const [cellsOn, setCellsOn] = useState(true)
  const [laserOn, setLaserOn] = useState(true)
  const [fscOn,   setFscOn]   = useState(true)
  const [sscOn,   setSscOn]   = useState(true)

  const rCells = useRef(cellsOn)
  const rLaser = useRef(laserOn)
  const rFsc   = useRef(fscOn)
  const rSsc   = useRef(sscOn)
  useEffect(() => { rCells.current = cellsOn }, [cellsOn])
  useEffect(() => { rLaser.current = laserOn }, [laserOn])
  useEffect(() => { rFsc.current   = fscOn   }, [fscOn])
  useEffect(() => { rSsc.current   = sscOn   }, [sscOn])

  const cells   = useRef<Cell[]>([])
  const photons = useRef<Photon[]>([])
  const flashes = useRef<Flash[]>([])
  const frameRef = useRef(0)
  const [, bump] = useState(0)

 const spawnCell = useCallback((startY = -26) => {

  cells.current.push({
    id: mkid(),
    cx: CH_CX + (Math.random() - 0.5) * 5,
    y: startY,
    r: 7 + Math.random() * 4,
    speed: 1.8,
    g: Math.random() > 0.5 ? 1 : 2,
    scattering: false,
    scatterAge: 0,
  })
}, [])

const emitPhotons = useCallback((ix: number, iy: number) => {
  const N = 34

  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2
    const axial = Math.abs(Math.cos(ang)) > 0.55

    // FSC
    if (axial) {
      const spd = 5.5 + Math.random() * 2.8

      photons.current.push({
        id: mkid(),
        x: ix,
        y: iy,

        vx: (0.96 + Math.random() * 0.18) * spd,
        vy: (Math.random() - 0.5) * 0.12 * spd,

        kind: "fsc",
        opacity: 0.95,
        age: 0,
        maxAge: 52 + Math.random() * 12,
      })
    }

    // SSC
    if (!axial) {
      const spd = 4.8 + Math.random() * 2.2
      
      photons.current.push({
        id: mkid(),
        x: ix,
        y: iy,
       
        vx: (-0.55 + Math.random() * 0.22) * spd,
        vy: (-0.85 + Math.random() * 0.28) * spd,
        kind: "ssc",
        opacity: 0.92,
        age: 0,
        maxAge: 40 + Math.random() * 10,
      })
    }
  }
}, [])

  useEffect(() => {
    for (let i = 0; i < 7; i++) spawnCell(-32 - i * 108)
  }, [spawnCell])

  useAnimationFrame(() => {
    frameRef.current++
    const f = frameRef.current

    if (rCells.current && f % 94 === 0) spawnCell()

    cells.current = cells.current.map(c => {
      const ny = c.y + c.speed
      let { scattering, scatterAge } = c

      if (
        rLaser.current &&
        rCells.current &&
        !scattering &&
        c.y < LASER_Y &&
        ny >= LASER_Y &&
        Math.abs(c.cx - CH_CX) < CH_HALF
      ) {
        scattering = true
        scatterAge = 0
        flashes.current.push({ id: mkid(), x: c.cx, y: LASER_Y, born: f })
        emitPhotons(c.cx, LASER_Y)
      }
      if (scattering) {
        scatterAge++
        // shorter and cleaner scatter pulse
        if (scatterAge > 12) {
          scattering = false
          scatterAge = 0
        }
      }
      return { ...c, y: ny, scattering, scatterAge }
    }).filter(c => c.y < SVG_H + 45)

    photons.current = photons.current.map(p => ({
      ...p,
      x: p.x + p.vx,
      y: p.y + p.vy,
      age: p.age + 1,
      opacity: p.opacity * 0.96,
    })).filter(p => p.age < p.maxAge && p.opacity > 0.02)

    flashes.current = flashes.current.filter(fl => f - fl.born < 16)

    if (f % 2 === 0) bump(n => n + 1)
  })

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{ background: "oklch(0.058 0.014 232)" }}>

      {/* ── Control Panel ── */}
      <aside
        className="relative flex w-[218px] flex-shrink-0 flex-col border-r overflow-y-auto"
        style={{ background: "oklch(0.075 0.019 232)", borderColor: "oklch(0.12 0.04 234)" }}>

        {/* CRT scanlines */}
        <div className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.008) 2px,rgba(255,255,255,0.008) 3px)",
          }}/>

        <div className="relative flex flex-col p-5">

          {/* Controls */}
          <div className="flex flex-col gap-5">
            <ControlRow
              label="Cells" sublabel="Fluidics / Sample"
              enabled={cellsOn} onChange={setCellsOn}
              color="oklch(0.66 0.13 215)"/>
            <ControlRow
              label="Laser 488nm" sublabel="Coherent Sapphire"
              enabled={laserOn} onChange={setLaserOn}
              color="oklch(0.62 0.22 254)"/>
            <ControlRow
              label="FSC Detector" sublabel="Forward Scatter"
              enabled={fscOn} onChange={setFscOn}
              color="oklch(0.64 0.18 158)"/>
            <ControlRow
              label="SSC Detector" sublabel="Side Scatter"
              enabled={sscOn} onChange={setSscOn}
              color="oklch(0.72 0.16 52)"/>
          </div>

        </div>
      </aside>

      {/* ── Main Scene ── */}
      <main className="relative flex flex-1 flex-col overflow-hidden">

        {/* Topbar */}
        <div className="flex h-9 items-center px-5 flex-shrink-0 border-b"
          style={{ background: "oklch(0.064 0.014 232)", borderColor: "oklch(0.11 0.04 234)" }}>
          <span className="font-mono text-[7.5px] tracking-[0.26em] uppercase"
            style={{ color: "oklch(0.24 0.05 234)" }}>
            Optical Path — Real-time Visualization
          </span>
          <div className="ml-auto flex items-center gap-3">
            <span className="font-mono text-[7.5px]" style={{ color: "oklch(0.22 0.04 234)" }}>
              488nm / 532nm
            </span>
            <div className="h-px w-5" style={{ background: "oklch(0.16 0.04 234)" }}/>
            <span className="font-mono text-[7.5px]" style={{ color: "oklch(0.22 0.04 234)" }}>
              FACSDiva 9.1
            </span>
          </div>
        </div>

        {/* SVG Scene */}
        <div className="relative flex-1 min-h-0">
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 h-full w-full">

            <Defs/>
            <SceneGrid/>
            <FlowChannel/>
            <LaserBeam
              enabled={laserOn}
              fscEnabled={fscOn}
              activeCell={
                cellsOn
                  ? cells.current.find(
                      c =>
                        Math.abs(c.y - LASER_Y) < c.r &&
                        Math.abs(c.cx - CH_CX) < CH_HALF
                    )
                  : undefined
              }
            />
            <LaserSource enabled={laserOn}/>
            <BeamStop visible={fscOn}/>
            <FSCDetector enabled={fscOn}/>
            <SSCDetector enabled={sscOn}/>

            {/* Rendered elements */}
            {flashes.current.map(fl => (
              <FlashSVG key={fl.id} f={fl} frame={frameRef.current}/>
            ))}
            {photons.current.map(p => (
              <PhotonSVG key={p.id} p={p}/>
            ))}

            <g clipPath="url(#channel-clip)">
              {cellsOn && cells.current.map(c => (
                <CellSVG key={c.id} cell={c}/>
              ))}
            </g>

            <Annotations laserEnabled={laserOn} fscEnabled={fscOn} sscEnabled={sscOn}/>
          </svg>
        </div>
      </main>
    </div>
  )
}
