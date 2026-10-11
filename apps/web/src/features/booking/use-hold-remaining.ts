import { useEffect, useState } from 'react';

/**
 * Counts down to `expiresAt` using the server clock: `serverTime` (from the same response)
 * corrects for any skew between the user's device and the server.
 */
export function useHoldRemaining(
  expiresAt: string | null,
  serverTime: string,
  receivedAt: number,
): number | null {
  const skew = Date.parse(serverTime) - receivedAt;
  const compute = () =>
    expiresAt
      ? Math.max(0, Math.floor((Date.parse(expiresAt) - (Date.now() + skew)) / 1000))
      : null;
  const [remaining, setRemaining] = useState(compute);
  useEffect(() => {
    setRemaining(compute());
    const t = setInterval(() => setRemaining(compute()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt, serverTime, receivedAt]);
  return remaining;
}
