const DAY_NAMES = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];

const normalizeText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9+ ]/g, "")
    .trim();

const joinLines = (lines) => lines.filter(Boolean).join("\n");

const TEMPLATES = {
  default: {
    weekFocus: "fuerza general, capacidad aerobica y adherencia",
    days: [
      "Pierna anterior + core: sentadilla, desplante, plancha y bici suave 10 min.",
      "Empuje superior: press, flexiones, hombro y movilidad toracica.",
      "Cardio base + estabilidad: 30-40 min continuo y trabajo de gluteo medio.",
      "Cadena posterior: peso muerto, puente de gluteo, isquios y antirotacion.",
      "Traccion superior: remo, jalon, face pull y cuello/escapulas.",
      "Condicionamiento mixto: intervalos cortos + circuito full body ligero.",
      "Recuperacion activa: caminata, movilidad global y respiracion 20 min.",
    ],
    nutrition:
      "Base nutricional: 1.8-2.2 g de proteina/kg, carbohidrato alrededor del entreno, verduras en 2 comidas y 30-35 ml de agua/kg.",
    message:
      "Plan de respaldo activo. Ejecuta el bloque del dia, registra check-in y ajusta carga si la tecnica cae.",
  },
  gym: {
    weekFocus: "hipertrofia y fuerza por grupos musculares",
    days: [
      "Pierna A: cuadriceps, gluteo y pantorrilla. Sentadilla, prensa, zancadas y elevacion de talon.",
      "Pecho + hombro anterior + triceps. Press plano, press inclinado, aperturas y fondos asistidos.",
      "Espalda + biceps + abdomen. Remo, jalon, curl inclinado y planchas cargadas.",
      "Pierna B: femoral, gluteo y aductores. Peso muerto rumano, curl femoral, hip thrust y aduccion.",
      "Hombro completo + brazos. Press militar, elevaciones laterales, curl martillo y extension por encima.",
      "Full body metabolico: 6-8 ejercicios en superseries, 10-12 reps, descanso corto.",
      "Recuperacion activa con movilidad de cadera, tobillo, dorsal y caminata 30 min.",
    ],
    nutrition:
      "Nutricion gym: proteina alta diaria, carbohidrato antes y despues de pesas, sodio estable y colacion proteica nocturna si faltan gramos.",
    message: "Semana gym precargada. Prioriza tecnica, progresion y check-in al cerrar cada sesion.",
  },
  running: {
    weekFocus: "economia de carrera, resistencia y fuerza de soporte",
    days: [
      "Fuerza pierna + core: sentadilla goblet, step-up, peso muerto unilateral, plancha y gemelo.",
      "Rodaje Z2 35-50 min + movilidad de tobillo, pie y cadera.",
      "Empuje/traccion superior ligero para postura: flexiones, remo, face pull y antirotacion.",
      "Series: 6-10 repeticiones de 200-400 m con recuperacion caminando.",
      "Cadena posterior: hip thrust, femoral, Copenhagen plank y trabajo de pie.",
      "Tirada larga progresiva 45-75 min segun nivel, cerrar con respiracion nasal.",
      "Recuperacion activa: bici suave o caminata 25 min + liberacion de soleo y fascia plantar.",
    ],
    nutrition:
      "Nutricion running: carbohidrato complejo en comida previa, proteina en las 2 horas posteriores y electrolitos si la sesion pasa de 60 min.",
    message: "Running fallback listo. Mantén zancada eficiente, no te quemes en las series y reporta sensaciones.",
  },
  cycling: {
    weekFocus: "potencia de pierna, estabilidad lumbopelvica y fondo aerobico",
    days: [
      "Fuerza de pierna: sentadilla frontal, zancada atras, hip thrust y gemelo sentado.",
      "Rodaje base 45-60 min en Z2 con cadencia controlada.",
      "Espalda, hombro y core anti-flexion: remo, face pull, farmer carry y dead bug.",
      "Intervalos en bici: 5-8 bloques de 2-4 min intensos con recuperacion igual.",
      "Femoral y gluteo: peso muerto rumano, puente unilateral, curl femoral y movilidad de cadera.",
      "Subidas o tempo largo 50-80 min segun nivel.",
      "Recuperacion: pedaleo muy suave 20-30 min y movilidad de piramidal/cuadriceps.",
    ],
    nutrition:
      "Nutricion ciclismo: carga de carbohidrato en dias de series y fondo, proteina repartida en 4 tomas y sal suficiente para evitar vacio de piernas.",
    message: "Fallback de ciclismo cargado. Cuida cadencia, gluteo activo y check-in al bajar de la bici.",
  },
  swimming: {
    weekFocus: "traccion superior, patada eficiente y control de tronco",
    days: [
      "Espalda + hombro posterior + core: jalon, remo, Y-T-W, hollow hold y movilidad escapular.",
      "Sesion tecnica en agua: 8-12 bloques cortos de tecnica, respiracion y patada.",
      "Pierna y estabilidad: sentadilla, split squat, gemelo, aductor y plancha lateral.",
      "Serie principal en piscina: 12-20 largos a ritmo controlado con descansos fijos.",
      "Empuje superior ligero: press inclinado, push-up, serrato y rotadores externos.",
      "Nado continuo o pull set segun nivel, 30-45 min con foco en longitud de brazada.",
      "Movilidad y descarga de hombro, dorsal, psoas y tobillo.",
    ],
    nutrition:
      "Nutricion natacion: carbohidrato facil antes del agua, proteina al terminar y hidratacion aunque no sientas tanta sed dentro de la alberca.",
    message: "Rutina de natacion precargada. Mantén hombro sano, brazada larga y registra energia post sesion.",
  },
  calisthenics: {
    weekFocus: "fuerza relativa, control corporal y progresiones tecnicas",
    days: [
      "Empuje: flexiones lastradas o progresiones, fondos, pike push-up y soporte hollow.",
      "Pierna unilateral + core: pistol squat asistida, split squat, puente y dragon flag regresion.",
      "Traccion: dominadas, remo invertido, curl en barra y agarre.",
      "Skill day: handstand, L-sit, soporte escapular y movilidad de muneca.",
      "Cadena posterior: buenos dias, hip hinge, nordic regresion y elevaciones de cadera.",
      "Circuito full body por rondas con volumen moderado y descanso corto.",
      "Recuperacion: movilidad de hombro, cadera, columna y paseo suave.",
    ],
    nutrition:
      "Nutricion calistenia: mantén proteina alta, peso corporal estable y carbohidrato suficiente para no perder calidad en skills y tracciones.",
    message: "Bloque de calistenia activo. Prioriza rango limpio, escápulas fuertes y progresion real, no ego.",
  },
  crossfit: {
    weekFocus: "fuerza, potencia, motor y tolerancia al lactato",
    days: [
      "Strength lower: back squat, clean pull, split squat y core antirotacion.",
      "Metcon corto 8-12 min + trabajo de hombro estable y movilidad toracica.",
      "Upper strength: strict press, bench, row y dips o push-up.",
      "Olympic skill + intervals: tecnica de clean/snatch y sprints en ergometro o carrera.",
      "Posterior chain: deadlift, RDL, GHD/regresion y glute bridge.",
      "Chipper largo 20-30 min con volumen controlado y pacing inteligente.",
      "Recuperacion activa, respiracion, movilidad de tobillo/cadera/hombro.",
    ],
    nutrition:
      "Nutricion CrossFit: carbohidrato util antes del WOD, proteina completa post sesion y rehidratacion agresiva si sudas mucho.",
    message: "CrossFit fallback listo. Hoy gana la tecnica y el pacing; intensidad sin desorden.",
  },
  field_team: {
    weekFocus: "potencia, cambios de direccion y resiliencia de isquios/aductores",
    days: [
      "Pierna de fuerza: sentadilla, zancada lateral, nordic regresion, gemelo y aductor.",
      "Velocidad y aceleracion: salidas cortas, skips, frenado y movilidad de cadera.",
      "Empuje/traccion superior para contactos: press, remo, cuello y core antirotacion.",
      "Agilidad + capacidad anaerobica: cambios de direccion, shuttles y trabajo reactivo.",
      "Cadena posterior: hip thrust, peso muerto rumano, Copenhagen plank y gluteo medio.",
      "Partido, scrimmage o condicionamiento especifico por bloques.",
      "Descarga de tobillo, aductores, soleo y respiracion.",
    ],
    nutrition:
      "Nutricion deporte de campo: carbohidrato alto en dias de velocidad o partido, proteina constante y sal adecuada para no perder explosividad.",
    message: "Semana de deporte de campo lista. Ataca aceleracion, desaceleracion y check-in de piernas.",
  },
  american_football: {
    weekFocus: "fuerza maxima, potencia de contacto y cuello/core",
    days: [
      "Lower max strength: squat pesado, trineo o empuje, split squat y core con carga.",
      "Upper push/pull: bench, row, landmine press, face pull y cuello.",
      "Velocidad corta: 10-20 yardas, salidas, cambios de base y saltos.",
      "Posterior chain pesada: deadlift, hip thrust, curl femoral y carries.",
      "Power upper: push press, med ball throws, pull-up y triceps.",
      "Condicionamiento especifico: intervalos alacticos + desplazamientos laterales.",
      "Recuperacion de hombro, cadera, cuello y fascia plantar.",
    ],
    nutrition:
      "Nutricion americano: prioridad a proteina y carbohidrato util para potencia, con comida post entreno abundante para recuperar golpes y SNC.",
    message: "Plan de americano cargado. Mantén violencia tecnica, postura fuerte y control de fatiga.",
  },
  basketball: {
    weekFocus: "salto, desaceleracion, hombro sano y motor intermitente",
    days: [
      "Pierna y salto: trap bar o sentadilla, jump squat, split squat y gemelo.",
      "Skill/cardio: desplazamientos, sprints de cancha y tiros bajo fatiga.",
      "Espalda, hombro y core: remo, press unilateral, face pull y antirotacion.",
      "Agilidad y frenado: laterales, closeout, drop step y deceleraciones.",
      "Posterior chain + aductor: RDL, hip thrust, Copenhagen y glute bridge.",
      "Juego o scrimmage con bloques de alta intensidad.",
      "Movilidad de tobillo, cadera, T-spine y descarga de rodilla.",
    ],
    nutrition:
      "Nutricion basquetbol: carbohidrato en torno a sesiones de cancha, proteina en 4 tomas y fruta/sodio para sostener velocidad y salto.",
    message: "Fallback de basquetbol listo. Piernas frescas, hombro estable y cero repeticiones sin intencion.",
  },
  racket_sport: {
    weekFocus: "rotacion, cambio de direccion y hombro resistente",
    days: [
      "Pierna unilateral + core rotacional: split squat, lateral lunge, wood chop y gemelo.",
      "Sesion tecnica o rally controlado con desplazamiento lateral.",
      "Upper stability: remo, press unilateral, rotadores externos y serrato.",
      "Intervalos de pies: shuttle, crossover, split step y frenadas.",
      "Posterior chain + agarre: RDL, hip thrust, carries y extensores de antebrazo.",
      "Partido o set largo con foco en consistencia y postura.",
      "Recuperacion de hombro, codo, aductores y tobillo.",
    ],
    nutrition:
      "Nutricion tenis/padel: carbohidrato ligero antes de pista, hidratacion con electrolitos y proteina despues para mantener velocidad y brazo fresco.",
    message: "Rutina de deporte de raqueta activa. Gana con pies, core y hombro estable.",
  },
  striking: {
    weekFocus: "potencia de cadera, hombro durable y condicionamiento de asaltos",
    days: [
      "Pierna y cadera: sentadilla, zancada, hip thrust, aductor y rotacion de tronco.",
      "Rondas tecnicas: sombra, costal y footwork con volumen medio.",
      "Empuje/traccion superior: press, remo, face pull, cuello y antebrazo.",
      "Condicionamiento tipo rounds: 6-10 bloques de 2-3 min intensos.",
      "Posterior chain + core: RDL, swing, antirotacion y flexor de cadera.",
      "Sparring controlado o rounds de potencia con buena tecnica.",
      "Movilidad de tobillo, cadera, hombro y respiracion nasal.",
    ],
    nutrition:
      "Nutricion striking: carbohidrato facil antes de rounds, proteina post y control del peso sin cortar agua a lo bruto.",
    message: "Plan de striking listo. Golpea con cadera, protege hombros y reporta el gas del dia.",
  },
  mma: {
    weekFocus: "potencia total, resistencia de rounds y mezcla golpeo-lucha",
    days: [
      "Lower strength + core: squat, split squat, hip thrust y antirotacion.",
      "Striking skill + intervals cortos de alta salida.",
      "Upper pull/push: remo, press, dominada asistida, cuello y grip.",
      "Grappling conditioning: carries, sprawls, med ball slam y assault intervals.",
      "Posterior chain: deadlift tecnico, femoral, gluteo medio y cadera.",
      "Rounds mixtos: 3-5 bloques de golpeo, clinch o piso segun nivel.",
      "Recuperacion con movilidad, respiracion y descarga de aductores/espalda.",
    ],
    nutrition:
      "Nutricion MMA: protege recuperacion con proteina alta, carbohidrato estrategico y agua/electrolitos constantes entre sesiones.",
    message: "Fallback MMA cargado. Controla ritmo, cadera fuerte y tecnica estable aun cansado.",
  },
  bjj: {
    weekFocus: "traccion, agarre, core y cadera para lucha en suelo",
    days: [
      "Espalda y agarre: dominada asistida, remo, farmer carry y curls de antebrazo.",
      "Drills tecnicos y rounds ligeros con foco en guardia y escapes.",
      "Pierna y cadera: split squat, hip thrust, aductor, puente y abduccion.",
      "Condicionamiento especifico: intervalos de isometria, arrastres y carries.",
      "Empuje superior y cuello: press inclinado, push-up, neck flexion y serrato.",
      "Rounds mas duros o trabajo posicional por bloques.",
      "Recuperacion: movilidad de columna, cadera, dedos y respiracion.",
    ],
    nutrition:
      "Nutricion BJJ: carbohidrato moderado antes de rolar, proteina al salir y micronutrientes para articulaciones y agarre.",
    message: "BJJ fallback activo. Agarre firme, cadera viva y check-in honesto despues de rolar.",
  },
  hyrox: {
    weekFocus: "motor largo, fuerza util y transiciones sin caida",
    days: [
      "Lower strength: squat, lunge, sled o empuje equivalente y core.",
      "Engine intervals: carrera o remo por repeticiones medias.",
      "Upper strength: press, row, carry y estabilidad escapular.",
      "Circuito Hyrox: burpee broad jump, farmer carry, lunges y cardio.",
      "Posterior chain: deadlift tecnico, hip hinge, gluteo y abdomen.",
      "Simulacion larga 35-50 min con pacing controlado.",
      "Recuperacion activa y movilidad de pie, cadera y hombro.",
    ],
    nutrition:
      "Nutricion Hyrox: come carbohidrato suficiente para el volumen, proteina completa y electrolitos para sostener sesiones largas.",
    message: "Hyrox precargado. Pacing inteligente, transiciones limpias y cero salidas suicidas.",
  },
  powerlifting: {
    weekFocus: "sentadilla, banca, peso muerto y musculatura de soporte",
    days: [
      "Dia squat: variante principal, pausa o tempo, cuadriceps y core pesado.",
      "Dia bench: banca principal, banca cerrada, hombro posterior y triceps.",
      "GPP ligero: remo, jalon, gemelo, abdomen y movilidad.",
      "Dia deadlift: tiron principal, RDL, femoral y grip.",
      "Bench volumen + upper back: banca repeticiones, remo pesado y deltoide posterior.",
      "Pierna soporte: split squat, prensa o belt squat y gluteo medio.",
      "Recuperacion: caminar, movilidad de cadera/toracica y descarga lumbar.",
    ],
    nutrition:
      "Nutricion powerlifting: proteina alta, carbohidrato alto en dias pesados y sodio estable para rendimiento y palanca.",
    message: "Powerlifting fallback listo. Barra veloz, tecnica igual en cada set y check-in con RPE real.",
  },
  weightlifting: {
    weekFocus: "tecnica olimpica, potencia y estabilidad overhead",
    days: [
      "Snatch tecnico + sentadilla frontal y core.",
      "Empuje overhead: jerk drives, press estricto, espalda alta y movilidad toracica.",
      "Pierna soporte: split squat, RDL, aductor y pantorrilla.",
      "Clean and jerk tecnico + tirones olimpicos.",
      "Upper pull/posterior: remo, pull-up asistido, face pull y rotadores.",
      "Potencia: saltos, lanzamientos y complejos ligeros a moderados.",
      "Recuperacion con movilidad de tobillo, cadera, hombro y muneca.",
    ],
    nutrition:
      "Nutricion halterofilia: carbohidrato antes de la tecnica pesada, proteina repartida y buena hidratacion para calidad neural.",
    message: "Halterofilia fallback activo. Barra cerca, velocidad alta y overhead estable.",
  },
  functional: {
    weekFocus: "fuerza general, patrones basicos y acondicionamiento util",
    days: [
      "Pierna y core: squat, hinge, zancada, carry y plancha.",
      "Upper push/pull: press, row, push-up y estabilidad escapular.",
      "Cardio base 30-40 min + movilidad global.",
      "Posterior chain: deadlift tecnico, puente de gluteo, femoral y antirotacion.",
      "Mixto atletico: saltos bajos, lanzamientos y trabajo lateral.",
      "Circuito full body por tiempo con cargas moderadas.",
      "Recuperacion activa y respiracion diafragmatica.",
    ],
    nutrition:
      "Nutricion funcional: simple y sostenible, con proteina en cada comida y carbohidrato util segun la carga del dia.",
    message: "Funcional precargado. Mueve bien, respira mejor y registra adherencia completa.",
  },
  yoga: {
    weekFocus: "movilidad activa, core, respiracion y fuerza de soporte",
    days: [
      "Vinyasa con foco en cadera, isquios y respiracion nasal.",
      "Fuerza de soporte: push-up, remo ligero, sentadilla y plancha lateral.",
      "Flujo de equilibrio: warrior series, gluteo medio y pie.",
      "Core y columna: hollow hold, bird dog, dead bug y torsiones suaves.",
      "Movilidad de hombro/toracica y secuencia de estabilidad escapular.",
      "Sesion larga de flow o power yoga segun nivel.",
      "Recuperacion profunda: respiracion, estiramiento suave y caminata.",
    ],
    nutrition:
      "Nutricion yoga: ligera antes de practicar, proteina suficiente y buena hidratacion para sostener movilidad y enfoque.",
    message: "Yoga fallback listo. Prioriza respiracion, control y presencia real en cada postura.",
  },
  pilates: {
    weekFocus: "core, control lumbo-pelvico y estabilidad global",
    days: [
      "Mat Pilates con foco en transverso, respiracion y pelvis neutra.",
      "Pierna y gluteo: puente, clam, split squat y gemelo.",
      "Upper posture: remo, serrato, face pull y movilidad toracica.",
      "Core anti-extension/antirotacion: dead bug, side plank y bird dog.",
      "Movilidad + control: cadera, hombro, columna y pie.",
      "Sesion larga de pilates flow con resistencia ligera.",
      "Recuperacion con caminata y descarga lumbar/respiracion.",
    ],
    nutrition:
      "Nutricion pilates: comida ligera pre sesion, proteina suficiente y consistencia diaria para sostener composicion y energia.",
    message: "Pilates precargado. Controla la pelvis, respira bien y no aceleres lo que debe sentirse preciso.",
  },
  climbing: {
    weekFocus: "agarre, traccion, core y estabilidad escapular",
    days: [
      "Traccion fuerte: dominada asistida, remo, agarre isometrico y face pull.",
      "Pierna y cadera para empuje en muro: split squat, step-up y gluteo medio.",
      "Tecnica de escalada o boulder facil con foco en pies y posicion.",
      "Core: hollow, toes-to-bar regresion, antirotacion y lumbar suave.",
      "Antebrazo y hombro sano: extensores, serrato, rotadores y hangs controlados.",
      "Sesion de escalada principal con volumen moderado-alto segun nivel.",
      "Recuperacion de dedos, dorsal, cadera y caminata suave.",
    ],
    nutrition:
      "Nutricion escalada: evita llegar vacio, reparte proteina, usa carbohidrato previo si haras boulder intenso y protege dedos con hidratacion.",
    message: "Escalada fallback listo. Pies silenciosos, grip inteligente y hombro bajo control.",
  },
  hiking: {
    weekFocus: "resistencia de pierna, tobillo y capacidad de carga",
    days: [
      "Pierna base: step-up, split squat, gemelo, tibial y core.",
      "Caminata inclinada o escaleras 35-50 min.",
      "Espalda y carga: remo, farmer carry, trapecio medio y abdomen.",
      "Cadena posterior: RDL, puente, femoral y gluteo medio.",
      "Movilidad de tobillo/cadera + trabajo unilateral ligero.",
      "Ruta larga o hike progresivo con mochila segun nivel.",
      "Recuperacion y descarga de pie, soleo y espalda baja.",
    ],
    nutrition:
      "Nutricion senderismo: carbohidrato simple durante rutas largas, proteina al terminar y agua/electrolitos constantes.",
    message: "Senderismo precargado. Pierna resistente, mochila estable y check-in al volver.",
  },
  trail: {
    weekFocus: "subida, bajada, tobillo resistente y motor de monte",
    days: [
      "Fuerza pierna: split squat, step-down, RDL unilateral, gemelo y tibial.",
      "Rodaje trail suave o cinta inclinada 35-50 min.",
      "Upper posture y core: remo, face pull, carry unilateral y plancha.",
      "Series en subida + tecnica de bajada controlada.",
      "Posterior chain: hip thrust, femoral, gluteo medio y aductor.",
      "Tirada larga por sendero o terreno mixto segun nivel.",
      "Recuperacion: movilidad de pie/tobillo/cadera y descarga de soleo.",
    ],
    nutrition:
      "Nutricion trail: mete carbohidrato antes y durante tiradas largas, no descuides sal y repara con proteina al bajar del monte.",
    message: "Trail fallback activo. Subida con ritmo, bajada con control y cero heroismos sin piernas.",
  },
  triathlon: {
    weekFocus: "equilibrio swim-bike-run y fuerza sin fatiga basura",
    days: [
      "Fuerza total: squat, RDL, row, press y core con volumen moderado.",
      "Natacion tecnica o serie principal segun nivel.",
      "Ciclismo Z2/tempo 45-70 min.",
      "Running de calidad: series o tempo corto.",
      "Upper back, gluteo y movilidad para sostener posicion aerodinamica.",
      "Brick session: bici + trote corto controlado.",
      "Recuperacion activa y movilidad global.",
    ],
    nutrition:
      "Nutricion triatlon: reparte carbohidrato alrededor de cada disciplina, proteina en 4 tomas y electrolitos en dias dobles o bricks.",
    message: "Triatlon precargado. Distribuye esfuerzo, cuida transiciones y no gastes piernas antes de tiempo.",
  },
  spinning: {
    weekFocus: "resistencia de pierna, core y tolerancia al lactato",
    days: [
      "Fuerza pierna: squat, lunge, hip thrust, gemelo y core.",
      "Clase o sesion spinning base 40-50 min.",
      "Upper posture: remo, face pull, press ligero y antirotacion.",
      "Intervals en bici: bloques de subida y sprints cortos.",
      "Posterior chain: RDL, curl femoral, gluteo medio y movilidad de cadera.",
      "Clase larga o tempo sostenido.",
      "Pedaleo suave 20 min + descarga de cuadriceps y soleo.",
    ],
    nutrition:
      "Nutricion spinning: carbohidrato facil antes de clase intensa, proteina al terminar y agua/sodio para no vaciarte.",
    message: "Spinning fallback listo. Mantén cadencia, tecnica y resistencia sin reventarte al inicio.",
  },
  dance: {
    weekFocus: "piernas resistentes, core, coordinacion y movilidad",
    days: [
      "Pierna y gluteo: sentadilla, zancada, gemelo y core rotacional.",
      "Sesion de baile tecnica o practica coreografica.",
      "Upper posture: remo, press ligero, escápulas y movilidad toracica.",
      "Condicionamiento por bloques cortos con pasos rapidos y cambios de nivel.",
      "Posterior chain y aductor: puente, RDL, Copenhagen y tobillo.",
      "Sesion larga de baile o ensayo general.",
      "Recuperacion con movilidad, respiracion y caminata suave.",
    ],
    nutrition:
      "Nutricion baile: energia estable con carbohidrato moderado, proteina diaria suficiente y buena hidratacion para no perder precision.",
    message: "Baile precargado. Ritmo, control y piernas vivas hasta el ultimo bloque.",
  },
  surf: {
    weekFocus: "espalda, hombro, core y potencia de pop-up",
    days: [
      "Espalda y hombro: remo, jalon, face pull, rotadores y serrato.",
      "Pierna explosiva + core: split squat, jump squat, pop-up drill y plancha.",
      "Movilidad toracica, cadera y tobillo + cardio suave.",
      "Upper push/pull: press inclinado, push-up, remo unilateral y cuello.",
      "Posterior chain: RDL, hip thrust, gluteo medio y antirotacion.",
      "Sesion en agua o circuito especifico de remada y pop-up.",
      "Recuperacion: hombro, espalda baja, flexor de cadera y respiracion.",
    ],
    nutrition:
      "Nutricion surf: llega con energia, hidrata antes de entrar al agua y recupera con proteina y carbohidrato al salir.",
    message: "Surf fallback listo. Remada fuerte, pop-up explosivo y hombro siempre sano.",
  },
};

const SPORTS = {
  generic: { label: "General", template: "default", aliases: [] },
  gym: { label: "Gym", template: "gym", aliases: ["pesas", "musculacion"] },
  running: { label: "Running", template: "running", aliases: ["correr", "carrera"] },
  cycling: { label: "Ciclismo", template: "cycling", aliases: ["bici", "bicicleta", "ciclismo ruta", "mountain bike"] },
  swimming: { label: "Natacion", template: "swimming", aliases: ["alberca", "natacion en alberca"] },
  calisthenics: { label: "Calistenia", template: "calisthenics", aliases: ["street workout"] },
  crossfit: { label: "CrossFit", template: "crossfit", aliases: ["cross fit"] },
  futbol: { label: "Futbol", template: "field_team", aliases: ["soccer"] },
  football_american: { label: "Futbol Americano", template: "american_football", aliases: ["americano", "football americano"] },
  basketball: { label: "Basquetbol", template: "basketball", aliases: ["basket", "basketball", "basquet"] },
  tenis: { label: "Tenis", template: "racket_sport", aliases: [] },
  padel: { label: "Padel", template: "racket_sport", aliases: ["paddle"] },
  box: { label: "Box", template: "striking", aliases: ["boxeo"] },
  mma: { label: "MMA", template: "mma", aliases: ["artes marciales mixtas"] },
  muay_thai: { label: "Muay Thai", template: "striking", aliases: ["thai boxing"] },
  bjj: { label: "BJJ", template: "bjj", aliases: ["jiu jitsu", "jiujitsu", "brazilian jiu jitsu"] },
  hyrox: { label: "Hyrox", template: "hyrox", aliases: [] },
  powerlifting: { label: "Powerlifting", template: "powerlifting", aliases: ["power"] },
  weightlifting: { label: "Halterofilia", template: "weightlifting", aliases: ["levantamiento olimpico", "weightlifting"] },
  functional: { label: "Entrenamiento funcional", template: "functional", aliases: ["funcional", "functional training"] },
  yoga: { label: "Yoga", template: "yoga", aliases: [] },
  pilates: { label: "Pilates", template: "pilates", aliases: [] },
  climbing: { label: "Escalada", template: "climbing", aliases: ["climb", "boulder", "bouldering"] },
  hiking: { label: "Senderismo", template: "hiking", aliases: ["hike", "trekking"] },
  trail: { label: "Trail running", template: "trail", aliases: ["trail", "trailrun", "trail run"] },
  triathlon: { label: "Triatlon", template: "triathlon", aliases: ["triathlon"] },
  spinning: { label: "Spinning", template: "spinning", aliases: ["indoor cycling"] },
  dance: { label: "Baile", template: "dance", aliases: ["dance"] },
  surf: { label: "Surf", template: "surf", aliases: [] },
};

const ALIAS_TO_KEY = {};
for (const [sportKey, sport] of Object.entries(SPORTS)) {
  ALIAS_TO_KEY[normalizeText(sport.label)] = sportKey;
  for (const alias of sport.aliases || []) {
    ALIAS_TO_KEY[normalizeText(alias)] = sportKey;
  }
}

const readAnswers = (value) => {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const resolveSportKey = (sportRaw, extraText = "") => {
  const direct = normalizeText(sportRaw);
  if (direct && ALIAS_TO_KEY[direct]) {
    return ALIAS_TO_KEY[direct];
  }

  const scanText = normalizeText(extraText);
  if (!scanText) {
    return "generic";
  }

  for (const [alias, sportKey] of Object.entries(ALIAS_TO_KEY)) {
    if (alias && scanText.includes(alias)) {
      return sportKey;
    }
  }
  return "generic";
};

const findPrimaryProfile = (users = []) => {
  for (const user of Array.isArray(users) ? users : []) {
    const answers = readAnswers(user?.onboardingAnswers);
    const sportRaw = String(answers.deporte || "").trim();
    const sport = sportRaw === "Otro" ? String(answers.deporte_otro || "").trim() : sportRaw;
    if (sport) {
      return {
        sport,
        goal: String(answers.objetivo || user?.goal || "").trim(),
        level: String(answers.nivel || "").trim(),
        time: String(answers.tiempo || "").trim(),
        place: String(answers.lugar || "").trim(),
      };
    }
  }
  return {
    sport: "",
    goal: "",
    level: "",
    time: "",
    place: "",
  };
};

const formatMetaLine = ({ goal, level, time, place, prompt }) => {
  const parts = [];
  if (goal) parts.push(`objetivo ${goal}`);
  if (level) parts.push(`nivel ${level}`);
  if (time) parts.push(`sesion ${time}`);
  if (place) parts.push(`entorno ${place}`);
  if (prompt) parts.push(`pedido ${String(prompt).slice(0, 80)}`);
  return parts.length ? `Ajustes: ${parts.join(" | ")}.` : "";
};

const buildFallbackPlanForSport = ({ sport, goal, level, time, place, prompt, names }) => {
  const sportKey = resolveSportKey(sport, [sport, prompt, goal].filter(Boolean).join(" "));
  const sportConfig = SPORTS[sportKey] || SPORTS.generic;
  const template = TEMPLATES[sportConfig.template] || TEMPLATES.default;
  const metaLine = formatMetaLine({ goal, level, time, place, prompt });
  const routineLines = template.days.map((line, index) => `${DAY_NAMES[index]}: ${line}`);

  return {
    sportKey,
    sportLabel: sportConfig.label,
    routineText: joinLines([
      `Rutina semanal de respaldo para ${sportConfig.label}.`,
      `Enfoque: ${template.weekFocus}.`,
      metaLine,
      ...routineLines,
    ]),
    dietText: joinLines([
      `Plan nutricional base para ${sportConfig.label}.`,
      template.nutrition,
      goal ? `Prioridad del objetivo: ${goal}. Ajusta calorias sin tocar la calidad de la comida.` : "",
      time ? `Si tu ventana es ${time}, compacta el volumen en bloques y evita saltarte la comida post entreno.` : "",
    ]),
    messageText:
      template.message ||
      `Plan de respaldo asignado para ${names || "el usuario"}. Ejecuta la sesion del dia y reporta check-in.`,
  };
};

const detectSportFallback = ({ users = [], prompt = "", context = "" }) => {
  const profile = findPrimaryProfile(users);
  const mergedText = [profile.sport, prompt, context].filter(Boolean).join(" ");
  const sportKey = resolveSportKey(profile.sport, mergedText);
  const sportLabel = SPORTS[sportKey]?.label || "General";
  return {
    sport: profile.sport || sportLabel,
    goal: profile.goal,
    level: profile.level,
    time: profile.time,
    place: profile.place,
    sportKey,
  };
};

module.exports = {
  detectSportFallback,
  buildFallbackPlanForSport,
};
