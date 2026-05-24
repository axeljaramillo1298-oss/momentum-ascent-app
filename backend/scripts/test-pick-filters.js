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

console.log("\n--- Adendums sample ---");
console.log("\n[IIHF mismatch puro: Finlandia vs Gran Bretaña]");
console.log(buildSportContextAdendum({ sport: "hockey", league: "IIHF World Championship", home_team: "Finlandia", away_team: "Gran Bretaña" }));
console.log("\n[IIHF mismatch parcial: USA vs Alemania]");
console.log(buildSportContextAdendum({ sport: "hockey", league: "IIHF World Championship", home_team: "Estados Unidos", away_team: "Alemania" }));
console.log("\n[NBA Playoffs: Knicks vs Cavaliers]");
console.log(buildSportContextAdendum({ sport: "basketball", league: "NBA Playoffs", home_team: "Knicks", away_team: "Cavaliers" }));

console.log(`\nResultado: ${pass}/${cases.length} PASS`);
if (failures.length) {
  console.log("Fallaron:", failures.join("; "));
  process.exit(1);
}
