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
        className={`font-bold text-xl sm:text-2xl tracking-tight select-none ${className}`}
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
      className={`h-7 sm:h-8 w-auto object-contain select-none ${className}`}
      onError={() => setImageFailed(true)}
    />
  );
}
