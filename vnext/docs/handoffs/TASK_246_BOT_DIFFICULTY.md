# Task #246 — Kalibrierung und UAT-Kandidat

## Abschluss 09.09.2026

Benutzer-UAT erfolgreich, #246 ausdrücklich abgenommen. Veröffentlichung der
bisher uncommitteten Bot-Stärken gemeinsam mit #292 (Austeilanimation): Server
alpha.27, Pixi 0.3.9, iOS 1.2.16 (31). Historische Kalibrierungszahlen und offene
UAT-Hinweise unten sind keine aktuelle Aufgabenliste oder Siegquotengarantie.

## UAT-Feintuning: Info und Tempo

Benutzerfeedback: Leicht/Mittel passen; Schwer ist zu schnell. Hard-Profil auf
900–1300 ms angehoben (zuvor 500–800 ms), auf Server/Pixi/iOS identisch konfiguriert.
Leicht und Mittel unverändert. PWA zeigt Bot-Erklärung in einem per Info-Button
geöffneten Popover, iOS im Info-Dialog; kein dauerhaft hoher Erklärungstext mehr.
Versionen: Server 1.1.0-alpha.26, Pixi 0.3.7, iOS 1.2.14 (29).
Webbuild und 218 Tests erfolgreich. Manueller UAT und Serverneustart durch Benutzer.

## UAT-Korrektur: natürlicher Spielfluss (2026-09-09)

Server **1.1.0-alpha.25**, Pixi **0.3.6**, iOS **1.2.13 (28)**.
Benutzer-UAT verwirft lange taktische Wartephasen: Mittel konnte bis zu 90 s,
Schwer bis zu 108 s den gesamten Aktionsfluss blockieren. Die Uhrreservierung
ist jetzt für alle Stufen deaktiviert. Normale stufenabhängige Zugintervalle
bleiben; taktische Unterschiede entstehen durch Zugbewertung, nicht Aussitzen.
Damit blockiert die Uhr weder spielbare Karten noch Flip/Draw/Recycle.
Die folgenden historischen Siegquoten gelten NICHT für diesen neuen Stand.
Erneuter Benutzer-UAT erforderlich; laufenden Server startet der Benutzer selbst.

Verifikation: Pixi-Produktionsbuild, 218/218 Node/Pixi-Tests und 33/33 iOS-26.5-
Tests erfolgreich. 48 Offline-Partien mit realen Intervallen, vier neuen Seeds,
beiden Rollen und Modi: Mittel gewinnt 4/16 gegen Leicht, Schwer 7/16 gegen
Mittel und 1/16 gegen Leicht; 46 Inaktivitätsenden, zwei vollständig beendet.
Dies ist keine abgeschlossene Siegquoten-Kalibrierung. Schnellere Fortschritte
und höhere Punktzahlen sichern unter der Inaktivitätsregel keinen Sieg.
Rohdaten: TASK_246_NATURAL_FLOW.json (TASK246-NATURAL, real, vier Seeds).
Offen: Spielfluss-UAT und weitere Stärkeabstimmung ohne langes Zeitspiel.

## UAT-Stand 2026-09-09

Server **1.1.0-alpha.24**, Pixi/PWA **0.3.5**, iOS **1.2.12 (27)**.
Lokale Änderungen, noch nicht committed/gepusht; Abschluss nach Benutzer-UAT.

### Analyse und Korrekturen

- Die alte Schleifensperre speicherte Zugwege unabhängig von inzwischen
  veränderten Karten. Sie wird jetzt nach Foundation-Fortschritt oder Aufdecken
  erneuert. Reine Königsspalten-Verschiebungen und andere nutzlose Umsortierungen
  liegen bei Mittel/Schwer hinter dem Stock-Ziehen.
- Mittel bewertet Freispielen, Aufdecken und nutzbare freie Spalten. Schwer
  berücksichtigt zusätzlich Tiefe verdeckter Stapel, sichtbare Folgeschritte,
  Umlegemöglichkeiten und gegnerische Foundation-Chancen.
- Leicht übersieht deterministisch bei einem Viertel der Entscheidungsschlüssel
  einen verfügbaren Zug zugunsten von Stock-Ziehen (falls Stock vorhanden).
  Keine ungültigen Züge, keine Kenntnis verdeckter Karten.
- Gleiche UTF-8-FNV-Gleichstandsauflösung in Node, Pixi und Swift; Node/Pixi
  teilen weiterhin die Bewertung. Node bewahrt nun die Clock-Metadaten samt
  Empfangszeit für serverzeitrelative Entscheidungen auf.
- Reject-Merklisten auf Node/Pixi bleiben auf den aktuellen Zustand begrenzt.

### Zeitmanagement — ausdrücklich vom Nutzer erlaubt

Die Fortschrittsuhr kann schnelles Ausschöpfen aller Optionen bestrafen: Ein
langsamer Bot gewinnt dann trotz weniger Punkten. Daher erhalten Mittel und
Schwer eine taktische Reserve. Gibt es nur einen unmittelbar verfügbaren
Foundation-Fortschrittszug, wird dieser unter geeigneten Bedingungen gehalten.
Mittel löst spätestens bei 30 s Restzeit, Schwer bei 12 s Restzeit aus.
Aufdecken, erkennbare unmittelbare Folgezüge und die letzte eigene Karte zum
Sieg werden nicht gehalten. Ohne aktive Uhr gibt es keine taktischen Pausen.
Pause wird regelmäßig neu bewertet; Stop, Reconnect und Gegnerfortschritt
bleiben wirksam. Warteschritte verbrauchen beim verwalteten Bot kein Zugbudget.
Das Bot-Menü erklärt die Pausen; der visuelle P1-Status benennt sie ausdrücklich.

### Getrennte Validierung

`node vnext/bot/compareStrategies.js 12 TASK246-HOLDOUT-FINAL real`

12 neue Seeds, vertauschte Rollen, Split/Shared, alle Paarungen: 144 Partien.
Originale Server-MatchSession einschließlich Fortschrittsuhr, virtuelle Zeit mit
den echten Bot-Intervallen; kein Warten in Echtzeit. Pausen werden übersprungen
und nach gegnerischen Aktionen erneut geprüft. Begrenzung: 1600 akzeptierte
Aktionen, 20000 Scheduler-Ereignisse oder 2 h virtuelle Zeit. Keine Partie dieses
Laufs erreichte die Grenze. Kein Netzwerk-/Rendering-Benchmark.

| Modus | Paarung | Siege |
|---|---|---|
| Split | Leicht / Mittel | 2 / 22 |
| Split | Mittel / Schwer | 4 / 20 |
| Split | Leicht / Schwer | 2 / 22 |
| Shared | Leicht / Mittel | 2 / 22 |
| Shared | Mittel / Schwer | 6 / 18 |
| Shared | Leicht / Schwer | 2 / 22 |

Das belegt eine klare Staffelung in dieser Stichprobe **mit Uhr**. 142 Partien
endeten durch Inaktivität, nur zwei durch vollständigen Abschluss: Der große
Abstand wird wesentlich durch Zeitmanagement verursacht, nicht durch überlegenes
Lösen allein. Bot-vs-Bot mit taktischen Reserven kann deutlich länger dauern.

Ohne Uhr, bei gleichem Tempo (12 separate Seeds, 144 Partien), lagen die
aufsummierten Punkte in allen Paarungen für die höhere Stufe höher, teilweise
nur knapp. Viele Partien waren nach 1600 Aktionen unbeendet; sie zählen nicht
als Siege. Eine allgemeine Garantie auf höhere Siegquote ohne Uhr folgt daraus
nicht. Rohdaten: `TASK_246_HOLDOUT_REAL.json` und `TASK_246_NO_CLOCK.json`.

### Prüfung und UAT

- Node/Pixi: Regressionstests einschließlich Hidden-Information-, Strategie-,
  Gleichstands-, Clock-Reserve-, Wiederaufnahme- und Stop-Tests.
- Pixi-Produktionsbuild erfolgreich; iOS 26.5: 33/33 Tests erfolgreich;
  optimierter unsigned arm64 Release-Gerätebuild erfolgreich.
- Bekannter iOS-26.2-Demo-Deinitialisierungsbefund aus dem ersten Stand bleibt
  dokumentiert; kein erneuter 26.2-Lauf im Kalibrierungsblock.

UAT: Menü → Bot → Leicht/Mittel/Schwer → Match mit Bot. Zunächst ohne Uhr das
Spielgefühl vergleichen; danach 2-Minuten-Fortschrittsuhr aktivieren und die
Reserve bei Mittel/Schwer prüfen. Split und Shared testen. Im visuellen
Bot-vs-Bot-Modus Pause beobachten, währenddessen stoppen und neu starten.
PWA-Version 0.3.5 kontrollieren; native App als 1.2.12 (27) aufs iPad bauen.

## Historischer erster Stand

Stand: 2026-09-09. In Bearbeitung, noch keine abschließende Spielstärke-Abnahme.
Versionen: Server 1.1.0-alpha.23, Pixi/PWA 0.3.4, iOS 1.2.11 (26).

## Implementiert

- Leicht bewertet unmittelbare Foundation-Punkte; Gleichstände bleiben seedbasiert.
- Mittel berücksichtigt zusätzlich Aufdecken, Waste-Freispielen und freie Spalten.
- Schwer bewertet zusätzlich einen bereits sichtbaren Foundation-Folgezug und
  neu eröffnete Foundation-Chancen sichtbarer gegnerischer Top-Karten.
- Keine Suche über unbekannte Karten: Stock-Werte und verdeckte Identitäten
  werden nicht ausgewertet. Der Seed dient ausschließlich der bestehenden
  deterministischen Gleichstandsauflösung.
- Node und Pixi verwenden dieselbe reine Bewertungsfunktion in `bot/strategy.js`.
  Swift spiegelt die Bewertungsregeln. Bestehende Schleifen-/Reject-Filter bleiben aktiv.
- Die bestehende Auswahl easy/medium/hard steuert jetzt Strategie und Tempo.
  BotActor und Offline-Vergleich können Strategie unabhängig vom Tempo prüfen.
- Keine Wire-/Rules-/Schema-Änderung. Alle Bots senden weiterhin reguläre Intents.

## Verifikation und erste Messung

211/211 Node-Tests einschließlich Pixi bestanden; Pixi-Produktionsbuild und
Vite-Entwicklungsimport der gemeinsamen Strategie bestanden.
Native iOS-26.5-Suite: 32/32 bestanden. Auf iOS 26.2 reproduzierbarer
Demo-Test-Absturz im Swift-Deinitialisierungs-Runtimepfad, 31/32 bestanden;
Details im nativen `vnext/TASK_246_BOT_DIFFICULTY.md`.
Gezielte Tests prüfen Aufdecken vs. Sofortpunkte, Gegnerchancen, sichtbaren
Folgezug, deterministische Auswahl und Unabhängigkeit von verdeckten Karten.

`node vnext/bot/compareStrategies.js 4` führt 48 isolierte Core-Partien aus:
vier Seeds, beide Sitzzuordnungen, Split/Shared und alle drei Paarungen.
Gleiche abwechselnde Zuggelegenheiten; maximal 1600 Aktionen pro Partie.
Keine Uhr und kein Netzwerk: dies ist ein Strategietest, kein Echtzeit-UAT.

| Modus | Paarung | Punkte gesamt in Reihenfolge der Paarung | Beendete Partien |
|---|---|---|---|
| Split | Leicht / Mittel | 874 / 823 | 0 / 8 |
| Split | Mittel / Schwer | 1519 / 1536 | 2 / 8, beide Schwer |
| Split | Leicht / Schwer | 926 / 821 | 0 / 8 |
| Shared | Leicht / Mittel | 991 / 1109 | 0 / 8 |
| Shared | Mittel / Schwer | 1342 / 1294 | 1 / 8, Schwer |
| Shared | Leicht / Schwer | 1095 / 1136 | 0 / 8 |

Die Ergebnisse belegen **noch keine durchgehend aufsteigende Spielstärke**.
Viele Partien erreichen die Aktionsgrenze. Unbeendete Partien zählen nicht als
Sieg oder Unentschieden. Punkte sind nur eine ergänzende Kennzahl; maßgeblich
bleibt die aktuelle serverautoritative Gewinnerregel.

## Nächste Arbeit innerhalb #246

1. Stock-/Tableau-Schleifen und ausbleibenden Fortschritt in Vergleichspartien
   auswerten; die bestehende 12-Züge-Schleifensperre allein reicht offenbar nicht.
2. Bewertungsgewichte kalibrieren, Beweglichkeit umfassender messen und die
   bisher nur einen sichtbaren Folgezug betrachtende Vorausschau ausbauen.
3. Größere Entwicklungs- und separate Validierungs-Seedmenge verwenden;
   Fortschrittsuhr und echte parallele Bots zusätzlich testen.
4. iOS/Pixi-Geräte-UAT, Veröffentlichung und Dashboard-Abschluss erst nach Abnahme.

Die Änderungen sind lokal, noch nicht committed oder gepusht.
LLM-Evaluation ist separat Backlog #289; Gegnerkommunikation Backlog #290.
