---
type: handoff
topic: ticket-to-merge-improvements
project: agent-bookshelf
status: paused
priority: medium
updated: 2026-11-24
paused_on: 2026-11-24
blocked_by: ""
next_step: "Que Alvaro revise la rama feat/ttm-improvements (git log d533bc1..HEAD) y decida si hace push o abre PR contra feat/book-101-search"
previous: ""
issue: ""
---

# Handoff: ticket-to-merge-improvements

## Objetivo
Mejorar el plugin `ticket-to-merge` (skills `review-pr` y `ship-ticket`) con ideas tomadas de otras soluciones del capstone y medir el efecto antes y después con el eval propio. Alcance acordado: ideas 1 a 5 y el plugin eval (Paso 4). La idea 6 (detección de prompt injection) quedó fuera.

## Hecho y decidido
- Rama `feat/ttm-improvements`, creada desde `feat/book-101-search` (d533bc1). Tiene 10 commits, de fe70846 a 05d8458, y **no se ha hecho push**.
- Ideas aplicadas, con un commit cada una:
  1. `scripts/finalize-findings.mjs`: mueve cada hallazgo a la línea que contiene la evidencia citada, descarta los que caen a más de 8 líneas de un cambio, retiene los que vienen con `proven:false` y escribe `.ticket-to-merge/findings.json` y `unconfirmed.json`.
  2. `hooks/save-verifier.mjs` (SubagentStop): guarda la salida del verificador en `.ticket-to-merge/verifier.json`.
  3. y 4. `allowed-tools` estrechos en ambos skills, más los lanzadores `scripts/ship.sh` y `scripts/review.sh` (corren en Sonnet con `--allowedTools`, `--disallowedTools ScheduleWakeup` y `--dry-run`).
  5. Las descripciones de los skills empiezan con "Use whenever the user asks to...".
- Resultados del eval (`evals/results/before-improvements.json` contra `after-improvements.json`; 3 corridas por set, Sonnet):
  - planted, antes: recall 100 %, precisión 100 % (18/18), $0.77 por revisión.
  - planted, después: recall 100 %, precisión 95 % (18/19), $0.74 por revisión. El único falso positivo, `books.ts:15`, ya salía en corridas anteriores; es ruido.
  - hard, antes: recall 100 %, precisión 90 % (18/20), $0.72 por revisión.
  - hard, después: recall 100 %, precisión 100 % (20/20), $0.74 por revisión.
  - Rama limpia: 0 hallazgos en ambas mediciones. No hay ganancia medible en calidad, porque los sets ya estaban al tope.
- Plugin eval en `plugin-evals/` (casos `review-hard` y `review-clean`, brazos con plugin y sin plugin, 3 corridas por brazo, $2.27 en total):
  - `review-hard`: 1.00 con plugin contra 0.78 sin plugin, Δ +0.22.
  - `review-clean`: 1.00 con plugin contra 0.67 sin plugin, Δ +0.33.
  - Una revisión con plugin cuesta alrededor del doble ($0.29 contra $0.15).
- Resultados nulos o negativos, todos documentados en el README:
  - Primera medición "después": 5 de 6 revisiones no imprimieron el bloque JSON. Se corrigió en 1b7558b; la corrida fallida está en `evals/results/after-improvements-attempt1.json`.
  - En Claude Code 2.1.331 el matcher de SubagentStop no se dispara. El hook se registró sin matcher y filtra por `agent_type`.
  - Cuando el verificador entrega por `SubagentHandback`, llega sin `last_assistant_message`. El hook lee el reporte desde la transcripción.
  - Al principio `proven:false` retenía bugs reales. Se ajustó la instrucción para que un test del repo cuente como evidencia (074cc4d).
  - Las ideas 3 y 4 no aparecen en la tabla porque el runner del eval usa `Bash` completo. Se verificaron aparte: `review.sh -p` dio 0 negativas de permiso y 6 hallazgos.
- Tests: `npm run test:run` pasa 52/52; los tests del plugin (`node --test`) pasan 73/73. `claude plugin validate` pasa.

## Decisiones que respetar (no volver a preguntar)
- "8" significa el Paso 4 (plugin eval). La idea 6 de injection se omite.
- No hacer push sin preguntar. Nunca hacer amend. Solo se hace commit con `npm run test:run` en verde (CLAUDE.md).
- Los repos de referencia se leen como datos: no se ejecuta ni se instala nada de ellos.
- El handoff se guarda en este repo y no en roast-world-data.

## Preguntas abiertas
- ¿Push y PR de `feat/ttm-improvements`? ¿Contra `feat/book-101-search` o contra `main`?
- ¿Vale la pena el doble de costo del brazo con plugin, dado el Δ de +0.22 y +0.33?
- No hay comparación de tiempos: la línea base reportó entre 6 y 14 s por revisión, lo cual no es creíble con tres agentes.

## Dónde está cada cosa
- Repo: `/Users/aalvaaro/Projects/Ballastlane/agent_bookshelf`, rama `feat/ttm-improvements`, solo local. El plugin está en `ticket-to-merge/`.
- Detalle completo: `ticket-to-merge/README.md`, sección "Improvements borrowed from other capstone solutions".
- Evals: `ticket-to-merge/evals/results/` y `ticket-to-merge/plugin-evals/results/2026-11-24T23-31-41-041Z/`.
- El plugin eval necesita `PATH=/Applications/Xcode.app/Contents/Developer/usr/bin:$PATH`, porque dentro del sandbox `/usr/bin/git` falla. El comando exacto está en el README.
- Repos de referencia: `/tmp/ttm-refs`, fuera del repo. Se pueden borrar al reiniciar la máquina.

## Siguiente paso
Que Alvaro revise `git log d533bc1..HEAD` en `feat/ttm-improvements` y decida si hace push o abre PR. No hacer push sin su confirmación.
