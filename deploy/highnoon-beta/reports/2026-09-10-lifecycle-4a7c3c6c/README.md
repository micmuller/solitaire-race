# Linux-/Image-Nachabnahme: WebSocket-Lifecycle

Kandidat: `4a7c3c6c4e3dd7df5ac92276e7aa909d9a4fd5cc`.
Stand: 2026-09-10. Auftrag: `security/ws-lifecycle/CANDIDATE.md` und dortiges `README.md`, nach Fetch des Feature-Branches gelesen.

## Urteil

**Gezielter Lifecycle-Fix und angeforderte interne Nachabnahme BESTANDEN.**
Der zuvor reproduzierte Prozessabsturz ist unter den geprüften Fehlerfällen behoben. **Keine Gesamt-Security-/Ferienfreigabe, keine Beta-Übernahme.** Die bestehenden hohen/kritischen Base-/npm-Befunde bleiben offen. Node-/Nginx-Base-Vorschläge wurden nicht übernommen.

## Identität und Isolation

- Separater Mac-Checkout: `/Users/bob/repos/solitaire-race-acceptance-4a7c3c6c`
- Separater Linux-Checkout: `/srv/micnet/releases/highnoon-build-4a7c3c6c`
- Neues Releaseverzeichnis: `/srv/micnet/releases/highnoon/4a7c3c6c4e3dd7df5ac92276e7aa909d9a4fd5cc`
- Plattform linux/amd64, native Tests auf Linux.
- Node-Base unverändert: `node@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752`
- Nginx-Base unverändert: `nginx@sha256:dc5069ad14f19660b141b21236140b91656bf89bbc3e2417c70ae650cd66104c`
- App Docker-ID: `sha256:5a72a486b4fb672058419fa57e5b65777213885db3d04acdf845525acbb1d66d`
- Origin Docker-ID: `sha256:b54a145a980d52fd017df5c98a6af661689c8340cbefc4a6a169072ca2bb8245`

Temporäres internes Netz `highnoon-lifecycle-4a-test`, nur Kandidaten-App/Origin und begrenzter Probeclient. Keine Hostports, kein Anschluss an das Cloudflare-Netz, keine Beta-Daten. Nonroot, read-only RootFS, cap_drop ALL, no-new-privileges und begrenzte CPU/RAM/tmpfs. App ohne Restart-Policy, damit kein Restart einen Absturz verdecken kann. Die vollständige native Suite wurde in einer temporären Kopie des Source-Checkouts mit Lockfile-Abhängigkeiten ausgeführt; das originale Arbeitsverzeichnis blieb unangetastet.

## Reale Ergebnisse

| Prüfung | Ergebnis | Beleg |
|---|---|---|
| Build + Smoke | PASS: nonroot/read-only nginx -t, Start, HTTP/PWA/config, WS-Snapshot | smoke.log |
| Vollständige native Suite | **233 PASS, 0 FAIL, 0 SKIP**, einschliesslich ws-lifecycle.test.js und Linux-Prozessidentität | native-tests.log |
| Security-/Lifecycle-Suite im fertigen Image | **5 PASS, 0 FAIL, 0 SKIP**; nur Tests und test-support read-only eingebunden, Server/Bibliothek aus dem Image | image-security-tests.log |
| Fragmentprobe über fertigen Origin | 16385 leere Frames bei Limit 16384 -> Code 1008, Health 200 | image-probe.json |
| Ungültiges UTF-8 über fertigen Origin | Code 1007, Health 200 | image-probe.json |
| Abrupter Transportabbruch | clientseitig Code 1006, Health 200 | image-probe.json |
| Andere Spieler | Nach jedem Fehler Ack im anderen Match und für P2 im betroffenen Match | image-probe.json |
| Neue Verbindung/Reconnect | Freier P1-Platz ohne Takeover neu belegbar; danach expliziter Reconnect, Ersatzpeer nach altem Close weiterhin spielbar | image-probe.json |
| Kein versteckter Neustart | Gleiche PID **842349**, gleiche Startzeit, Running=true, OOMKilled=false, RestartCount=0 vor/nach Proben und normaler Regression | process-verification.json |
| Normaler Spielpfad | Lobby mit zwei Spielern, beidseitiger Stock-Zug, echter Reconnect bei Revision 2/gleichem State-Hash, Aufgabe | normal-regression.json |
| Profil/History | Host-Sieg und Gast-Niederlage über Profil-/History-API bestätigt | normal-regression.json |
| Bot + Onlinebackup | 20 Bot-Acks im Lauf beobachtet; Online-SQLite-Backup, SHA-Abgleich und Integrität ok | normal-regression.json |

Die neue externe Image-Probe wiederholt die relevanten Verhaltenstests durch den tatsächlichen Nginx-Origin und startet keinen instrumentierten Ersatzserver. Die zusätzliche Suite im Image prüft ausserdem Listener-Cleanup über die mitgelieferte test-support-Fixture. Das sind ergänzende Nachweise, nicht dieselbe Prüfung doppelt gezählt.

Alle hier ausgeführten finalen Prüfkommandos liefen erfolgreich. BuildKit warnt über fehlende Defaultwerte für die zwingenden Base-ARGs; die Werte wurden explizit mit den oben genannten Digests gesetzt, kein unversionierter Fallback. SQLite meldet die bekannte ExperimentalWarning unter Node 22.

## Trivy-Nachscan

Scanner 0.74.0, gepinnt:
`aquasec/trivy@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969`.

Export der beiden fertigen Kandidaten-Images; Scan via `--input`, `--scanners vuln`, `--list-all-pkgs`. Archiv-Config-SHA gegen Trivy-ImageID nachgerechnet und RootFS-Diff-IDs gegen Docker inspect verglichen. Docker-Manifest-ID und Archiv-Config-Digest sind unterschiedliche Identifikatoren, siehe `scan-provenance.json`.

| Image | Critical | High | Medium | Low | Unknown | eindeutige CVEs |
|---|---:|---:|---:|---:|---:|---:|
| App | 5 | 62 | 96 | 73 | 6 | 121 |
| Origin | 0 | 7 | 1 | 0 | 0 | 8 |

Severity-Spalten zählen Paket/CVE-Zeilen, nicht eindeutige CVEs. Die Zahlen entsprechen dem vorherigen ws-Kandidaten mit denselben Bases. Keine ws-CVE-Treffer. Die übrigen Befunde sind damit **nicht behoben oder akzeptiert**. Anwendbarkeitsbewertung und Base-Vorschläge bleiben separat in `security/FINDINGS.md`, `security/ws-lifecycle/README.md` und der vorherigen Abnahme dokumentiert.

Rohdaten: `app-scan.json`, `origin-scan.json`, `scan-summary.json`, `scan.log`.

## Reproduzierbare Hilfsmittel und Grenzen

- `acceptance.py`: exakter Linux-Ablauf für Image-Security-Tests, Scratch-Aufbau, Proben, Prozessvergleich, normale Regression, Cleanup und Scan. Nur für das ausgewiesene Kandidatenverzeichnis und ein noch nicht vorhandenes Scratch-Verzeichnis verwenden; absichtlich kein Überschreiben vorhandener Testdaten.
- `image-probe.cjs`: begrenzte Fragment-/UTF8-/Transportproben, feste Scratch-Origin-Adresse.
- `normal-regression.cjs`: zuvor geprüfter Spiel-/Profil-/Backup-Harness, hier ausdrücklich mit `SKIP_FRAGMENT=1` ausgeführt; die Fehlerproben liegen im separaten Harness.
- `scan-images.py`: exakte Kandidatenreferenzen, gepinnter Scanner, Archive und Herkunftsprüfung; kein Pull neuer Node-/Nginx-Bases.
- Dateinamen der Hilfsmittel in `/tmp` stehen im Runner; die Repository-Kopien sind zur Lesbarkeit kürzer benannt. Bei Wiederholung entsprechend zuordnen.
- `SHA256SUMS` stammt aus dem Linux-Release und betrifft auch das dort verbleibende Imagearchiv. `EVIDENCE_SHA256SUMS` deckt die hier abgelegten Übergabedateien ab.

Kein erneuter visueller Browser-/iOS-UAT, kein WSS-/Cloudflare-Test, kein NAS-Restore oder längerer Lastlauf in dieser gezielten Nachabnahme. Keine Aussage allgemeiner DoS-Immunität. Die früheren Betriebsbelege gelten separat; Backup-Alarmierung/Stale-Erkennung, Endgerätezugang und verbleibende Sicherheitsentscheidungen sind weiterhin eigene Gates. Der alte RED-Nachweis wurde nicht erneut ausgeführt: BOBs vorheriger unabhängiger Prozessabsturzbeleg und Codex' versionierte RED-Belege bleiben erhalten.

## Abschlusszustand

Scratch-App, Scratch-Origin und Testnetz nach erfolgreicher Prüfung entfernt. Kandidaten-Images und private Scratch-Artefakte auf Linux für Nachvollziehbarkeit aufbewahrt; keine SQLite-Dateien oder Session-Tokens in der Übergabe. `beta-unchanged.json` bestätigt identische Image-IDs, PID, Startzeit und RestartCount des Beta-Stacks vor/nach den Tests.

Aktive Beta weiter auf App `sha256:0dcb2e20b8007b2512c363ccd093d183f9c6aa3e2feb82311e52684e12e66553` und Origin `sha256:194ce99b70c716eabaab036e8d0daefd00f3e7e59363dc2144ef3c4bc8917547`.

**Keine Beta-Übernahme, keine Base-Wechsel, keine Cloudflare-Freischaltung, keine FinanceHub-Änderung.**
