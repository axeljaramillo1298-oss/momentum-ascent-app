/**
 * Smoke tests para los filtros nuevos de isStablePickForParlay
 * y los adendums de IIHF/NBA agregados el 2026-05-24.
 *
 * Uso:
 *   node backend/scripts/test-pick-filters.js
 *
 * Salida esperada: 7/7 PASS y muestra los adendums generados.
 */

const {
  isStablePickForParlay,
  buildSportContextAdendum,
  getIIHFMatchupTier,
  getConmebolMatchupTier,
  isConmebolEvent,
  isBrasileiraoEvent,
  getEventHourCDMX,
  selectTopPicksOfDay,
} = require("../ai.js");

const cases = [
  // Aprendizaje 2026-05-21: Knicks Over 221.5 NBA falló con conf 68
  {
    label: "Knicks Over 221.5 NBA conf 68",
    input: { league: "NBA Playoffs", market: "Goles", pick: "Over 221.5 pts", confidence: 68 },
    expected: false,
  },
  // Thunder Over 215.5 NBA (threshold < 220) debe seguir pasando
  {
    label: "Thunder Over 215.5 NBA conf 70",
    input: { league: "NBA Playoffs", market: "Goles", pick: "Over 215.5 pts", confidence: 70 },
    expected: true,
  },
  // Aprendizaje 2026-05-22: Finlandia Over 5.5 IIHF falló con conf 70
  {
    label: "Finlandia Over 5.5 IIHF conf 70",
    input: { league: "IIHF World Championship", market: "Goles", pick: "Over 5.5", confidence: 70 },
    expected: false,
  },
  // Suiza ML IIHF conf 70 sí pasa (no es Over alto, conf >= 70)
  {
    label: "Suiza ML IIHF conf 70",
    input: { league: "IIHF World Championship", market: "1X2", pick: "Local (Suiza)", confidence: 70 },
    expected: true,
  },
  // IIHF con conf 65 ya no pasa (umbral elevado a 70 para IIHF)
  {
    label: "Canadá ML IIHF conf 65",
    input: { league: "IIHF World Championship", market: "1X2", pick: "Local (Canadá)", confidence: 65 },
    expected: false,
  },
  // ML visitante siempre fuera (regla pre-existente)
  {
    label: "Barcelona ML visitante conf 68",
    input: { league: "LaLiga", market: "1X2", pick: "Visitante (Barcelona)", confidence: 68 },
    expected: false,
  },
  // Local o Empate (DC) debe pasar
  {
    label: "DC United Doble Chance conf 71",
    input: { league: "MLS", market: "1X2", pick: "Local o Empate (DC United o Empate)", confidence: 71 },
    expected: true,
  },
];

let pass = 0;
const failures = [];
for (const c of cases) {
  const actual = isStablePickForParlay(c.input);
  const ok = actual === c.expected;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.label} → got ${actual}, expected ${c.expected}`);
  if (ok) pass++;
  else failures.push(c.label);
}

// ── Aprendizajes semanales 2026-05-25 a 2026-06-01 ────────────────────
// Cada caso replica un fallo real para asegurar que el adendum nuevo
// detona y/o que las constantes de tier están bien ubicadas.
console.log("\n=== Casos reales semana 25-may a 01-jun ===");

const adendumCases = [
  {
    label: "Fluminense vs La Guaira Libertadores — adendum mismatch",
    build: () => buildSportContextAdendum({ sport: "football", league: "CONMEBOL Libertadores", home_team: "Fluminense", away_team: "La Guaira" }),
    must: ["TIER MISMATCH", "Fluminense"],
  },
  {
    label: "Bolívar vs Ind. Rivadavia Libertadores — adendum altitud",
    build: () => buildSportContextAdendum({ sport: "football", league: "CONMEBOL Libertadores", home_team: "Bolívar", away_team: "Independiente Rivadavia" }),
    must: ["altura", "ALTITUD"],
  },
  {
    label: "Caracas vs Botafogo Sudamericana — adendum mismatch (Botafogo TierA)",
    build: () => buildSportContextAdendum({ sport: "football", league: "CONMEBOL Sudamericana", home_team: "Caracas", away_team: "Botafogo" }),
    must: ["TIER MISMATCH", "Botafogo"],
  },
  {
    label: "Vasco vs Atlético-MG Brasileirão — adendum top visitante",
    build: () => buildSportContextAdendum({ sport: "football", league: "Brasileirão Série A", home_team: "Vasco da Gama", away_team: "Atlético Mineiro" }),
    must: ["BRASILEIRÃO", "ML visitante"],
  },
  {
    label: "Cruzeiro vs Fluminense Brasileirão — adendum top vs top",
    build: () => buildSportContextAdendum({ sport: "football", league: "Brasileirão Série A", home_team: "Cruzeiro", away_team: "Fluminense" }),
    must: ["BRASILEIRÃO SÉRIE A"],
  },
  {
    label: "Reds vs Braves MLB — adendum Run Line visitante",
    build: () => buildSportContextAdendum({ sport: "baseball", league: "MLB", home_team: "Reds", away_team: "Braves" }),
    must: ["RUN LINE", "Visitante +1.5"],
  },
  {
    label: "Giants vs Diamondbacks MLB 19:45 CDMX — adendum Under nocturno",
    build: () => buildSportContextAdendum({ sport: "baseball", league: "MLB", home_team: "Giants", away_team: "Diamondbacks", event_date: "2026-05-27T01:45:00Z" /* 19:45 CDMX */ }),
    must: ["UNDER NOCTURNO"],
  },
  {
    label: "Bulgaria vs Montenegro Friendly — adendum NO debe activar (sin reglas específicas)",
    build: () => buildSportContextAdendum({ sport: "football", league: "International Friendly Games", home_team: "Bulgaria", away_team: "Montenegro" }),
    must: [],
    mustNot: ["BRASILEIRÃO", "CONMEBOL", "LIBERTADORES"],
  },
];

for (const c of adendumCases) {
  let out = "";
  try { out = c.build() || ""; } catch (e) { out = `ERROR ${e.message}`; }
  let ok = true;
  for (const need of c.must) if (!out.includes(need)) ok = false;
  for (const forbid of (c.mustNot || [])) if (out.includes(forbid)) ok = false;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.label}`);
  if (!ok) { failures.push(c.label); console.log("  ↳ output:", out.slice(0, 250)); }
  else pass++;
}

// ── TOP threshold tests ─────────────────────────────────────────
// selectTopPicksOfDay con default 70: si nada pasa, devuelve vacío.
console.log("\n=== TOP threshold ≥70% ===");
const topCases = [
  {
    label: "TOP día 01-jun con confs 63/62/62/65/63 → 0 TOPs (todos <70)",
    picks: [
      { id: 1, confidence: 63, league: "Friendly", market: "Goles" },
      { id: 2, confidence: 62, league: "Friendly", market: "1X2" },
      { id: 3, confidence: 62, league: "Friendly", market: "1X2" },
      { id: 4, confidence: 65, league: "LMB", market: "1X2" },
      { id: 5, confidence: 63, league: "MLB", market: "Goles" },
    ],
    expectedCount: 0,
  },
  {
    label: "TOP día con 4 picks ≥70 y 2 <70 → solo 3 TOPs ≥70",
    picks: [
      { id: 1, confidence: 75, league: "X", market: "ml" },
      { id: 2, confidence: 73, league: "X", market: "ml" },
      { id: 3, confidence: 71, league: "X", market: "ml" },
      { id: 4, confidence: 70, league: "X", market: "ml" },
      { id: 5, confidence: 68, league: "X", market: "ml" },
      { id: 6, confidence: 65, league: "X", market: "ml" },
    ],
    expectedCount: 3,
    expectedMaxConfFirst: 75,
  },
];
for (const tc of topCases) {
  const out = selectTopPicksOfDay(tc.picks, { topN: 3 });
  let ok = out.length === tc.expectedCount;
  if (ok && tc.expectedMaxConfFirst) ok = out[0]?.confidence === tc.expectedMaxConfFirst;
  console.log(`${ok ? "PASS" : "FAIL"}  ${tc.label} → got ${out.length} TOPs`);
  if (!ok) failures.push(tc.label);
  else pass++;
}

// ── isStablePickForParlay nuevos casos ──────────────────────────
console.log("\n=== isStablePickForParlay nuevos casos semana ===");
const stableNew = [
  {
    label: "Fluminense U3.5 Libertadores conf 82 → estable (pero el adendum hubiera bajado conf)",
    input: { league: "CONMEBOL Libertadores", market: "Goles", pick: "Under 3.5", confidence: 82 },
    expected: true, // isStablePickForParlay no filtra Unders Libertadores explícitamente — eso lo hace el adendum del prompt
  },
  {
    label: "Bulgaria Over 1.5 Friendly conf 63 → NO estable (conf <65)",
    input: { league: "International Friendly Games", market: "Goles", pick: "Over 1.5 goles", confidence: 63 },
    expected: false,
  },
  {
    label: "Braves +1.5 Run Line MLB visitante conf 70 → estable (no es ML visitante)",
    input: { league: "MLB", market: "Handicap", pick: "Visitante +1.5 (Braves Run Line)", confidence: 70 },
    // El filtro de visitante es para ML, no para handicap. El adendum del prompt
    // cap-eará confidence si es Run Line visitante sin evidencia.
    expected: true,
  },
];
for (const sc of stableNew) {
  const actual = isStablePickForParlay(sc.input);
  const ok = actual === sc.expected;
  console.log(`${ok ? "PASS" : "FAIL"}  ${sc.label} → got ${actual}`);
  if (ok) pass++;
  else failures.push(sc.label);
}

console.log("\n--- Adendums sample ---");
console.log("\n[IIHF mismatch puro: Finlandia vs Gran Bretaña]");
console.log(buildSportContextAdendum({ sport: "hockey", league: "IIHF World Championship", home_team: "Finlandia", away_team: "Gran Bretaña" }));
console.log("\n[IIHF mismatch parcial: USA vs Alemania]");
console.log(buildSportContextAdendum({ sport: "hockey", league: "IIHF World Championship", home_team: "Estados Unidos", away_team: "Alemania" }));
console.log("\n[NBA Playoffs: Knicks vs Cavaliers]");
console.log(buildSportContextAdendum({ sport: "basketball", league: "NBA Playoffs", home_team: "Knicks", away_team: "Cavaliers" }));

const totalCases = cases.length + adendumCases.length + topCases.length + stableNew.length;
console.log(`\nResultado: ${pass}/${totalCases} PASS`);
if (failures.length) {
  console.log("Fallaron:", failures.join("; "));
  process.exit(1);
}
