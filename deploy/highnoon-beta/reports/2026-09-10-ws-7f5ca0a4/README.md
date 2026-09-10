# Isolierte Abnahme: ws-Kandidat 7f5ca0a4

Stand: 2026-09-10. Quelle: `7f5ca0a4d483a4a7a461ecec4894585027d9fc80`.
Auftrag und Bewertungsbasis: `deploy/highnoon-beta/security/WS_FIX_AND_REVIEW.md` und `FINDINGS.md` dieses Commits.

## Urteil: NICHT FREIGEGEBEN

**Der aktualisierte ws-Parser begrenzt Fragmente, aber seine Fehlerbehandlung beendet den gesamten App-Prozess.** Der Kandidat wurde nicht in die laufende Beta übernommen. Keine Cloudflare-Änderung; FinanceHub unverändert.

### Blocker für Codex: unhandled WebSocket error

- Isolierter neuer App-/Origin-Stack auf internem Docker-Netz `highnoon-ws-fix-test`, ohne veröffentlichte Ports und ohne Beta-Daten.
- Eine WS-Verbindung über den Kandidaten-Origin; `maxFragments=16384`; begrenzte Probe mit 16385 leeren, nicht abgeschlossenen Frames.
- Peer wird mit **1008** geschlossen. Danach ist `/health` nicht mehr erreichbar.
- Docker bestätigt **ExitCode 1, OOMKilled false, Running false**.
- `fragment-app.log`: `Unhandled 'error' event`, `RangeError: Too many message fragments`, `WS_ERR_TOO_MANY_BUFFERED_PARTS`, Statuscode 1008, Stack aus `node_modules/ws/lib/receiver.js` und `websocket.js`.
- Die `wss.on('connection', ...)`-Behandlung in `vnext/server/index.js:843` hat keinen Listener für das `error`-Event der einzelnen Verbindung. Parser-Fehler werden daher nicht verbindungslokal abgefangen.
- Zuerst im umfangreicheren Regressionstest beobachtet, danach mit `fragment-repro.cjs` ausserhalb des App-Prozesses unabhängig reproduziert. Die Probe verlangt Health 200 und meldet tatsächlich FAIL.
- Die Scratch-App hatte bewusst keinen Restart-Mechanismus, damit ein Prozessabsturz sichtbar bleibt. Ein automatischer Restart in der Beta wäre keine Sicherheitsbehebung: laufende In-memory-Partien würden trotzdem verloren gehen.

**Erwarteter Folgefix:** Error-/Close-Lebenszyklus der einzelnen WebSocket-Verbindung sauber behandeln und aufräumen; andere Peers/Matches nicht unterbrechen. Integrationstest gegen den tatsächlichen Server ergänzen: überzählige Fragmente -> betroffene Verbindung geschlossen, Prozess/Health bleiben verfügbar, anderer Peer kann weiterspielen. Nicht nur einen weiteren isolierten Receiver-Test ergänzen. Kein Source-Fix durch BOB in dieser Abnahme.

## Build und Identität

Separate Worktrees, bestehende Arbeitsstände nicht überschrieben:

- Mac: `/Users/bob/repos/solitaire-race-acceptance-7f5ca0a4`
- Linux: `/srv/micnet/releases/highnoon-build-7f5ca0a4`
- Release: `/srv/micnet/releases/highnoon/7f5ca0a4d483a4a7a461ecec4894585027d9fc80`
- Plattform: linux/amd64, native Linux-Ausführung.
- App Docker-ID: `sha256:6ed3fb509a34590b72f37a7c628837dfa401328deb980dca03772df62a1a0905`
- Origin Docker-ID: `sha256:659b5d950b1bdae0b03b4b29edcaf63324d7b1ede521c4beba560c15948111bc`

**Unveränderte Bases für den ws-Vergleich:**

- Node: `node@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752`
- Nginx: `nginx@sha256:dc5069ad14f19660b141b21236140b91656bf89bbc3e2417c70ae650cd66104c`

`BASE_IMAGES`, `images.json`, `SHA256SUMS`, `scan-provenance.json` belegen Zuordnung. Docker-ID und Trivy-ImageID sind hier unterschiedliche Identifikatoren: Trivy meldet den Config-Digest aus dem exportierten Archiv. Dieser wurde aus den Config-Bytes nachgerechnet; RootFS-Diff-IDs wurden gegen Docker inspect verglichen. Nicht fälschlich beide Digests gleichsetzen.

## Prüfergebnisse

| Prüfung | Ergebnis / Grenze |
|---|---|
| Build-Smoke | PASS: nonroot/read-only `nginx -t`, Start, HTTP/PWA/config, WebSocket-Snapshot; `smoke.log` |
| Vollständige native Tests | **230 PASS, 0 FAIL, 0 SKIP**, inklusive `ws-security.test.js`; `native-tests-verified.log` |
| Security-Tests gegen fertiges App-Image | **2 PASS**; nur Testverzeichnis read-only eingebunden, Bibliothek aus dem fertigen Image; `image-ws-tests.log` |
| Zwei Spieler | Lobby erstellen/beitreten, beide Stock-Züge bestätigt |
| Reconnect | echte WS-Trennung und Wiederverbindung desselben Protokollclients; Revision 2 und State-Hash stimmen, anschliessende Aufgabe bestätigt |
| Profil/History | Host-Sieg und Gast-Niederlage nach Aufgabe per Profil-/History-API gelesen |
| Bot + Onlinebackup | Bot-Bestätigungen während Backup; 20 beobachtete Acks im erfolgreichen Lauf |
| Backup-Verifikation | Online-SQLite-Backup, SHA-Abgleich und Integrität `ok`; `normal-regression.json` |
| Fragmentabwehr im Gesamtsystem | **FAIL: Prozessabsturz**, siehe oben |
| Trivy | technisch erfolgreiche Scans, **keine Gesamt-Sicherheitsfreigabe** |

Die gezielte neue Regression ist ein echter HTTP-/WS-/SQLite-Integrationstest über den neuen Origin, kein erneuter visueller Browser-UAT. Sie wiederholt keinen 30-Minuten-Lastlauf und keinen NAS-Restore. Die frühere Abnahme dieser Betriebswege bleibt separat dokumentiert; kein neuer Nachweis hierfür behauptet.

Die Testsuite wurde in einer beschreibbaren temporären Kopie des separaten Source-Worktrees mit Abhängigkeiten aus den Lockfiles ausgeführt; der originale Worktree blieb unangetastet. Erste Harness-Anläufe fehlten Pixi-Abhängigkeiten bzw. scheiterten am verschachtelten Read-only-Mount. Danach sauberer vollständiger Lauf. Im zusätzlichen Integrationsharness wurden falscher Client-State-Feldname, frischer Client ohne Sequenzzustand und erwarteter WS-Closecode korrigiert. Gerade die zuletzt erwartete Verbindungstrennung offenbarte den echten Prozessabsturz; dieser wurde **nicht** als Harnessfehler wegkorrigiert.

Für eine normale Wiederholung `normal-regression.cjs` mit `SKIP_FRAGMENT=1` verwenden. Ohne diese Variable enthält die Datei ebenfalls die begrenzte Fragmentprobe. **Nur Scratch-Ziel verwenden.** Der kleine eigenständige Reproducer ist für den Folgefix vorzuziehen. Keine Testprofile, Session-Tokens oder SQLite-Dateien in dieser Übergabe; Ergebnisse sind auf Prüfaussagen reduziert.

## Trivy: gleiche Bases, neue App

Scanner: Trivy **0.74.0**, gepinnt auf `aquasec/trivy@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969`.
Scans der exportierten fertigen Images mit `--scanners vuln --list-all-pkgs`, Rohdaten und ausführbares Scan-Script beiliegend. Zählung ist **Paket/CVE-Zeilen**, nicht eindeutige CVEs; `scan-summary.json` enthält zusätzlich eindeutige CVE-Zahlen.

| Image | Critical | High | Medium | Low | Unknown |
|---|---:|---:|---:|---:|---:|
| ws-App, bestehende Node-Base | 5 | 62 | 96 | 73 | 6 |
| Origin, bestehende Nginx-Base | 0 | 7 | 1 | 0 | 0 |
| Node-Base-Vorschlag, ohne App | 5 | 62 | 95 | 73 | 6 |
| Nginx-Slim-Base-Vorschlag | 0 | 0 | 0 | 0 | 0 |

Die App-Inventarisierung erkennt **ws 8.21.3**, ohne ws-CVE-Treffer. Die Scanner-Behebung des ursprünglichen ws-Befunds ist damit belegt, die serverseitige Abwehr insgesamt jedoch nicht.

Verbleibende Critical-Zeilen: `perl-base` (CVE-2026-13221, CVE-2026-42496, CVE-2026-8376), `zlib1g` (CVE-2023-45853), npm-internes `tar` (CVE-2026-59873). Diese sind nicht stillschweigend akzeptiert. Perl meldet sowohl in alter als auch neuer Node-Base `ivsize=8`, `ptrsize=8`; daraus allein folgt keine pauschale Ausnahme für sämtliche Perl-Befunde. Die weitergehende Erreichbarkeits-/Paketbewertung aus `FINDINGS.md` bleibt Gegenstand der gemeinsamen Security-Entscheidung.

## Konkrete Base-Vorschläge zur Abstimmung — NICHT AKTIVIERT

### Node 22 / Bookworm Slim

Digest: `node@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5`.

- Direkte Runtime-Ausführung: Node **22.22.3 -> 22.23.2**, npm bleibt **10.9.8**.
- Debian **12.14 -> 12.15**. Erfasstes OS-Paketdelta: `base-files` **12.4+deb12u14 -> 12.4+deb12u15**; beide Inventare 88 OS-Pakete.
- Die beiden im JSON-Vergleich entfernten Node-Pakete `solitaire-race` und `ws` sind die App-Schicht, die in einer nackten Base absichtlich fehlt — keine Deinstallation im vorgeschlagenen App-Image.
- **Kein Rückgang der High/Critical-Zeilen.** Ein Medium weniger; Node-Binärversion wird separat dokumentiert, der OS-Paketvergleich erfasst sie nicht.
- Vorschlag als Versionsaktualisierung, **nicht** als Lösung aller Base-Befunde. Noch kein App-Build mit dieser Base und keine Freigabe.

### Nginx Stable Alpine Slim (expliziter Variantenwechsel)

Der abgefragte Tag `nginx:stable-alpine` zeigt weiterhin auf die bereits verwendete Base. Als echte Alternative separat gezogen und gescannt:

`nginx@sha256:d6d5b2985faade9971eb1bec34c3f778b800f872f236969b3fd1ba65f4692b54`

Dies ist der abgefragte linux/amd64-Manifest-Digest von `nginx:stable-alpine-slim`, kein heimlicher Austausch unter gleichem Tag.

- Alpine bleibt **3.24.1**.
- **71 -> 21 OS-Pakete**, 50 entfallen, keine hinzugefügten/geänderten Pakete im erfassten Paketdelta.
- Darunter entfallen `libuuid` und zahlreiche Bild-/Font-/GeoIP-/XSLT-Abhängigkeiten bzw. Zusatzmodule. Vollständige Liste: `package-deltas.json`.
- Trivy meldet **0 bekannte Befunde** für dieses Inventar und diese Datenbank. Keine Garantie genereller Schwachstellenfreiheit.
- `nginx -t` mit unserer unveränderten `nginx.conf`, UID 101, read-only RootFS, ohne Capabilities und `/tmp`-tmpfs erfolgreich.
- **Noch kein vollständiger Origin-Build-/HTTP-/WS-UAT mit der Slim-Base.** Nach Zustimmung separate Build-/Spiel-/Reconnect-Abnahme nötig, insbesondere wegen entfallender Module.

## Abschlusszustand

Scratch-App, Scratch-Origin und `highnoon-ws-fix-test` entfernt; Images und private Testartefakte für Nachvollziehbarkeit auf Linux aufbewahrt. Keine Hostports veröffentlicht. Der normale Beta-Stack läuft weiterhin healthy auf:

- App `sha256:0dcb2e20b8007b2512c363ccd093d183f9c6aa3e2feb82311e52684e12e66553`
- Origin `sha256:194ce99b70c716eabaab036e8d0daefd00f3e7e59363dc2144ef3c4bc8917547`

Isolation-Service und Backup-Timer aktiv. FinanceHub-Backends/Postgres healthy, Frontends/Tunnel weiter laufend. Kein Host-/Docker-Neustart, kein Beta-Imagewechsel, keine Cloudflare-Freischaltung.
