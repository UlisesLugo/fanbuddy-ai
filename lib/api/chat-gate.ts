export type GateError = 'phone_unverified' | 'upgrade_required';

export interface GateResult {
  allowed: boolean;
  error?: GateError;
}

export function checkGate(user: {
  phone_verified: boolean;
  plan: string;
  trips_used: number;
}): GateResult {
  if (!user.phone_verified) {
    return { allowed: false, error: 'phone_unverified' };
  }
  if (user.plan !== 'paid' && user.trips_used >= 3) {
    return { allowed: false, error: 'upgrade_required' };
  }
  return { allowed: true };
}
