import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { localDay } from '@/lib/dates';

/**
 * Today's local day ("YYYY-MM-DD") in `timezone`, kept current: re-checked when the app
 * returns to the foreground and every 30 s while open, so daily tasks reset at midnight.
 */
export function useLocalDay(timezone: string): string {
  const [day, setDay] = useState(() => localDay(timezone));

  useEffect(() => {
    const update = () => setDay(localDay(timezone));
    update();
    const interval = setInterval(update, 30_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') update();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [timezone]);

  return day;
}
