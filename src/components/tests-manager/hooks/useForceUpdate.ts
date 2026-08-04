import { useEffect, useState } from 'react';

// Forces a re-render on every notification from `subscribe`, without needing a referentially
// stable derived value the way `useSyncExternalStore` does — for components (like a section's
// assertion pass counters) whose rendered output depends on several service reads recomputed
// fresh on every notification rather than one cached snapshot.
export function useForceUpdateOn(subscribe: (listener: () => void) => () => void): void {
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick((tick) => tick + 1)), [subscribe]);
}
