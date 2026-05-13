// backend/line-movement.js
// Line movement detection: compare odds snapshots vs current odds, flag significant moves.

function detectSignificantMove({ oldOdds, newOdds, threshold = 0.10 } = {}) {
  const a = Number(oldOdds);
  const b = Number(newOdds);
  const thr = Math.max(0, Number(threshold) || 0);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) {
    return { significant: false, pctChange: 0, error: "invalid_odds" };
  }
  const pctChange = (b - a) / a;
  const abs = Math.abs(pctChange);
  if (abs >= thr) {
    return {
      significant: true,
      direction: pctChange > 0 ? "up" : "down",
      pctChange,
    };
  }
  return { significant: false, pctChange };
}

// Compare current odds against latest stored snapshot for a pick.
// If db provided and has getLatestOddsSnapshot, fetches snapshot and computes movement.
async function compareOddsForPick(pickId, currentOdds, { db, threshold = 0.10 } = {}) {
  const pid = Number(pickId || 0);
  const curr = Number(currentOdds);
  if (!pid) return { error: "pick_id_required" };
  if (!Number.isFinite(curr) || curr <= 0) return { error: "invalid_current_odds" };

  let snapshot = null;
  if (db && typeof db.getLatestOddsSnapshot === "function") {
    try {
      snapshot = await db.getLatestOddsSnapshot(pid);
    } catch (err) {
      return { error: String(err.message || err) };
    }
  }
  if (!snapshot) {
    return { snapshot: null, currentOdds: curr, change: { significant: false, pctChange: 0, reason: "no_snapshot" } };
  }
  const change = detectSignificantMove({ oldOdds: snapshot.odds, newOdds: curr, threshold });
  return { snapshot, currentOdds: curr, change };
}

module.exports = {
  detectSignificantMove,
  compareOddsForPick,
};
