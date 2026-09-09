# #292 — Pixi/PWA Austeil-Prototyp

## Abschluss / Benutzerabnahme 09.09.2026

Michael hat die Austeilanimation einschließlich der nativen Sichtbarkeitskorrektur
ausdrücklich abgenommen. #292 ist abgeschlossen. Finaler Stand: Server alpha.27,
Pixi/PWA 0.3.9, iOS 1.2.16 (31). 226/226 Node/Pixi-Tests, 35/35 native Tests,
Web-Produktionsbuild und optimierter iOS-Gerätebuild erfolgreich.
Veröffentlichung gemeinsam mit den bislang uncommitteten, ebenfalls abgenommenen
Bot-Stärken aus #246. Die folgenden UAT-/Offen-Angaben sind historischer Verlauf.

## Live-Integration und natives iOS — UAT-Kandidat

Server **1.1.0-alpha.27**, Pixi/PWA **0.3.9**, iOS **1.2.15 (30)**.
Die Vorschau wurde vom Benutzer optisch abgenommen. Der folgende Ausbau ist
implementiert, wartet aber noch auf gemeinsame PWA-/iPad-UAT.

- Neue Pixi/iOS-Matches optieren über `dealAnimation: true` in eine feste
  serverseitige Startphase von 1800 ms ein; alte API-Aufrufer bleiben unverändert.
- Direkte Spiele beginnen die Phase bei Erstellung, Lobbyspiele erst bei P2-
  Beitritt. Restarts derselben Session erhalten eine neue Deal-Generation,
  auch bei unverändertem Seed. Wartezustand auf P2 verbraucht keine Uhrzeit.
- Additive optionale Transportfelder `progressClock.dealId`/`dealEndsAt`
  zusammen mit `serverNow`, auch bei deaktivierter Fortschrittsuhr. Kein neuer
  kanonischer Kartenstate, keine Regel-/Hash-/Replay-Änderung. Bestehender
  Protocol-2.5.2-Envelope bleibt lesbar; fehlende Felder bedeuten keine Startphase.
- Frühe Intents erhalten Snapshot `DEALING`, ohne Mutation, Seq-Verbrauch oder
  Replay-Aktion. Server-Bots und visuelle Bots warten. Am Ende folgt Snapshot
  `DEAL_READY`; beide vollen Uhrbudgets beginnen an derselben Server-Zeitgrenze.
- Pixi und UIKit teilen beide Tableaus parallel aus zwei Stockpositionen aus.
  Normale Animation 1434 ms; verspätete Darstellung wird auf die verfügbare
  Restphase gekürzt bzw. übersprungen. READY/aktueller State hat immer Vorrang.
  Die Startphase ist zeitgebunden, kein unbegrenzt verlängerbarer Client-Ready-Handshake.
- Verdeckte Karten bleiben verdeckt; sichtbare Endkarten erscheinen bei Ankunft.
  Neue Snapshots, Resize und Transient-Reset räumen die Animation auf. Dieselbe
  Deal-ID wird nicht erneut animiert; expliziter Reconnect startet kein Austeilen.
- Reduzierte Bewegung/ausgeschaltete Kartenanimationen zeigen den Endtisch;
  sie überspringen nicht die gemeinsame serverseitige Sperre. iOS verwendet
  native UIView-Animationen und keine Pixi-Einbettung.

Verifikation: 226/226 Node/Pixi-Tests, Produktionsbuild, 35/35 native Tests auf
iOS 26.5 sowie optimierter unsigned arm64 Release-Build erfolgreich. Gezielte
Tests für beide Modi, Frühintents, volle Uhrbudgets, Restarts, Lobbybeitritt,
Metadaten-Decoding sowie native Abbruch-/Doppelstart-Sicherheit. Browser-Smoke
mit echtem Human-vs-Bot-Match auf isoliertem Loopback-Server/Memory-DB: reguläre
Züge nach Startphase, keine Konsolenfehler. Testserver beendet; Nutzer-Server
und persistente Spieldaten unverändert. Kein Commit/Push.

UAT: PWA neu laden und neuen Serverstand selbst starten, iOS neu bauen/installieren.
Human-vs-Bot und Mensch-vs-Mensch, Split/Shared, Uhr an/aus, Neustart mit gleichem
und neuem Seed prüfen. Auf iPad speziell Flugbild, Rotation, Reduce Motion und
Reconnect prüfen. Neuer Austeil-Sound bleibt separat in #291.

## Historischer Vorschau-Stand

Stand 09.09.2026, Pixi/PWA 0.3.8. Server und iOS unverändert.

Menü → Lobby → Austeilen-Vorschau. Vorher eine echte Partie verlassen.
Eine explizit nicht spielbare Grafik-Fixture zeigt zwei Decks mit je 24 Stock-
und 28 Tableau-Karten. Die Karten fliegen von beiden Stockpositionen parallel
zeilenweise auf die sieben Spalten: 42 ms Staffelung, 300 ms Flug, insgesamt
1434 ms. Kartenwerte verdeckter Karten werden nicht dargestellt. Offene Karten
werden erst bei Ankunft sichtbar. Keine Serveranfrage für die Vorschau.

Bestehende Einstellung für Kartenanimationen/Reduce Motion wird respektiert.
Statewechsel, Resize und Aufräumen brechen auf exakte Endpositionen ab.
Vorschau kann über denselben Menübutton erneut gestartet werden.

Verifiziert: Produktionsbuild, automatisierte Tests für 104 eindeutige Karten,
Startform, Staffelung, Gesamtdauer und unveränderte Eingabedaten; Browser-Smoke
mit sichtbarer Flugphase und vollständigem Endzustand, keine Konsolenfehler.

Noch NICHT umgesetzt: automatisches Austeilen bei echten Spielstarts/Restart,
serverseitig faire gemeinsame Startphase für Menschen/Bots/Fortschrittsuhr,
iOS und neuer Austeil-Sound (#291). Task bleibt in progress; zunächst optische
Benutzerbeurteilung dieses Prototyps. Keine Serverneustarts, kein Commit/Push.
