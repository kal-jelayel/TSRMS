"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { contingency } from "./contingency.mjs";
import { fetchSupabaseAppSnapshot } from "./appDataSync";

const serverState = { status: "unavailable", snapshot: null, refreshedAt: null, error: "", busy: false };

export function useContingency(user) {
  const state = useSyncExternalStore(contingency.subscribe, contingency.getState, () => serverState);
  const owner = user ? JSON.stringify([user.id, user.username, user.role]) : null;
  const refresh = useCallback(() => contingency.loadWithContingency(user, fetchSupabaseAppSnapshot), [user]);
  useEffect(() => {
    // The initial null render on route navigation must not erase the user's cache.
    // Logout explicitly clears it; a different non-null account replaces its scope.
    if (user) contingency.setUser(user);
    const offline = () => contingency.setOffline(true);
    const online = () => contingency.setOffline(false);
    contingency.setOffline(!navigator.onLine);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, [user]);
  return { ...(owner && owner === contingency.getScope() ? state : serverState), refresh };
}
