CREATE TABLE IF NOT EXISTS referrals (
  code TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referrals_owner ON referrals(owner_email);

CREATE TABLE IF NOT EXISTS referral_uses (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  referred_email TEXT NOT NULL,
  referrer_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reward_applied BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_referral_uses_referrer ON referral_uses(referrer_email);
CREATE INDEX IF NOT EXISTS idx_referral_uses_referred ON referral_uses(referred_email);
