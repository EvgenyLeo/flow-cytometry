import Navigation from "../components/Navigation"
import { ScatterDetection } from "../components/ScatterDetection"

type ScatterDetectionPageProps = {
  setCurrentPage: (page: string) => void
}

export default function ScatterDetectionPage({
  setCurrentPage,
}: ScatterDetectionPageProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <div
          className="
            absolute
            inset-0
            bg-[radial-gradient(circle_at_top,#13041d_0%,#06020b_45%,#000000_100%)]
          "
        />

        <div
          className="
            absolute
            top-[-10%]
            right-[5%]
            w-[1000px]
            h-[1000px]
            rounded-full
            bg-fuchsia-500/10
            blur-3xl
          "
        />

        <div
          className="
            absolute
            bottom-[-20%]
            left-[10%]
            w-[700px]
            h-[700px]
            rounded-full
            bg-cyan-500/10
            blur-3xl
          "
        />
      </div>

      <Navigation setCurrentPage={setCurrentPage} />

      <main className="relative z-20 px-12 pt-[110px]">
        {/* Intro */}
        <div className="max-w-[760px]">
          <p className="text-[15px] leading-[2] text-cyan-100/60">
            Flow cytometry uses lasers, optical filters and detectors to
            measure physical and fluorescent properties of individual cells
            moving through a focused fluid stream.
          </p>
        </div>

        {/* Interactive scatter detection scene */}
        <ScatterDetection />
      </main>
    </div>
  )
}
