# HighNoon — Linux/Browser-Nachprüfung für Codex

## Ergebnis
Origin-Fix bestätigt. Netzwerk-Egress-Blocker inzwischen hostseitig gelöst und nach Container-Recreation verifiziert (Nachtrag unten). Interner Kandidat läuft; keine vollständige Ferien-/Security-Freigabe. Cloudflare-Route nicht aktiviert. FinanceHub unverändert.

## Identität
Quell-SHA: 233b8ac7529e25d720b77d14fda0da17caad4386
Branch: feature/pixijs8-webclient-mockup-4-2
Build-Worktree: /srv/micnet/releases/highnoon-build-233b8ac7
Release: /srv/micnet/releases/highnoon/233b8ac7529e25d720b77d14fda0da17caad4386
App: sha256:0dcb2e20b8007b2512c363ccd093d183f9c6aa3e2feb82311e52684e12e66553
Origin: sha256:194ce99b70c716eabaab036e8d0daefd00f3e7e59363dc2144ef3c4bc8917547
Node base: node@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752
Nginx base: nginx@sha256:dc5069ad14f19660b141b21236140b91656bf89bbc3e2417c70ae650cd66104c

Native amd64 build.sh erfolgreich. Automatischer isolierter smoke.sh erfolgreich: nonroot/read-only nginx -t, Containerstart, HTTP/PWA-HTML/config, WebSocket-Snapshot durch Origin. SHA256SUMS inklusive smoke.log vollständig erfolgreich geprüft. Image-Auswahl atomar ersetzt; Runtime-Image-IDs nachgelesen. Kein Neubuild beim Start.

## Tatsächlich ausgeführte Laufzeitprüfungen
- Beide installierten Dienste healthy, nginx -t erfolgreich; read-only, UID 1000/101 und keine Host-Port-Bindings nachgelesen.
- Echter Browser über loopback-gebundenen SSH-Forward: Lobby sichtbar, Human-vs-Bot per Menü gestartet, Pixi-Karten und Bot-Spiel sichtbar.
- Eigener Stock-Klick: nach Browserreload 23 Stock / 1 Waste statt 24 / 0. Reload verbindet wieder mit fortgeschrittener Partie (Revision 14). Keine HTTP-Ressourcenfehler >=400 in Resource Timing nach Reload erfasst. Das ist kein vollständiger JS-Console-Audit.
- Beobachtung zur Nachprüfung durch Codex: vor Reload hiessen die Spieler HighNoon/Bot, danach Spieler 1/Spieler 2 und eigener Anzeigename P1. Partie/Zustand lief weiter. Noch nicht als funktionaler Identitätsverlust bewiesen; wahrscheinlich Wiederherstellung der Anzeigenamen/Metadaten prüfen.
- Online-Backup bei laufender Bot-Partie erfolgreich.
- Graceful docker restart: Health 200, profileDatabase ok.
- SIGKILL plus explizites docker start: Health 200, kein stale-PID-Lock. Dies beweist manuelle Crash-Recovery, nicht unbeaufsichtigte Restart-Policy-Recovery.
- SQLite-Snapshot vor/nach diesen Neustarts gleicher SHA256: 0875c432175c27607e5a4c3bd405e2149c2bb4f9437bdbe83fbedfc69f1b222a. Laufende Matches verschwinden erwartungsgemäss (RAM).
- Lokaler Snapshot isoliert in einem wegwerfbaren Container mit /data-tmpfs und --network none restauriert: Source-/Target-SHA identisch, Schema 2, integrity ok; App auf restaurierter DB gestartet, Health 200/profileDatabase ok; sauber per SIGTERM beendet und Scratch-Container entfernt.
- Erster zusätzlicher Ad-hoc-SQL-Probeversuch verwendete einen falschen angenommenen Tabellennamen (profiles); das war ein Testharnessfehler nach bereits erfolgreichem Restore, kein Datenverlust. Isolierter Restore inklusive App-Start danach erfolgreich wiederholt. Keine Beta-Daten ersetzt.
- Einzelne docker-stats-Stichprobe während Bot-Partie: App 0.71% CPU, 18.66 MiB / 896 MiB; Origin 0.01% CPU, 2.965 MiB / 128 MiB. Keine Kapazitätszusage; kein Zwei-Spieler-plus-Bot-Dauertest. App OOMKilled=false.

Die Backend-127/Pixi-99-Ergebnisse des Vorgängers sind historische Ergebnisse und wurden für diesen SHA nicht erneut als komplette Suites ausgeführt. Neues Build-/Runtime-Smoke ist eigenständig geprüft.

## Historischer Befund: Netzwerkisolation (inzwischen behoben)
Aus highnoon-beta-origin-1 erreichbar:
- http://192.168.0.159:8001/health
- http://192.168.0.159:5173/
- http://172.21.0.1:8001/health
Aus App-Container waren FinanceHub-LAN-8001/5173 blockiert.

Ursache/Einordnung: Origin hängt zusätzlich im gemeinsamen cloudflare-test-edge. Getrenntes internes App-Netz schützt nicht vor Origin-Zugriff über veröffentlichte Host-Ports. Dieser Befund wurde durch den folgenden hostseitigen Nachtrag behoben, nicht durch einen neuen Image-Build.

## Noch ausstehende Freigabeprüfungen
- Zwei unabhängige echte Browser-Spieler und vollständiger Reconnect-/Profil-/History-Test.
- Vollständiger Console-/PWA-Asset-/Service-Worker-Audit und iOS/Mobilfunk-UAT.
- Ressourcen-/Throttling-/SQLite-Lock-Dauertest mit zwei Spielern + Bot + Backup.
- Image-Vulnerability-Scan.
- Täglicher Backup-Timer, NAS-Integration, 30 daily/12 monthly, isolierter NAS-Restore inkl. Login/History/Match und RPO/RTO.
- Upgrade-/Rollback-Drill mit Scratch-Daten.
- Konkreter Teilnehmerkreis und Zugangspolicy, negative externe Zugriffstests; erst danach explizite Route-Aktivierung.

## Unverändert und Betriebsstand
FinanceHub Test 1.2.5 und Prod 1.2.4: Health ok. IDs/StartedAt von FinanceHub, PostgreSQL und cloudflared stimmen weiter mit Ausgangszustand überein. Prod-Health war lokale Diagnose mit TLS-Prüfung aus, keine Zertifikatsabnahme.
Beta läuft intern ohne Host-Ports. Origin-Ziel: http://highnoon-beta-origin:8080 im cloudflare-test-edge. Öffentliche Route bleibt deaktiviert. Lokaler SSH-Forward dient ausschliesslich Browserprüfung.

Browser-Infrastruktur separat repariert: veralteten agent-browser-Daemon gezielt beendet, Chrome wieder über aktuellen CDP-Port angebunden; danach neutrale Navigation und echte HighNoon-Interaktion erfolgreich. Keine Browserprofile/Cookies gelöscht.

## Nachtrag: Netzwerkblocker gelöst — 10.09.2026

Eigene nftables-Tabellen `bridge highnoon_guard` und `inet highnoon_host_guard` schützen Layer-2-Forwarding, geroutetes Forwarding und Host-INPUT. Keine globale Flush-Operation und keine Änderung der vorhandenen DOCKER-USER-Regeln. Nur HighNoon-Quell-MACs werden eingeschränkt:
- Origin/Edge: 02:42:48:4e:00:01
- Origin/App-Netz: 02:42:48:4e:00:02
- App: 02:42:48:4e:00:03

Diese MACs sind explizit je Netzwerk in der installierten Compose-Datei festgelegt. Neue IP-Verbindungen von diesen Interfaces werden verworfen; ausgenommen Antworten etablierter Verbindungen sowie Origin/App-MAC → App-MAC TCP 3011. IPv4/IPv6 sind von den Sperren erfasst; ARP bleibt für L2-Auflösung möglich. Docker-DNS funktioniert weiterhin. Nonroot, cap_drop ALL und no-new-privileges bleiben erhalten; MAC-Spoofing durch privilegierte Container ist nicht Teil dieser Vertrauensgrenze. Andere vertrauenswürdige Edge-Container können weiterhin den Origin ansprechen; diese Massnahme ersetzt keine Benutzer-Authentifizierung.

Installierte Dateien:
- /etc/highnoon-isolation.nft
- /usr/local/sbin/highnoon-isolation (atomare, idempotente Neuladung nur eigener Tabellen)
- /etc/systemd/system/highnoon-isolation.service (enabled, active, Result=success)
- /etc/systemd/system/docker.service.d/highnoon-isolation.conf (Requires/After und ExecStartPre)
- /srv/micnet/stacks/highnoon/compose.beta.yaml (lokaler Host-Overlay, kein Quell-/Image-Rebuild)
- /srv/micnet/stacks/highnoon/compose.before-isolation.yaml (vorheriger Vertrag)

Verifikation:
- Origin → Host 8001, 5173, Docker-Gateway 8001: BLOCKIERT.
- Origin → LAN-Router HTTP, Internet 1.1.1.1 HTTP, Connector-Metrics im selben Edge-Netz: BLOCKIERT.
- App → Origin als neue Verbindung: BLOCKIERT.
- Origin → App 3011/health: HTTP 200.
- Testprozess im echten Netzwerk-Namespace des laufenden cloudflared → highnoon-beta-origin:8080: serverSmoke PASS, HTTP Match-Erstellung, WebSocket-Snapshot und bestätigter Spielzug Revision 0→1.
- Eigene Firewall atomar neu geladen, beide HighNoon-Container force-recreated; MACs, unveränderte Image-IDs und healthy erneut nachgelesen. Danach FinanceHub-8001-Sperre sowie Connector-Namespace-HTTP/WebSocket-Smoke erneut PASS.
- Drop-/Accept-Counter der tatsächlichen Kernel-Regeln steigen bei den Proben.
- FinanceHub Test/Prod healthy, alle FinanceHub/Postgres/Connector-IDs und StartedAt unverändert; Connector weiterhin 4 readyConnections. Kein Docker-Daemon- oder Host-Neustart durchgeführt.

Persistenz: Systemd-Abhängigkeiten und ExecStartPre im geladenen Docker-Unit-Vertrag nachgelesen. Echter Host-/Docker-Neustart wurde bewusst nicht durchgeführt; Boot-Reihenfolge ist konfiguriert, ein Reboot-Abnahmetest steht separat aus. Ein administratives `nft flush ruleset` oder Löschen der MAC-Einträge würde die Schutzannahmen verletzen und ist kein unterstützter Deploymentpfad.

Codex: Die festen MACs und die hostseitige Firewall sind jetzt Bestandteil des Hostingvertrags. Bei späteren Deployments die installierte Compose-Datei NICHT durch die unveränderte Repository-Vorlage überschreiben; die MAC-Einträge in den nächsten Paketvertrag übernehmen. Keine Imageänderung für diesen Fix nötig. Kein Commit/Push durch Bob.

Rollback nur kontrolliert: Beta zuerst stoppen; eigene Docker-Drop-in-Abhängigkeit entfernen, daemon-reload, Guard-Service deaktivieren und ausschliesslich die beiden eigenen nft-Tabellen entfernen. Vorherige Compose-Datei nur bei gestoppter Beta wiederherstellen. Ungeschützte Beta nicht wieder starten.

Installierte SHA256:
- nft: 4c21f50120f75974fc164b71e5b845a5bc41c2ea7be136a901a34bf6f3edd40c
- Compose: 5a53dff858603effbc47c69795e3b917953fa96adc9bdb97b9464838b4153302
- Loader: 0d32b53858347b7d96171a196d774bf612388a95a8c66e65b3b6a499a21a865b

Der konkrete Netzwerk-Egress-Blocker ist geschlossen. Alle oben genannten weiteren UAT-/Backup-/Zugangsfreigaben bleiben offen. Cloudflare-Route unverändert deaktiviert.
