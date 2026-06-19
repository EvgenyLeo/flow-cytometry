import Navigation from "../components/Navigation"
import heroImage from "../assets/hero-cytometry.png"

type HomePageProps = {
  setCurrentPage: (page: string) => void
}

type ModuleBlockProps = {
  title: string
  subtitle: string
  onClick: () => void
  accent: string
  hoverText: string
  hoverLine: string
}

function ModuleBlock({
  title,
  subtitle,
  onClick,
  accent,
  hoverText,
  hoverLine,
}: ModuleBlockProps) {
  return (
    <button
      onClick={onClick}
      className={`
        group
        relative
        w-full
        rounded-[22px]
        border
        border-white/10
        bg-white/[0.03]
        px-6
        py-5
        text-left
        backdrop-blur-sm
        transition-all
        hover:border-white/20
        hover:bg-white/[0.05]
        ${hoverText}
      `}
    >
      <div
        className="absolute inset-x-6 top-0 h-px opacity-60"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <div
        className="font-['Orbitron'] text-[13px] tracking-[0.18em] uppercase"
        style={{ color: accent }}>
        {title}
      </div>
      <div className="mt-2 text-[12px] leading-relaxed text-cyan-100/45">
        {subtitle}
      </div>
      <div
        className={`
          mt-4
          h-px
          w-0
          transition-all
          duration-300
          group-hover:w-full
          ${hoverLine}
        `}
      />
    </button>
  )
}

export default function HomePage({
  setCurrentPage,
}: HomePageProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      {/* Atmosphere */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {/* Base background */}
        <div
          className="
            absolute
            inset-0
            bg-[radial-gradient(circle_at_top,#04131d_0%,#02070b_45%,#000000_100%)]
          "
        />

        {/* Cyan glow */}
        <div
          className="
            absolute
            top-[-12%]
            right-[6%]
            w-[1200px]
            h-[1200px]
            rounded-full
            bg-cyan-500/10
            blur-3xl
          "
          style={{
            animation: "driftCyan 18s ease-in-out infinite",
          }}
        />

        {/* Purple glow */}
        <div
          className="
            absolute
            bottom-[-25%]
            left-[-10%]
            w-[900px]
            h-[900px]
            rounded-full
            bg-fuchsia-500/10
            blur-3xl
          "
          style={{
            animation: "driftPurple 24s ease-in-out infinite",
          }}
        />

        {/* Artwork */}
        <img
          src={heroImage}
          alt="Flow cytometry visualization"
          className="
            absolute
            right-[-6%]
            top-[-2%]
            h-[110%]
            w-auto
            max-w-none
            object-cover
            opacity-90
            mix-blend-screen
            pointer-events-none
            select-none
          "
          style={{
            transform: "scale(1.025)",
            animation: "floatHero 24s ease-in-out infinite",
          }}
          draggable={false}
        />

        {/* Left fade */}
        <div
          className="
            absolute
            inset-y-0
            left-0
            w-[62%]
            bg-gradient-to-r
            from-black
            via-black/92
            to-transparent
          "
        />
      </div>

      <Navigation setCurrentPage={setCurrentPage} />

      {/* Hero text */}
      <main className="relative z-20 flex min-h-screen items-start px-12 pt-[22vh]">
        <div className="max-w-[500px]">
          <div className="space-y-11">
            <p className="text-[18px] leading-[2.25] text-cyan-50/84">
              Emerging in the mid-20th century, flow cytometry evolved into
              one of the most versatile analytical technologies in biology
              and medicine.
            </p>

            <p className="text-[18px] leading-[2.25] text-cyan-100/58">
              This platform explores the core principles behind modern
              cytometry through interactive visual simulations.
            </p>
          </div>

          {/* Learning modules */}
          <div className="relative mt-16 w-[420px]">
            <svg
              className="pointer-events-none absolute left-[calc(50%-1px)] top-1/2 h-px w-[calc(100%-200px)] -translate-x-1/2 -translate-y-1/2 overflow-visible"
              viewBox="0 0 220 2"
              fill="none"
              preserveAspectRatio="none"
              aria-hidden="true">
              <path
                d="M 0 1 L 220 1"
                stroke="rgba(34, 211, 238, 0.22)"
                strokeWidth="1"
                strokeDasharray="4 6"
              />
            </svg>

            <div className="relative grid grid-cols-2 gap-4">
              <ModuleBlock
                title="Scatter Detection"
                subtitle="Forward and side scatter measurement"
                onClick={() => setCurrentPage("scatter")}
                accent="#e879f9"
                hoverText="hover:text-fuchsia-100"
                hoverLine="bg-fuchsia-300/70"
              />
              <ModuleBlock
                title="Fluorescence Detection"
                subtitle="Fluorochrome excitation and emission"
                onClick={() => setCurrentPage("fluorescence")}
                accent="#a78bfa"
                hoverText="hover:text-violet-100"
                hoverLine="bg-violet-300/70"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}