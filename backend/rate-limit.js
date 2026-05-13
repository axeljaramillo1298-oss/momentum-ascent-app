// Policy: { bucket, maxEvents, windowMs }
// Example: { bucket: "ai_generation", maxEvents: 30, windowMs: 3600000 }

function normalizePolicy(policy) {
  const bucket = String((policy && policy.bucket) || "").trim();
  const maxEvents = Math.max(0, Number(policy && policy.maxEvents) || 0);
  const windowMs = Math.max(0, Number(policy && policy.windowMs) || 0);
  if (!bucket) throw new Error("bucket_required");
  if (!maxEvents) throw new Error("max_events_required");
  if (!windowMs) throw new Error("window_ms_required");
  return { bucket, maxEvents, windowMs };
}

async function checkRateLimit(userKey, policy, db) {
  const key = String(userKey || "").trim();
  if (!key) throw new Error("user_key_required");
  if (!db || typeof db.countRateLimitEvents !== "function") {
    throw new Error("db_required");
  }
  const pol = normalizePolicy(policy);
  const count = Number(await db.countRateLimitEvents(key, pol.bucket, pol.windowMs)) || 0;
  if (count >= pol.maxEvents) {
    // Conservative estimate: wait the full window (no per-event timestamps exposed).
    const retryAfterMs = pol.windowMs;
    return {
      allowed: false,
      count,
      max: pol.maxEvents,
      remaining: 0,
      retryAfterMs,
    };
  }
  return {
    allowed: true,
    count,
    max: pol.maxEvents,
    remaining: pol.maxEvents - count,
  };
}

async function enforceRateLimit(userKey, policy, db) {
  const result = await checkRateLimit(userKey, policy, db);
  if (!result.allowed) return result;
  if (typeof db.logRateLimitEvent !== "function") {
    throw new Error("db_log_required");
  }
  await db.logRateLimitEvent(String(userKey).trim(), normalizePolicy(policy).bucket);
  return {
    ...result,
    count: result.count + 1,
    remaining: Math.max(0, result.remaining - 1),
  };
}

function rateLimitMiddleware(policy, getKey, db) {
  const pol = normalizePolicy(policy);
  if (typeof getKey !== "function") {
    throw new Error("get_key_required");
  }
  if (!db || typeof db.countRateLimitEvents !== "function") {
    throw new Error("db_required");
  }
  return async function rateLimitHandler(req, res, next) {
    try {
      const key = String(getKey(req) || "").trim();
      if (!key) {
        return res.status(400).json({ ok: false, error: "rate_limit_key_missing" });
      }
      const result = await enforceRateLimit(key, pol, db);
      res.setHeader("X-RateLimit-Limit", String(pol.maxEvents));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(0, result.remaining)));
      if (!result.allowed) {
        res.setHeader("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
        return res.status(429).json({
          ok: false,
          error: "rate_limited",
          retryAfterMs: result.retryAfterMs,
          limit: pol.maxEvents,
          windowMs: pol.windowMs,
        });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { checkRateLimit, enforceRateLimit, rateLimitMiddleware };
