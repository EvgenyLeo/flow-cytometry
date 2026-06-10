import { useState } from "react"

export default function OpticsScene() {
  const [cellsEnabled, setCellsEnabled] = useState(true)
  const [laserEnabled, setLaserEnabled] = useState(true)
  const [fscEnabled, setFscEnabled] = useState(true)
  const [sscEnabled, setSscEnabled] = useState(true)

  const cells = [0, 1, 2, 3, 4]

  return (
    <div className="relative mt-16 flex min-h-[720px]">
      {/* LEFT CONTROL PANEL */}
      <div
        className="
          relative
          z-20
          w-[320px]
          rounded-[28px]
          border
          border-white/10
          bg-black/30
          p-7
          backdrop-blur-xl
        "
      >
        <div
          className="
            mb-8
            font-['Orbitron']
            text-[18px]
            tracking-[0.24em]
            text-cyan-100
          "
        >
          OPTICS COMPONENTS
        </div>

        {/* TOGGLES */}
        <div className="space-y-5">
          <Toggle
            title="Cells"
            subtitle="Fluidic stream"
            enabled={cellsEnabled}
            setEnabled={setCellsEnabled}
            color="cyan"
          />

          <Toggle
            title="Laser"
            subtitle="488 nm excitation"
            enabled={laserEnabled}
            setEnabled={setLaserEnabled}
            color="blue"
          />

          <Toggle
            title="FSC Detector"
            subtitle="Forward scatter"
            enabled={fscEnabled}
            setEnabled={setFscEnabled}
            color="green"
          />

          <Toggle
            title="SSC Detector"
            subtitle="Side scatter"
            enabled={sscEnabled}
            setEnabled={setSscEnabled}
            color="purple"
          />
        </div>

        {/* INFO */}
        <div
          className="
            mt-8
            rounded-2xl
            border
            border-cyan-500/10
            bg-cyan-500/5
            p-5
          "
        >
          <div className="text-[13px] leading-[1.9] text-cyan-100/58">
            Enable components to explore how lasers and detectors interact
            with flowing cells inside the optical chamber.
          </div>
        </div>
      </div>

      {/* MAIN SCENE */}
      <div className="relative flex-1">
        {/* FLOW CHANNEL */}
        <div
          className="
            absolute
            left-[240px]
            top-[80px]
            h-[540px]
            w-[84px]
            rounded-full
            border
            border-cyan-400/20
            bg-cyan-300/5
            shadow-[0_0_80px_rgba(0,255,255,0.08)]
          "
        />

        {/* FLOW */}
        <div
          className="
            absolute
            left-[277px]
            top-[40px]
            h-[620px]
            w-[10px]
            bg-gradient-to-b
            from-cyan-200/0
            via-cyan-200/30
            to-cyan-200/0
            blur-sm
          "
        />

        {/* CELLS */}
        {cellsEnabled &&
          cells.map((cell, index) => (
            <div
              key={cell}
              className="
                absolute
                left-[252px]
                h-[34px]
                w-[34px]
                rounded-full
                border
                border-cyan-100/30
                bg-cyan-100/10
                backdrop-blur-md
              "
              style={{
                top: `${120 + index * 100}px`,
                animation: `cellFlow ${6 + index}s linear infinite`,
              }}
            >
              <div
                className="
                  absolute
                  inset-[7px]
                  rounded-full
                  bg-fuchsia-300/20
                "
              />
            </div>
          ))}

        {/* LASER */}
        {laserEnabled && (
          <>
            {/* beam */}
            <div
              className="
                absolute
                left-[40px]
                top-[345px]
                h-[4px]
                w-[290px]
                rounded-full
                bg-cyan-300
                shadow-[0_0_24px_rgba(0,255,255,0.9)]
              "
            />

            {/* laser source glow */}
            <div
              className="
                absolute
                left-[18px]
                top-[327px]
                h-[40px]
                w-[40px]
                rounded-full
                bg-cyan-300/20
                blur-xl
              "
            />
          </>
        )}

        {/* INTERACTION BURST */}
        {laserEnabled && cellsEnabled && (
          <>
            {/* FSC scatter */}
            <div
              className="
                absolute
                left-[360px]
                top-[337px]
                h-[6px]
                w-[240px]
                rounded-full
                bg-green-300/70
                blur-[1px]
                shadow-[0_0_24px_rgba(120,255,120,0.7)]
              "
            />

            {/* SSC scatter */}
            <div
              className="
                absolute
                left-[345px]
                top-[352px]
                h-[120px]
                w-[2px]
                rotate-[-55deg]
                rounded-full
                bg-fuchsia-400
                shadow-[0_0_22px_rgba(255,0,255,0.9)]
              "
            />
          </>
        )}

        {/* FSC DETECTOR */}
        {fscEnabled && (
          <>
            {/* beam stop */}
            <div
              className="
                absolute
                left-[530px]
                top-[290px]
                h-[120px]
                w-[10px]
                rounded-full
                bg-white/30
              "
            />

            {/* detector */}
            <div
              className="
                absolute
                left-[620px]
                top-[305px]
                h-[90px]
                w-[90px]
                rounded-full
                border
                border-green-300/30
                bg-green-300/10
                shadow-[0_0_40px_rgba(120,255,120,0.25)]
              "
            />

            <div
              className="
                absolute
                left-[620px]
                top-[410px]
                text-[14px]
                tracking-[0.12em]
                text-green-200/70
              "
            >
              FSC
            </div>
          </>
        )}

        {/* SSC DETECTOR */}
        {sscEnabled && (
          <>
            <div
              className="
                absolute
                left-[520px]
                top-[470px]
                h-[82px]
                w-[82px]
                rounded-full
                border
                border-fuchsia-300/30
                bg-fuchsia-300/10
                shadow-[0_0_40px_rgba(255,0,255,0.2)]
              "
            />

            <div
              className="
                absolute
                left-[515px]
                top-[565px]
                text-[14px]
                tracking-[0.12em]
                text-fuchsia-200/70
              "
            >
              SSC
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* TOGGLE COMPONENT */

type ToggleProps = {
  title: string
  subtitle: string
  enabled: boolean
  setEnabled: (value: boolean) => void
  color: string
}

function Toggle({
  title,
  subtitle,
  enabled,
  setEnabled,
}: ToggleProps) {
  return (
    <button
      onClick={() => setEnabled(!enabled)}
      className="
        flex
        w-full
        items-center
        justify-between
        rounded-2xl
        border
        border-white/8
        bg-white/[0.03]
        px-5
        py-4
        transition-all
        hover:border-cyan-300/20
      "
    >
      <div className="text-left">
        <div className="text-[17px] text-white/92">{title}</div>

        <div className="mt-1 text-[13px] text-white/40">
          {subtitle}
        </div>
      </div>

      <div
        className={`
          relative h-[26px] w-[48px] rounded-full transition-all
          ${enabled ? "bg-cyan-300/80" : "bg-white/10"}
        `}
      >
        <div
          className={`
            absolute top-[3px] h-[20px] w-[20px]
            rounded-full bg-white transition-all
            ${enabled ? "left-[25px]" : "left-[3px]"}
          `}
        />
      </div>
    </button>
  )
}