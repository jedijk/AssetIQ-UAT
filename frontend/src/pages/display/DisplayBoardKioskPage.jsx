import React, { useState } from "react";
import DisplayBoardImagePage from "./DisplayBoardImagePage";
import DisplayBoardPage from "./DisplayBoardPage";

/**
 * TV kiosk board route — prefer static snapshot images; fall back to live canvas
 * when no snapshot exists yet (e.g. board not republished after deploy).
 */
export default function DisplayBoardKioskPage() {
  const [mode, setMode] = useState("snapshot");

  if (mode === "canvas") {
    return <DisplayBoardPage />;
  }

  return <DisplayBoardImagePage onFallbackToCanvas={() => setMode("canvas")} />;
}
