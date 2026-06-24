import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { displayDeviceAPI } from "../lib/apis/displayDeviceAPI";
import { detectLocalSubnet, isPairingDismissed } from "../lib/localNetwork";
import { mergeNearbyPairing } from "../lib/nearbyDisplayPairingUtils";
import { isPublicKioskPath } from "../lib/publicRoutes";

const POLL_MS = 6000;
/** Consecutive empty polls before hiding a previously seen TV (avoids flicker). */
const EMPTY_CLEAR_POLLS = 2;

/**
 * Poll for pending display pairings on the same network as this browser session.
 */
export function useNearbyDisplayPairing({ enabled }) {
  const location = useLocation();
  const [nearby, setNearby] = useState(null);
  const subnetRef = useRef(null);
  const emptyPollStreakRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setNearby(null);
      emptyPollStreakRef.current = 0;
      return undefined;
    }

    if (isPublicKioskPath(location.pathname)) {
      setNearby(null);
      emptyPollStreakRef.current = 0;
      return undefined;
    }

    if (location.pathname.includes("/visual-management/pair-displays")) {
      setNearby(null);
      emptyPollStreakRef.current = 0;
      return undefined;
    }

    let cancelled = false;
    let endpointUnavailable = false;

    const poll = async () => {
      if (endpointUnavailable) return;
      try {
        if (!subnetRef.current) {
          subnetRef.current = await detectLocalSubnet();
        }
        const data = await displayDeviceAPI.listNearbyPairings(subnetRef.current);
        if (cancelled) return;
        const candidate = (data?.items || []).find(
          (item) => item?.pairing_id && !isPairingDismissed(item.pairing_id),
        );
        if (candidate) {
          emptyPollStreakRef.current = 0;
          setNearby((previous) => mergeNearbyPairing(previous, candidate));
          return;
        }
        emptyPollStreakRef.current += 1;
        if (emptyPollStreakRef.current >= EMPTY_CLEAR_POLLS) {
          setNearby(null);
        }
      } catch (err) {
        if (err?.response?.status === 404) {
          endpointUnavailable = true;
          return;
        }
        /* Keep last known pairing — transient network/API errors should not hide the prompt. */
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
