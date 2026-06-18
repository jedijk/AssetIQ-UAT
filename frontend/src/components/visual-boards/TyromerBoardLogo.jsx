import React from "react";
import { publicAssetUrl } from "../../lib/assetUrl";

/**
 * Tyromer wordmark for operations visual boards (top-right header).
 */
export default function TyromerBoardLogo({
  className = "",
  heightPx = 32,
  transparentBackground = true,
  theme = "light",
}) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const transparentClass = transparentBackground ? "bg-transparent" : "";
  const blendStyle =
    transparentBackground && theme === "light" && !imageFailed
      ? { mixBlendMode: "multiply" }
      : undefined;

  if (imageFailed) {
    return (
      <div
        className={`font-bold tracking-tight text-slate-900 select-none leading-none ${transparentClass} ${className}`}
        style={{ fontSize: `${Math.round(heightPx * 0.65)}px` }}
        aria-label="Tyromer"
      >
        Tyromer
      </div>
    );
  }

  return (
    <img
      src={publicAssetUrl("/tyromer-logo.png")}
      alt="Tyromer"
      className={`w-auto object-contain select-none ${transparentClass} ${className}`}
      style={{ height: `${heightPx}px`, background: "transparent", ...blendStyle }}
      onError={() => setImageFailed(true)}
    />
  );
}
