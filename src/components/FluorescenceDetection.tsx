import React, { memo, useEffect, useRef, useState, useCallback } from "react"
import { useAnimationFrame } from "framer-motion"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

const SVG_W   = 1040
const SVG_H   = 680

const CH_CX   = 420
const CH_HALF = 22

const LASER_Y  = 292
const LASER_X0 = 50
const LASER_X1 = LASER_X0 + 76

const INT_X = CH_CX

const FSC_LENS_X = 548
const FSC_DET_X  = 648
const FSC_DET_Y  = LASER_Y
const LASER_X_END = FSC_LENS_X - 34

// Fluorescence bench — vertical detector stack (visual layout)
const FL_BEAM_END = LASER_X_END - 8
const DET_STACK_X = FSC_DET_X
const DET_SPACING   = 96
const FL1_DET_X     = DET_STACK_X
const FL1_DET_Y     = LASER_Y + DET_SPACING
const FL2_DET_X     = DET_STACK_X
const FL2_DET_Y     = LASER_Y + DET_SPACING * 2
const FSC_MIRROR_X  = 488
const FSC_MIRROR_Y  = LASER_Y
const MIRROR1_X     = 488
const MIRROR1_Y     = FL1_DET_Y
const MIRROR2_X     = 488
const MIRROR2_Y     = FL2_DET_Y

// Compact education panels
const EDU_Y0      = LASER_Y + 56
const EDU_TUBES_X = 36
const EDU_PHENO_X = 172

const DETECTOR_APERTURE_R = 5
const DETECTOR_BODY_R = 14
const DETECTOR_MODULE_W = 76
const DETECTOR_MODULE_H = 52

let _id = 0
const mkid = () => ++_id

const FL1_COLOR = "#22c55e"
const FL2_COLOR = "#f97316"
const DP_COLOR  = "#a855f7"
const DN_COLOR  = "#64748b"
const PHOTON_FSC_COUNT = 27
const PHOTON_FL_COUNT  = 27
const FL_CONE_HALF     = 0.035
const FSC_TO_DICHROIC_HALF = 0.07

type Population = "lymphocyte" | "monocyte" | "granulocyte"
type LymphPhenotype = "helperT" | "cytotoxicT" | "doublePositive" | "doubleNegative"
type AntibodyKind = "cd4" | "cd8"

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

const ACQUISITION_PAUSE = 18

const PLOT_X = 738
const PLOT_Y = 24
const PLOT_W = 288
const PLOT_H = 252
const PLOT_MARGIN = 30
const MAX_PLOT_POINTS = 50

type PlotQuadrant = "dn" | "cd4" | "cd8" | "dp"

interface Cell {
  id: number
  cx: number; y: number
  r: number; speed: number
  g: 1 | 2
  population: Population
  phenotype?: LymphPhenotype
  cd4Stained: boolean
  cd8Stained: boolean
  cd4Plot: number
  cd8Plot: number
  plotQuadrant: PlotQuadrant
  emitFl1: boolean
  emitFl2: boolean
  scattering: boolean; scatterAge: number
}

interface Photon {
  id: number
  x: number; y: number
  vx: number; vy: number
  kind: "fsc" | "fl1" | "fl2"
  phase: "toDichroic" | "vertical" | "focus"
  eventId: number
  opacity: number; age: number; maxAge: number
}

interface PlotPoint {
  id: number
  cd4: number
  cd8: number
  quadrant: PlotQuadrant
}

interface PendingMeasurement {
  eventId: number
  cd4: number
  cd8: number
  quadrant: PlotQuadrant
  needsFl1: boolean
  needsFl2: boolean
  fscHit: boolean
  fl1Hit: boolean
  fl2Hit: boolean
  releaseFrame: number | null
}

interface StainingState {
  cd4: boolean
  cd8: boolean
}

const LYMPH_PHENOTYPE_WEIGHTS: { pheno: LymphPhenotype; weight: number }[] = [
  { pheno: "helperT", weight: 0.45 },
  { pheno: "cytotoxicT", weight: 0.35 },
  { pheno: "doublePositive", weight: 0.10 },
  { pheno: "doubleNegative", weight: 0.10 },
]

function pickLymphPhenotype(): LymphPhenotype {
  const r = Math.random()
  let acc = 0
  for (const { pheno, weight } of LYMPH_PHENOTYPE_WEIGHTS) {
    acc += weight
    if (r < acc) return pheno
  }
  return "doubleNegative"
}

function computeStaining(
  pheno: LymphPhenotype,
  staining: StainingState,
): { cd4Stained: boolean; cd8Stained: boolean } {
  const cd4Stained =
    staining.cd4 && (pheno === "helperT" || pheno === "doublePositive")
  const cd8Stained =
    staining.cd8 && (pheno === "cytotoxicT" || pheno === "doublePositive")
  return { cd4Stained, cd8Stained }
}

function getPlotQuadrant(
  cd4Stained: boolean,
  cd8Stained: boolean,
): PlotQuadrant {
  if (cd4Stained && cd8Stained) return "dp"
  if (cd4Stained) return "cd4"
  if (cd8Stained) return "cd8"
  return "dn"
}

function assignFluorescencePlotCoords(
  quadrant: PlotQuadrant,
): { cd4Plot: number; cd8Plot: number } {
  const jitter = () => (Math.random() - 0.5) * 9
  const low = () => Math.max(6, Math.min(38, 18 + jitter()))
  const high = () => Math.max(62, Math.min(94, 76 + jitter()))

  switch (quadrant) {
    case "dp":  return { cd4Plot: high(), cd8Plot: high() }
    case "cd4": return { cd4Plot: high(), cd8Plot: low() }
    case "cd8": return { cd4Plot: low(), cd8Plot: high() }
    default:    return { cd4Plot: low(), cd8Plot: low() }
  }
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
      <linearGradient id="laser-gr" x1={LASER_X1} y1={LASER_Y} x2={FL_BEAM_END} y2={LASER_Y}
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
        x1={LASER_X1 + 30} y1={LASER_Y} x2={FL_BEAM_END - 20} y2={LASER_Y}
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
      <radialGradient id="ph-fl1-g" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stopColor="#bbf7d0" stopOpacity="1"/>
        <stop offset="100%" stopColor="#22c55e" stopOpacity="0"/>
      </radialGradient>
      <radialGradient id="ph-fl2-g" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stopColor="#fed7aa" stopOpacity="1"/>
        <stop offset="100%" stopColor="#f97316" stopOpacity="0"/>
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
  const x2 = FL_BEAM_END
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

function FluorescenceMirror({
  x, y, angle, enabled, performanceMode,
}: {
  x: number; y: number; angle: number
  enabled: boolean; performanceMode: boolean
}) {
  const glow = enabled && !performanceMode ? "url(#glow-cyan)" : undefined
  return (
    <g transform={`translate(${x},${y}) rotate(${angle})`} opacity={enabled ? 0.9 : 0.28}>
      <g filter={glow}>
        <rect
          x={-13} y={-2.5} width={26} height={5} rx={0.8}
          fill={enabled ? "#2a4058" : "#0f1f35"}
          stroke={enabled ? "#5a7890" : "#1a3048"}
          strokeWidth={0.7}
        />
      </g>
    </g>
  )
}

function HorizontalDetectorModule({
  detX, detY, lensX, enabled, performanceMode,
}: {
  detX: number; detY: number; lensX: number
  enabled: boolean; performanceMode: boolean
}) {
  return (
    <OpticalDetectorModule
      lensX={lensX}
      lensY={detY}
      detX={detX}
      detY={detY}
      enabled={enabled}
      performanceMode={performanceMode}/>
  )
}

function FSCOpticalPath({ enabled, performanceMode }: { enabled: boolean; performanceMode: boolean }) {
  return (
    <g opacity={enabled ? 1 : 0.22}>
      <HorizontalDetectorModule
        lensX={FSC_MIRROR_X}
        detX={FSC_DET_X}
        detY={FSC_DET_Y}
        enabled={enabled}
        performanceMode={performanceMode}/>
    </g>
  )
}

function FL1OpticalPath({ enabled, performanceMode }: { enabled: boolean; performanceMode: boolean }) {
  return (
    <g opacity={enabled ? 1 : 0.22}>
      <HorizontalDetectorModule
        lensX={MIRROR1_X}
        detX={FL1_DET_X}
        detY={FL1_DET_Y}
        enabled={enabled}
        performanceMode={performanceMode}/>
      {enabled && (
        <circle cx={FL1_DET_X + 38} cy={FL1_DET_Y - 10} r={3}
          fill={FL1_COLOR} opacity={0.9} filter={performanceMode ? undefined : "url(#glow-cyan)"}/>
      )}
    </g>
  )
}

function FL2OpticalPath({ enabled, performanceMode }: { enabled: boolean; performanceMode: boolean }) {
  return (
    <g opacity={enabled ? 1 : 0.22}>
      <HorizontalDetectorModule
        lensX={MIRROR2_X}
        detX={FL2_DET_X}
        detY={FL2_DET_Y}
        enabled={enabled}
        performanceMode={performanceMode}/>
      {enabled && (
        <circle cx={FL2_DET_X + 38} cy={FL2_DET_Y - 10} r={3}
          fill={FL2_COLOR} opacity={0.9} filter={performanceMode ? undefined : "url(#glow-cyan)"}/>
      )}
    </g>
  )
}

const StaticLayer = memo(function StaticLayer({
  laserOn,
  fscOn,
  fl1On,
  fl2On,
  performanceMode,
  staining,
  onResetStaining,
  draggingAb,
  onAbPointerDown,
}: {
  laserOn: boolean
  fscOn: boolean
  fl1On: boolean
  fl2On: boolean
  performanceMode: boolean
  staining: StainingState
  onResetStaining: () => void
  draggingAb: AntibodyKind | null
  onAbPointerDown: (ab: AntibodyKind, e: React.PointerEvent) => void
}) {
  return (
    <>
      <Defs/>
      <SceneGrid/>
      <FlowChannel/>
      <LaserSource enabled={laserOn} performanceMode={performanceMode}/>
      <InstrumentEducationArea
        staining={staining}
        draggingAb={draggingAb}
        onAbPointerDown={onAbPointerDown}
        onResetStaining={onResetStaining}
      />
      <FSCOpticalPath enabled={fscOn} performanceMode={performanceMode}/>
      <FluorescenceMirror enabled={fscOn} performanceMode={performanceMode} x={FSC_MIRROR_X} y={FSC_MIRROR_Y} angle={45}/>
      <FluorescenceMirror enabled={laserOn} performanceMode={performanceMode} x={MIRROR1_X} y={MIRROR1_Y} angle={45}/>
      <FluorescenceMirror enabled={laserOn} performanceMode={performanceMode} x={MIRROR2_X} y={MIRROR2_Y} angle={45}/>
      <FL1OpticalPath enabled={fl1On} performanceMode={performanceMode}/>
      <FL2OpticalPath enabled={fl2On} performanceMode={performanceMode}/>
      <FluorescenceAnnotations
        fscEnabled={fscOn}
        fl1Enabled={fl1On}
        fl2Enabled={fl2On}/>
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
  draggingAb,
  dragOffset,
}: {
  laserOn: boolean
  cellsOn: boolean
  plotOn: boolean
  performanceMode: boolean
  cells: Cell[]
  photons: Photon[]
  plotPoints: PlotPoint[]
  draggingAb: AntibodyKind | null
  dragOffset: { x: number; y: number }
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
      {plotOn && <FluorescencePlot points={plotPoints}/>}
      {draggingAb === "cd4" && (
        <CompactTubeSVG
          x={CD4_TUBE_ORIGIN.x + dragOffset.x}
          y={CD4_TUBE_ORIGIN.y + dragOffset.y}
          label="Anti-CD4 (FITC)" liquidColor={FL1_COLOR} capColor={FL1_COLOR}
          isDragging
        />
      )}
      {draggingAb === "cd8" && (
        <CompactTubeSVG
          x={CD8_TUBE_ORIGIN.x + dragOffset.x}
          y={CD8_TUBE_ORIGIN.y + dragOffset.y}
          label="Anti-CD8 (PE)" liquidColor={FL2_COLOR} capColor={FL2_COLOR}
          isDragging
        />
      )}
    </>
  )
}

function CellSVG({ cell }: { cell: Cell }) {
  const { cx, y, r, g, cd4Stained, cd8Stained } = cell
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
      {cd4Stained && (
        <circle cx={r * 0.48} cy={-r * 0.22} r={r * 0.30}
          fill={FL1_COLOR} stroke="#052e16" strokeWidth="0.5" opacity="1"
          filter="url(#glow-ph)"/>
      )}
      {cd8Stained && (
        <circle cx={-r * 0.44} cy={r * 0.22} r={r * 0.30}
          fill={FL2_COLOR} stroke="#431407" strokeWidth="0.5" opacity="1"
          filter="url(#glow-ph)"/>
      )}
    </g>
  )
}

function PhotonSVG({ p, performanceMode }: { p: Photon; performanceMode: boolean }) {
  const r = p.phase === "focus" ? 1.25 : 1.05
  const grad =
    p.kind === "fl1" ? "url(#ph-fl1-g)"
    : p.kind === "fl2" ? "url(#ph-fl2-g)"
    : p.phase === "focus" ? "url(#ph-focus-g)" : "url(#ph-scatter-g)"
  const core =
    p.kind === "fl1" ? FL1_COLOR
    : p.kind === "fl2" ? FL2_COLOR
    : p.phase === "focus" ? "#e0fcff" : "#7ee8ff"
  const trailColor =
    p.kind === "fl1" ? FL1_COLOR
    : p.kind === "fl2" ? FL2_COLOR
    : "#22d3ee"
  const trailLen = p.phase === "focus" ? 6 : 12
  const photonGlow = performanceMode ? undefined : "url(#glow-ph)"
  const showTrail = p.phase !== "focus"
  return (
    <g opacity={p.opacity} filter={photonGlow}>
      {showTrail && (
        <line
          x1={p.x - p.vx * trailLen * 0.4} y1={p.y - p.vy * trailLen * 0.4}
          x2={p.x} y2={p.y}
          stroke={trailColor} strokeWidth={p.kind === "fsc" ? "0.6" : "0.75"} opacity={0.38}
        />
      )}
      <circle cx={p.x} cy={p.y} r={r * 2}
        fill={grad} opacity={0.38}/>
      <circle cx={p.x} cy={p.y} r={r}
        fill={core} opacity={0.88}/>
    </g>
  )
}

function FluorescenceAnnotations({
  fscEnabled,
  fl1Enabled,
  fl2Enabled,
}: {
  fscEnabled: boolean
  fl1Enabled: boolean
  fl2Enabled: boolean
}) {
  return (
    <g fontFamily="monospace" fontSize="7.5" letterSpacing="0.08em">
      {fscEnabled && (
        <text x={FSC_DET_X + 44} y={FSC_DET_Y + 4} textAnchor="start"
          fill="#0d5a6e" fontSize="7.5" fontWeight="600">
          FSC
        </text>
      )}

      {fl1Enabled && (
        <text x={FL1_DET_X + 44} y={FL1_DET_Y + 4} textAnchor="start"
          fill={FL1_COLOR} fontSize="7.5" fontWeight="600">
          FL1 (FITC)
        </text>
      )}

      {fl2Enabled && (
        <text x={FL2_DET_X + 44} y={FL2_DET_Y + 4} textAnchor="start"
          fill={FL2_COLOR} fontSize="7.5" fontWeight="600">
          FL2 (PE)
        </text>
      )}

      {/* watermark */}
      <text x={10} y={SVG_H - 8} fill="#0a1f35" fontSize="6.5" fontWeight="500">
        Fluorescence bench — 488 nm excitation
      </text>
      <text x={SVG_W - 10} y={SVG_H - 8} textAnchor="end" fill="#0a1f35" fontSize="6.5" fontWeight="500">
        Fluorescence detection simulation
      </text>
    </g>
  )
}

function FluorescencePlot({ points }: { points: PlotPoint[] }) {
  const ix = PLOT_X + PLOT_MARGIN
  const iy = PLOT_Y + PLOT_MARGIN
  const iw = PLOT_W - PLOT_MARGIN * 2
  const ih = PLOT_H - PLOT_MARGIN * 2
  const midX = ix + iw / 2
  const midY = iy + ih / 2

  const toX = (cd4: number) => ix + (cd4 / 100) * iw
  const toY = (cd8: number) => iy + ih - (cd8 / 100) * ih

  return (
    <g>
      <rect
        x={PLOT_X} y={PLOT_Y} width={PLOT_W} height={PLOT_H} rx="6"
        fill="#f4f5f7" stroke="#c8cdd4" strokeWidth="1.2" opacity="0.97"/>
      <rect
        x={ix} y={iy} width={iw} height={ih}
        fill="#fafbfc" stroke="#d8dce2" strokeWidth="0.6"/>

      {/* quadrant dividers */}
      <line x1={midX} y1={iy} x2={midX} y2={iy + ih}
        stroke="#b8bcc4" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.7"/>
      <line x1={ix} y1={midY} x2={ix + iw} y2={midY}
        stroke="#b8bcc4" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.7"/>

      {/* axis ticks */}
      {[25, 50, 75].map(v => (
        <g key={`t${v}`}>
          <line x1={toX(v)} y1={iy} x2={toX(v)} y2={iy + ih}
            stroke="#e2e5ea" strokeWidth="0.5"/>
          <line x1={ix} y1={toY(v)} x2={ix + iw} y2={toY(v)}
            stroke="#e2e5ea" strokeWidth="0.5"/>
        </g>
      ))}

      {/* quadrant labels */}
      <text x={ix + 8} y={iy + 12} fill="#94a3b8" fontSize="6.5" fontFamily="monospace">CD8+</text>
      <text x={ix + iw - 8} y={iy + 12} textAnchor="end" fill="#94a3b8" fontSize="6.5" fontFamily="monospace">DP</text>
      <text x={ix + 8} y={iy + ih - 6} fill="#94a3b8" fontSize="6.5" fontFamily="monospace">DN</text>
      <text x={ix + iw - 8} y={iy + ih - 6} textAnchor="end" fill="#94a3b8" fontSize="6.5" fontFamily="monospace">CD4+</text>

      {points.map(pt => {
        const cx = toX(pt.cd4)
        const cy = toY(pt.cd8)
        const fill =
          pt.quadrant === "dp" ? DP_COLOR
          : pt.quadrant === "cd4" ? FL1_COLOR
          : pt.quadrant === "cd8" ? FL2_COLOR
          : DN_COLOR
        return (
          <circle
            key={pt.id}
            cx={cx}
            cy={cy}
            r={2.2}
            fill={fill}
            opacity={0.82}
          />
        )
      })}

      <text
        x={PLOT_X + PLOT_W / 2} y={PLOT_Y + PLOT_H - 6}
        textAnchor="middle" fill="#3a4048"
        fontSize="8" fontFamily="monospace" fontWeight="600" letterSpacing="0.06em">
        CD4 (FITC)
      </text>
      <text
        x={PLOT_X + 9} y={PLOT_Y + PLOT_H / 2}
        textAnchor="middle" fill="#3a4048"
        fontSize="8" fontFamily="monospace" fontWeight="600" letterSpacing="0.06em"
        transform={`rotate(-90 ${PLOT_X + 9} ${PLOT_Y + PLOT_H / 2})`}>
        CD8 (PE)
      </text>
    </g>
  )
}

const TUBE_H = 34
const SAMPLE_TUBE_ORIGIN = { x: EDU_TUBES_X + 10, y: EDU_Y0 + 22 }
const CD4_TUBE_ORIGIN = { x: EDU_TUBES_X + 10, y: EDU_Y0 + 22 + 38 }
const CD8_TUBE_ORIGIN = { x: EDU_TUBES_X + 10, y: EDU_Y0 + 22 + 76 }

function CompactTubeSVG({
  x, y, label, liquidColor, capColor, showCells = false,
  draggable = false, onPointerDown, isDragging = false,
}: {
  x: number; y: number; label: string; liquidColor: string; capColor?: string
  showCells?: boolean
  draggable?: boolean
  onPointerDown?: (e: React.PointerEvent) => void
  isDragging?: boolean
}) {
  const cap = capColor ?? "#1a3048"
  return (
    <g
      transform={`translate(${x},${y})`}
      style={{ cursor: draggable ? "grab" : undefined }}
      onPointerDown={onPointerDown}
      opacity={isDragging ? 0.85 : 1}>
      <rect x={7} y={2} width={12} height={4} rx={1} fill={cap} stroke="#2a4560" strokeWidth="0.4"/>
      <rect x={5} y={6} width={16} height={28} rx={3.5} fill="#07111a" stroke="#2a4560" strokeWidth="0.5"/>
      <rect x={7} y={showCells ? 15 : 17} width={12} height={showCells ? 14 : 12} rx={1.5} fill={liquidColor} opacity="0.8"/>
      {showCells && (
        <>
          <circle cx={10} cy={19} r={1.6} fill="#2fa0d6" opacity="0.9"/>
          <circle cx={15} cy={23} r={1.6} fill="#2fa0d6" opacity="0.85"/>
        </>
      )}
      <text x={26} y={16} fill="#3a8ab0" fontSize="7.5" fontFamily="monospace" fontWeight="600">
        {label}
      </text>
    </g>
  )
}

function CompactPhenotypeRowSVG({
  x, y, title, markers, pheno, staining,
}: {
  x: number; y: number; title: string; markers: string
  pheno: LymphPhenotype
  staining: StainingState
}) {
  const highlighted =
    (staining.cd4 && (pheno === "helperT" || pheno === "doublePositive")) ||
    (staining.cd8 && (pheno === "cytotoxicT" || pheno === "doublePositive"))

  const showCd4 =
    staining.cd4 && (pheno === "helperT" || pheno === "doublePositive")
  const showCd8 =
    staining.cd8 && (pheno === "cytotoxicT" || pheno === "doublePositive")

  const baseDot =
    pheno === "doubleNegative" ? DN_COLOR
    : pheno === "helperT" ? FL1_COLOR
    : pheno === "cytotoxicT" ? FL2_COLOR
    : "#64748b"

  return (
    <g transform={`translate(${x},${y})`} opacity={highlighted ? 1 : 0.55}>
      <rect x={-2} y={0} width={168} height={24} rx={4}
        fill={highlighted ? "#0a2030" : "transparent"}
        stroke={highlighted ? "#2a6080" : "transparent"}
        strokeWidth="0.6"/>
      <circle cx={7} cy={10} r={4} fill={baseDot} opacity={highlighted ? 0.95 : 0.45}/>
      {showCd4 && (
        <circle cx={15} cy={5} r={2.8} fill={FL1_COLOR} stroke="#052e16" strokeWidth="0.35"/>
      )}
      {showCd8 && (
        <circle cx={15} cy={15} r={2.8} fill={FL2_COLOR} stroke="#431407" strokeWidth="0.35"/>
      )}
      <text x={22} y={9} fill={highlighted ? "#62b4d0" : "#3a6078"} fontSize="7.5" fontFamily="monospace" fontWeight="600">
        {title}
      </text>
      <text x={22} y={18} fill="#284860" fontSize="7" fontFamily="monospace">
        {markers}
      </text>
    </g>
  )
}

function InstrumentEducationArea({
  staining,
  draggingAb,
  onAbPointerDown,
  onResetStaining,
}: {
  staining: StainingState
  draggingAb: AntibodyKind | null
  onAbPointerDown: (ab: AntibodyKind, e: React.PointerEvent) => void
  onResetStaining: () => void
}) {
  const phenoY = EDU_Y0 + 22

  return (
    <g fontFamily="monospace">
      {/* Tubes & Dyes — left panel */}
      <rect
        x={EDU_TUBES_X} y={EDU_Y0} width={128} height={178} rx={8}
        fill="#040a12" stroke="#122840" strokeWidth="0.8" opacity="0.88"/>
      <text x={EDU_TUBES_X + 10} y={EDU_Y0 + 16} fill="#3a8ab0" fontSize="8" fontWeight="600" letterSpacing="0.12em">
        TUBES &amp; DYES
      </text>
      <CompactTubeSVG x={SAMPLE_TUBE_ORIGIN.x} y={SAMPLE_TUBE_ORIGIN.y} label="Sample Tube" liquidColor="#1a5a8a" capColor="#6b4fa0" showCells/>
      {/* drop target highlight when dragging */}
      {draggingAb && (
        <rect
          x={SAMPLE_TUBE_ORIGIN.x + 4} y={SAMPLE_TUBE_ORIGIN.y + 4}
          width={90} height={TUBE_H + 4} rx={6}
          fill="none" stroke="#6b4fa0" strokeWidth="1" strokeDasharray="3 2" opacity="0.7"/>
      )}
      {draggingAb !== "cd4" && (
        <CompactTubeSVG
          x={CD4_TUBE_ORIGIN.x} y={CD4_TUBE_ORIGIN.y}
          label="Anti-CD4 (FITC)" liquidColor={FL1_COLOR} capColor={FL1_COLOR}
          draggable
          onPointerDown={e => onAbPointerDown("cd4", e)}
        />
      )}
      {draggingAb !== "cd8" && (
        <CompactTubeSVG
          x={CD8_TUBE_ORIGIN.x} y={CD8_TUBE_ORIGIN.y}
          label="Anti-CD8 (PE)" liquidColor={FL2_COLOR} capColor={FL2_COLOR}
          draggable
          onPointerDown={e => onAbPointerDown("cd8", e)}
        />
      )}
      {staining.cd4 && (
        <text x={EDU_TUBES_X + 10} y={EDU_Y0 + 148} fill={FL1_COLOR} fontSize="6.5" fontWeight="600">
          CD4 staining active
        </text>
      )}
      {staining.cd8 && (
        <text x={EDU_TUBES_X + 10} y={EDU_Y0 + (staining.cd4 ? 158 : 148)} fill={FL2_COLOR} fontSize="6.5" fontWeight="600">
          CD8 staining active
        </text>
      )}
      <g
        transform={`translate(${EDU_TUBES_X + 10}, ${EDU_Y0 + 162})`}
        style={{ cursor: "pointer" }}
        onClick={onResetStaining}>
        <rect x={0} y={0} width={108} height={16} rx={3}
          fill="#0a1828" stroke="#2a4560" strokeWidth="0.6"/>
        <text x={54} y={11} textAnchor="middle" fill="#5a7890" fontSize="7" fontWeight="600" letterSpacing="0.08em">
          RESET STAINING
        </text>
      </g>

      {/* Cell Phenotype Panel — right panel */}
      <rect
        x={EDU_PHENO_X} y={EDU_Y0} width={176} height={136} rx={8}
        fill="#040a12" stroke="#122840" strokeWidth="0.8" opacity="0.88"/>
      <text x={EDU_PHENO_X + 10} y={EDU_Y0 + 16} fill="#3a8ab0" fontSize="8" fontWeight="600" letterSpacing="0.1em">
        CELL PHENOTYPE PANEL
      </text>
      <CompactPhenotypeRowSVG x={EDU_PHENO_X + 8} y={phenoY} title="Helper T Cell" markers="CD4+ CD8−" pheno="helperT" staining={staining}/>
      <CompactPhenotypeRowSVG x={EDU_PHENO_X + 8} y={phenoY + 28} title="Cytotoxic T Cell" markers="CD4− CD8+" pheno="cytotoxicT" staining={staining}/>
      <CompactPhenotypeRowSVG x={EDU_PHENO_X + 8} y={phenoY + 56} title="Double Positive T Cell" markers="CD4+ CD8+" pheno="doublePositive" staining={staining}/>
      <CompactPhenotypeRowSVG x={EDU_PHENO_X + 8} y={phenoY + 84} title="Double Negative T Cell" markers="CD4− CD8−" pheno="doubleNegative" staining={staining}/>
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

function focusPhotonToward(
  p: Photon, targetX: number, targetY: number,
  speedBoost = 1, spreadHalf = 0.04,
): Photon {
  const dx = targetX - p.x
  const dy = targetY - p.y
  const spd = Math.hypot(p.vx, p.vy) * speedBoost
  const spread = (Math.random() - 0.5) * 2 * spreadHalf
  const baseAng = Math.atan2(dy, dx)
  const ang = baseAng + spread
  return {
    ...p,
    phase: "focus",
    vx: Math.cos(ang) * spd,
    vy: Math.sin(ang) * spd,
  }
}

function routePhoton(
  p: Photon,
  fscOn: boolean,
  fl1On: boolean,
  fl2On: boolean,
): Photon {
  if (p.phase === "toDichroic") {
    const reachedDichroic =
      p.x >= FSC_MIRROR_X - 3 &&
      p.x - p.vx < FSC_MIRROR_X + 2 &&
      Math.abs(p.y - FSC_MIRROR_Y) <= 10

    if (!reachedDichroic) return p

    if (p.kind === "fsc" && fscOn) {
      return focusPhotonToward(p, FSC_DET_X, FSC_DET_Y, 1, 0.05)
    }

    if (p.kind === "fl1" && !fl1On && fscOn) {
      return focusPhotonToward(p, FSC_DET_X, FSC_DET_Y, 1, 0.05)
    }

    if (p.kind === "fl2" && !fl2On && fscOn) {
      return focusPhotonToward(p, FSC_DET_X, FSC_DET_Y, 1, 0.05)
    }

    if ((p.kind === "fl1" && fl1On) || (p.kind === "fl2" && fl2On)) {

      const targetX =    
        p.kind === "fl1"   
          ? MIRROR1_X    
          : MIRROR2_X    

      const targetY =    
        p.kind === "fl1"   
          ? MIRROR1_Y    
          : MIRROR2_Y
              
      return focusPhotonToward(   
        p,   
        targetX,    
        targetY,    
        1.06,    
        0.015
      )
    }

    return p
  }

  if (p.phase === "focus" && p.vy > 0.2) {
    if (p.kind === "fl1" && fl1On) {
      const crossed =
        p.y >= MIRROR1_Y - 4 && p.y - p.vy < MIRROR1_Y + 2 &&
        Math.abs(p.x - MIRROR1_X) <= 12
      if (crossed) {
        return focusPhotonToward(p, FL1_DET_X, FL1_DET_Y, 1.06, 0.03)
      }
    }

    if (p.kind === "fl2" && fl2On) {
      const crossed =
        p.y >= MIRROR2_Y - 4 && p.y - p.vy < MIRROR2_Y + 2 &&
        Math.abs(p.x - MIRROR2_X) <= 12
      if (crossed) {
        return focusPhotonToward(p, FL2_DET_X, FL2_DET_Y, 1.06, 0.03)
      }
    }
  }

  if (p.phase === "vertical") {
    if (p.kind === "fl1" && fl1On) {
      const crossed =
        p.y >= MIRROR1_Y - 4 && p.y - p.vy < MIRROR1_Y + 2 &&
        Math.abs(p.x - MIRROR1_X) <= 12
      if (crossed) {
        return focusPhotonToward(p, FL1_DET_X, FL1_DET_Y, 1.06, 0.03)
      }
    }

    if (p.kind === "fl2" && fl2On) {
      const crossed =
        p.y >= MIRROR2_Y - 4 && p.y - p.vy < MIRROR2_Y + 2 &&
        Math.abs(p.x - MIRROR2_X) <= 12
      if (crossed) {
        return focusPhotonToward(p, FL2_DET_X, FL2_DET_Y, 1.06, 0.03)
      }
    }

    return p
  }

  return p
}

function absorbPhotonIfInside(p: Photon): { photon: Photon | null; detected: boolean } {
  if (p.phase !== "focus") return { photon: p, detected: false }

  const targets: Record<Photon["kind"], { x: number; y: number }> = {
    fsc: { x: FSC_DET_X, y: FSC_DET_Y },
    fl1: { x: FL1_DET_X, y: FL1_DET_Y },
    fl2: { x: FL2_DET_X, y: FL2_DET_Y },
  }
  const { x: detX, y: detY } = targets[p.kind]
  const inside = Math.hypot(p.x - detX, p.y - detY) < DETECTOR_BODY_R * 0.85

  if (!inside) return { photon: p, detected: false }

  const nextOpacity = p.opacity * 0.72
  if (nextOpacity < 0.06) return { photon: null, detected: true }
  return { photon: { ...p, opacity: nextOpacity }, detected: false }
}

function measurementReady(m: PendingMeasurement): boolean {
  if (!m.fscHit) return false
  if (m.needsFl1 && !m.fl1Hit) return false
  if (m.needsFl2 && !m.fl2Hit) return false
  return true
}

function applyDetectorHit(
  pending: PendingMeasurement[],
  eventId: number,
  kind: Photon["kind"],
  frame: number,
): PendingMeasurement[] {
  return pending.map(m => {
    if (m.eventId !== eventId) return m
    const updated = { ...m }
    if (kind === "fsc") updated.fscHit = true
    if (kind === "fl1") updated.fl1Hit = true
    if (kind === "fl2") updated.fl2Hit = true
    if (updated.releaseFrame === null && measurementReady(updated)) {
      updated.releaseFrame = frame + ACQUISITION_PAUSE
    }
    return updated
  })
}

function isOverSampleTube(svgX: number, svgY: number): boolean {
  const left = SAMPLE_TUBE_ORIGIN.x + 4
  const top = SAMPLE_TUBE_ORIGIN.y + 4
  const right = left + 90
  const bottom = top + TUBE_H + 4
  return svgX >= left && svgX <= right && svgY >= top && svgY <= bottom
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

export function FluorescenceDetection() {
  const [cellsOn, setCellsOn] = useState(false)
  const [laserOn, setLaserOn] = useState(false)
  const [fscOn,   setFscOn]   = useState(false)
  const [fl1On,   setFl1On]   = useState(false)
  const [fl2On,   setFl2On]   = useState(false)
  const [lymphOn, setLymphOn] = useState(true)
  const [monoOn,  setMonoOn]  = useState(true)
  const [granOn,  setGranOn]  = useState(true)
  const [plotOn,  setPlotOn]  = useState(false)
  const [performanceMode, setPerformanceMode] = useState(false)
  const [showPerfStats, setShowPerfStats] = useState(false)
  const [perfStats, setPerfStats] = useState({ fps: 0, cells: 0, photons: 0 })
  const [staining, setStaining] = useState<StainingState>({ cd4: false, cd8: false })
  const [draggingAb, setDraggingAb] = useState<AntibodyKind | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const rCells = useRef(cellsOn)
  const rLaser = useRef(laserOn)
  const rFsc   = useRef(fscOn)
  const rFl1   = useRef(fl1On)
  const rFl2   = useRef(fl2On)
  const rLymph = useRef(lymphOn)
  const rMono  = useRef(monoOn)
  const rGran  = useRef(granOn)
  const rPlot  = useRef(plotOn)
  const rStaining = useRef(staining)
  useEffect(() => { rCells.current = cellsOn }, [cellsOn])
  useEffect(() => { rLaser.current = laserOn }, [laserOn])
  useEffect(() => { rFsc.current   = fscOn   }, [fscOn])
  useEffect(() => { rFl1.current   = fl1On   }, [fl1On])
  useEffect(() => { rFl2.current   = fl2On   }, [fl2On])
  useEffect(() => { rLymph.current = lymphOn }, [lymphOn])
  useEffect(() => { rMono.current  = monoOn  }, [monoOn])
  useEffect(() => { rGran.current  = granOn  }, [granOn])
  useEffect(() => { rPlot.current  = plotOn  }, [plotOn])
  useEffect(() => { rStaining.current = staining }, [staining])

  const cells      = useRef<Cell[]>([])
  const photons    = useRef<Photon[]>([])
  const plotPoints = useRef<PlotPoint[]>([])
  const pending    = useRef<PendingMeasurement[]>([])
  const frameRef   = useRef(0)
  const [, bump]   = useState(0)
  const rShowPerfStats = useRef(showPerfStats)
  const perfFrameCount = useRef(0)
  const perfLastSample = useRef(performance.now())
  const dragStart = useRef({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => { rShowPerfStats.current = showPerfStats }, [showPerfStats])
  useEffect(() => {
    if (showPerfStats) {
      perfFrameCount.current = 0
      perfLastSample.current = performance.now()
    }
  }, [showPerfStats])

  const resetStaining = useCallback(() => {
    setStaining({ cd4: false, cd8: false })
    rStaining.current = { cd4: false, cd8: false }
    bump(n => n + 1)
  }, [])

  const applyAntibody = useCallback((ab: AntibodyKind) => {
    setStaining(prev => {
      const next = ab === "cd4" ? { ...prev, cd4: true } : { ...prev, cd8: true }
      rStaining.current = next
      return next
    })
    bump(n => n + 1)
  }, [])

  const handleCellsChange = useCallback((on: boolean) => {
    setCellsOn(on)
    if (!on) resetStaining()
  }, [resetStaining])

  const handleLymphChange = useCallback((on: boolean) => {
    setLymphOn(on)
    if (!on) resetStaining()
  }, [resetStaining])

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

  const clientToSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const svgPt = pt.matrixTransform(ctm.inverse())
    return { x: svgPt.x, y: svgPt.y }
  }, [])

  const handleAbPointerDown = useCallback((ab: AntibodyKind, e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const origin = ab === "cd4" ? CD4_TUBE_ORIGIN : CD8_TUBE_ORIGIN
    const svgPt = clientToSvg(e.clientX, e.clientY)
    dragStart.current = { x: svgPt.x - origin.x, y: svgPt.y - origin.y }
    setDraggingAb(ab)
    setDragOffset({ x: 0, y: 0 })
  }, [clientToSvg])

  useEffect(() => {
    if (!draggingAb) return

    const handleMove = (e: PointerEvent) => {
      const origin = draggingAb === "cd4" ? CD4_TUBE_ORIGIN : CD8_TUBE_ORIGIN
      const svgPt = clientToSvg(e.clientX, e.clientY)
      setDragOffset({
        x: svgPt.x - origin.x - dragStart.current.x,
        y: svgPt.y - origin.y - dragStart.current.y,
      })
    }

    const handleUp = (e: PointerEvent) => {
      const svgPt = clientToSvg(e.clientX, e.clientY)
      if (isOverSampleTube(svgPt.x, svgPt.y)) {
        applyAntibody(draggingAb)
      }
      setDraggingAb(null)
      setDragOffset({ x: 0, y: 0 })
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleUp)
    return () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleUp)
    }
  }, [draggingAb, clientToSvg, applyAntibody])

  const spawnCell = useCallback((startY = -26) => {
    const pop = pickPopulation(rLymph.current, rMono.current, rGran.current)
    if (!pop) return

    const cfg = POPULATION_CONFIG[pop]
    const stain = rStaining.current

    let phenotype: LymphPhenotype | undefined
    let cd4Stained = false
    let cd8Stained = false

    if (pop === "lymphocyte") {
      phenotype = pickLymphPhenotype()
      const stainingResult = computeStaining(phenotype, stain)
      cd4Stained = stainingResult.cd4Stained
      cd8Stained = stainingResult.cd8Stained
    }

    const plotQuadrant = getPlotQuadrant(cd4Stained, cd8Stained)
    const { cd4Plot, cd8Plot } = assignFluorescencePlotCoords(plotQuadrant)

    cells.current.push({
      id: mkid(),
      cx: CH_CX + (Math.random() - 0.5) * 5,
      y: startY,
      r: cfg.r,
      speed: 1.8,
      g: cfg.g,
      population: pop,
      phenotype,
      cd4Stained,
      cd8Stained,
      cd4Plot,
      cd8Plot,
      plotQuadrant,
      emitFl1: cd4Stained,
      emitFl2: cd8Stained,
      scattering: false,
      scatterAge: 0,
    })
  }, [])

  const emitPhotons = useCallback((cell: Cell, eventId: number) => {
    const ix = cell.cx
    const iy = LASER_Y
    const dichroicAng = Math.atan2(FSC_MIRROR_Y - iy, FSC_MIRROR_X - ix)

    for (let i = 0; i < PHOTON_FSC_COUNT; i++) {
      const spd = 4.4 + Math.random() * 1.8
      const ang = dichroicAng + (Math.random() - 0.5) * 2 * FSC_TO_DICHROIC_HALF
      photons.current.push({
        id: mkid(),
        x: ix + (Math.random() - 0.5) * 1.2,
        y: iy + (Math.random() - 0.5) * 1.2,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        kind: "fsc",
        phase: "toDichroic",
        eventId,
        opacity: 0.7 + Math.random() * 0.25,
        age: 0,
        maxAge: 56 + Math.random() * 18,
      })
    }

    const emitFlChannel = (kind: "fl1" | "fl2", count: number) => {
      for (let i = 0; i < count; i++) {
        const spd = 4.8 + Math.random() * 1.6
        const ang = dichroicAng + (Math.random() - 0.5) * 2 * FL_CONE_HALF
        photons.current.push({
          id: mkid(),
          x: ix + (Math.random() - 0.5) * 1.0,
          y: iy + (Math.random() - 0.5) * 1.0,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          kind,
          phase: "toDichroic",
          eventId,
          opacity: 0.74 + Math.random() * 0.2,
          age: 0,
          maxAge: 64 + Math.random() * 18,
        })
      }
    }

    if (cell.emitFl1) emitFlChannel("fl1", PHOTON_FL_COUNT)
    if (cell.emitFl2) emitFlChannel("fl2", PHOTON_FL_COUNT)
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
        const eventId = mkid()
        emitPhotons(c, eventId)
        pending.current.push({
          eventId,
          cd4: c.cd4Plot,
          cd8: c.cd8Plot,
          quadrant: c.plotQuadrant,
          needsFl1: c.emitFl1,
          needsFl2: c.emitFl2,
          fscHit: false,
          fl1Hit: false,
          fl2Hit: false,
          releaseFrame: null,
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
      if (m.releaseFrame !== null && f >= m.releaseFrame && rPlot.current) {
        plotPoints.current.push({
          id: m.eventId,
          cd4: m.cd4,
          cd8: m.cd8,
          quadrant: m.quadrant,
        })
        if (plotPoints.current.length > MAX_PLOT_POINTS) {
          plotPoints.current.shift()
        }
      }
    }
    pending.current = pending.current.filter(
      m => m.releaseFrame === null || f < m.releaseFrame,
    )

    const nextPhotons: Photon[] = []
    for (const p of photons.current) {
      let next: Photon = {
        ...p,
        x: p.x + p.vx,
        y: p.y + p.vy,
        age: p.age + 1,
        opacity: p.opacity * (p.phase === "focus" ? 0.978 : 0.968),
      }
      next = routePhoton(next, rFsc.current, rFl1.current, rFl2.current)
      const { photon: absorbed, detected } = absorbPhotonIfInside(next)
      if (detected) {
        pending.current = applyDetectorHit(pending.current, p.eventId, p.kind, f)
      }
      if (absorbed && absorbed.age < absorbed.maxAge && absorbed.opacity > 0.02) {
        nextPhotons.push(absorbed)
      }
    }
    photons.current = nextPhotons

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
              enabled={cellsOn} onChange={handleCellsChange}
              color="oklch(0.66 0.13 215)"/>
            <ControlRow
              label="Laser 488nm" sublabel="Coherent Sapphire"
              enabled={laserOn} onChange={setLaserOn}
              color="oklch(0.62 0.22 254)"/>
            <ControlRow
              label="FSC Detector" sublabel="Event Detection"
              enabled={fscOn} onChange={setFscOn}
              color="oklch(0.64 0.18 158)"/>
            <ControlRow
              label="FL1" sublabel="FITC Channel"
              enabled={fl1On} onChange={setFl1On}
              color="oklch(0.58 0.16 145)"/>
            <ControlRow
              label="FL2" sublabel="PE Channel"
              enabled={fl2On} onChange={setFl2On}
              color="oklch(0.72 0.16 52)"/>
            <ControlRow
              label="Plot" sublabel="CD4 / CD8 Acquisition"
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
                  enabled={lymphOn} onChange={handleLymphChange}
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
            Optical Path — Fluorescence Detection
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
            ref={svgRef}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 h-full w-full">

            <StaticLayer
              laserOn={laserOn}
              fscOn={fscOn}
              fl1On={fl1On}
              fl2On={fl2On}
              performanceMode={performanceMode}
              staining={staining}
              onResetStaining={resetStaining}
              draggingAb={draggingAb}
              onAbPointerDown={handleAbPointerDown}
            />
            <DynamicLayer
              laserOn={laserOn}
              cellsOn={cellsOn}
              plotOn={plotOn}
              performanceMode={performanceMode}
              cells={cells.current}
              photons={photons.current}
              plotPoints={plotPoints.current}
              draggingAb={draggingAb}
              dragOffset={dragOffset}
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
