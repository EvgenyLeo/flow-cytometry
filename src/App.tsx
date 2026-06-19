import { useState } from "react"

import HomePage from "./pages/HomePage"
import ScatterDetectionPage from "./pages/ScatterDetectionPage"
import FluorescenceDetectionPage from "./pages/FluorescenceDetectionPage"
import HydrodynamicPage from "./pages/HydrodynamicPage"

export default function App() {
  const [currentPage, setCurrentPage] = useState("home")

  if (currentPage === "scatter") {
    return (
      <ScatterDetectionPage setCurrentPage={setCurrentPage} />
    )
  }

  if (currentPage === "fluorescence") {
    return (
      <FluorescenceDetectionPage setCurrentPage={setCurrentPage} />
    )
  }

  if (currentPage === "hydrodynamic") {
    return (
      <HydrodynamicPage setCurrentPage={setCurrentPage} />
    )
  }

  return (
    <HomePage setCurrentPage={setCurrentPage} />
  )
}
