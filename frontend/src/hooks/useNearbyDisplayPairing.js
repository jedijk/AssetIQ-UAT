import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { displayDeviceAPI } from "../lib/apis/displayDeviceAPI";
import { detectLocalSubnet, isPairingDismissed } from "../lib/localNetwork";
import { isPublicKioskPath } from "../lib/publicRoutes";

const POLL_MS = 6000;

/**
 * Poll for pending display pairings on the same network as this browser session.
 */
export function useNearbyDisplayPairing({ enabled }) {
  const location = useLocation();
  const [nearby, setNearby] = useState(null);
  const subnetRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      setNearby(null);
      return undefined;
    }

    if (isPublicKioskPath(location.pathname)) {
      setNearby(null);
      return undefined;
    }

    if (location.pathname.includes("/visual-management/pair-displays")) {
      setNearby(null);
      return undefined;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        if (!subnetRef.current) {
          subnetRef.current = await detectLocalSubnet();
        }
        const data = await displayDeviceAPI.listNearbyPairings(subnetRef.current);
        if (cancelled) return;
        const candidate = (data?.items || []).find(
          (item) => item?.pairing_id && !isPairingDismissed(item.pairing_id),
        );
        setNearby(candidate || null);
      } catch {
        if (!cancelled) setNearby(null);
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, location.pathname]);

  const dismiss = (pairingId) => {
    if (nearby?.pairing_id === pairingId) {
      setNearby(null);
    }
  };

  return { nearby, dismiss };
}

export default useNearbyDisplayPairing;
