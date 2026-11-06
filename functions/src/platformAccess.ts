/** Platform access is independent of legacy subscription and balance records. */
export function platformAccess() {
  return { allowed: true, trial: false, cost: 0, billingEnabled: false } as const;
}
