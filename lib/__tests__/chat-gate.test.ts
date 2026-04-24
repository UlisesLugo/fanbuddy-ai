import { checkGate } from '../api/chat-gate';

describe('checkGate', () => {
  const base = { phone_verified: true, plan: 'free' as const, trips_used: 0 };

  it('blocks when phone is not verified', () => {
    expect(checkGate({ ...base, phone_verified: false })).toEqual({
      allowed: false,
      error: 'phone_unverified',
    });
  });

  it('allows free user with 0 trips used', () => {
    expect(checkGate(base)).toEqual({ allowed: true });
  });

  it('allows free user with 2 trips used', () => {
    expect(checkGate({ ...base, trips_used: 2 })).toEqual({ allowed: true });
  });

  it('blocks free user at 3 trips used', () => {
    expect(checkGate({ ...base, trips_used: 3 })).toEqual({
      allowed: false,
      error: 'upgrade_required',
    });
  });

  it('allows paid user even at 10 trips used', () => {
    expect(checkGate({ ...base, plan: 'paid', trips_used: 10 })).toEqual({
      allowed: true,
    });
  });

  it('phone check runs before trip limit check', () => {
    expect(checkGate({ phone_verified: false, plan: 'paid', trips_used: 0 })).toEqual({
      allowed: false,
      error: 'phone_unverified',
    });
  });
});
