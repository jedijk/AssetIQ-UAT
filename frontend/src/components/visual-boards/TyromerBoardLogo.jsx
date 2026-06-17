import React from "react";
import { publicAssetUrl } from "../../lib/assetUrl";

/**
 * Tyromer wordmark for operations visual boards (top-right header).
 */
export default function TyromerBoardLogo({ className = "" }) {
  const [imageFailed, setImageFailed] = React.useState(false);

  if (imageFailed) {
    return (
      <div
        className={`font-bold text-lg sm:text-xl tracking-tight text-slate-900 select-none ${className}`}
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
      className={`h-7 sm:h-8 w-auto object-contain select-none ${className}`}
      onError={() => setImageFailed(true)}
    />
  );
}
