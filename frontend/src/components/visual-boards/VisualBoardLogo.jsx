import React from "react";
import { publicAssetUrl } from "../../lib/assetUrl";

/**
 * AssetIQ wordmark for visual management board headers.
 */
export default function VisualBoardLogo({
  theme = "light",
  className = "",
  heightPx = 56,
  transparentBackground = true,
}) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const useText = theme === "dark" || imageFailed;
  const transparentClass = transparentBackground ? "bg-transparent" : "";
  const blendStyle =
    transparentBackground && theme === "light" && !useText
      ? { mixBlendMode: "multiply" }
      : undefined;

  if (useText) {
    return (
      <div
        className={`font-bold tracking-tight select-none leading-none ${transparentClass} ${className}`}
        style={{ fontSize: `${Math.round(heightPx * 0.65)}px` }}
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
      className={`w-auto object-contain select-none ${transparentClass} ${className}`}
      style={{ height: `${heightPx}px`, background: "transparent", ...blendStyle }}
      onError={() => setImageFailed(true)}
    />
  );
}
