import React from "react";
import { RotateCcw } from "lucide-react";

/**
 * LandscapeBlocker - Shows a message when mobile users rotate to landscape
 * This component is always rendered but only visible via CSS media query
 * when orientation is landscape on mobile devices.
 */
const LandscapeBlocker = () => {
  return (
    <div className="landscape-blocker" data-testid="landscape-blocker">
      <RotateCcw className="rotate-icon text-white" strokeWidth={1.5} />
      <h2>Please Rotate Your Device</h2>
      <p>This app is optimized for portrait mode. Please rotate your device to continue.</p>
    </div>
  );
};

export default LandscapeBlocker;
