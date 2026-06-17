import React, { memo, useEffect, useRef, useState, useCallback } from "react"
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

const INT_X = CH_CX
const INT_Y = LASER_Y

const FSC_LENS_X = 618
const FSC_LENS_Y = LASER_Y
const FSC_DET_X  = 712
const FSC_DET_Y  = LASER_Y
const LASER_X_END = FSC_LENS_X - 34

const SSC_ANGLE = (52 * Math.PI) / 180
const SSC_LENS_DIST = 128
const SSC_DET_OFFSET = 82
const SSC_LENS_X = INT_X + Math.cos(SSC_ANGLE) * SSC_LENS_DIST
const SSC_LENS_Y = INT_Y + Math.sin(SSC_ANGLE) * SSC_LENS_DIST
const SSC_DET_X  = SSC_LENS_X + Math.cos(SSC_ANGLE) * SSC_DET_OFFSET
const SSC_DET_Y  = SSC_LENS_Y + Math.sin(SSC_ANGLE) * SSC_DET_OFFSET

const LENS_R = 16
const DETECTOR_APERTURE_R = 5
const DETECTOR_BODY_R = 14
const DETECTOR_MODULE_W = 76
const DETECTOR_MODULE_H = 52

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
  phase: "scatter" | "focus"
  opacity: number; age: number; maxAge: number
}

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

      <linearGradient id="det-body-g" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#102436"/>
        <stop offset="42%" stopColor="#07111a"/>
        <stop offset="100%" stopColor="#101923"/>
      </linearGradient>

      {/* Detector aperture glow */}
      <radialGradient id="det-aperture-g" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stopColor="#a8f0ff" stopOpacity="0.75"/>
        <stop offset="55%"  stopColor="#22d3ee" stopOpacity="0.28"/>
        <stop offset="100%" stopColor="#0e7490" stopOpacity="0.04"/>
      </radialGradient>

      {/* Photon cores */}
      <radialGradient id="ph-scatter-g" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stopColor="#c8f8ff" stopOpacity="1"/>
        <stop offset="100%" stopColor="#22d3ee" stopOpacity="0"/>
      </radialGradient>
      <radialGradient id="ph-focus-g" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stopColor="#e8fcff" stopOpacity="1"/>
        <stop offset="100%" stopColor="#67e8f9" stopOpacity="0"/>
      </radialGradient>

      <filter id="glow-cyan" x="-120%" y="-120%" width="340%" height="340%">
        <feGaussianBlur stdDeviation="4" result="b1"/>
        <feGaussianBlur stdDeviation="9" result="b2"/>
        <feMerge>
          <feMergeNode in="b2"/>
          <feMergeNode in="b1"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>

      {/* Clip path for cells */}
      <clipPath id="channel-clip">
        <rect x={CH_CX - CH_HALF} y={0} width={CH_HALF * 2} height={SVG_H}/>
      </clipPath>
    </defs>
  )
}

const SCENE_GRID_LINES = (() => {
  const items: React.ReactElement[] = []
  for (let x = 65; x < SVG_W; x += 65)
    items.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={SVG_H}/>)
  for (let y = 50; y < SVG_H; y += 50)
    items.push(<line key={`h${y}`} x1={0} y1={y} x2={SVG_W} y2={y}/>)
  return items
})()

function SceneGrid() {
  return (
    <g stroke="#0a1d30" strokeWidth="0.4" strokeDasharray="3 14" opacity="0.85">
      {SCENE_GRID_LINES}
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
  activeCell,
  performanceMode,
}: {
  enabled: boolean
  activeCell?: Cell
  performanceMode: boolean
}) {

  if (!enabled) return null

  const y = LASER_Y
  const x1 = LASER_X1
  const x2 = LASER_X_END - 8
  const laserGlow = performanceMode ? undefined : "url(#glow-laser)"
  const flashGlow = performanceMode ? undefined : "url(#glow-flash)"

  const renderSegment = (sx: number, ex: number) => {
    if (ex <= sx) return null
    return (
      <>
        <line
          x1={sx} y1={y} x2={ex} y2={y}
          stroke="#1066ff" strokeWidth="64" opacity={0.05}
          filter={laserGlow}
        />
        <line
          x1={sx} y1={y} x2={ex} y2={y}
          stroke="#2e8bff" strokeWidth="24" opacity={0.15}
          filter={laserGlow}
        />
        <line
          x1={sx} y1={y} x2={ex} y2={y}
          stroke="url(#laser-gr)" strokeWidth="6" opacity={1}
        />
        <line
          x1={sx + 30} y1={y} x2={ex - 20} y2={y}
          stroke="url(#laser-core)" strokeWidth="1.8" opacity={0.92}
          filter={laserGlow}
        />
      </>
    )
  }

  if (!activeCell) {
    return (
      <g>
        {renderSegment(x1, x2)}
        <circle cx={INT_X} cy={y} r={7} fill="#a0d8ff" opacity="0.45" filter={flashGlow}/>
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
        filter={flashGlow}
      />
      <circle
        cx={cellLeftEdge}
        cy={y}
        r={7}
        fill="#c8ecff"
        opacity={0.65}
        filter={laserGlow}
      />
      <circle
        cx={cellLeftEdge}
        cy={y}
        r={2.5}
        fill="#ffffff"
        opacity={0.95}
      />

      {/* Interaction point marker (interrogation zone dot) */}
      <circle cx={INT_X} cy={y} r={7} fill="#a0d8ff" opacity="0.45" filter={flashGlow}/>
      <circle cx={INT_X} cy={y} r={3} fill="#ffffff" opacity="0.85"/>
    </g>
  )
}

function LaserSource({ enabled, performanceMode }: { enabled: boolean; performanceMode: boolean }) {
  const bx = LASER_X0
  const by = LASER_Y - 28
  const c  = enabled ? "#1d5bb9" : "#0f1f35"
  const laserGlow = enabled && !performanceMode ? "url(#glow-laser)" : undefined
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
      <g filter={laserGlow}>
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
          filter={laserGlow}/>
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

/** Shared compact detector module matching the laser source visual language. */
function OpticalDetectorModule({
  lensX, lensY, detX, detY, enabled, performanceMode,
}: {
  lensX: number; lensY: number; detX: number; detY: number; enabled: boolean
  performanceMode: boolean
}) {
  const ang = Math.atan2(detY - lensY, detX - lensX) * (180 / Math.PI)
  const w = DETECTOR_MODULE_W
  const h = DETECTOR_MODULE_H
  const c = enabled ? "#1aa6c9" : "#0f1f35"
  const opacity = enabled ? 1 : 0.24
  const detGlow = enabled && !performanceMode ? "url(#glow-det)" : undefined
  const cyanGlow = enabled && !performanceMode ? "url(#glow-cyan)" : undefined
  const laserGlow = enabled && !performanceMode ? "url(#glow-laser)" : undefined

  return (
    <g transform={`translate(${detX},${detY}) rotate(${ang})`} opacity={opacity}>
      {enabled && (
        <rect x={-9} y={-h / 2 - 5} width={w + 16} height={h + 10} rx="10"
          fill="#0a3a99" opacity="0.11" filter={detGlow}/>
      )}

      {/* Housing mirrors the laser source: compact body with an angled rear cap. */}
      <path
        d={`M 0 ${-h / 2 + 7}
            Q 0 ${-h / 2 + 1} 8 ${-h / 2 + 1}
            L ${w - 10} ${-h / 2 - 6}
            L ${w} ${-h / 2 + 13}
            L ${w - 8} ${h / 2 - 4}
            L 8 ${h / 2 + 3}
            Q 0 ${h / 2 - 1} 0 ${h / 2 - 9} Z`}
        fill="url(#det-body-g)"
        stroke={c}
        strokeWidth={enabled ? 1.7 : 1.1}
      />

      <path
        d={`M 13 ${-h / 2 + 9}
            L ${w - 17} ${-h / 2 + 4}
            L ${w - 22} ${h / 2 - 10}
            L 13 ${h / 2 - 6} Z`}
        fill="#07121d"
        stroke="#183248"
        strokeWidth="0.6"
        opacity="0.74"
      />

      {/* Front aperture: photons enter here and disappear inside the body. */}
      <g filter={cyanGlow}>
        <ellipse cx={0} cy={0} rx={DETECTOR_APERTURE_R + 2.5} ry={15}
          fill={enabled ? "url(#det-aperture-g)" : "#0f1f35"}
          stroke={enabled ? "#9beeff" : "#1a3048"}
          strokeWidth="0.8"
          opacity={enabled ? 0.95 : 0.32}/>
        <ellipse cx={0} cy={0} rx={DETECTOR_APERTURE_R - 0.8} ry={10.5}
          fill="#02070c"
          opacity={enabled ? 0.54 : 0.35}/>
        <ellipse cx={-0.4} cy={-3.4} rx={2.4} ry={4.8}
          fill="#e0f2ff"
          opacity={enabled ? 0.32 : 0.08}/>
      </g>

      {/* Minimal internal details, like the laser source LEDs but quieter. */}
      {[0, 1, 2].map(i => (
        <circle key={i} cx={22 + i * 12} cy={h / 2 - 13} r={2.2}
          fill={enabled ? "#4fa3ff" : "#0a1f35"}
          opacity={enabled ? 0.78 : 0.28}
          filter={laserGlow}/>
      ))}

      <line x1={18} y1={-h / 2 + 13} x2={w - 24} y2={-h / 2 + 8}
        stroke="#8eddf7" strokeWidth="0.55" opacity={enabled ? 0.18 : 0.05}/>
      <path
        d={`M ${w - 13} ${-h / 2 + 13} L ${w - 7} ${-h / 2 + 24} L ${w - 12} ${h / 2 - 7}`}
        fill="none" stroke="#233b50" strokeWidth="0.8" opacity="0.72"
      />
    </g>
  )
}

function FSCOpticalPath({ enabled, performanceMode }: { enabled: boolean; performanceMode: boolean }) {
  return (
    <g opacity={enabled ? 1 : 0.22}>
      <OpticalDetectorModule
        lensX={FSC_LENS_X} lensY={FSC_LENS_Y}
        detX={FSC_DET_X} detY={FSC_DET_Y}
        enabled={enabled}
        performanceMode={performanceMode}/>
    </g>
  )
}

function SSCOpticalPath({ enabled, performanceMode }: { enabled: boolean; performanceMode: boolean }) {
  return (
    <g opacity={enabled ? 1 : 0.22}>
      <OpticalDetectorModule
        lensX={SSC_LENS_X} lensY={SSC_LENS_Y}
        detX={SSC_DET_X} detY={SSC_DET_Y}
        enabled={enabled}
        performanceMode={performanceMode}/>
    </g>
  )
}

const StaticLayer = memo(function StaticLayer({
  laserOn,
  fscOn,
  sscOn,
  performanceMode,
}: {
  laserOn: boolean
  fscOn: boolean
  sscOn: boolean
  performanceMode: boolean
}) {
  return (
    <>
      <Defs/>
      <SceneGrid/>
      <FlowChannel/>
      <LaserSource enabled={laserOn} performanceMode={performanceMode}/>
      <FSCOpticalPath enabled={fscOn} performanceMode={performanceMode}/>
      <SSCOpticalPath enabled={sscOn} performanceMode={performanceMode}/>
      <Annotations laserEnabled={laserOn} fscEnabled={fscOn} sscEnabled={sscOn}/>
    </>
  )
})

function DynamicLayer({
  laserOn,
  cellsOn,
  plotOn,
  performanceMode,
  cells,
  photons,
  plotPoints,
}: {
  laserOn: boolean
  cellsOn: boolean
  plotOn: boolean
  performanceMode: boolean
  cells: Cell[]
  photons: Photon[]
  plotPoints: PlotPoint[]
}) {
  const activeCell = cellsOn
    ? cells.find(
        c =>
          Math.abs(c.y - LASER_Y) < c.r &&
          Math.abs(c.cx - CH_CX) < CH_HALF
      )
    : undefined

  return (
    <>
      <LaserBeam
        enabled={laserOn}
        activeCell={activeCell}
        performanceMode={performanceMode}/>
      {photons.map(p => (
        <PhotonSVG key={p.id} p={p} performanceMode={performanceMode}/>
      ))}
      <g clipPath="url(#channel-clip)">
        {cellsOn && cells.map(c => (
          <CellSVG key={c.id} cell={c}/>
        ))}
      </g>
      {plotOn && <FSCSSCPlot points={plotPoints}/>}
    </>
  )
}

function CellSVG({ cell }: { cell: Cell }) {
  const { cx, y, r, g } = cell
  return (
    <g transform={`translate(${cx},${y})`} filter="url(#glow-cell)">
      <circle r={r}
        fill={`url(#cg${g})`}
        stroke="#3284be"
        strokeWidth={1}
        strokeOpacity={0.5}/>
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

function PhotonSVG({ p, performanceMode }: { p: Photon; performanceMode: boolean }) {
  const r = p.phase === "focus" ? 1.25 : 1.1
  const grad = p.phase === "focus" ? "url(#ph-focus-g)" : "url(#ph-scatter-g)"
  const core = p.phase === "focus" ? "#e0fcff" : "#7ee8ff"
  const trailLen = p.phase === "scatter" ? 10 : 5
  const photonGlow = performanceMode ? undefined : "url(#glow-ph)"
  return (
    <g opacity={p.opacity} filter={photonGlow}>
      {p.phase === "scatter" && (
        <line
          x1={p.x - p.vx * trailLen * 0.35} y1={p.y - p.vy * trailLen * 0.35}
          x2={p.x} y2={p.y}
          stroke="#22d3ee" strokeWidth="0.6" opacity={0.28}
        />
      )}
      <circle cx={p.x} cy={p.y} r={r * 2}
        fill={grad} opacity={0.38}/>
      <circle cx={p.x} cy={p.y} r={r}
        fill={core} opacity={0.88}/>
    </g>
  )
}

function Annotations({ laserEnabled, fscEnabled, sscEnabled }:
  { laserEnabled: boolean; fscEnabled: boolean; sscEnabled: boolean }) {
  const y  = LASER_Y
  const lx = CH_CX

  return (
    <g fontFamily="monospace" fontSize="7.5" letterSpacing="0.08em">
      {/* SSC path */}
      {sscEnabled && laserEnabled && (
        <g>
          <line
            x1={lx} y1={y + 6}
            x2={SSC_LENS_X - 10} y2={SSC_LENS_Y - 8}
            stroke="#0e4a5a" strokeWidth="0.9" strokeDasharray="3 5" opacity="0.65"/>
          <text x={SSC_DET_X + 4} y={SSC_DET_Y + 50} textAnchor="middle"
            fill="#0d5a6e" fontSize="7.5" fontWeight="600">
            SIDE SCATTER
          </text>
        </g>
      )}

      {/* FSC path */}
      {fscEnabled && laserEnabled && (
        <g>
          <text x={FSC_DET_X + 8} y={y + 58} textAnchor="middle"
            fill="#0d5a6e" fontSize="7.5" fontWeight="600">
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
      <div className="flex-shrink-0 size-2.5 rounded-full shadow-lg"
        style={{
          backgroundColor: enabled ? color : "oklch(0.18 0.03 240)",
          boxShadow: enabled ? `0 0 12px ${color}` : "none",
        }}/>
      <div className="flex flex-1 flex-col gap-0.5">
        <Label className="cursor-pointer font-mono text-[11px] font-semibold tracking-widest uppercase"
          style={{ color }}>
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
      <div className="flex-shrink-0 size-2 rounded-full"
        style={{
          backgroundColor: enabled && !disabled ? color : "oklch(0.18 0.03 240)",
          boxShadow: enabled && !disabled ? `0 0 8px ${color}` : "none",
        }}/>
      <Label className="flex-1 cursor-pointer font-mono text-[9.5px] font-medium tracking-widest uppercase"
        style={{ color: disabled ? "oklch(0.26 0.04 240)" : color }}>
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

function focusPhotonToward(
  p: Photon, targetX: number, targetY: number,
): Photon {
  const dx = targetX - p.x
  const dy = targetY - p.y
  const spd = Math.hypot(p.vx, p.vy)
  const spread = (Math.random() - 0.5) * 0.12
  const baseAng = Math.atan2(dy, dx)
  const ang = baseAng + spread
  return {
    ...p,
    phase: "focus",
    vx: Math.cos(ang) * spd,
    vy: Math.sin(ang) * spd,
  }
}

function tryCollectPhoton(p: Photon, fscOn: boolean, sscOn: boolean): Photon {
  if (p.phase !== "scatter") return p

  if (p.kind === "fsc" && fscOn && p.vx > 0.5) {
    const crossed = p.x >= FSC_LENS_X - 4 && p.x - p.vx < FSC_LENS_X + 2
    if (crossed && Math.abs(p.y - FSC_LENS_Y) <= LENS_R) {
      return focusPhotonToward(p, FSC_DET_X, FSC_DET_Y)
    }
  }

  if (p.kind === "ssc" && sscOn) {
    const prevDist = Math.hypot(p.x - p.vx - SSC_LENS_X, p.y - p.vy - SSC_LENS_Y)
    const dist = Math.hypot(p.x - SSC_LENS_X, p.y - SSC_LENS_Y)
    const approaching = dist < prevDist
    if (approaching && dist <= LENS_R + 2) {
      return focusPhotonToward(p, SSC_DET_X, SSC_DET_Y)
    }
  }

  return p
}

function absorbPhotonIfInside(p: Photon): Photon | null {
  if (p.phase !== "focus") return p

  const detX = p.kind === "fsc" ? FSC_DET_X : SSC_DET_X
  const detY = p.kind === "fsc" ? FSC_DET_Y : SSC_DET_Y
  const inside = Math.hypot(p.x - detX, p.y - detY) < DETECTOR_BODY_R * 0.85

  if (!inside) return p

  const nextOpacity = p.opacity * 0.72
  if (nextOpacity < 0.06) return null
  return { ...p, opacity: nextOpacity }
}

function PerformanceStatsOverlay({
  fps,
  cells,
  photons,
}: {
  fps: number
  cells: number
  photons: number
}) {
  return (
    <div
      className="pointer-events-none absolute right-3 top-3 z-10 rounded-md px-2.5 py-2 font-mono text-[10px] leading-relaxed text-white"
      style={{ background: "rgba(0, 0, 0, 0.55)" }}>
      <div>FPS: {fps}</div>
      <div>Cells: {cells}</div>
      <div>Photons: {photons}</div>
    </div>
  )
}

export function FlowCytometry() {
  const [cellsOn, setCellsOn] = useState(false)
  const [laserOn, setLaserOn] = useState(false)
  const [fscOn,   setFscOn]   = useState(false)
  const [sscOn,   setSscOn]   = useState(false)
  const [lymphOn, setLymphOn] = useState(true)
  const [monoOn,  setMonoOn]  = useState(true)
  const [granOn,  setGranOn]  = useState(true)
  const [plotOn,  setPlotOn]  = useState(false)
  const [performanceMode, setPerformanceMode] = useState(false)
  const [showPerfStats, setShowPerfStats] = useState(false)
  const [perfStats, setPerfStats] = useState({ fps: 0, cells: 0, photons: 0 })

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
  const plotPoints = useRef<PlotPoint[]>([])
  const pending    = useRef<PendingMeasurement[]>([])
  const frameRef   = useRef(0)
  const [, bump]   = useState(0)
  const rShowPerfStats = useRef(showPerfStats)
  const perfFrameCount = useRef(0)
  const perfLastSample = useRef(performance.now())

  useEffect(() => { rShowPerfStats.current = showPerfStats }, [showPerfStats])
  useEffect(() => {
    if (showPerfStats) {
      perfFrameCount.current = 0
      perfLastSample.current = performance.now()
    }
  }, [showPerfStats])

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
    const nFsc = 32
    const nSsc = 28
    const sscBase = Math.atan2(SSC_LENS_Y - iy, SSC_LENS_X - ix)

    for (let i = 0; i < nFsc; i++) {
      const spd = 4.2 + Math.random() * 2.4
      const miss = Math.random() < 0.38
      const half = miss ? cfg.fscConeHalf * 2.4 : cfg.fscConeHalf
      const ang = (Math.random() - 0.5) * 2 * half
      photons.current.push({
        id: mkid(),
        x: ix + Math.random() * 2 - 1,
        y: iy + Math.random() * 2 - 1,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd * (0.55 + Math.random() * 0.35),
        kind: "fsc",
        phase: "scatter",
        opacity: 0.7 + Math.random() * 0.25,
        age: 0,
        maxAge: 52 + Math.random() * 18,
      })
    }

    for (let i = 0; i < nSsc; i++) {
      const spd = 3.8 + Math.random() * 2.2
      const miss = Math.random() < 0.40
      const half = miss ? cfg.sscConeHalf * 2.2 : cfg.sscConeHalf
      const ang = sscBase + (Math.random() - 0.5) * 2 * half
      photons.current.push({
        id: mkid(),
        x: ix + Math.random() * 2 - 1,
        y: iy + Math.random() * 2 - 1,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        kind: "ssc",
        phase: "scatter",
        opacity: 0.65 + Math.random() * 0.28,
        age: 0,
        maxAge: 48 + Math.random() * 16,
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

    photons.current = photons.current
      .map(p => {
        let next: Photon = {
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          age: p.age + 1,
          opacity: p.opacity * (p.phase === "focus" ? 0.978 : 0.965),
        }
        next = tryCollectPhoton(next, rFsc.current, rSsc.current)
        return absorbPhotonIfInside(next)
      })
      .filter((p): p is Photon => p !== null && p.age < p.maxAge && p.opacity > 0.02)

    if (rShowPerfStats.current) {
      perfFrameCount.current++
      const now = performance.now()
      const elapsed = now - perfLastSample.current
      if (elapsed >= 250) {
        setPerfStats({
          fps: Math.round((perfFrameCount.current * 1000) / elapsed),
          cells: cells.current.length,
          photons: photons.current.length,
        })
        perfFrameCount.current = 0
        perfLastSample.current = now
      }
    }

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
            <ControlRow
              label="Performance Mode" sublabel="Disable SVG glow filters"
              enabled={performanceMode} onChange={setPerformanceMode}
              color="oklch(0.55 0.08 280)"/>
            <ControlRow
              label="Show Performance Stats" sublabel="Display FPS and object counts"
              enabled={showPerfStats} onChange={setShowPerfStats}
              color="oklch(0.52 0.06 250)"/>
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

            <StaticLayer
              laserOn={laserOn}
              fscOn={fscOn}
              sscOn={sscOn}
              performanceMode={performanceMode}/>
            <DynamicLayer
              laserOn={laserOn}
              cellsOn={cellsOn}
              plotOn={plotOn}
              performanceMode={performanceMode}
              cells={cells.current}
              photons={photons.current}
              plotPoints={plotPoints.current}
            />
          </svg>

          {showPerfStats && (
            <PerformanceStatsOverlay
              fps={perfStats.fps}
              cells={perfStats.cells}
              photons={perfStats.photons}
            />
          )}

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
