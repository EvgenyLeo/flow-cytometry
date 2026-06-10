import Navigation from "../components/Navigation"
import heroImage from "../assets/hero-cytometry.png"

type HomePageProps = {
  setCurrentPage: (page: string) => void
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
        </div>
      </main>
    </div>
  )
}