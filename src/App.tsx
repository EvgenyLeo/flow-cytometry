import { useState } from "react"

import HomePage from "./pages/HomePage"
import OpticsPage from "./pages/OpticsPage"

import HydrodynamicPage from "./pages/HydrodynamicPage"

export default function App() {
  const [currentPage, setCurrentPage] = useState("home")

  if (currentPage === "optics") {
    return (
      <OpticsPage setCurrentPage={setCurrentPage} />
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