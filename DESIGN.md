# Design System — Momentum Ascent (capa "app premium")

Sistema de rediseño que eleva la marca actual (dark + naranja) hacia un
lenguaje de **app**, no de página web. Se aplica de forma **aditiva** vía
`www/app-shell.css` + una clase compuerta `app-redesign` en `<body>`, sin
reescribir `styles.css` (monolito compartido) ni tocar `app.js`.

> Regla de oro: **no cambiar nombres de clase ni IDs**. `app.js` inyecta las
> pick-cards y referencia variables CSS (`--orange`, `--green`, `--red`,
> `--yellow`) desde JS. El rediseño solo re-estiliza; nunca re-estructura.

## 1. Atmósfera

Carbón cálido con auroras tenues de marca. Un apostador revisando los picks de
IA del día en su teléfono, de noche, antes de los partidos → **tema oscuro
cálido** (nunca `#000`/`#fff` puros). Densidad media, esquinas muy redondeadas,
una sola sombra suave grande (lenguaje Drip), tipografía deportiva fuerte
(Barlow Condensed) que se conserva de la marca.

## 2. Color (tokens en `:root` de la pantalla + `.app-redesign` en app-shell)

Nombres que consume `app.js` (se conservan, valores elevados):

| Token | Valor | Rol |
| --- | --- | --- |
| `--orange` | `#FF5A1F` | Marca / acciones / pick IA |
| `--dark` | `#100c0b` | Fondo (carbón cálido, no negro puro) |
| `--text` | `#f6efe7` | Texto principal (crema cálida) |
| `--muted` | `rgba(246,239,231,.46)` | Texto secundario |
| `--green` `--red` `--yellow` | `#46E59A` `#FF6B6B` `#FFB23E` | Ganado / perdido / riesgo medio |

Tokens nuevos (en `.app-redesign`, OKLCH con tinte cálido):
`--surface`, `--surface-2`, `--line`, `--brand`, `--brand-soft`, `--cream`,
`--shadow`, `--shadow-sm`, `--glow-brand`.

- Estrategia: **comprometida** — el naranja carga la identidad; la crema realza.
- Prohibido: gradient-text, neón/glow saturado, glassmorphism decorativo.

## 3. Tipografía

- Display: **Barlow Condensed** 900 italic, track-tight (títulos, valores, equipos).
- Body: **Barlow** 300–600, interlineado relajado.
- Se mantiene la fuente de marca (no se mete Inter ni serif).

## 4. Forma y elevación

- Radios: cards `--r-lg` (20px), chips/botones `--r-pill` (999px), inputs `--r-md`.
- Una sombra: `--shadow-sm` en reposo, `--shadow` en hover. Sin sombras duras.
- **Sin side-stripe borders**: el riesgo se comunica con barra superior de ancho
  completo (`.pick-card::before`, color por `--risk-color`) + chip de riesgo.

## 5. Componentes

- **Botones**: pill, press `scale(.97)` (140ms `--ease-out`), primario naranja
  con `--glow-brand` y texto oscuro; secundario ghost con borde.
- **Pick card**: borde completo + radio + sombra suave, barra de riesgo arriba,
  hover `translateY(-2px)`.
- **Bottom-nav**: iconos **SVG stroke** (no emoji), item activo en naranja con
  pastilla `--brand-soft`, blur, padding con `safe-area-inset-bottom` (Capacitor).
- **App header**: `.user-panel-top` sticky + blur; links de texto ocultos (el
  bottom-nav cubre la navegación) → look de app.

## 6. Motion (Emil)

- Curvas fuertes: `--ease-out: cubic-bezier(.23,1,.32,1)`.
- Solo `transform`/`opacity`. Press feedback inmediato. Stagger ya existente en cards.
- Respeta `prefers-reduced-motion`.

## 7. Cómo propagar a otra pantalla

1. `<link rel="stylesheet" href="app-shell.css" />` después de `styles.css`.
2. `class="app-redesign"` en `<body>`.
3. Sustituir emojis del bottom-nav por los SVG (`.bn-ico`) — copiar de `user-hoy.html`.
4. En el `<style>` inline: refinar tokens `:root`, neutralizar `min-height` heredados
   de `styles.css`, redondear cards/botones, quitar cualquier `border-left` de color.
5. Verificar en navegador (las cards/datos los pinta `app.js`; conservar clases/IDs).

Pantallas pendientes: `user-bank.html`, `user-reto.html`, `user-progreso.html`,
`user-checkin.html`. Hecho: `user-hoy.html` (insignia).
