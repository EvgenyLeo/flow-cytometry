import React, { useEffect, useRef, useState, useCallback } from "react"
import { useAnimationFrame } from "framer-motion"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

const SVG_W   = 1040
const SVG_H   = 680

const CH_CX   = 420
const CH_HALF = 22

const LASER_Y  = 340
const LASER_X0 = 50
const LASER_X1 = LASER_X0 + 76
const FSC_BEAM_STOP_X = 558
const LASER_X_END = FSC_BEAM_STOP_X

const FSC_LENS_X = 618
const FSC_LENS_Y = LASER_Y
const FSC_DET_X  = 712
const FSC_DET_Y  = LASER_Y

const SSC_LENS_X = 276
const SSC_LENS_Y = 128
const SSC_DET_X  = 192
const SSC_DET_Y  = 98

const INT_X = CH_CX
const INT_Y = LASER_Y

let _id = 0
const mkid = () => ++_id

type Population = "lymphocyte" | "monocyte" | "granulocyte"

const POPULATION_CONFIG: Record<Population, {
  label: string
  r: number
  fscConeHalf: number
  sscConeHalf: number
  fscCenter: number
  sscCenter: number
  plotJitter: number
  g: 1 | 2
  color: string
}> = {
  lymphocyte: {
    label: "Lymphocytes",
    r: 5.5,
    fscConeHalf: 0.11,
    sscConeHalf: 0.17,
    fscCenter: 22,
    sscCenter: 18,
    plotJitter: 4.5,
    g: 1,
    color: "oklch(0.62 0.14 200)",
  },
  monocyte: {
    label: "Monocytes",
    r: 8,
    fscConeHalf: 0.22,
    sscConeHalf: 0.32,
    fscCenter: 52,
    sscCenter: 46,
    plotJitter: 5,
    g: 2,
    color: "oklch(0.64 0.16 158)",
  },
  granulocyte: {
    label: "Granulocytes",
    r: 11,
    fscConeHalf: 0.34,
    sscConeHalf: 0.48,
    fscCenter: 78,
    sscCenter: 74,
    plotJitter: 5.5,
    g: 1,
    color: "oklch(0.72 0.16 52)",
  },
}

const PHOTON_VISUAL_FRAMES = 52
const ACQUISITION_PAUSE = 18
const ACQUISITION_DELAY = PHOTON_VISUAL_FRAMES + ACQUISITION_PAUSE

const PLOT_X = 738
const PLOT_Y = 24
const PLOT_W = 288
const PLOT_H = 252
const PLOT_MARGIN = 30
const MAX_PLOT_POINTS = 50

interface Cell {
  id: number
  cx: number; y: number
  r: number; speed: number
  g: 1 | 2
  population: Population
  fscPlot: number
  sscPlot: number
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

interface PlotPoint { id: number; fsc: number; ssc: number }

interface PendingMeasurement {
  id: number
  fsc: number
  ssc: number
  releaseFrame: number
}

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

      {/* Collection lens glass */}
      <radialGradient id="lens-glass" cx="38%" cy="32%" r="68%">
        <stop offset="0%"   stopColor="#e8f4fc" stopOpacity="0.95"/>
        <stop offset="42%"  stopColor="#8ab4cc" stopOpacity="0.55"/>
        <stop offset="100%" stopColor="#1a3048" stopOpacity="0.18"/>
      </radialGradient>

      {/* Detector sensor windows */}
      <radialGradient id="det-fsc-g" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stopColor="#6ef2a8" stopOpacity="0.9"/>
        <stop offset="60%"  stopColor="#10b981" stopOpacity="0.45"/>
        <stop offset="100%" stopColor="#065f46" stopOpacity="0.06"/>
      </radialGradient>
      <radialGradient id="det-ssc-g" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stopColor="#fde789" stopOpacity="0.9"/>
        <stop offset="60%"  stopColor="#f59e0b" stopOpacity="0.45"/>
        <stop offset="100%" stopColor="#92400e" stopOpacity="0.06"/>
      </radialGradient>

      {/* Photon signal cores */}
      <radialGradient id="ph-fsc-g" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stopColor="#b8ffd4" stopOpacity="1"/>
        <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
      </radialGradient>
      <radialGradient id="ph-ssc-g" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stopColor="#fff0b8" stopOpacity="1"/>
        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0"/>
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

/** Shared collection lens — faces toward (fx, fy) from lens center (lx, ly). */
function CollectionLens({
  lx, ly, fx, fy, enabled, tint,
}: {
  lx: number; ly: number; fx: number; fy: number
  enabled: boolean; tint: "fsc" | "ssc"
}) {
  const ang = Math.atan2(fy - ly, fx - lx) * (180 / Math.PI)
  const accent = tint === "fsc" ? "#10b981" : "#f59e0b"
  return (
    <g transform={`translate(${lx},${ly}) rotate(${ang})`}>
      {/* lens barrel */}
      <rect x={-5} y={-22} width={10} height={44} rx="2"
        fill="#0a1520" stroke={enabled ? "#2a4a62" : "#141f2a"} strokeWidth="1.2"/>
      <rect x={-3.5} y={-19} width={7} height={38} rx="1"
        fill="#0d1a28" stroke="#1a3048" strokeWidth="0.6"/>
      {/* biconvex element */}
      <ellipse cx={0} cy={0} rx={5.5} ry={20}
        fill={enabled ? "url(#lens-glass)" : "#0f1a24"}
        stroke={enabled ? "#6a9ab8" : "#1a2838"} strokeWidth="0.9" opacity={enabled ? 0.92 : 0.35}/>
      <ellipse cx={-1.2} cy={-5} rx={2.2} ry={7}
        fill="#ffffff" opacity={enabled ? 0.22 : 0.06}/>
      {/* tint ring — channel accent */}
      <ellipse cx={0} cy={0} rx={5.5} ry={20}
        fill="none" stroke={enabled ? accent : "#1a2838"}
        strokeWidth="0.45" opacity={enabled ? 0.35 : 0.15}/>
    </g>
  )
}

/** Shared PMT-style detector housing — window faces (fx, fy). */
function DetectorHousing({
  dx, dy, fx, fy, enabled, tint,
}: {
  dx: number; dy: number; fx: number; fy: number
  enabled: boolean; tint: "fsc" | "ssc"
}) {
  const ang = Math.atan2(fy - dy, fx - dx) * (180 / Math.PI)
  const accent = tint === "fsc" ? "#10b981" : "#f59e0b"
  const bright = tint === "fsc" ? "#5fee9a" : "#fde789"
  const windowGrad = tint === "fsc" ? "url(#det-fsc-g)" : "url(#det-ssc-g)"

  return (
    <g transform={`translate(${dx},${dy}) rotate(${ang})`} opacity={enabled ? 1 : 0.28}>
      {/* bench rail mount */}
      <rect x={-6} y={-30} width={12} height={60} rx="2"
        fill="#080f18" stroke="#1a3048" strokeWidth="1"/>
      {/* main body */}
      <rect x={4} y={-26} width={46} height={52} rx="5"
        fill="#060d16" stroke={enabled ? accent : "#1a2838"} strokeWidth={enabled ? 1.6 : 1}/>
      <rect x={7} y={-23} width={40} height={46} rx="3"
        fill="#0a121c" stroke="#152030" strokeWidth="0.6"/>
      {/* sensor window */}
      <rect x={2} y={-14} width={6} height={28} rx="2"
        fill={enabled ? windowGrad : "#0a1210"}
        stroke={enabled ? bright : "#1a2838"} strokeWidth="0.8" opacity={enabled ? 0.9 : 0.4}/>
      {/* photocathode ring */}
      <ellipse cx={5} cy={0} rx={2.5} ry={12}
        fill="none" stroke={enabled ? bright : "#1a2838"} strokeWidth="0.5" opacity={0.4}/>
      {/* rear connector */}
      <rect x={48} y={-5} width={10} height={10} rx="2"
        fill="#0d1a28" stroke="#2a4055" strokeWidth="1"/>
      <circle cx={56} cy={0} r={3.5}
        fill="#111c28" stroke="#3a5068" strokeWidth="1"/>
      {/* status LED */}
      <circle cx={42} cy={-18} r={2.8}
        fill={enabled ? bright : "#0f1a24"}
        opacity={enabled ? 0.95 : 0.3}/>
      {enabled && (
        <circle cx={42} cy={-18} r={5} fill={bright} opacity="0.1"/>
      )}
    </g>
  )
}

/** Optical tube segment between two points. */
function OpticalTube({
  x1, y1, x2, y2, enabled,
}: { x1: number; y1: number; x2: number; y2: number; enabled: boolean }) {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const len = Math.hypot(x2 - x1, y2 - y1)
  const ang = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI)
  return (
    <g transform={`translate(${mx},${my}) rotate(${ang})`} opacity={enabled ? 0.55 : 0.2}>
      <rect x={-len / 2} y={-5} width={len} height={10} rx="2"
        fill="#060d14" stroke="#1a3048" strokeWidth="0.8"/>
      <line x1={-len / 2 + 4} y1={0} x2={len / 2 - 4} y2={0}
        stroke="#2a4a62" strokeWidth="0.5" strokeDasharray="3 4" opacity="0.5"/>
    </g>
  )
}

function BeamStopDisc({ x, y, enabled }: { x: number; y: number; enabled: boolean }) {
  return (
    <g opacity={enabled ? 1 : 0.3}>
      {/* pedestal mount */}
      <rect x={x - 4} y={y + 2} width={8} height={38} rx="2"
        fill="#0a1520" stroke="#2a4a62" strokeWidth="1.2"/>
      <ellipse cx={x} cy={y + 42} rx={14} ry={4}
        fill="#060d14" stroke="#1a3048" strokeWidth="1"/>

      {/* obstruction disc — on laser axis, face-on to beam */}
      <circle cx={x} cy={y} r={17}
        fill="#030608" stroke="#1e3040" strokeWidth="2"/>
      <circle cx={x} cy={y} r={15.5}
        fill="#000000" opacity="0.97"/>
      {/* matte absorptive surface */}
      {[0, 45, 90, 135].map(deg => {
        const rad = (deg * Math.PI) / 180
        return (
          <line key={deg}
            x1={x + Math.cos(rad) * 4} y1={y + Math.sin(rad) * 4}
            x2={x + Math.cos(rad) * 14} y2={y + Math.sin(rad) * 14}
            stroke="#0a1820" strokeWidth="1.1" opacity="0.7"/>
        )
      })}
      <circle cx={x} cy={y} r={16.2}
        fill="none" stroke="#253848" strokeWidth="0.7" opacity="0.5"/>
      {/* center pin — beam termination point */}
      <circle cx={x} cy={y} r={2.2} fill="#1a2838" stroke="#304858" strokeWidth="0.5"/>

      {/* shadow wedge below — shows beam blocked */}
      <path
        d={`M ${x - 20} ${y + 1} L ${x + 20} ${y + 1} L ${x + 28} ${y + 18} L ${x - 28} ${y + 18} Z`}
        fill="#020508" opacity="0.35"/>
    </g>
  )
}

function FSCOpticalPath({ enabled }: { enabled: boolean }) {
  const y = LASER_Y
  const srcX = INT_X
  const srcY = INT_Y

  return (
    <g opacity={enabled ? 1 : 0.22}>
      {/* bench rail along forward axis */}
      <rect x={FSC_BEAM_STOP_X - 8} y={y + 14} width={FSC_DET_X - FSC_BEAM_STOP_X + 36} height={8} rx="2"
        fill="#060d14" stroke="#1a3048" strokeWidth="0.8"/>

      <BeamStopDisc x={FSC_BEAM_STOP_X} y={y} enabled={enabled}/>

      <OpticalTube
        x1={FSC_BEAM_STOP_X + 18} y1={y} x2={FSC_LENS_X - 8} y2={y} enabled={enabled}/>
      <CollectionLens
        lx={FSC_LENS_X} ly={FSC_LENS_Y} fx={srcX} fy={srcY}
        enabled={enabled} tint="fsc"/>
      <OpticalTube
        x1={FSC_LENS_X + 8} y1={y} x2={FSC_DET_X - 10} y2={y} enabled={enabled}/>
      <DetectorHousing
        dx={FSC_DET_X} dy={FSC_DET_Y} fx={srcX} fy={srcY}
        enabled={enabled} tint="fsc"/>
    </g>
  )
}

function SSCOpticalPath({ enabled }: { enabled: boolean }) {
  const srcX = INT_X
  const srcY = INT_Y

  return (
    <g opacity={enabled ? 1 : 0.22}>
      {/* bench arm from interrogation zone to SSC module */}
      <OpticalTube
        x1={INT_X - 6} y1={INT_Y - 8}
        x2={SSC_LENS_X + 4} y2={SSC_LENS_Y + 2}
        enabled={enabled}/>

      <CollectionLens
        lx={SSC_LENS_X} ly={SSC_LENS_Y} fx={srcX} fy={srcY}
        enabled={enabled} tint="ssc"/>
      <OpticalTube
        x1={SSC_LENS_X - 6} y1={SSC_LENS_Y - 4}
        x2={SSC_DET_X + 12} y2={SSC_DET_Y + 4}
        enabled={enabled}/>
      <DetectorHousing
        dx={SSC_DET_X} dy={SSC_DET_Y} fx={srcX} fy={srcY}
        enabled={enabled} tint="ssc"/>

      {/* bench mount plate */}
      <rect x={SSC_DET_X - 14} y={SSC_DET_Y + 22} width={52} height={7} rx="2"
        fill="#060d14" stroke="#1a3048" strokeWidth="0.8"/>
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
  const r = p.kind === "fsc" ? 1.15 : 1.0
  const grad = p.kind === "fsc" ? "url(#ph-fsc-g)" : "url(#ph-ssc-g)"
  const core = p.kind === "fsc" ? "#8ef8bc" : "#ffe08a"
  return (
    <g>
      <circle cx={p.x} cy={p.y} r={r * 2.2}
        fill={grad} opacity={p.opacity * 0.35}/>
      <circle cx={p.x} cy={p.y} r={r}
        fill={core} opacity={p.opacity * 0.82}/>
    </g>
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
            d={`M ${lx - 8} ${y - 6} Q ${(lx + SSC_LENS_X) / 2} ${(y + SSC_LENS_Y) / 2 - 20} ${SSC_LENS_X} ${SSC_LENS_Y}`}
            stroke="#6b3a00" strokeWidth="0.9" strokeDasharray="3 5" fill="none" opacity="0.7"/>
          <text x={SSC_DET_X - 18} y={SSC_DET_Y + 52} textAnchor="middle"
            fill="#7c4400" fontSize="7.5" fontWeight="600">
            SIDE SCATTER (90°)
          </text>
        </g>
      )}

      {/* FSC path */}
      {fscEnabled && laserEnabled && (
        <g>
          <line x1={lx + CH_HALF + 4} y1={y + 4}
            x2={FSC_LENS_X - 6} y2={y + 4}
            stroke="#0b4a35" strokeWidth="0.9" strokeDasharray="3 5" opacity="0.7"/>
          <text x={FSC_DET_X + 8} y={y + 58} textAnchor="middle"
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

function FSCSSCPlot({ points }: { points: PlotPoint[] }) {
  const ix = PLOT_X + PLOT_MARGIN
  const iy = PLOT_Y + PLOT_MARGIN
  const iw = PLOT_W - PLOT_MARGIN * 2
  const ih = PLOT_H - PLOT_MARGIN * 2

  const toX = (fsc: number) => ix + (fsc / 100) * iw
  const toY = (ssc: number) => iy + ih - (ssc / 100) * ih

  return (
    <g>
      <rect
        x={PLOT_X} y={PLOT_Y} width={PLOT_W} height={PLOT_H} rx="6"
        fill="#f4f5f7" stroke="#c8cdd4" strokeWidth="1.2" opacity="0.97"/>
      <rect
        x={ix} y={iy} width={iw} height={ih}
        fill="#fafbfc" stroke="#d8dce2" strokeWidth="0.6"/>

      {/* axis ticks */}
      {[25, 50, 75].map(v => (
        <g key={`t${v}`}>
          <line x1={toX(v)} y1={iy} x2={toX(v)} y2={iy + ih}
            stroke="#e2e5ea" strokeWidth="0.5"/>
          <line x1={ix} y1={toY(v)} x2={ix + iw} y2={toY(v)}
            stroke="#e2e5ea" strokeWidth="0.5"/>
        </g>
      ))}

      {points.map(pt => (
        <circle
          key={pt.id}
          cx={toX(pt.fsc)}
          cy={toY(pt.ssc)}
          r={2.2}
          fill="#2a2f36"
          opacity={0.82}
        />
      ))}

      <text
        x={PLOT_X + PLOT_W / 2} y={PLOT_Y + PLOT_H - 6}
        textAnchor="middle" fill="#3a4048"
        fontSize="8" fontFamily="monospace" fontWeight="600" letterSpacing="0.06em">
        FSC-A
      </text>
      <text
        x={PLOT_X + 9} y={PLOT_Y + PLOT_H / 2}
        textAnchor="middle" fill="#3a4048"
        fontSize="8" fontFamily="monospace" fontWeight="600" letterSpacing="0.06em"
        transform={`rotate(-90 ${PLOT_X + 9} ${PLOT_Y + PLOT_H / 2})`}>
        SSC-A
      </text>
    </g>
  )
}

function ControlRow({
  label, sublabel, enabled, onChange, color, disabled,
}: {
  label: string; sublabel: string; enabled: boolean
  onChange: (v: boolean) => void; color: string
  disabled?: boolean
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
        disabled={disabled}
        className="data-[state=checked]:bg-[oklch(0.36_0.12_240)] data-[state=unchecked]:bg-[oklch(0.16_0.03_240)]"
      />
    </div>
  )
}

function PopulationRow({
  label, enabled, onChange, color, disabled,
}: {
  label: string; enabled: boolean
  onChange: (v: boolean) => void; color: string
  disabled?: boolean
}) {
  return (
    <div className={`flex items-center gap-2.5 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <div className="relative flex-shrink-0 size-2">
        {enabled && !disabled && (
          <div className="absolute inset-0 animate-ping rounded-full opacity-50"
            style={{ backgroundColor: color }}/>
        )}
        <div className="relative size-2 rounded-full transition-all duration-500"
          style={{
            backgroundColor: enabled && !disabled ? color : "oklch(0.18 0.03 240)",
            boxShadow: enabled && !disabled ? `0 0 8px ${color}` : "none",
          }}/>
      </div>
      <Label className="flex-1 cursor-pointer font-mono text-[9.5px] font-medium tracking-widest uppercase"
        style={{ color: enabled && !disabled ? color : "oklch(0.26 0.04 240)" }}>
        {label}
      </Label>
      <Switch
        checked={enabled}
        onCheckedChange={onChange}
        disabled={disabled}
        className="scale-90 data-[state=checked]:bg-[oklch(0.36_0.12_240)] data-[state=unchecked]:bg-[oklch(0.16_0.03_240)]"
      />
    </div>
  )
}

function pickPopulation(
  lymph: boolean, mono: boolean, gran: boolean,
): Population | null {
  const pool: Population[] = []
  if (lymph) pool.push("lymphocyte")
  if (mono)  pool.push("monocyte")
  if (gran)  pool.push("granulocyte")
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

function assignPlotCoords(pop: Population): { fscPlot: number; sscPlot: number } {
  const cfg = POPULATION_CONFIG[pop]
  const jitter = () => (Math.random() - 0.5) * 2 * cfg.plotJitter
  return {
    fscPlot: Math.max(4, Math.min(96, cfg.fscCenter + jitter())),
    sscPlot: Math.max(4, Math.min(96, cfg.sscCenter + jitter())),
  }
}

export function FlowCytometry() {
  const [cellsOn, setCellsOn] = useState(true)
  const [laserOn, setLaserOn] = useState(true)
  const [fscOn,   setFscOn]   = useState(true)
  const [sscOn,   setSscOn]   = useState(true)
  const [lymphOn, setLymphOn] = useState(true)
  const [monoOn,  setMonoOn]  = useState(true)
  const [granOn,  setGranOn]  = useState(true)
  const [plotOn,  setPlotOn]  = useState(true)

  const rCells = useRef(cellsOn)
  const rLaser = useRef(laserOn)
  const rFsc   = useRef(fscOn)
  const rSsc   = useRef(sscOn)
  const rLymph = useRef(lymphOn)
  const rMono  = useRef(monoOn)
  const rGran  = useRef(granOn)
  const rPlot  = useRef(plotOn)
  useEffect(() => { rCells.current = cellsOn }, [cellsOn])
  useEffect(() => { rLaser.current = laserOn }, [laserOn])
  useEffect(() => { rFsc.current   = fscOn   }, [fscOn])
  useEffect(() => { rSsc.current   = sscOn   }, [sscOn])
  useEffect(() => { rLymph.current = lymphOn }, [lymphOn])
  useEffect(() => { rMono.current  = monoOn  }, [monoOn])
  useEffect(() => { rGran.current  = granOn  }, [granOn])
  useEffect(() => { rPlot.current  = plotOn  }, [plotOn])

  const cells      = useRef<Cell[]>([])
  const photons    = useRef<Photon[]>([])
  const flashes    = useRef<Flash[]>([])
  const plotPoints = useRef<PlotPoint[]>([])
  const pending    = useRef<PendingMeasurement[]>([])
  const frameRef   = useRef(0)
  const [, bump]   = useState(0)

  const handlePlotChange = useCallback((on: boolean) => {
    setPlotOn(on)
    if (on) {
      plotPoints.current = []
      pending.current = []
    }
    bump(n => n + 1)
  }, [])

  const resetPlot = useCallback(() => {
    plotPoints.current = []
    bump(n => n + 1)
  }, [])

  const spawnCell = useCallback((startY = -26) => {
    const pop = pickPopulation(rLymph.current, rMono.current, rGran.current)
    if (!pop) return

    const cfg = POPULATION_CONFIG[pop]
    const { fscPlot, sscPlot } = assignPlotCoords(pop)

    cells.current.push({
      id: mkid(),
      cx: CH_CX + (Math.random() - 0.5) * 5,
      y: startY,
      r: cfg.r,
      speed: 1.8,
      g: cfg.g,
      population: pop,
      fscPlot,
      sscPlot,
      scattering: false,
      scatterAge: 0,
    })
  }, [])

  const emitPhotons = useCallback((ix: number, iy: number, pop: Population) => {
    const cfg = POPULATION_CONFIG[pop]
    const nFsc = 30
    const nSsc = 26
    const sscBase = Math.atan2(SSC_LENS_Y - iy, SSC_LENS_X - ix)

    for (let i = 0; i < nFsc; i++) {
      const spd = 4.2 + Math.random() * 2.4
      const miss = Math.random() < 0.30
      const half = miss ? cfg.fscConeHalf * 2.0 : cfg.fscConeHalf
      const ang = (Math.random() - 0.5) * 2 * half
      photons.current.push({
        id: mkid(),
        x: ix + Math.random() * 2 - 1,
        y: iy + Math.random() * 2 - 1,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd * (0.55 + Math.random() * 0.35),
        kind: "fsc",
        opacity: 0.7 + Math.random() * 0.25,
        age: 0,
        maxAge: 48 + Math.random() * 16,
      })
    }

    for (let i = 0; i < nSsc; i++) {
      const spd = 3.8 + Math.random() * 2.2
      const miss = Math.random() < 0.32
      const half = miss ? cfg.sscConeHalf * 1.9 : cfg.sscConeHalf
      const ang = sscBase + (Math.random() - 0.5) * 2 * half
      photons.current.push({
        id: mkid(),
        x: ix + Math.random() * 2 - 1,
        y: iy + Math.random() * 2 - 1,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        kind: "ssc",
        opacity: 0.65 + Math.random() * 0.28,
        age: 0,
        maxAge: 44 + Math.random() * 14,
      })
    }
  }, [])

  useEffect(() => {
    for (let i = 0; i < 7; i++) spawnCell(-32 - i * 108)
  }, [spawnCell])

  useAnimationFrame(() => {
    frameRef.current++
    const f = frameRef.current

    const hasPopulation = rLymph.current || rMono.current || rGran.current
    if (rCells.current && hasPopulation && f % 94 === 0) spawnCell()

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
        emitPhotons(c.cx, LASER_Y, c.population)
        pending.current.push({
          id: mkid(),
          fsc: c.fscPlot,
          ssc: c.sscPlot,
          releaseFrame: f + ACQUISITION_DELAY,
        })
      }
      if (scattering) {
        scatterAge++
        if (scatterAge > 12) {
          scattering = false
          scatterAge = 0
        }
      }
      return { ...c, y: ny, scattering, scatterAge }
    }).filter(c => c.y < SVG_H + 45)

    for (const m of pending.current) {
      if (f >= m.releaseFrame && rPlot.current) {
        plotPoints.current.push({ id: m.id, fsc: m.fsc, ssc: m.ssc })
        if (plotPoints.current.length > MAX_PLOT_POINTS) {
          plotPoints.current.shift()
        }
      }
    }
    pending.current = pending.current.filter(m => f < m.releaseFrame)

    photons.current = photons.current.map(p => ({
      ...p,
      x: p.x + p.vx,
      y: p.y + p.vy,
      age: p.age + 1,
      opacity: p.opacity * 0.965,
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
            <ControlRow
              label="Plot" sublabel="FSC / SSC Acquisition"
              enabled={plotOn} onChange={handlePlotChange}
              color="oklch(0.58 0.04 250)"/>
          </div>

          {cellsOn && (
            <div className="mt-6 flex flex-col gap-3 border-t pt-5"
              style={{ borderColor: "oklch(0.12 0.04 234)" }}>
              <span className="font-mono text-[8px] font-semibold tracking-[0.22em] uppercase"
                style={{ color: "oklch(0.24 0.05 234)" }}>
                Population
              </span>
              <div className="flex flex-col gap-2.5">
                <PopulationRow
                  label="Lymphocytes"
                  enabled={lymphOn} onChange={setLymphOn}
                  color={POPULATION_CONFIG.lymphocyte.color}/>
                <PopulationRow
                  label="Monocytes"
                  enabled={monoOn} onChange={setMonoOn}
                  color={POPULATION_CONFIG.monocyte.color}/>
                <PopulationRow
                  label="Granulocytes"
                  enabled={granOn} onChange={setGranOn}
                  color={POPULATION_CONFIG.granulocyte.color}/>
              </div>
            </div>
          )}

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
            <FSCOpticalPath enabled={fscOn}/>
            <SSCOpticalPath enabled={sscOn}/>

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

            {plotOn && <FSCSSCPlot points={plotPoints.current}/>}
            <Annotations laserEnabled={laserOn} fscEnabled={fscOn} sscEnabled={sscOn}/>
          </svg>

          {plotOn && (
            <Button
              variant="outline"
              size="xs"
              onClick={resetPlot}
              className="absolute font-mono text-[9px] tracking-widest uppercase"
              style={{
                left: `${(PLOT_X / SVG_W) * 100}%`,
                top: `${((PLOT_Y + PLOT_H + 6) / SVG_H) * 100}%`,
                width: `${(PLOT_W / SVG_W) * 100}%`,
                background: "oklch(0.075 0.019 232)",
                borderColor: "oklch(0.18 0.04 234)",
                color: "oklch(0.42 0.05 234)",
              }}>
              Reset Plot
            </Button>
          )}
        </div>
      </main>
    </div>
  )
}
