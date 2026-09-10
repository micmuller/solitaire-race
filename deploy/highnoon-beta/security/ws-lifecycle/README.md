# Verbindungslokale WebSocket-Fehler — Folgefix

## Ursache und begrenzte Änderung

Bobs Abnahmebericht in ../../reports/2026-09-10-ws-7f5ca0a4/ wurde zuerst gelesen.
Ausgangsstand d48dc2d75a3212dc9cdcedf92b6ef2fc7f4719a0 enthält dieselbe
Serverimplementierung wie der abgelehnte ws-Kandidat 7f5ca0a4.
ws 8.21.3 meldet korrekt ein error-Event auf der WebSocket-Instanz. Ohne
Listener beendet Node den gesamten Prozess. Dass der Parser die Verbindung
mit 1008 schliesst, genügt also nicht. Ungültiges UTF-8 hat denselben Fehlerpfad.

Änderung ausschliesslich im connection-Lifecycle in vnext/server/index.js:

- error-, close- und message-Listener vor dem ersten Snapshot-Send registrieren.
- Fehler einmal als WS_ERROR mit technischem Code protokollieren, keine
  Client-Payload oder Tokens loggen.
- Peer einmalig aus der Room-Map entfernen und anwendungseigenen Message-
  Listener lösen; vorhandenen Bot-Orphan-Lifecycle weiterverwenden.
- Parser-eingeleiteten Close-Handschlag (1007/1008) erhalten. Falls ein Fehler
  einen noch OPEN stehenden Socket betrifft, nur diesen Socket terminieren.
- Bei Fehler und späterem close keine doppelte Bereinigung; eine bereits
  verbundene Ersatzverbindung darf vom alten close nicht ausgetragen werden.
- Verzögerte Nachrichten von ersetzten Peers/entfernten Matches ignorieren.
- Verbindungslokaler error-Listener bleibt bis zur Freigabe des Socket-Objekts
  vorhanden, damit auch ein spätes Fehlerereignis abgefangen wird. Keine
  removeAllListeners-Aufrufe, keine Entfernung interner ws-Listener.

Keine globale uncaughtException-Behandlung, keine Restart-Lösung, keine
Änderung von Regeln/Protokoll, Datenbankschema, ws-Version oder Base-Images.
Sonstige Programmier-/Datenbankfehler werden nicht pauschal verschluckt.

## Echter Serverprozess und RED/GREEN

vnext/test/ws-lifecycle.test.js startet pro Szenario per fork einen eigenen
Node-Prozess. Die Fixture vnext/test-support/ws-lifecycle-child.cjs startet die
reale createVNextServer-Implementierung auf 127.0.0.1:0 mit eigener temporärer
SQLite-Datei; kein globaler Error-Handler, kein Prozessmanager/Restart. Alle
Socket-Proben richten sich ausschliesslich an diesen gemeldeten Zufallsport.
Fixture liegt bewusst ausserhalb des automatisch gesuchten test-Verzeichnisses.

Drei Szenarien: 16.385 leere Fragmente bei Limit 16.384; ungültiges UTF-8;
abrupte Transporttrennung. Je Szenario zwei Matches und drei Verbindungen.
Prüfungen nach dem Fehler:

1. Angreifer-Verbindung geschlossen (1008 für Fragmente, 1007 für UTF-8).
2. Identischer Serverprozess lebt weiter und /health liefert 200.
3. Anwendungseigener Message-Listener der alten Verbindung entfernt.
4. Unbeteiligter Spieler in anderem Match kann ziehen und erhält Ack.
5. P2 im betroffenen Match kann ebenfalls ziehen und erhält Ack.
6. P1-Platz lässt sich ohne Takeover-Flag neu verbinden und bespielen.
7. Anschliessender expliziter Reconnect ersetzt diesen Peer; nach dem close
   des alten Peers bleibt der Ersatzpeer spielbar und /health weiterhin 200.

RED wurde VOR der Serverkorrektur ausgeführt. Der finalisierte identische Test
wurde zusätzlich gegen eine temporäre Kopie des Ausgangsservers bestätigt:
server/core/bot/client/test-support und Test in ein mkdtemp kopiert; nur index.js
via `git show d48dc2d75a3212dc9cdcedf92b6ef2fc7f4719a0:vnext/server/index.js`
aus dem Ausgangscommit verwendet; ws 8.21.3 unverändert. Kein Zurücksetzen des
Arbeitsbaums, kein Zugriff auf Beta. RED: Prozess Exit 1 bei Fragment/UTF-8;
Transportfall meldet verbliebenen Message-Listener. Drei Fehler, Exitstatus 1.

Befehle (jeweils im Server-Repo bzw. in dieser temporären Ausgangskopie):

```sh
node --test vnext/test/ws-lifecycle.test.js
npm test
git diff --check
```

Ergebnisse auf M4/macOS, Node 22.22.3, ws 8.21.3:

- RED: 0 PASS / 3 FAIL; Prozessabsturz durch WS_ERR_TOO_MANY_BUFFERED_PARTS
  bzw. WS_ERR_INVALID_UTF8, kein OOM-Reproducer erforderlich.
- GREEN: 3 PASS / 0 FAIL; alle oben genannten Integrationsassertionen erfüllt.
- Gesamtsuite: 232 PASS / 0 FAIL / 1 SKIP (Linux-Prozessidentität).
- Gesamtsuite enthält die zwei bisherigen ws-security-Parserregressionen,
  Spiel-/Bot-/Reconnect-, Profil-/History- und SQLite-Backup/Restore-Tests.
- Kein aktueller Linux-/Container-Nachweis von Codex: Docker lokal nicht
  vorhanden. Bobs frühere 230 nativen PASS gehören zum abgelehnten Vorgänger.

Belege: red.tap, green.tap, full-suite.tap. Nur lokale Repository-/Scratch-
Präfixe sind durch <repo>/<scratch> ersetzt, sonst Testausgabe unverändert.
Keine echten Benutzerprofile/Tokens oder Beta-Daten in den Proben.

## BOB: separate Linux-/Image-Nachabnahme

Vollständige Kandidaten-SHA wird in CANDIDATE.md nach Commit-Erstellung ergänzt.
Diesen Code-Kandidaten separat auschecken und mit unveränderten Bases bauen:

```sh
export NODE_IMAGE='node@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752'
export NGINX_IMAGE='nginx@sha256:dc5069ad14f19660b141b21236140b91656bf89bbc3e2417c70ae650cd66104c'
bash deploy/highnoon-beta/build.sh /srv/micnet/releases/highnoon/<candidate-sha>
```

Nur neues Kandidatenverzeichnis, keine Imageauswahl der Beta ändern.
Native Gesamtsuite ausführen, insbesondere ws-lifecycle.test.js und
ws-security.test.js. Fixture/test-support in die temporäre Testkopie mitnehmen.
Danach eigene isolierte App/Origin-Image-Probe mit Bobs fragment-repro.cjs:
1008 UND Health 200 UND Prozess unverändert lebendig; anderer Peer spielt weiter,
Neu-/Reconnect klappt. Nicht gegen die laufende Beta richten. Zusätzlich normales
Spiel/Aufgabe/Profil/History, Bot plus Onlinebackup prüfen; Trivy gegen exakt
fertige Images erneut scannen und Image-/Config-Digest-Zuordnung belegen.

Grenzen: Direkter Loopback-Test beweist noch keine Proxy-/HTTP/WSS-Abnahme,
keine Kapazitätszusage und keine allgemeine DoS-Immunität. Breitere ungültige
Protokoll-/Sendefehler werden vom selben error-Listener erfasst; echte fragment-
und UTF-8-Parserfehler sowie Transportabbruch sind hier konkret geprüft.
Kein eigener schwer reproduzierbarer Kernel-Sendefehler injiziert.
Hohe/kritische Base-/npm-Restbefunde bleiben offen, siehe ../FINDINGS.md.
Backup-Alarme/Stale-Erkennung, Endgeräte-/HTTPS-/iOS-Abnahme bleiben eigene Gates.
Kein Beta-Deployment, kein Cloudflare-Zugang, keine FinanceHub-Änderung.

## Separate Base-Empfehlung zur Abstimmung (NICHT aktiviert)

Bewertungsgrundlage sind Bobs README, package-deltas.json, scan-summary.json
und Raw-Scans des Übergabecommits d48dc2d. Diese Imagebefunde wurden hier nicht
selbst mit Docker nachgemessen.

**Node:** node@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5
ist als eigener nachfolgender Runtime-Kandidat sinnvoll: Node 22.23.2 statt
22.22.3 enthält spätere Security-Fixes. npm bleibt 10.9.8, OS-Delta betrifft
base-files; kein Rückgang der HIGH/CRITICAL-Pakettreffer. Deshalb kein
"Base-Security erledigt". App-/SQLite-/Backup- und Lifecycle-Abnahme erforderlich;
Toolchain-Minimierung bleibt separater Schritt, nicht heimlich npm löschen.
Primärquelle für Runtime-Fixes:
https://nodejs.org/en/blog/vulnerability/july-2026-security-releases

**Nginx:** nginx@sha256:d6d5b2985faade9971eb1bec34c3f778b800f872f236969b3fd1ba65f4692b54
(stable-alpine-slim) ist als eigener Origin-Kandidat empfehlenswert. Das Paket-
inventar sinkt laut Bob von 71 auf 21, der konkrete Scan zeigt 0 Befunde.
Unser Proxy verwendet keinen der entfernten Bild-/GeoIP-/XSLT-Zusatzpfade.
Dennoch sind nginx -t und ein leerer Scan keine komplette Runtime-Abnahme:
Image mit Dockerfile.origin bauen, UID/tmpfs/Read-only-Healthcheck inkl. wget,
DNS-Neuauflösung nach App-Recreation, Assets/PWA, HTTP, WSS, zwei Spieler,
Reconnect und Netzwerkgrenzen prüfen. Keine generelle Schwachstellenfreiheit.

Empfehlung: erst diesen Prozessabsturz schliessen. Danach die beiden konkreten
Base-Wechsel ausdrücklich bestätigen lassen und unabhängig voneinander testen;
beide NICHT in diesen Folgefix oder die aktuelle Beta aufnehmen.
