// backend/cron-jobs.js
// Simple cron scheduler usando setInterval (sin deps).
// - Daily summary @ 23:00 CDMX (notifyDailyResults)
// - Streak alert hourly (notifyStreakAlert si racha perdedora >=3)

function startCronJobs({ notifications, db, listPickHistory, toDateKey, matchesDateKey } = {}) {
  if (!notifications) {
    console.warn("[cron-jobs] missing notifications module — not starting");
    return { stop() {} };
  }
  if (typeof listPickHistory !== "function") {
    console.warn("[cron-jobs] missing listPickHistory — not starting");
    return { stop() {} };
  }
  if (typeof matchesDateKey !== "function") {
    matchesDateKey = (value, dateKey) => {
      if (!value || !dateKey) return false;
      try {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return false;
        const key = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Mexico_City",
          year: "numeric", month: "2-digit", day: "2-digit",
        }).format(d);
        return key === dateKey;
      } catch (_) { return false; }
    };
  }

  const jobs = [];
  let lastDailyKey = "";
  let lastStreakNotified = null;

  // ─── Daily summary check (every 1 min, fires once at 23:00 CDMX) ───────────
  const dailyCheck = async () => {
    try {
      const now = new Date();
      const cdmxHour = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Mexico_City",
          hour: "numeric",
          hour12: false,
        }).format(now)
      );
      const todayKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Mexico_City",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
      if (cdmxHour === 23 && lastDailyKey !== todayKey) {
        lastDailyKey = todayKey;
        const allPicks = await listPickHistory(500);
        const todayPicks = allPicks.filter((p) => matchesDateKey(p.eventDate, todayKey));
        const won = todayPicks.filter((p) => p.result === "won").length;
        const lost = todayPicks.filter((p) => p.result === "lost").length;
        const pending = todayPicks.filter((p) => !p.result).length;
        const resolved = won + lost;
        const winRate = resolved ? Math.round((won / resolved) * 100) : null;
        await notifications.notifyDailyResults(
          {
            date: todayKey,
            totalPicks: todayPicks.length,
            won,
            lost,
            pending,
            winRate,
            topPicks: todayPicks.slice(0, 3),
          },
          { db }
        );
        console.log(`[cron-jobs] daily summary sent for ${todayKey}`);
      }
    } catch (err) {
      console.error("[cron daily]", err.message || err);
    }
  };
  jobs.push(setInterval(dailyCheck, 60 * 1000));

  // ─── Streak alert (every 1 hour) ───────────────────────────────────────────
  const streakCheck = async () => {
    try {
      const allPicks = await listPickHistory(50);
      const resolved = allPicks.filter((p) => p.result === "won" || p.result === "lost");
      if (!resolved.length) return;
      const first = resolved[0].result;
      let count = 0;
      for (const p of resolved) {
        if (p.result === first) count += 1;
        else break;
      }
      if (first === "lost" && count >= 3) {
        const key = `${first}-${count}-${resolved[0].id}`;
        if (lastStreakNotified !== key) {
          lastStreakNotified = key;
          await notifications.notifyStreakAlert({ type: "lost", count }, { db });
          console.log(`[cron-jobs] streak alert sent (${count} losses)`);
        }
      }
    } catch (err) {
      console.error("[cron streak]", err.message || err);
    }
  };
  jobs.push(setInterval(streakCheck, 60 * 60 * 1000));

  // Unref so cron does not block process exit during tests
  for (const j of jobs) {
    if (j && typeof j.unref === "function") j.unref();
  }

  console.log("[cron-jobs] started: daily (every 1min check, fires at 23:00 CDMX) + streak (hourly)");

  return {
    stop() {
      jobs.forEach((j) => clearInterval(j));
    },
  };
}

module.exports = { startCronJobs };
