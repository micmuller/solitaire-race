# HighNoon Ferien-Beta — Übergabe an Bob

Stand: 10.09.2026. Dies ist ein Quell-/Build-Paket zur internen Installation,
keine Internetfreigabe und kein bereits abgenommenes Container-Image.
Grundlage: Michaels Übergabe `linux_handover.md` vom 10.09.2026.
Produktzuordnung: Solitaire-vNext = Solitaire HighNoon, bestehender Slot highnoon.

## Aktueller Host-Vertrag nach Netzwerk-Abnahme

Bobs Übergabe wurde mit Commit a740aea übernommen. Bericht und unveränderter
Host-Snapshot: [Linux-Abnahme](reports/2026-09-10-linux-233b8ac7/README.md).
Der dort geprüfte Anwendungskandidat bleibt 233b8ac; der Dokumentationscommit
und die folgende Vorlagenangleichung sind keine neuen Image-Releases.
Origin-Fix und isolierter Build-Smoke sind auf Linux bestätigt; Beta läuft laut
Bob intern. Der Netzwerkblocker wurde hostseitig behoben und nach Recreation
erneut geprüft. Weitere Ferien-/Backup-/Zugangsabnahmen bleiben offen.

Die Repository-Vorlage compose.beta.yaml übernimmt jetzt die drei festen
per-Netzwerk-MACs der installierten Compose-Datei:

| Interface | Feste MAC |
|---|---|
| Origin / cloudflare-test-edge | 02:42:48:4e:00:01 |
| Origin / highnoon-beta-app | 02:42:48:4e:00:02 |
| App / highnoon-beta-app | 02:42:48:4e:00:03 |

Diese Identitäten gehören gemeinsam mit den hostseitigen nftables-Tabellen
`bridge highnoon_guard` und `inet highnoon_host_guard` zum Betriebsvertrag.
Sie dürfen nicht unabhängig geändert, entfernt oder für eine zweite Instanz
wiederverwendet werden. Compose muss per-Netzwerk-MACs unterstützen; Bob hat die
installierte Variante bereits geprüft. Kein service-weites mac_address verwenden.

Neue Verbindungen von diesen Interfaces sind gesperrt, ausgenommen Origin im
App-Netz → App TCP 3011. Antworten etablierter Verbindungen bleiben erlaubt.
ARP und Docker-DNS funktionieren laut Host-Abnahme. Die Sperren betreffen IPv4
und IPv6; der neue Origin→App-Pfad ist explizit IPv4. Kein externer App-Egress.
Andere vertrauenswürdige Edge-Container können den Origin weiterhin ansprechen.
Dies ersetzt weder Teilnehmer-Authentifizierung noch deren externe Negativtests.

Vor jedem Start/Upgrade/Recreate muss Bob den geladenen Guard und den
systemd-Vertrag kontrollieren: highnoon-isolation.service sowie Docker-Drop-in
mit Requires/After und ExecStartPre. Dienststatus allein beweist nicht, dass die
Regeln noch geladen sind: beide tatsächlichen nft-Tabellen prüfen. Keine alten
Compose-Vorlagen ohne diese MACs installieren. Fehlt der Guard, Beta gestoppt
lassen. Host-Dateien im reports-Verzeichnis sind Nachweise, keine automatisch
anzuwendenden Installer; ihre Pflege bleibt bei Bob. Kein globales nft flush.

Nach Recreation tatsächliche MACs an allen drei Interfaces prüfen und Bobs
Negativtests wiederholen (Host/FinanceHub, LAN, Internet, Connector-Metrics und
App→Origin); Connector→Origin→App HTTP/WebSocket muss weiter funktionieren.
Ein echter Host-/Docker-Neustart wurde laut Bob noch nicht getestet: konfigurierte
Boot-Reihenfolge nicht mit abgenommener Reboot-Persistenz gleichsetzen.

Das isolierte Build-smoke.sh verwendet absichtlich eigene dynamische MACs,
ein wegwerfbares internes Netz und tmpfs. Es prüft App/Proxy, NICHT den Host-
Firewall-Vertrag. Produktions-MACs nicht in parallele Smoke-Container kopieren.
Für Netzwerk-Abnahme vom Connector-Namespace testen: neue App→Origin-Verbindungen
sind im installierten Stack absichtlich blockiert.

Für diese Vorlagenangleichung ist kein Image-Neubuild nötig. Bestehende geprüfte
Image-IDs erhalten. Die aktive Host-Vorlage und laufende Container wurden durch
Codex nicht verändert. Bob gleicht die Vorlage vor einer späteren Installation
mit dem Host ab; bestehende Host-Anpassungen nicht blind überschreiben.

## Historischer Korrekturkandidat nach Bobs erster Linux-Abnahme

Der erste Kandidat 2b17913 wurde auf Linux gebaut, aber NICHT freigegeben:
App healthy, Backend 127/127 und Pixi 99/99 laut Bob; Origin scheiterte am
schreibgeschützten /var/cache/nginx/fastcgi_temp. Beide Beta-Container sind laut
Bob gestoppt, FinanceHub/Tunnel unverändert. Bobs vollständiger Abnahmebericht
bleibt ausserhalb des Repositorys bei Michael.

Korrektur: fastcgi_temp_path, uwsgi_temp_path und scgi_temp_path liegen nun wie
die anderen temporären Dateien auf /tmp. Alle Sicherheits-/Ressourcenlimits
bleiben bestehen. build.sh führt vor Artefakt-Export automatisch smoke.sh aus:
echtes nonroot/read-only `nginx -t`, isolierter App-/Origin-Start und HTTP/PWA/
WebSocket-Prüfung. Der Test verwendet nur ein eigenes internes Netz und tmpfs,
keine Beta-Daten, keine Host-Ports, kein gemeinsames Edge-Netz. smoke.log wird
mit dem Artefakt gehasht. Bei Fehler entsteht kein freigegebenes Exportpaket.

Bob: neuen Commit separat auschecken, dieselben verifizierten Base-Digests aus
dem Bericht verwenden und in ein NEUES SHA-Releaseverzeichnis bauen. Nur nach
PASS des Build-Smokes die installierte Image-Auswahl aktualisieren und die
unterbrochene Host-Abnahme fortsetzen. Alte Artefakte bleiben abgelehnte
Kandidaten. Der neue Smoke ersetzt weder Netzwerkisolation noch NAS-/iOS-UAT.
Codex kann diesen Docker-Test auf dem Mac ohne Docker weiterhin nicht ausführen.

## Ergebnis und Zuständigkeiten

Codex liefert Dockerfiles, Compose, Nginx-Konfiguration, konsistente Backup- und
Restore-Jobs sowie diesen Ablauf. Auf dem Entwicklungs-Mac ist Docker nicht
installiert: kein Image/Digest und keine Container-Ressourcenmessung vorgetäuscht.
Bob baut den Kandidaten einmal auf amd64, prüft ihn und verwendet danach exakt
diese Image-IDs / das geprüfte docker-save-Archiv. Beim Rollout nicht neu bauen.
Michael legt Teilnehmer/Zugang fest und aktiviert erst nach Abnahme die Route.

Repo: solitaire-race, Branch feature/pixijs8-webclient-mockup-4-2.
Paket: deploy/highnoon-beta/ im Server-Repository.
Basis vor Paketänderung: 0db562e97e3073b6380fe871a17d5e016b54f186.
Der konkrete Paket-Commit ergibt sich aus `git rev-parse HEAD` nach Übernahme;
`build.sh` lehnt uncommittete Quellen ab und schreibt SOURCE_REVISION und Labels.
Keine automatische Promotion, kein Poll-Timer, kein Push durch dieses Paket.

## App-Vertrag

| Bereich | Vertrag |
|---|---|
| Plattform | linux/amd64, Node 22.22.3 Debian slim oder separat geprüfter gepinnter Patchstand |
| App | Node HTTP :3011; UID/GID 1000:1000; eine Instanz |
| Origin | Nginx :8080; UID/GID 101:101; highnoon-beta-origin im cloudflare-test-edge |
| URL | https://solitairehighnoon-test.stillorbit.net/vnext/pixi/ |
| API | /vnext/config, /vnext/profiles/*, /vnext/lobby/*, /vnext/matches*, /vnext/leaderboard |
| WebSocket | /vnext?matchId=…&clientId=…; Upgrade durchreichen; kein Prefix-Stripping |
| Health | GET /health; Origin prüft dabei auch App-Erreichbarkeit |
| Persistenz | /data/highnoon.sqlite, WAL/SHM und Prozess-Lock im selben Verzeichnis |
| Temporär | /tmp als begrenztes tmpfs; Proxy-PID und temporäre Proxy-Dateien dort |
| Backup | /backups Bindmount; fertige Snapshot-Verzeichnisse, .pending-* nicht übertragen |
| Egress | App braucht keine externen Dienste; Bot-Verbindungen laufen über Loopback |
| Budget | App 0.85 CPU / 896 MiB; Origin 0.15 CPU / 128 MiB; Summe 1 CPU / 1 GiB |

PWA-Dateien sind vorgebaut; kein Vite-Server. /vnext/web/ bleibt Referenzclient.
PUBLIC_URL ist explizit HTTPS. Der Server leitet daraus öffentliche Links ab,
nicht aus untrusted Forwarded-Headern. Proxy setzt Host und Proto fest, entfernt
X-Forwarded-For/Forwarded; es gibt keine IP-basierte App-Authentifizierung.
Nginx löst app über Docker-DNS erneut auf, auch nach Container-Recreation.

SQLite: WAL, foreign_keys ON, busy_timeout 5000 ms. Ein Node-Prozess führt die
App-Schreiboperationen aus; parallele Clients werden im Prozess verarbeitet.
Der Online-Backup-Prozess nutzt SQLite Backup API. Prozess-Lock ist kein
verteilter Lock: keine zwei App-/Admin-Schreiber aus getrennten PID-Namespaces.
Linux-Prozessstart und Boot-ID ergänzen PID, damit ein alter PID-1-Lock nach
Containerabsturz den Neustart nicht fälschlich blockiert. SIGKILL-Neustart testen.
Laufende Spiele/Lobby liegen im RAM und gehen bei Neustart verloren; Profile,
Sessions und abgeschlossene Resultate bleiben in SQLite.

## Sicherheitsgrenze / keine öffentliche Freigabe

Dieses Paket implementiert KEIN neues Benutzer-/Einladungssystem. Profil-Tokens
sind keine Beta-Allowlist. WebSocket-Spielerplätze und mehrere Match-/Bot-APIs
sind weiterhin nicht durchgängig benutzerautorisiert. Der Proxy begrenzt HTTP-
Anfragen aggregiert (30/s, Burst 100) und Verbindungen (64), aber keine einzelnen
WebSocket-Aktionen oder Anzahl gespeicherter Matches. Kein vollständiges Security-Audit.
Nur für vertrauenswürdige Tester hinter geprüftem Zugang betreiben.

Origin ist im gemeinsamen Edge-Netz erreichbar, also nicht gegen beliebige andere
Container in diesem Netz authentifiziert. Netzwerk-/Host-Negativtests sind Pflicht.
App hat nur internal App-Netz; Proxy hat Edge und App. Keine Ports am Host, kein
Docker-Socket, keine FinanceHub-/PostgreSQL-Netze. Host-Firewall muss insbesondere
Zugriff auf vorhandene FinanceHub-LAN-Ports und sonstige Hostdienste verhindern,
wenn Isolation gefordert wird; getrennte Bridges allein genügen nicht.

Michael und Bob müssen Cloudflare-Zugangsmodus konkret festlegen: verwaltetes
WARP/Zero Trust bevorzugt, aber keine Annahme, dass WARP allein eine Access-Policy
ersetzt. Die Policy muss native URLSession-HTTP/WSS und PWA unterstützen und
Nichtberechtigte tatsächlich ablehnen. Browser-Cookie-Login nicht ungeprüft vor
die native App schalten. Keine Service-Secrets in Clients einbauen. Tunnel-Route
allein ist öffentlich. Produktivhostname und FinanceHub bleiben unangetastet.

## 1. Build-Kandidat auf Linux erzeugen

Quellen vollständig übernehmen, Änderungen reviewen und einen identifizierbaren
Commit verwenden (kein Build vom alten Basis-SHA!). Noch keine Route aktivieren.
Gepinnte amd64-fähige Base-Images prüfen und deren Digests verwenden:

```sh
export NODE_IMAGE='node:22.22.3-bookworm-slim@sha256:<verified-digest>'
export NGINX_IMAGE='nginx:stable-alpine@sha256:<verified-digest>'
bash deploy/highnoon-beta/build.sh /srv/micnet/releases/highnoon/<git-sha>
```

Platzhalter ersetzen. Build braucht Registry-/npm-Netzwerk, Runtime nicht.
`build.sh` erzeugt images.tar, SHA256SUMS, images.json, images.env,
SOURCE_REVISION, BASE_IMAGES und deployment/. SHA256SUMS prüfen; Images mit
`docker load -i images.tar` auf anderem Abnahmehost laden. IDs aus images.env
müssen mit `docker image inspect` übereinstimmen; Architektur amd64, OS linux,
Revision und UID/GID prüfen. Images vor Freigabe auf bekannte Schwachstellen
prüfen; Befund/Tool/Datum protokollieren. Es werden keine Digests erfunden.

## 2. Host vorbereiten und installieren

FinanceHub-Health vorher erfassen. Externes cloudflare-test-edge muss existieren.
Host-Guard und MAC-Vertrag gemäss aktuellem Abschnitt oben sind Startvoraussetzung.
Nach Verifikation der Image-UID/GIDs:

```sh
sudo install -d -m 0750 -o 1000 -g 1000 /srv/micnet-data/highnoon-beta/sqlite
sudo install -d -m 0700 -o 1000 -g 1000 /srv/micnet/backups/highnoon-beta
sudo install -d -m 0750 /srv/micnet/stacks/highnoon /srv/micnet/config/highnoon /srv/micnet/logs/deployments/highnoon
```

Compose zuerst mit installiertem Host-Vertrag vergleichen: nur eine Vorlage mit
allen drei vereinbarten MACs übernehmen; alte immutable Pakete sind dafür ungeeignet.
Compose, backup.sh, restore.sh aus dem passenden deployment-Verzeichnis nach
/srv/micnet/stacks/highnoon/ kopieren (root-owned; Skripte 0750). images.env als
/srv/micnet/secrets/highnoon-beta.env root:root 0600 installieren. Datei enthält
nur Image-IDs, keine Login-Secrets. Nicht als Shell-Datei sourcen.

```sh
sudo docker compose --env-file /srv/micnet/secrets/highnoon-beta.env -f /srv/micnet/stacks/highnoon/compose.beta.yaml config --quiet
sudo docker compose --env-file /srv/micnet/secrets/highnoon-beta.env -f /srv/micnet/stacks/highnoon/compose.beta.yaml up -d --wait
```

Ab hier für Kürze (in einer root-Administrationsshell):

```sh
compose=(docker compose --env-file /srv/micnet/secrets/highnoon-beta.env -f /srv/micnet/stacks/highnoon/compose.beta.yaml)
"${compose[@]}" ps
"${compose[@]}" exec -T origin wget -qO- http://127.0.0.1:8080/health
"${compose[@]}" exec -T app id
"${compose[@]}" exec -T origin id
```

Für interne Browserabnahme ohne Host-Publikation: Origin-IP im Edge-Netz via
`docker inspect` bestimmen; vom Mac `ssh -N -L 18080:<origin-edge-ip>:8080 <admin>@192.168.0.159`.
Dann http://localhost:18080/vnext/pixi/. In den Client-Servereinstellungen für
diesen vorläufigen Test http://localhost:18080 verwenden; externe HTTPS-URL ist
noch nicht aktiv. Das ersetzt keinen PWA/iOS-TLS-Abnahmetest.

## 3. Backup, NAS und Wiederherstellung

`backup.sh` läuft root auf dem Host, nutzt flock und startet den Online-Backup-
Prozess mit App-UID im laufenden Container. Snapshot wird in .pending-* erzeugt,
mit integrity_check, Fremdschlüsseln und SHA-256 geprüft und als ganzes Verzeichnis
atomar veröffentlicht. release.json ergänzt Git-SHA/Schema zum vorhandenen Manifest.
Fehlgeschlagene .pending-Verzeichnisse nach Prüfung bereinigen; niemals replizieren.
Manueller Lauf: `/srv/micnet/stacks/highnoon/backup.sh`.

Service/Timer aus Paket nach /etc/systemd/system installieren; daemon-reload,
Service einmal erfolgreich ausführen, dann Timer enable --now. Fehler über
vorhandenes Host-Monitoring melden; letzter erfolgreicher Backup-Lauf <24h.
Healthcheck allein startet ungesunde Container nicht neu; Docker restart policy
reagiert auf Prozessende. Unhealthy/Backupfehler separat überwachen.

Bob integriert nur fertige Snapshot-Verzeichnisse ins vorhandene NAS-Verfahren:
terastore.micnet.ch / install / Linux-Host-1_Backup / highnoon-beta.
Credentials bleiben beim Host; keine neue SMB-Konfiguration durch Codex.
30 tägliche + 12 monatliche Stände kalendarisch auswählen, manuelle Läufe nicht
als zusätzliche Tage zählen. Retention erst nach verifizierter NAS-Kopie aktivieren;
Paket löscht absichtlich keine Backups automatisch. 10 GiB ist Planungsbudget,
keine Quota; Daten-/Backupverbrauch überwachen.

Restore-Job (ersetzt Beta-Daten, stoppt vorher beide Dienste):

```sh
/srv/micnet/stacks/highnoon/restore.sh /backups/<snapshot>/<backup.sqlite> --replace-beta-database
```

Manifest muss neben SQLite-Datei liegen. Job verifiziert vor Stopp, erstellt beim
Restore ein Sicherheitsbackup und lässt Dienste bei Fehler gestoppt. Automatisch
gespeicherte before-restore-Sicherungen ebenfalls in Host-Retention aufnehmen.
Bei inkompatiblen Schemas nicht blind mit älterem Image restaurieren (siehe Upgrade).

NAS-Restore-Probe: kompletten Snapshot vom NAS in eigenes temporäres lokales
Verzeichnis holen, SHA/Manifest prüfen, Restore mit App-Image in separatem
Scratch-/data durchführen, ohne Beta-Volume und ohne Edge-Netz. Danach App auf
Scratch-DB starten, /health, Profil-Login, Historie und ein Match prüfen. Tokens
nicht protokollieren. Gemessene Dauer = RTO; NAS-Prüfung mit Datum dokumentieren.
Nicht nur auf integrity_check vertrauen. Restore-Probe darf Beta nicht überschreiben.

## 4. Migration, Update, Rollback, Deinstallation

Erstinstallation mit vorhandenen Profilen: vorhandenes Runbook
vnext/docs/runbooks/PROFILE_DATABASE_MIGRATION.md verwenden. Online-Backup und
Manifest von Quelle erstellen, übertragen/verifizieren, bei gestoppter Ziel-App
mit adminCli restore und expliziter Zielbestätigung /data/highnoon.sqlite einspielen.
Erst danach starten. Keine laufenden WAL-Dateien kopieren. Auf Ziel gehören alle
Dateien UID/GID 1000:1000. Bei leerem Start erzeugt App Schema 2 automatisch.

Update: Host-maintenance-flock wie backup.sh verwenden (kein gleichzeitiger Timer/
Restore). Vorher konsistentes Backup erzeugen, Image-IDs und laufende Revision
sichern; Kandidat/Migration zuerst mit Kopie der DB isoliert abnehmen. Dann beide
Dienste stoppen, images.env atomar auf geprüfte IDs wechseln, `up -d --wait`,
Spiel/Profile prüfen. Kein Neubuild, keine automatische Migration/Promotion im
Host-Framework. Die App selbst wendet Schema-Migrationen beim Start an; daher
vorherige Kopie/Probe zwingend. Während Ferien keine automatischen Updates.

Rollback bei kompatiblem Schema: stoppen, alte geprüfte IDs eintragen, starten.
Bei inkompatibler Migration zusätzlich passendes Vorher-Backup zurückspielen;
Restore mit schema-kompatiblem Werkzeug durchführen, danach altes Image starten.
Daten seit Backup gehen verloren; Michael vor Durchführung informieren. Alte
Images und Backup bis zur bestätigten Abnahme behalten.

Deinstallation: Zugang deaktivieren, finales Backup/NAS prüfen, Backup-Timer
abschalten, Compose down OHNE -v. Daten und Releases bleiben erhalten; Löschen
nur nach gesonderter Entscheidung. Gemeinsames Edge-Netz/Tunnel nicht entfernen.

## 5. Abnahmeprotokoll von Bob zurück an Codex/Michael

- [ ] SOURCE_REVISION, Image-IDs, Archiv-SHA256, Base-Digests dokumentiert.
- [ ] Build, Compose config, Nginx -t, nonroot/read-only und amd64 bestätigt.
- [ ] Backend/PWA-Tests auf amd64; insbesondere Linux-PID-Lock-Test ausgeführt.
- [ ] PWA HTML/JS/Manifest/Service Worker erreichbar; /vnext/config liefert HTTPS.
- [ ] Zwei echte Spieler, Bot, HTTP und WebSocket-Reconnect funktionieren.
- [ ] Graceful restart UND SIGKILL/restart: App kommt wieder; Profile bleiben.
- [ ] Unter gleichzeitiger Nutzung/Online-Backup keine SQLite-Lockfehler.
- [ ] docker stats bei 2 Spielern + Bot: CPU, RAM, OOM/Throttle, Laufzeit notiert.
- [ ] Verbrauch bleibt im Budget; noch keine gemessene Kapazitätszusage von Codex.
- [ ] Tägliches Backup, NAS-Checksumme, isolierter NAS-Restore inkl. App-Smoke grün.
- [ ] Upgrade/Rollback mit Scratch-Daten erfolgreich; RPO/RTO festgehalten.
- [ ] Keine Host-Ports; drei MACs entsprechen dem Host-Vertrag; beide nft-Tabellen geladen.
- [ ] Nach Recreation Cross-App/Host/LAN-Erreichbarkeit negativ und Connector→App positiv getestet.
- [ ] Reboot-Persistenz separat abgenommen oder ausdrücklich als ungeprüft dokumentiert.
- [ ] FinanceHub-Health vorher/nachher unverändert.
- [ ] Teilnehmer und konkrete Zugangspolicy mit Michael festgelegt.
- [ ] Erst danach Michael: Beta-Route auf http://highnoon-beta-origin:8080 aktivieren.
- [ ] Mobilfunk: HTTPS/WSS, installierte PWA, native iOS-App, Zugriff ohne Berechtigung,
      abgelaufene Anmeldung, WLAN-Wechsel und Hintergrund/Vordergrund geprüft.

Bis einschliesslich Host-Abnahme ist dies eine INTERNE Beta. Ohne bestätigte
Zugangskontrolle keine öffentliche Route und kein App/API-Bypass.

Technische Referenzen: https://docs.docker.com/reference/compose-file/services/
und https://nginx.org/en/docs/http/websocket.html (geprüft 10.09.2026).
