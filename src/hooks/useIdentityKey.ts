import { useState } from 'react';

/**
 * Returns a counter that increments whenever `value`'s identity changes.
 * Useful as a React `key` to remount stateful children (e.g. reset a feedback
 * form) when a new result object arrives. Uses the documented
 * "storing information from previous renders" pattern (setState during render
 * is scoped to this component and React re-renders immediately).
 */
export function useIdentityKey(value: unknown) {
  const [tracker, setTracker] = useState({ value, key: 0 });

  if (tracker.value !== value) {
    setTracker({ value, key: tracker.key + 1 });
    return tracker.key + 1;
  }

  return tracker.key;
}
