// Test rápido de autoClassifyFailTags con casos reales de la semana 25-may al 01-jun.
const { autoClassifyFailTags } = require("../backend/ai");

const cases = [
  {
    name: "Fluminense U3.5 al 82% (BOMBA fallida mié 27)",
    input: { pick: "Under 3.5", market: "Goles", confidence: 82, riskLevel: "BAJO",
             league: "CONMEBOL Libertadores", sport: "football",
             eventDate: "2026-05-28T00:30:00.000Z" },
    expectsAny: ["conf_80plus", "conmebol_libertadores", "market_under", "libertadores_under"],
  },
  {
    name: "Bolívar 1X altura La Paz (Free fallido)",
    input: { pick: "Local o Empate", market: "1X2", confidence: 68, riskLevel: "BAJO",
             league: "CONMEBOL Libertadores", sport: "football",
             eventDate: "2026-05-27T22:00:00.000Z" },
    expectsAny: ["conf_65_69", "conmebol_libertadores", "market_dc", "dc_1x"],
  },
  {
    name: "Vasco da Gama ML Brasileirão (dom 31 fallido)",
    input: { pick: "Vasco da Gama", market: "1X2", confidence: 65, riskLevel: "MEDIO",
             league: "Brasileirão", sport: "football",
             eventDate: "2026-05-31T19:00:00.000Z" },
    expectsAny: ["conf_65_69", "brasileirao", "market_1x2", "brasileirao_1x2"],
  },
  {
    name: "Bulgaria O1.5 TOP fallido al 63% (lun 1-jun)",
    input: { pick: "Over 1.5 goles", market: "Goles", confidence: 63, riskLevel: "BAJO",
             league: "Int. Friendly Games", sport: "football",
             eventDate: "2026-06-01T16:00:00.000Z" },
    expectsAny: ["conf_60_64", "friendly_international", "market_over", "friendly_low_conf"],
  },
  {
    name: "Reds-Braves +1.5 RL al 70% fallido (dom 31)",
    input: { pick: "Visitante +1.5 (Braves Run Line)", market: "Handicap", confidence: 70, riskLevel: "BAJO",
             league: "MLB", sport: "baseball",
             eventDate: "2026-05-31T17:40:00.000Z" },
    expectsAny: ["conf_70_74", "mlb", "market_handicap", "handicap_visitante", "mlb_rl_visitante_plus15"],
  },
  {
    name: "Giants U9.5 nocturno mar 26 (TOP 2 fallido)",
    input: { pick: "Under 9.5 carreras", market: "Goles", confidence: 72, riskLevel: "BAJO",
             league: "MLB", sport: "baseball",
             eventDate: "2026-05-27T01:45:00.000Z" }, // 19:45 CDMX = 01:45 UTC del 27
    expectsAny: ["conf_70_74", "mlb", "market_under", "mlb_unders_nocturno"],
  },
  {
    name: "Knicks Over 221.5 NBA (caso histórico Mayo)",
    input: { pick: "Over 221.5 pts", market: "Goles", confidence: 68, riskLevel: "BAJO",
             league: "NBA Playoffs", sport: "basketball",
             eventDate: "2026-05-22T00:00:00.000Z" },
    expectsAny: ["conf_65_69", "nba", "market_over", "nba_over_220plus"],
  },
  // ── Tags rev 2026-06-02 (post-fallos martes 2-jun) ──────────────────
  {
    name: "Barracas Over 1.5 Copa Argentina TOP 1 fallido (mar 2-jun)",
    input: { pick: "Over 1.5 goles", market: "Goles", confidence: 75, riskLevel: "BAJO",
             league: "Copa Argentina", sport: "football",
             eventDate: "2026-06-03T00:10:00.000Z" },
    expectsAny: ["conf_75_79", "copa_argentina", "market_over", "cup_sudamerica_over_15", "top_candidate"],
  },
  {
    name: "Reds-Royals Over 7.5 MLB afternoon fallido (mar 2-jun)",
    input: { pick: "Over 7.5 carreras", market: "Goles", confidence: 68, riskLevel: "BAJO",
             league: "MLB", sport: "baseball",
             eventDate: "2026-06-02T23:10:00.000Z" }, // 17:10 CDMX
    expectsAny: ["conf_65_69", "mlb", "market_over", "mlb_overs_7_5_plus", "afternoon_cdmx"],
  },
  {
    name: "Wales-Ghana 1X2 Local amistoso TIER B (mar 2-jun)",
    input: { pick: "Local (Wales)", market: "1X2", confidence: 65, riskLevel: "MEDIO",
             league: "Int. Friendly Games", sport: "football",
             eventDate: "2026-06-02T18:45:00.000Z" },
    expectsAny: ["conf_65_69", "friendly_international", "market_1x2", "ml_local", "friendly_low_conf", "friendly_possibly_tier_b"],
  },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const tags = autoClassifyFailTags(c.input);
  const missing = c.expectsAny.filter((t) => !tags.includes(t));
  if (missing.length === 0) {
    console.log(`PASS  ${c.name}`);
    console.log(`      tags: ${tags.join(", ")}`);
    pass++;
  } else {
    console.log(`FAIL  ${c.name}`);
    console.log(`      missing tags: ${missing.join(", ")}`);
    console.log(`      got: ${tags.join(", ")}`);
    fail++;
  }
}
console.log(`\nResultado: ${pass}/${cases.length} PASS (${fail} fail)`);
process.exit(fail > 0 ? 1 : 0);
