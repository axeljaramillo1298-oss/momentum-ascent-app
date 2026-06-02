-- Análisis semanal 2026-05-25 a 2026-06-01
-- Ejecutado el 2026-06-01 por el agente Claude tras reporte
-- de Axel "estamos fallando mucho".
--
-- Queries usadas para encontrar los patrones que motivaron el branch
-- feat/weekly-analysis-improvements-2026-06-01.

-- 1. Resumen global
SELECT
  COUNT(*) FILTER (WHERE result='won') AS won,
  COUNT(*) FILTER (WHERE result='lost') AS lost,
  COUNT(*) FILTER (WHERE result IS NULL OR result='') AS pending,
  COUNT(*) AS total
FROM ai_picks ap
JOIN sports_events se ON se.id = ap.event_id
WHERE se.event_date >= '2026-05-25' AND se.event_date < '2026-06-02';
-- Resultado: 41W-25L (62%) en 66 picks

-- 2. WR por día (en hora CDMX)
SELECT
  to_char(se.event_date AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD Dy') AS dia,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE result='won') AS won,
  COUNT(*) FILTER (WHERE result='lost') AS lost,
  ROUND(100.0 * COUNT(*) FILTER (WHERE result='won') /
        NULLIF(COUNT(*) FILTER (WHERE result IN ('won','lost')), 0), 1) AS wr
FROM ai_picks ap
JOIN sports_events se ON se.id = ap.event_id
WHERE se.event_date >= '2026-05-25' AND se.event_date < '2026-06-02'
GROUP BY 1 ORDER BY 1;

-- 3. WR por liga (peor liga = Libertadores 40%)
SELECT
  se.league,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE result='won') AS won,
  COUNT(*) FILTER (WHERE result='lost') AS lost,
  ROUND(100.0 * COUNT(*) FILTER (WHERE result='won') /
        NULLIF(COUNT(*) FILTER (WHERE result IN ('won','lost')), 0), 1) AS wr,
  ROUND(AVG(confidence) FILTER (WHERE result IN ('won','lost')), 1) AS avg_conf
FROM ai_picks ap
JOIN sports_events se ON se.id = ap.event_id
WHERE se.event_date >= '2026-05-25' AND se.event_date < '2026-06-02'
  AND result IN ('won','lost')
GROUP BY 1 ORDER BY total DESC;

-- 4. CALIBRACIÓN: WR por banda de confidence
-- HALLAZGO CRÍTICO: descalibración fuerte. Bandas altas (75+) fallan al 100%.
SELECT
  CASE
    WHEN confidence >= 80 THEN '80+'
    WHEN confidence >= 75 THEN '75-79'
    WHEN confidence >= 70 THEN '70-74'
    WHEN confidence >= 65 THEN '65-69'
    WHEN confidence >= 60 THEN '60-64'
    ELSE '<60'
  END AS banda,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE result='won') AS won,
  ROUND(100.0 * COUNT(*) FILTER (WHERE result='won') /
        NULLIF(COUNT(*) FILTER (WHERE result IN ('won','lost')), 0), 1) AS wr
FROM ai_picks ap
JOIN sports_events se ON se.id = ap.event_id
WHERE se.event_date >= '2026-05-25' AND se.event_date < '2026-06-02'
  AND result IN ('won','lost')
GROUP BY 1 ORDER BY 1 DESC;
-- Banda 80+: 0/1 = 0% (Fluminense U3.5)
-- Banda 75-79: 0/2 = 0%
-- Banda 70-74: 9/16 = 56%
-- Banda 65-69: 14/23 = 61%
-- Banda 60-64: 17/22 = 77% ← mejor banda
-- Banda <60: 1/2 = 50%

-- 5. Top fallos por confidence (los más dolorosos)
SELECT
  to_char(se.event_date AT TIME ZONE 'America/Mexico_City', 'MM-DD HH24:MI') AS fecha,
  se.league, se.home_team || ' vs ' || se.away_team AS partido,
  ap.market, ap.pick, ap.confidence, ap.plan_tier
FROM ai_picks ap JOIN sports_events se ON se.id = ap.event_id
WHERE se.event_date >= '2026-05-25' AND se.event_date < '2026-06-02'
  AND result='lost' AND confidence >= 65
ORDER BY confidence DESC, se.event_date;

-- 6. MLB Unders por hora CDMX (hallazgo: nocturnos fallan)
SELECT
  EXTRACT(HOUR FROM se.event_date AT TIME ZONE 'America/Mexico_City') AS hora_cdmx,
  ap.pick, ap.confidence, ap.result,
  se.home_team || ' vs ' || se.away_team AS partido
FROM ai_picks ap JOIN sports_events se ON se.id = ap.event_id
WHERE se.event_date >= '2026-05-25' AND se.event_date < '2026-06-02'
  AND se.league ILIKE '%MLB%' AND ap.pick ILIKE 'Under%'
ORDER BY hora_cdmx;
-- 13:00 won, 16:00 lost, 19:00 lost, 20:00 lost, 20:00 won
-- Nocturnos (≥19:00 CDMX): 1W-2L = 33%

-- 7. ai_pick_candidates: VACÍA
SELECT COUNT(*) AS total FROM ai_pick_candidates apc
JOIN sports_events se ON se.id = apc.event_id
WHERE se.event_date >= '2026-05-25' AND se.event_date < '2026-06-02';
-- = 0. Sigue vacío desde el 2026-05-24. La doble-IA dual está
-- ejecutándose pero no se persiste el rastro de candidatos.

-- 8. fail_reason_tags fill rate (no se llenan)
SELECT
  COUNT(*) FILTER (WHERE result='lost') AS lost_total,
  COUNT(*) FILTER (WHERE result='lost' AND fail_reason_tags IS NOT NULL AND fail_reason_tags <> '') AS lost_with_tags,
  COUNT(*) FILTER (WHERE result='lost' AND fail_reason IS NOT NULL AND fail_reason <> '') AS lost_with_reason,
  COUNT(*) FILTER (WHERE result='lost' AND fail_notes IS NOT NULL AND fail_notes <> '') AS lost_with_notes
FROM ai_picks ap JOIN sports_events se ON se.id = ap.event_id
WHERE se.event_date >= '2026-05-25' AND se.event_date < '2026-06-02';
-- 25 fallos, 0 tags, 0 reasons, 0 notes. El sistema de tagging
-- de fallos no se está usando. Oportunidad: tag manual o automático.
