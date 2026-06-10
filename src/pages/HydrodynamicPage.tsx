import Navigation from "../components/Navigation"
import HydrodynamicSimulation from "../HydrodynamicSimulation"

type HydrodynamicPageProps = {
  setCurrentPage: (page: string) => void
}

export default function HydrodynamicPage({
  setCurrentPage,
}: HydrodynamicPageProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      {/* Background atmosphere */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div
          className="
            absolute
            inset-0
            bg-[radial-gradient(circle_at_top,#04131d_0%,#02070b_45%,#000000_100%)]
          "
        />

        <div
          className="
            absolute
            top-[-12%]
            right-[6%]
            w-[1200px]
            h-[1200px]
            rounded-full
            bg-sky-500/10
            blur-3xl
          "
        />

        <div
          className="
            absolute
            bottom-[-25%]
            left-[-10%]
            w-[900px]
            h-[900px]
            rounded-full
            bg-cyan-500/10
            blur-3xl
          "
        />
      </div>

      <Navigation setCurrentPage={setCurrentPage} />

      {/* Simulation */}
      <main className="relative z-20 pt-24">
        <HydrodynamicSimulation />
      </main>
    </div>
  )
}