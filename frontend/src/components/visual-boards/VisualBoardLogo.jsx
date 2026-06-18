import React from "react";
import { publicAssetUrl } from "../../lib/assetUrl";

/**
 * AssetIQ wordmark for visual management board headers.
 */
export default function VisualBoardLogo({ theme = "light", className = "" }) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const useText = theme === "dark" || imageFailed;

  if (useText) {
    return (
      <div
        className={`font-bold text-4xl sm:text-5xl tracking-tight select-none ${className}`}
        aria-label="AssetIQ"
      >
        <span className={theme === "light" ? "text-slate-900" : "text-white"}>Asset</span>
        <span className={theme === "light" ? "text-blue-600" : "text-blue-400"}>IQ</span>
      </div>
    );
  }

  return (
    <img
      src={publicAssetUrl("/assetiq-wordmark.png")}
      alt="AssetIQ"
      className={`h-14 sm:h-16 w-auto object-contain select-none ${className}`}
      onError={() => setImageFailed(true)}
    />
  );
}
