# Task #272 – visueller Client-Bot für Pixi und iOS

Pixi `0.3.3` und iOS `1.2.10 (25)` ergänzen den bestehenden schnellen
Bot-vs-Bot-Observer um eine zweite Darstellung. Nach erfolgreicher visueller
Abnahme in Pixi ist dieselbe Architektur nun als iOS-UAT-Kandidat umgesetzt.

## Varianten

- `Schnell`: P1 und P2 laufen weiterhin serverseitig, Pixi verbindet sich
  schreibgeschützt als Observer. Dieser Modus eignet sich für schnelle
  technische Läufe.
- `Visuell`: Pixi beziehungsweise iOS verbindet sich als echter
  P1-Thin-Client. Ein lokaler
  Autopilot wählt lediglich den nächsten Zug und sendet ihn als regulären
  Intent. P2 bleibt ein serververwalteter Bot. Beide Seiten erreichen den
  gewählten Client als autoritative Acks und verwenden damit den normalen
  Karten- und Flip-Pfad.

Der P1-Autopilot wartet vor jedem Intent auf einen freien Protokollpfad. Nach
dem Ack lässt er bei aktiven Animationen zusätzlich Zeit für die Darstellung,
bevor der nächste P1-Zug geplant wird. Bei `Reduce Motion` beziehungsweise
deaktivierten Kartenanimationen entfällt diese Zusatzpause und die Darstellung
springt entsprechend der bestehenden Benutzereinstellung in den neuen Zustand.

Rejects werden pro autoritativem Zustand gemerkt und nicht sofort wiederholt.
Snapshots löschen den transienten Board-Zustand; ein Reconnect setzt den
visuellen Autopiloten kontrolliert fort. Menüwechsel, neuer Match, Demo, Lobby,
Hintergrundwechsel und `Bot stoppen` beenden ihn kontrolliert. `Bot stoppen`
beendet zusätzlich den serverseitigen P2-Bot. iOS verlässt danach das alte
Bot-Match vollständig, sodass die Startbuttons unmittelbar wieder für ein
neues Bot-Spiel verfügbar sind.

## Prüfung und Abschluss

Automatisiert geprüft sind Kandidatenauswahl, deterministisches Pacing,
Animations-Synchronisation, Stop während einer Pause sowie die Fortsetzung
nach Reject und Recovery-Snapshot. Die komplette Pixi-Suite umfasst 93 Tests.

Die lokale visuelle Vorprüfung am 2026-09-07 war für `Split` und `Shared`
erfolgreich: P1- und P2-Züge liefen fortlaufend, Punktestand und Revision wurden
aktualisiert und beide Bots ließen sich gemeinsam stoppen. Der isolierte
Testserver auf Port 3022 wurde anschließend heruntergefahren.

Für die Benutzerabnahme:

1. `Menü > Bot` öffnen und `Visuell` wählen.
2. Je einen Lauf in `Split` und `Shared` starten.
3. Kartenbewegungen und Flips von P1 und P2 beobachten; es darf kein
   Animationsstau entstehen.
4. Kartenanimationen auf `Aus` oder systemweit `Bewegung reduzieren` testen.
5. Während eines Laufs `Bot stoppen` wählen und prüfen, dass die Revision nicht
   weiterläuft.

Die Benutzerabnahme ist am 2026-09-07 für Pixi sowie iOS/iPadOS erfolgreich
abgeschlossen worden. Auf iOS wurde dabei zusätzlich bestätigt, dass
`Bots stoppen` das alte Match vollständig verlässt und unmittelbar ein neues
Bot-Spiel gestartet werden kann. Task #272 ist damit abgeschlossen.
