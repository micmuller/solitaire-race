# Interne Folgeabnahme – Linux-host-1

Stand: 2026-09-10. Auftrag: `NEXT_STEPS.md` auf Dokumentationsstand `2305238`.
**Ergebnis: betriebliche Teilprüfungen bestanden; KEINE Ferien-/Security-Gesamtfreigabe.**
Cloudflare-Route nicht aktiviert. FinanceHub nicht geändert. Keine neuen App-/Origin-Images gebaut oder in der Beta ausgewählt.

## Unveränderte Laufzeit

Anwendungsquelle: `233b8ac7529e25d720b77d14fda0da17caad4386`.

| Komponente | Laufendes Image |
|---|---|
| App | `sha256:0dcb2e20b8007b2512c363ccd093d183f9c6aa3e2feb82311e52684e12e66553` |
| Origin | `sha256:194ce99b70c716eabaab036e8d0daefd00f3e7e59363dc2144ef3c4bc8917547` |

Beide healthy, RestartCount 0. Feste per-Netzwerk-MACs unverändert, nft-Tabellen `bridge highnoon_guard` und `inet highnoon_host_guard` vorhanden. Kein Recreate der echten Beta wegen des Dokumentationsupdates. Daher gelten die vorherigen Isolations-Positiv-/Negativtests weiter; sie wurden in dieser Runde nicht vollständig wiederholt. Kein Host-/Docker-Reboot durchgeführt.

## Prüfergebnisse

| Kriterium | Status | Beleg / Grenze |
|---|---|---|
| Zwei unabhängige Browserprofile | PASS | Zwei isolierte Chrome-Browserkontexte, unterschiedliche Profile; Host eröffnet Tisch, Gast tritt bei, beide ziehen. |
| WebSocket-Reconnect | PASS | Gast-Reload; beide zeigen Revision 2, Hash `09a41fc79e43`. |
| Spielabschluss/Profil/History | PASS | Guest gibt über UI auf, Host gewinnt; beide sehen nach Reload korrekte Statistik und History. Aufgeben ist der getestete reguläre Abschluss, kein vollständig ausgespieltes Kartenlayout. |
| NAS-Zweitkopie | PASS | Verschlüsselt gemountetes SMB, Snapshot/Manifest/Release-Metadaten kopiert, SHA-Prüfung auf NAS und nach echtem Rücklesen. Mount anschliessend entfernt. |
| Täglicher Backupjob | EINGERICHTET / MANUELL PASS | systemd-Service und Timer aktiv; tägliche Auslösung selbst noch nicht über mehrere Tage beobachtet. |
| Backupfehler erkennen | PASS, begrenzt | Gezielte Locksperre führt zu systemd `Result=exit-code`, Status 1. Nach Freigabe neuer Job erfolgreich. Kein echter NAS-Ausfall simuliert, keine externe Alarmzustellung getestet. |
| NAS-Restore inkl. Benutzer | PASS | Isolierte Datenbank, gleicher SHA, Integrität/FKs okay, vorhandene Profilsessions nutzbar, gleiche IDs und History in beiden Browsern. Danach neue Bot-Partie mit bestätigtem Stock-Zug. |
| Überschreiben mit Sicherheitsbackup | PASS auf Scratch | Erneuter Restore auf vorhandene Scratch-DB erzeugt Sicherheitsbackup. Live-DB nicht ersetzt. |
| Automatische Crash-Recovery | PASS auf Scratch | SIGKILL an verifizierte Host-PID des Testcontainers, nicht `docker kill`; automatischer RestartCount 0→1, keine manuelle Startaktion, Health nach 0.604 s. |
| App-Rollback/Upgrade | PASS, begrenzt | Vorhandenes altes App-Image und zurück auf aktuelles; Schema v2 in beiden, Profildaten/Ergebnisse erhalten. Kein Schema-Migrationsdrill; kein vollständiger Stack-Rollback mit altem defektem Nginx. |
| Begrenzter Lastlauf | PASS | 30 Minuten, 60 Runden, 2382 Spieler-Acks, 3600 beobachtete Bot-Acks, keine erfassten Harnessfehler; Online-Backups parallel. |
| Browser-Netzwerk | TEILPRÜFUNG PASS | In der aufgezeichneten Restore-/Recovery-Navigation keine Resource-Timing-Einträge mit HTTP-Status >=400. Kein lückenloses HAR/Console-Protokoll; `errors` war in der Instrumentierung nicht vorhanden und wird NICHT als fehlerfreie Console ausgelegt. |
| Vulnerability-Scan | AUSGEFÜHRT, GATE FAIL | Runtime-relevanter HIGH-Befund in `ws`; siehe unten. |
| HTTPS/PWA/native iOS/WARP | OFFEN | Finaler HTTPS-Host und Zugang noch nicht aktiviert. Siehe `ACCESS_PREPARATION.md`. |

## Last, Speicher und Recovery-Grenzen

Lauf: `2026-09-10T14:34:27.818Z` bis `2026-09-10T15:04:28.476Z`.
Zwei synthetische Protokollspieler mit wiederholten Draw-Aktionen in kurzen Matches plus getrennte Bot-vs-Bot-Partie/Observer. Das ist eine begrenzte Stabilitätslast, kein Kapazitätsmaximum oder DDoS-Test. Der letzte Durchlauf endet zeitbegrenzt; deshalb nicht pauschal 2400 Spieleraktionen behaupten.

Letzte Messpunkte: App ca. 33–34 MiB / Limit 896 MiB, Origin ca. 3 MiB / Limit 128 MiB. Keine daraus abgeleiteten Maximal-/Durchschnittswerte über den gesamten Lauf. Das Ressourcenmonitoring des erfolgreichen Versuchs begann verspätet; es ist kein vollständiger Zeitreihenbeleg für alle 30 Minuten.

`runtime-final-audit.json`: kein OOM in den cgroup-Lifetime-Zählern; kein Neustart der Beta; keine Treffer für SQLITE_BUSY, SQLITE_LOCKED, database-is-locked, out-of-memory oder uncaught in den seit Laststart abgefragten Logs. CPU-Throttling ist **nicht null**: beim ersten Abschlusscheck 51 Perioden / 1106277 µs für die App. Das sind Container-Lifetime-Zähler ohne Vorher-Baseline, keine exakt dem Lastlauf zurechenbare Messung. Vollständige spätere Zähler stehen im JSON.

**Wichtig:** Aktive Matches/Lobbys sind memory-only. Nach Prozessneustart sind sie weg; Profile und abgeschlossene Ergebnisse bleiben erhalten. Nach dem Scratch-Crash wurden beide Profile/History erneut im Browser geprüft. Kein Versprechen der Wiederaufnahme einer laufenden Partie nach Serverneustart.

## Backupbetrieb und RPO/RTO

Installiert:
- `/usr/local/sbin/highnoon-nas-backup`
- `/etc/systemd/system/highnoon-beta-backup.service`
- `/etc/systemd/system/highnoon-beta-backup.timer`
- Erfolgsstatus: `/srv/micnet/config/highnoon/backup-status.json`

Zeitplan: täglich 03:15 Europe/Zurich, bis 120 Sekunden Verzögerung, Persistent=true. NAS: `install/Linux-Host-1_Backup/highnoon-beta/{daily,monthly}`. 30 kalendarische Tagesstände und 12 Monatsstände; mehrere Läufe am selben Tag belegen keinen zusätzlichen Tagesplatz. Retention erst nach verifizierten Kopien und Rücklesen. Lokale Staging-/Restore-Kopien werden durch diesen Job noch nicht begrenzt; Speicherüberwachung/Pruning bleibt als Betriebsergänzung offen.

Letzter erfolgreich verifizierter NAS-Backupstand nach dem Fehlerdrill: `2026-09-10T15:16:44.729Z`; Details in `backup-status.json`. Der tatsächlich mit Browserlogin abgenommene Restore stammt vom Stand `2026-09-10T14:55:50.801Z`, SHA `cf27b54800829a56eeab2fcb5659fd29d7eba0c1e3ad82404c6f7392fcd03c78`.

Geplantes RPO für persistierte Profile/Ergebnisse: etwa ein Tag plus Scheduling-/Ausführungszeit, sofern Jobs erfolgreich sind. Bei Fehlern wächst das RPO; der letzte Erfolgszeitpunkt und systemd Result müssen überwacht werden. Keine Garantie eines 24h-RPO bei unbemerkten NAS-Ausfällen. Für aktive Partien gibt es keine Persistenzzusage.

Gemessener Restore-Drill: 7.031 s vom bereits lokal zurückgelesenen NAS-Paket bis zur gesunden isolierten App, inklusive erneutem Überschreiben/Sicherheitsbackup-Test. **Keine End-to-End-RTO inklusive NAS-Transfer, manueller Bedienung, Routing und Browserlogin.**

Fehlererkennung per systemd praktisch getestet. Externe Alarmierung und altersbasierte Stale-Backup-Warnung sind noch nicht integriert/abgenommen; vor unbeaufsichtigtem Ferienbetrieb schliessen. SMB-Zugangsmittel werden weder mitgeliefert noch ausgegeben. Das Script referenziert die vorhandene root-only Credentialsdatei.

## Scan und konkrete Codex-Aufgabe

Trivy 0.74.0, Scanner-Digest `sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969`, ausgeführt gegen Docker-save-Archive der laufenden Images. Raw JSON und Zusammenfassung liegen hier. Trivy meldet Config-Digests statt der Docker-Laufzeit-IDs; `scan-image-provenance.json` belegt den Config-Hash im Archiv und den Abgleich aller RootFS-Layer mit dem laufenden Image.

Scanner-Paketbefunde (nicht Anzahl unabhängig ausnutzbarer Schwachstellen):
- App: 244 Einträge / 123 unterschiedliche CVE-IDs; 5 CRITICAL, 63 HIGH, 97 MEDIUM, 73 LOW, 6 UNKNOWN.
- Origin: 8 Einträge / 8 CVE-IDs; 7 HIGH, 1 MEDIUM.

**Direkt relevante Runtime-Abhängigkeit:** `/app/node_modules/ws/package.json`, installiert `8.18.3` auch live verifiziert. `CVE-2026-48779`: Speichererschöpfung durch kleine WebSocket-Fragmente; laut Scanner im 8er-Zweig ab `8.21.0` behoben. Vor Freischaltung beheben oder eine nachvollziehbare spezifische Nichtbetroffenheit belegen. HTTP-Request-Limits des Proxys sind kein Nachweis gegen Fragment-DoS innerhalb einer bereits offenen WebSocket-Verbindung.

Andere hohe Node-Paketbefunde einschliesslich des kritischen `tar`-Befunds liegen unter `/usr/local/lib/node_modules/npm/`, nicht unter den App-Dependencies. Sie sind zunächst Toolchain-/Paketmanager-Befunde; nicht pauschal als über das Spiel remote erreichbar darstellen. Keine blanket suppression: prüfen, ob irgendein Runtime-Pfad npm/Archive verarbeitet; schlankes Runtime-Image erwägen.

OS-Befunde betreffen unter anderem Perl, util-linux, ncurses/zlib; im Origin sind die HIGH-Einträge dem libuuid/util-linux-Paket zugeordnet. Viele Beschreibungen erfordern lokale privilegierte Mount-/Tool-Aufrufe; nonroot/cap_drop ALL/read-only reduzieren die entsprechenden Voraussetzungen, beweisen aber keine universelle Nichtbetroffenheit. Die formale CVE-/Paketbewertung und eine Base-Image-Entscheidung stehen aus. Auch Trivy 0.74.0 warnt, dass Alpine 3.24 nicht in seiner EOL-Liste steht; diese Metadatenlücke wird nicht verschwiegen. Scan ist kein vollständiger Pentest und keine Garantie vollständiger Node-Binary-/Browser-Bundle-Abdeckung.

**Codex bitte:** gesonderten Fix-Kandidaten für ws/Lockfile liefern, Runtime-/Base-Befunde bewerten und gewünschte Base-Digests explizit abstimmen. Danach eigener Build-Smoke und gezielte Regression. Die jetzigen laufenden Images bleiben unverändert; keine stillen Paketupdates im Container.

## Fehlversuche und Bereinigung

- Erster Last-Harness verwendete eine nicht erlaubte ProtocolClient-Observerrolle; korrigiert auf rohen WS-Observer, erfolgreicher Lauf separat belegt.
- Erste Profildirektabfrage nutzte falschen Pfad `/profiles/me`; korrekte `/vnext/profiles/me`-Abfrage und UI-History bestanden.
- SQLite-Verify auf einem read-only gemounteten WAL-Snapshot schlug fehl. Lösung: NAS-Paket unverändert behalten, isolierte lokale Arbeitskopie für SQLite-Sidecars beschreibbar mounten. Danach Hash/Integrität erneut geprüft.
- Trivy-Wiederholungen scheiterten zunächst an kleinem tmpfs, falschem Archivnamen und schliesslich DAC-Leserechten bei cap_drop ALL. Erfolgreicher Lauf: existierende `*-scan.tar`, `--mount`, dediziertes root-eigenes Ausgabeverzeichnis und root-eigene Scan-Kopien, cap_drop ALL unverändert.
- Scratch-App/Origin, erfolgreiche/fehlgeschlagene Lastcontainer und Scratch-Dockernetz entfernt; privater Scratch-SSH-Forward beendet. Echte Beta-Container unverändert healthy. On-disk-Test-/Restore-Artefakte verbleiben für Nachvollziehbarkeit; enthaltene SQLite-Daten werden NICHT ins Repo kopiert.

## Übergabe / offene Gates

`operations/` enthält die ausgeführten Betriebs-/Drillscripte als nachvollziehbare Referenz. Restore-/Rollback-/Crash-Scripte sind bewusst spezifische Acceptance-Drills mit Guardrails und Scratch-Namen, kein generischer Produktions-Deploybefehl. Ein Initialisierungswert in der archivierten Recovery-Scriptkopie wurde für die statische Typprüfung ergänzt; der zugrunde liegende echte Drill ist im JSON belegt.

Offen vor Ferienfreigabe: ws-Security-Fix/Bewertung und Nachscan; übrige hohe/kritische Befunde einordnen; Backup-Alarme/Stale-Erkennung; endgültige Zugangskonfiguration und Geräte-Negativtests; HTTPS/PWA/native iOS inklusive URLSession/WSS. Host-/Docker-Reboot-Persistenz bleibt bis zu separatem Wartungsfenster offen. Kein vollständiger Schema-Migrations-/Stack-Rollback nachgewiesen. Bekannter Namensfallback im Reload-/Ergebnisdialog bleibt UI-Fix für Codex, kein nachgewiesener Profilverlust.
