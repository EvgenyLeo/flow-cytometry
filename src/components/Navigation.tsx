type NavigationProps = {
    setCurrentPage: (page: string) => void
  }
  
  export default function Navigation({
    setCurrentPage,
  }: NavigationProps) {
    return (
      <header className="relative z-30 flex items-start justify-between px-12 pt-8">
        {/* Logo */}
        <button
          onClick={() => setCurrentPage("home")}
          className="text-left"
        >
          <div
            className="
              font-['Orbitron']
              text-[22px]
              tracking-[0.34em]
              text-cyan-50
              transition-opacity
              hover:opacity-80
            "
          >
            FLOW CYTOMETRY
          </div>
  
          <div
            className="
              mt-2
              text-[13px]
              tracking-[0.24em]
              lowercase
              text-cyan-300
            "
          >
            interactive learning platform
          </div>
        </button>
  
        {/* Navigation */}
        <nav
          className="
            flex
            items-center
            gap-12
            pt-1
            text-[14px]
            tracking-[0.16em]
            text-cyan-100/72
          "
        >
          {/* Cell Journey */}
          <button
            onClick={() => setCurrentPage("cell")}
            className="
              relative
              transition-all
              hover:text-cyan-50
              after:absolute
              after:left-0
              after:-bottom-2
              after:h-[1px]
              after:w-0
              after:bg-cyan-300
              after:transition-all
              hover:after:w-full
            "
          >
            Cell Journey
          </button>
  
          {/* Hydrodynamic */}
          <button
            onClick={() => setCurrentPage("hydrodynamic")}
            className="
              relative
              transition-all
              hover:text-sky-100
              after:absolute
              after:left-0
              after:-bottom-2
              after:h-[1px]
              after:w-0
              after:bg-sky-300
              after:transition-all
              hover:after:w-full
            "
          >
            Hydrodynamic Focusing
          </button>
  
          {/* Optics */}
          <button
            onClick={() => setCurrentPage("optics")}
            className="
              relative
              transition-all
              hover:text-fuchsia-100
              after:absolute
              after:left-0
              after:-bottom-2
              after:h-[1px]
              after:w-0
              after:bg-fuchsia-300
              after:transition-all
              hover:after:w-full
            "
          >
            Optics & Detection
          </button>
  
          {/* Resources */}
          <button
            onClick={() => setCurrentPage("resources")}
            className="
              relative
              transition-all
              hover:text-orange-100
              after:absolute
              after:left-0
              after:-bottom-2
              after:h-[1px]
              after:w-0
              after:bg-orange-300
              after:transition-all
              hover:after:w-full
            "
          >
            Learning Resources
          </button>
        </nav>
      </header>
    )
  }