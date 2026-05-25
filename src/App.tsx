import { useEffect, useRef, useState, useCallback } from "react"

interface Particle {
  id: number
  x: number
  y: number
  r: number
  speed: number
  wobble: number
  wobblePhase: number
  opacity: number
  isDoublet: boolean
  doubletOffset: number
  microMotionX: number
  microMotionY: number
}

const CHAMBER_W = 300
const PARTICLE_COUNT = 36
const BASE_SPEED = 1.95

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function initParticles(count: number, canvasH: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: 0,
    y: -(i * (canvasH / count)) - Math.random() * 40,
    r: 2.8 + Math.random() * 4.2,
    speed: BASE_SPEED * (0.72 + Math.random() * 0.65),
    wobble: Math.random() * 2 - 1,
    wobblePhase: Math.random() * Math.PI * 2,
    opacity: 0.74 + Math.random() * 0.26,
    isDoublet: false,
    doubletOffset: 0,
    microMotionX: 0,
    microMotionY: 0,
  }))
}

function getEducationalLines(flow: number): { lines: string[]; color: string; glowColor: string } {
  if (flow < 0.25) {
    return {
      lines: ["Events become", "overcrowded"],
      color: "#22d3ee",
      glowColor: "#22d3ee80",
    }
  }
  if (flow < 0.4) {
    return {
      lines: ["Tight focusing", "High event density"],
      color: "#22d3ee",
      glowColor: "#22d3ee80",
    }
  }
  if (flow <= 0.6) {
    return {
      lines: ["Optimal focusing", "Balanced acquisition", "Clear separation"],
      color: "#10b981",
      glowColor: "#10b98180",
    }
  }
  if (flow <= 0.75) {
    return {
      lines: ["Sample core widens", "Focusing weakens", "Coincidence increases"],
      color: "#f97316",
      glowColor: "#f9731680",
    }
  }
  return {
    lines: ["Chaotic flow", "Streams begin mixing"],
    color: "#f97316",
    glowColor: "#f9731680",
  }
}

function drawParticle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  opacity: number,
  flow: number,
  isDoublet: boolean
) {
  const glowR = r * 3.0
  const grd = ctx.createRadialGradient(x, y, 0, x, y, glowR)

  if (isDoublet) {
    grd.addColorStop(0, `rgba(255,145,60,${opacity * 0.97})`)
    grd.addColorStop(0.3, `rgba(249,115,22,${opacity * 0.68})`)
    grd.addColorStop(0.7, `rgba(249,115,22,${opacity * 0.10})`)
    grd.addColorStop(1, "rgba(249,115,22,0)")
  } else {
    const baseR = Math.round(lerp(175, 95, flow))
    const baseG = Math.round(lerp(230, 165, flow * 0.32))
    grd.addColorStop(0, `rgba(${baseR},${baseG},255,${opacity})`)
    grd.addColorStop(0.25, `rgba(${baseR - 22},${baseG - 32},255,${opacity * 0.76})`)
    grd.addColorStop(0.7, `rgba(65,125,220,${opacity * 0.12})`)
    grd.addColorStop(1, "rgba(65,125,220,0)")
  }

  ctx.beginPath()
  ctx.fillStyle = grd
  ctx.arc(x, y, glowR, 0, Math.PI * 2)
  ctx.fill()

  ctx.beginPath()
  ctx.fillStyle = isDoublet
    ? `rgba(255,180,90,${opacity * 0.95})`
    : `rgba(225,245,255,${opacity * 0.94})`
  ctx.arc(x, y, r * 0.60, 0, Math.PI * 2)
  ctx.fill()
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const flowRef = useRef(0.12)
  const rafRef = useRef<number>(0)
  const timeRef = useRef(0)
  const [flow, setFlow] = useState(0.12)
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const { width, height } = el.getBoundingClientRect()
      setDimensions({ w: Math.round(width), h: Math.round(height) })
    }
    const obs = new ResizeObserver(update)
    obs.observe(el)
    update()
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (dimensions.h === 0) return
    particlesRef.current = initParticles(PARTICLE_COUNT, dimensions.h)
  }, [dimensions.h])

  const handleSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = clamp(parseFloat(e.target.value), 0, 1)
    flowRef.current = v
    setFlow(v)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || dimensions.w === 0) return
    const ctx = canvas.getContext("2d")!

    const draw = () => {
      const W = canvas.width
      const H = canvas.height
      const f = flowRef.current
      timeRef.current += 0.0167

      ctx.clearRect(0, 0, W, H)

      const cx = W / 2
      const chamberH = H * 0.82
      const chamberY = H * 0.06
      const chamberX = cx - CHAMBER_W / 2

      // Background
      ctx.fillStyle = "#050a0f"
      ctx.fillRect(0, 0, W, H)

      // Sheath fluid background gradient
      const sheathGrad = ctx.createLinearGradient(chamberX, 0, chamberX + CHAMBER_W, 0)
      sheathGrad.addColorStop(0, "rgba(2, 12, 35, 0.90)")
      sheathGrad.addColorStop(0.25, "rgba(3, 26, 68, 0.84)")
      sheathGrad.addColorStop(0.5, "rgba(5, 38, 100, 0.78)")
      sheathGrad.addColorStop(0.75, "rgba(3, 26, 68, 0.84)")
      sheathGrad.addColorStop(1, "rgba(2, 12, 35, 0.90)")
      ctx.fillStyle = sheathGrad
      ctx.beginPath()
      ctx.roundRect(chamberX, chamberY, CHAMBER_W, chamberH, 16)
      ctx.fill()

      // Core stream width: controls focusing
      // Low (f=0): 6px tight, Mid (f=0.5): 85px balanced, High (f=1): 240px wide
      const coreHW = lerp(6, CHAMBER_W * 0.40, f)

      // Clip to chamber
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(chamberX + 1, chamberY + 1, CHAMBER_W - 2, chamberH - 2, 15)
      ctx.clip()

      // Sheath motion: subtle flowing gradients
      for (let side = -1; side <= 1; side += 2) {
        const baseX = cx + side * (coreHW + 18)
        const flowPhase = (timeRef.current * 0.5 + Math.abs(side)) % 1
        const grad = ctx.createLinearGradient(baseX - 35, chamberY, baseX + 35, chamberY + chamberH)
        grad.addColorStop(0, "rgba(0,170,210,0)")
        grad.addColorStop(0.3, `rgba(0,170,210,${0.035 + 0.015 * Math.sin(flowPhase * Math.PI)})`)
        grad.addColorStop(0.5, `rgba(0,185,230,${0.055 + 0.015 * Math.sin(flowPhase * Math.PI)})`)
        grad.addColorStop(0.7, `rgba(0,170,210,${0.035 + 0.015 * Math.sin(flowPhase * Math.PI)})`)
        grad.addColorStop(1, "rgba(0,170,210,0)")
        ctx.fillStyle = grad
        ctx.fillRect(baseX - 45, chamberY, 90, chamberH)
      }

      // Core stream: the sample fluid
      const coreX = cx - coreHW
      const coreAlpha = lerp(0.64, 0.26, f)
      const coreGrad = ctx.createLinearGradient(coreX, 0, coreX + coreHW * 2, 0)
      coreGrad.addColorStop(0, `rgba(0,200,230,0)`)
      coreGrad.addColorStop(0.07, `rgba(0,200,230,${coreAlpha * 0.52})`)
      coreGrad.addColorStop(0.30, `rgba(25,218,248,${coreAlpha})`)
      coreGrad.addColorStop(0.70, `rgba(25,218,248,${coreAlpha})`)
      coreGrad.addColorStop(0.93, `rgba(0,200,230,${coreAlpha * 0.52})`)
      coreGrad.addColorStop(1, `rgba(0,200,230,0)`)
      ctx.fillStyle = coreGrad
      ctx.fillRect(coreX, chamberY, coreHW * 2, chamberH)

      // Edge glow: stronger when focused
      const egW = Math.max(6, coreHW * 0.30)
      const egAlpha = lerp(0.32, 0.06, f)
      {
        const lg = ctx.createLinearGradient(coreX - egW, 0, coreX + egW, 0)
        lg.addColorStop(0, "rgba(0,230,255,0)")
        lg.addColorStop(1, `rgba(0,230,255,${egAlpha})`)
        ctx.fillStyle = lg
        ctx.fillRect(coreX - egW, chamberY, egW * 2, chamberH)
      }
      {
        const rg = ctx.createLinearGradient(cx + coreHW - egW, 0, cx + coreHW + egW, 0)
        rg.addColorStop(0, `rgba(0,230,255,${egAlpha})`)
        rg.addColorStop(1, "rgba(0,230,255,0)")
        ctx.fillStyle = rg
        ctx.fillRect(cx + coreHW - egW, chamberY, egW * 2, chamberH)
      }

      // Animated flow gradient overlay
      const coreFlowPhase = (timeRef.current * 1.1) % 1
      const cfGrad = ctx.createLinearGradient(0, chamberY, 0, chamberY + chamberH)
      cfGrad.addColorStop(Math.max(0, coreFlowPhase - 0.12), "rgba(0,255,255,0)")
      cfGrad.addColorStop(coreFlowPhase, `rgba(0,255,255,${0.05 + 0.018 * Math.sin(f * Math.PI)})`)
      cfGrad.addColorStop(Math.min(1, coreFlowPhase + 0.12), "rgba(0,255,255,0)")
      ctx.fillStyle = cfGrad
      ctx.fillRect(coreX, chamberY, coreHW * 2, chamberH)

      // Outlet fade
      const outFade = ctx.createLinearGradient(0, chamberY + chamberH - 58, 0, chamberY + chamberH + 8)
      outFade.addColorStop(0, "rgba(5,10,15,0)")
      outFade.addColorStop(1, "rgba(5,10,15,0.95)")
      ctx.fillStyle = outFade
      ctx.fillRect(chamberX, chamberY + chamberH - 58, CHAMBER_W, 70)

      // Particles with micro-motion and realistic behavior
      const particles = particlesRef.current
      const coincProb = lerp(0, 0.35, clamp((f - 0.55) / 0.45, 0, 1))

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]

        // Main downward motion
        p.y += p.speed * lerp(0.95, 1.75, f)

        // Lateral wobble: increases with flow
        p.wobblePhase += 0.009 * lerp(0.20, 3.0, f)
        const lateralRange = coreHW * lerp(0.035, 0.95, f)
        const targetX = Math.sin(p.wobblePhase + p.wobble * 1.15) * lateralRange

        // Micro-motion: subtle random jitter
        p.microMotionX = Math.sin(timeRef.current * 0.3 + p.id * 0.7) * lerp(0.2, 1.8, f)
        p.microMotionY = Math.cos(timeRef.current * 0.25 + p.id * 0.6) * 0.4

        p.x = lerp(p.x, targetX + p.microMotionX, 0.022 + f * 0.09)

        // Hard boundary: keep particles inside core
        const maxX = coreHW * 0.98
        if (Math.abs(p.x) > maxX) {
          p.x = Math.sign(p.x) * maxX
        }

        // Doublet coincidence at high flow
        if (f > 0.55 && !p.isDoublet && Math.random() < coincProb * 0.0038) {
          p.isDoublet = true
          p.doubletOffset = (Math.random() * 12 + 3) * (Math.random() < 0.5 ? 1 : -1)
        }
        if (f < 0.5) p.isDoublet = false

        // Recycle at bottom
        if (p.y > chamberY + chamberH + 32) {
          p.y = chamberY - 12 - Math.random() * 55
          p.x = 0
          p.isDoublet = false
          p.wobble = Math.random() * 2 - 1
          p.wobblePhase = Math.random() * Math.PI * 2
          p.r = 2.8 + Math.random() * 4.2
          p.opacity = 0.74 + Math.random() * 0.26
        }

        const px = cx + p.x
        const py = p.y + p.microMotionY
        drawParticle(ctx, px, py, p.r, p.opacity, f, false)
        if (p.isDoublet) {
          drawParticle(ctx, px + p.doubletOffset, py + 4, p.r * 0.80, p.opacity * 0.74, f, true)
        }
      }

      ctx.restore()

      // Chamber border
      ctx.save()
      ctx.shadowBlur = 26
      ctx.shadowColor = "rgba(0,175,255,0.16)"
      ctx.strokeStyle = "rgba(0,175,255,0.24)"
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.roundRect(chamberX, chamberY, CHAMBER_W, chamberH, 16)
      ctx.stroke()
      ctx.restore()

      // Inlet nozzle
      const nozzleW = lerp(9, CHAMBER_W * 0.52, f)
      const nozzleGrad = ctx.createLinearGradient(cx - nozzleW, 0, cx + nozzleW, 0)
      nozzleGrad.addColorStop(0, "rgba(0,200,230,0)")
      nozzleGrad.addColorStop(0.16, "rgba(0,200,230,0.16)")
      nozzleGrad.addColorStop(0.5, "rgba(0,218,248,0.30)")
      nozzleGrad.addColorStop(0.84, "rgba(0,200,230,0.16)")
      nozzleGrad.addColorStop(1, "rgba(0,200,230,0)")
      ctx.fillStyle = nozzleGrad
      ctx.fillRect(cx - nozzleW, chamberY - 24, nozzleW * 2, 26)

      // Outlet
      const outW = lerp(9, CHAMBER_W * 0.52, f)
      const outGrad = ctx.createLinearGradient(cx - outW, 0, cx + outW, 0)
      outGrad.addColorStop(0, "rgba(0,200,230,0)")
      outGrad.addColorStop(0.16, "rgba(0,200,230,0.12)")
      outGrad.addColorStop(0.5, "rgba(0,218,248,0.24)")
      outGrad.addColorStop(0.84, "rgba(0,200,230,0.12)")
      outGrad.addColorStop(1, "rgba(0,200,230,0)")
      ctx.fillStyle = outGrad
      ctx.fillRect(cx - outW, chamberY + chamberH, outW * 2, 26)

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [dimensions])

  const edu = getEducationalLines(flow)

  return (
    <div style={{
      background: "#050a0f",
      minHeight: "100vh",
      width: "100vw",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Courier New', 'Fira Mono', monospace",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        height: "100vh",
        width: "100%",
        maxWidth: 1020,
        padding: "0 20px",
        gap: 28,
      }}>

        {/* Left: Educational Text */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 8,
          minWidth: 180,
          flex: "0 0 auto",
          transition: "opacity 0.8s ease",
        }}>
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}>
            {edu.lines.map((line, i) => (
              <div
                key={i}
                style={{
                  fontSize: "9px",
                  letterSpacing: "0.13em",
                  color: edu.color,
                  textTransform: "uppercase",
                  textShadow: `0 0 10px ${edu.glowColor}`,
                  fontWeight: i === 0 ? 600 : 400,
                  opacity: 0.88,
                  transition: `color 0.7s ease, text-shadow 0.7s ease`,
                  lineHeight: "1.4",
                }}
              >
                {line}
              </div>
            ))}
          </div>

          <div style={{
            width: 28,
            height: 1,
            background: edu.color,
            opacity: 0.3,
            marginTop: 6,
            transition: "background 0.7s ease",
          }} />

          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 3,
            marginTop: 8,
          }}>
            <span style={{
              fontSize: "7.5px",
              letterSpacing: "0.12em",
              color: "rgba(0,200,230,0.35)",
              textTransform: "uppercase",
            }}>
              Hydrodynamic
            </span>
            <span style={{
              fontSize: "7.5px",
              letterSpacing: "0.12em",
              color: "rgba(0,200,230,0.35)",
              textTransform: "uppercase",
            }}>
              Focusing
            </span>
          </div>
        </div>

        {/* Center: Canvas */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            height: "100vh",
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {dimensions.w > 0 && (
            <canvas
              ref={canvasRef}
              width={dimensions.w}
              height={dimensions.h}
              style={{ display: "block", position: "absolute", inset: 0 }}
            />
          )}
        </div>

        {/* Right: Slider */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          flex: "0 0 auto",
          userSelect: "none",
        }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 8, letterSpacing: "0.16em", color: "rgba(249,115,22,0.58)", textTransform: "uppercase", fontWeight: 500 }}>
              High
            </span>
            <div style={{ width: 1, height: 12, background: "linear-gradient(to bottom, rgba(249,115,22,0.44), transparent)" }} />
          </div>

          <div style={{ position: "relative", height: 380, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              width: 2.5,
              height: "100%",
              borderRadius: 1.5,
              background: "linear-gradient(to bottom, rgba(249,115,22,0.44), rgba(34,211,238,0.44))",
              boxShadow: "0 0 7px rgba(34,211,238,0.10)",
            }} />
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              defaultValue={0.12}
              onChange={handleSlider}
              style={{
                appearance: "none",
                WebkitAppearance: "none",
                writingMode: "vertical-lr",
                direction: "rtl",
                width: 36,
                height: 380,
                background: "transparent",
                cursor: "pointer",
                outline: "none",
                position: "relative",
                zIndex: 2,
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ width: 1, height: 12, background: "linear-gradient(to top, rgba(34,211,238,0.44), transparent)" }} />
            <span style={{ fontSize: 8, letterSpacing: "0.16em", color: "rgba(34,211,238,0.58)", textTransform: "uppercase", fontWeight: 500 }}>
              Low
            </span>
          </div>

          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: "7px", letterSpacing: "0.11em", color: "rgba(125,160,185,0.34)", textTransform: "uppercase" }}>
              Sample Flow
            </span>
            <span style={{ fontSize: "7px", letterSpacing: "0.11em", color: "rgba(125,160,185,0.34)", textTransform: "uppercase" }}>
              Rate
            </span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        position: "fixed",
        bottom: 18,
        left: 24,
        display: "flex",
        gap: 16,
        alignItems: "center",
        userSelect: "none",
      }}>
        <LegendItem color="rgba(3,26,68,1)" border="rgba(0,90,160,0.30)" label="Sheath" />
        <LegendItem color="rgba(0,200,230,0.85)" border="rgba(0,200,230,0.36)" label="Sample" glow="0 0 4px rgba(0,200,230,0.35)" />
        <LegendItem color="rgba(249,115,22,0.85)" border="rgba(249,115,22,0.36)" label="Coincident" />
      </div>

      <style>{`
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #67e8f9, #0891b2);
          box-shadow: 0 0 0 2.5px rgba(34,211,238,0.15), 0 0 16px rgba(34,211,238,0.62);
          cursor: pointer;
          transition: box-shadow 0.2s ease;
          border: 1.5px solid rgba(34,211,238,0.52);
        }
        input[type=range]::-webkit-slider-thumb:hover {
          box-shadow: 0 0 0 4px rgba(34,211,238,0.18), 0 0 24px rgba(34,211,238,0.78);
        }
        input[type=range]::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #67e8f9, #0891b2);
          box-shadow: 0 0 0 2.5px rgba(34,211,238,0.15), 0 0 16px rgba(34,211,238,0.62);
          cursor: pointer;
          border: 1.5px solid rgba(34,211,238,0.52);
        }
        input[type=range]::-webkit-slider-runnable-track { background: transparent; }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  )
}

function LegendItem({
  color, border, label, glow
}: {
  color: string; border: string; label: string; glow?: string
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        width: 8, height: 8, borderRadius: 1.5,
        background: color,
        border: `1px solid ${border}`,
        flexShrink: 0,
        boxShadow: glow,
      }} />
      <span style={{
        fontSize: "7.5px", letterSpacing: "0.1em",
        color: "rgba(125,160,185,0.38)",
        textTransform: "uppercase",
        fontWeight: 400,
      }}>
        {label}
      </span>
    </div>
  )
}
