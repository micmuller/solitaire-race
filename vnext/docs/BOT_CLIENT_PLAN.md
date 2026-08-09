---
Document: BOT_CLIENT_PLAN.md
Version: vNext-0.1
Status: DRAFT
Phase: Phase 2 - Bot Client & Drift Harness
Last-Updated: 2026-08-02
---

# Bot Client Plan

## Ziel
Der vNext-Bot ist ein regelneutraler Protocol-2.5.0-Client und Drift-Harness.
Er erzwingt keine Regeln, mutiert keinen State lokal und akzeptiert Rejects als
normale Serverantwort. Alle Spielentscheidungen werden als Intents an die
autoritative Server-Shell gesendet.

## Modi

### 1. Human vs Bot
- Host erstellt ein Match und spielt als Mensch.
- Bot verbindet sich als freier Gegenspieler (`p2`, spaeter konfigurierbar).
- Bot erzeugt Actions nur fuer seine eigene Spieler-ID.
- Bot stoppt, wenn Match endet, Verbindung getrennt wird oder der Mensch das
  Match verlaesst.
- Primaerer Nutzen: spielbarer Einzelspieler-/Testmodus gegen eine einfache,
  reproduzierbare Bot-Strategie.

### 2. Bot vs Bot
- Zwei Bot-Clients verbinden sich als `p1` und `p2` in dasselbe Match.
- Keine UI-Abhaengigkeit; der Lauf ist CLI-/Harness-tauglich.
- Ziel ist Drift-Erkennung, Replay-Erzeugung, Endgame-Beobachtung und Design
  des Spielendes.
- Jeder Lauf schreibt kompaktes Ergebnis: seed, mode, action count, final rev,
  final stateHash, reject count je Bot, stop reason und optional Replay-Link.

## Geschwindigkeiten
- `slow`: sichtbarer Demo-/Debug-Lauf, ca. 900-1200 ms zwischen Bot-Actions.
- `normal`: spielnaher Testlauf, ca. 250-400 ms zwischen Bot-Actions.
- `fast`: Drift-/Regression-Lauf, ohne kuenstliche Wartezeit ausser Event-Loop
  Yield und Pending-Ack-Abschluss.

Die Geschwindigkeit beeinflusst nur Scheduling, nie Strategie, RNG, Seed,
Action-Auswahl oder Protocol-Verhalten.

## Strategie v0
- Deterministische Heuristik mit stabiler Prioritaet:
  1. Foundation-Move aus Waste oder Tableau-Top.
  2. Tableau-Move aus Waste.
  3. Tableau-Move mit face-up Tableau-Suffix.
  4. Flip einer zugaenglichen verdeckten Tableau-Top-Karte.
  5. Draw oder Recycle.
- Der Bot darf legale Zuege bevorzugen, aber nicht selbst zur Autoritaet
  werden. Unsichere Kandidaten werden gesendet; Reject bleibt Teil des
  normalen Suchraums.
- Bei mehreren Kandidaten gleicher Prioritaet entscheidet eine deterministische
  Ordnung aus seed, botId, rev und Kandidatenindex.

## Drift- und Endgame-Gates
- Bot-Client nutzt dieselbe Thin-Client-State-Machine wie Web/iOS:
  maximal ein ausstehender Intent, seq nur nach eigenem Ack erhoehen,
  State nur aus Ack/Snapshot ersetzen.
- Bot-vs-Bot-Lauf muss bei identischem seed/mode deterministisch denselben
  ActionLog-Hash und End-StateHash erzeugen.
- Drift-Verdacht liegt vor, wenn Replay des erzeugten Logs vom Live-Lauf
  abweicht oder wenn zwei gleiche Bot-vs-Bot-Laeufe divergieren.
- Spielende ist zunaechst beobachtend zu designen: Win-/Stalemate-/No-progress-
  Kriterien werden aus Bot-vs-Bot-Laeufen abgeleitet und erst danach als
  explizite Server-Regel/ADR eingefuehrt.

## Umsetzungsschritte
1. [X] Shared Bot-Core als reiner Action-Generator unter `vnext/bot/`.
2. [X] Bot Protocol Client Adapter auf Basis des bestehenden vNext-Client-Vertrags.
3. [X] CLI-Harness fuer Human-vs-Bot mit Match-ID/Client-ID und optionaler
   Auto-Match-Erstellung.
4. [X] CLI-Harness fuer Bot-vs-Bot mit seed, mode, speed, maxActions und
   Replay-Export.
5. [X] Regressionstests fuer deterministische Kandidatenauswahl, seq/pending,
   Reject-Handling und zwei identische Bot-vs-Bot-Laeufe.
6. Dashboard-/Replay-Auswertung fuer Drift, Laufzeit und Spielende-Hypothesen.

## Nichtziele im ersten Bot-Block
- Keine Machine-Learning-Strategie.
- Keine echte Accounts/Auth.
- Keine finale Spielende-Regel ohne gesonderte Entscheidung.
- Keine Migration der Legacy-v1-Botlogik mit lokaler Gameplay-Authority.
