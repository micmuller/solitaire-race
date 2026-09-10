# Lokale Prüfung — 10.09.2026

Umgebung: macOS ARM, Node v22.22.3. Docker und Nginx nicht installiert.

- Backend vNext: 125 bestanden, 0 fehlgeschlagen, 1 Linux-spezifischer Test übersprungen.
- Zusätzlicher Deployment-Backup-Test: 1 bestanden (Online-Sicherung bei offener
  Quelldatenbank, atomare Veröffentlichung, Dateimodus, Manifest/SHA, Wiederherstellung
  und Profilzugriff; fehlende Revision wird ohne neuen Snapshot zurückgewiesen).
- Pixi-Webclient: 99 bestanden, 0 fehlgeschlagen.
- PWA-Produktionsbuild erfolgreich.
- bash -n für Build-/Backup-/Restore-Skripte erfolgreich.
- Compose YAML mit Ruby/Psych geparst; kein Ersatz für docker compose config.
- node --check für Backup-Job und git diff --check erfolgreich.

Der erste Backend-Lauf wurde durch Sandbox-EPERM bei Loopback-Testservern blockiert.
Wiederholung mit erlaubten lokalen Testservern war erfolgreich.

Nicht lokal geprüft: Docker-Build, Registry-Digests, Nginx-Konfiguration zur Laufzeit,
Linux-Prozessidentität, Container-Limits/Verbrauch, amd64, Host-Netz-Isolation,
NAS-Kopie/Restore, Cloudflare-Policy sowie externe PWA-/iOS-Abnahme.
Keine öffentliche Freigabe. Vollständige Checkliste in HANDOVER_BOB.md.

## Nach Bobs Linux-Abnahme: Origin-Korrektur

Bobs separat übermittelter Abnahmebericht bestätigt native Builds und 127 Backend-
sowie 99 Pixi-Tests. Laufzeitfehler im Origin reproduziert: fastcgi_temp auf
read-only Root. Drei zusätzliche Nginx-Temp-Pfade nach /tmp verlegt.

Neuer echter Docker-Regressions-/Starttest smoke.sh ist automatisch in build.sh
integriert, inklusive HTTP/PWA/Config und WebSocket-Snapshot durch den Proxy.
Lokal: Bash-Syntax, eingebettete Node-Syntax und git diff --check geprüft.
Docker-Ausführung dieses Korrekturkandidaten steht bei Bob aus. Keine Aussage,
dass der neue Container hier gestartet oder auf Linux bereits abgenommen wurde.

## Host-Vertrag aus Bobs zweiter Übergabe

Bericht: reports/2026-09-10-linux-233b8ac7/README.md, importiert mit a740aea.
Laut Bob: Origin-Fix/Build-Smoke PASS, interner Browser/Bot und Connector-
HTTP/WebSocket PASS; Netzwerkblocker mit MAC-gebundenem Host-Guard behoben,
Recreation und Negativtests PASS. Das sind Bobs Host-Ergebnisse, keine lokal
wiederholte Linux-Abnahme. Vollständige offene Gates stehen im Originalbericht.

Compose-Vorlage an die drei berichteten per-Netzwerk-MACs angeglichen. Lokal
YAML geparst und komplette effektive YAML-Struktur mit Bobs Compose-Snapshot
verglichen: identisch. git diff --check PASS. Kein Image-Build, Host-Deployment,
Firewall-Reload, Container-Recreate oder Cloudflare-Freischaltung vorgenommen.
