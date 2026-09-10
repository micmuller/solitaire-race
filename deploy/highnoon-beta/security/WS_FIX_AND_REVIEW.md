# Separater ws-Fix und Runtime-Bewertung — 10.09.2026

## Kandidat und Grenzen

Basis: Bobs Report-Commit 57b8726, ausgewertete Images aus
../reports/2026-09-10-remaining-acceptance/. Keine Änderungen an Dockerfiles,
Base-Digests, aktiven Images, Firewall/MACs oder Zugangspolicies.
Runtime-Änderung dieses Kandidaten: ws 8.18.3 → exakt 8.21.3 in package.json
und npm-Lockfile. Kein npm audit fix, kein Paketupdate im laufenden Container.
UI-/Reload-Namen bleiben separater Arbeitsauftrag.

Die derzeitige Konstruktion WebSocketServer({ noServer: true }) ist vom
Fragment-Speicherproblem betroffen. HTTP-Ratelimits greifen nicht innerhalb
bestehender WebSockets. Pin 8.21.3 umfasst den ersten Fix und die nachfolgenden
Korrekturen, insbesondere leere Fragmente und reduzierte Default-Grenzen.
Quellen: [ws-Advisory](https://github.com/websockets/ws/security/advisories/GHSA-96hv-2xvq-fx4p),
[8.21.1](https://github.com/websockets/ws/releases/tag/8.21.1),
[8.21.3](https://github.com/websockets/ws/releases/tag/8.21.3).
Registry-Version und Lockfile-Integrität wurden über npm bezogen; keine manuell
erfundenen Hashwerte. Dies begrenzt die Fragmentvektoren, ist kein allgemeiner
DoS-Schutz gegen beliebig viele Verbindungen/Spiele.

## Auswertung hoher/kritischer Scanbefunde

Die vollständige CVE-/Paketliste mit Einordnung steht in FINDINGS.md. App:
68 HIGH/CRITICAL-Pakettreffer, 29 unterschiedliche CVEs. Origin: 7 HIGH-Treffer.
Doppelte Source-Package-Zuordnungen sind keine unabhängigen Angriffswege.
Die Tabelle umfasst alle hohen/kritischen Treffer beider Raw-Scans; keine
Ignore-Datei oder globale Suppression wird angelegt. Sie bewertet genau den
berichteten Stack, nicht beliebige Images oder privilegierte Debug-Sessions.

Runtime-Quellprüfung: vnext/server, core, client und bot importieren weder npm,
node-tar, pacote noch Perl; keine child_process-/Shell-Ausführung in diesen
Runtime-Modulen. SQLite-Backup verarbeitet SQLite über node:sqlite, keine
hochgeladenen Archive. Start erfolgt direkt über node, nicht npm. Die npm-
Treffer liegen im Scan ausschliesslich unter /usr/local/lib/node_modules/npm;
ws ist unter /app/node_modules. npm bleibt jedoch im Runtime-Image vorhanden.
Ein kompromittierter Prozess oder spätere Betriebsänderungen können andere
Voraussetzungen schaffen: daher keine pauschale Nichtbetroffenheitserklärung.

- npm-Toolchain: über die geprüften Spiel-/Backup-Endpunkte kein Aufrufpfad
  erkennbar. Empfehlung: npm/npx und mitgelieferte alternative Paketmanager in
  einem separaten Runtime-Härtungskandidaten entfernen; Builder getrennt lassen.
  Kein manuelles npm-internes Dependency-Override dieses ws-Kandidaten.
- util-linux: Scan beschreibt privilegierte mount/nsenter-/fstab-Pfade.
  Nonroot, no-new-privileges und cap_drop ALL blockieren die erforderliche
  Privilegienerlangung im normalen Dienst. Bei libuuid (Origin) ist ausserdem
  Source-Package-Mapping von tatsächlich vorhandenem betroffenem Code zu trennen.
  Bob muss Binary-/SUID-/fstab-Inventar und Paketdateien der genauen Images
  nachreichen, bevor eine komponentenspezifische Ausnahme geschlossen wird.
  [Upstream mount-Advisory](https://github.com/util-linux/util-linux/security/advisories/GHSA-8gj5-72r3-428g).
- Perl: kein Runtime-Aufrufpfad. Archive::Tar/IO::Compress/Storable können in
  perl-base fehlen; nicht allein vom Paketnamen auf Modulpräsenz schliessen.
  Für den 32-Bit-Befund ist die Perl-Buildbreite zu prüfen, nicht nur die
  Container-Architektur. Keine pauschale Entwarnung für alle Perl-CVEs.
- zlib CVE-2023-45853: Debian dokumentiert, dass Bookworms src:zlib den
  betroffenen contrib/minizip-Code nicht in die betreffenden Binärpakete baut.
  Für den gemeldeten zlib1g-Treffer ist eine Source-Mapping-Nichtbetroffenheit
  begründet; das gilt nicht automatisch für separat gebündeltes MiniZip.
  [Debian-Bewertung](https://security-tracker.debian.org/tracker/CVE-2023-45853).
- ncurses: konkreter Pfad ist infocmp, nicht jede Nutzung von libtinfo;
  kein Spielaufruf erkennbar. [Debian](https://security-tracker.debian.org/tracker/CVE-2025-69720).
- systemd-homed: kein entsprechender Dienst in diesem Node-Container konfiguriert;
  Treffer auf libsystemd0/libudev1 belegen keinen homed-Daemon. Binary-Inventar
  noch prüfen. [Upstream](https://github.com/systemd/systemd/security/advisories/GHSA-jm29-p7hh-vjhv).

## Zusätzliche Grenze: Node-Binary und Base-Entscheidung

Der Bericht nennt Node 22.22.3. Danach gab es Security-Releases im Juni/Juli.
Eine reine OS-/npm-Paketliste deckt das Node-Binary und seine gebündelten
Bibliotheken nicht vollständig ab. Der Juli-Release nennt unter anderem
HTTP/2- und Permission-Model-Fixes; diese Pfade sind in der App nicht aktiv
(HTTP/1-Server, kein --permission). Das ist keine pauschale Node-Freigabe.
[Juli-Release / Node 22.23.2](https://nodejs.org/en/blog/vulnerability/july-2026-security-releases),
[Juni-Release](https://nodejs.org/en/blog/vulnerability/june-2026-security-releases).

Entscheidung für den isolierten ws-Vergleich: vorhandene verifizierte Digests
BEIBEHALTEN (aus Bobs BASE_IMAGES übernehmen):

- Node: node@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752
- Nginx: nginx@sha256:dc5069ad14f19660b141b21236140b91656bf89bbc3e2417c70ae650cd66104c

Das ist eine Vergleichsbasis, keine Empfehlung zum dauerhaften Verbleib auf
veralteter Runtime. Nächster separat abzustimmender Base-Kandidat:
aktueller gepflegter Node-22-Patchstand (mindestens mit Juli-Fixes), möglichst
weiter Debian bookworm-slim statt gleichzeitigem Distro-/Major-Wechsel.
Origin: expliziter neuer Nginx-Alpine-Digest mit geprüftem util-linux/libuuid-
Paketstand; im vorliegenden Scan deckt erst 2.42.3-r1 alle sieben HIGH-Einträge
ab. Das ist die Scanner-Fixversion, keine verifizierte Aussage über ein bereits
verfügbares konkretes Nginx-Image. Bob liefert Tag→Digest, Plattform, Versionen,
Paketdelta und Scan; gemeinsam bestätigen, dann eigener Build/Smoke/Regression.
Kein apt/apk upgrade als unversionierter Zusatz und kein Wechsel auf :latest.
Alpine-3.24-EOL-Metadatenlücke des Scanners weiter dokumentieren bzw. mit
aktueller unterstützender Scanner-/DB-Version gegenprüfen.

## Gezielte Nachabnahme durch Bob

1. Neuen Kandidaten separat auschecken. Gleiche Base-Digests setzen; build.sh
   in neues SHA-Verzeichnis ausführen. Sein realer Docker-Smoke muss bestehen.
2. Im neuen Image ws-Paketversion 8.21.3 und Revisionslabel nachlesen. Backend-
   Suite inkl. ws-security.test.js nativ amd64 ausführen (lokal Docker fehlt).
   Tests prüfen begrenzt die Ablehnung überzähliger leerer Fragmente und Reset
   des Fragmentbudgets zwischen abgeschlossenen Nachrichten. Kein OOM-Lastangriff.
3. Trivy erneut gegen exakt neues App-Image; Zuordnung Scan↔Image belegen.
   CVE-2026-48779 muss im App-ws-Pfad verschwinden. Restbefunde bleiben sichtbar.
   Gleiche Bases lassen weiterhin Base-/npm-Treffer erwarten; nicht als neuer
   ws-Regressionsfehler missverstehen, nicht pauschal freigeben.
4. Durch Origin zwei Spieler, Bot, Fragment-/Reconnect-Verhalten, Aufgabe,
   Profil/History und Online-Backup prüfen. Fehlerhaften Fragment-Client nur
   isoliert gegen Scratch testen, nicht die laufende Beta belasten.
5. Erst nach Kandidatenabnahme kontrollierter Wechsel; MAC-/Guard-Vertrag und
   vorhandenen NAS-Backupservice unverändert erhalten. Keine alten Paket-
   systemd-Dateien über Bobs bereits erweiterte NAS-/Timer-Integration kopieren.
6. Nach Image-Recreate tatsächliche IDs, Health, persistierte Profile sowie
   Connector-Positiv- und Netzwerk-Negativtest bestätigen. Kein Zugangsbypass.

Vor Ferienfreigabe bleiben Node-/Base-Bewertung, ggf. begründete zeitlich
befristete Ausnahmen, Backup-Alarme/Stale-Erkennung und Geräte-/HTTPS/iOS-Gates.
Keine automatische Security-Gesamtfreigabe allein aufgrund des ws-Updates.

## Lokale Verifikation und Repository-Besonderheit

Node 22.22.3, macOS: vollständige `npm test`-Suite 229 PASS, 0 FAIL,
1 Linux-spezifischer Test übersprungen; darin die beiden neuen ws-Regressions-
tests. Separater vNext-Lauf: 128 PASS, 0 FAIL, 1 SKIP. `npm ls ws --depth=0`
zeigt 8.21.3; git diff --check erfolgreich. Docker/amd64/Trivy-Nachscan hier
nicht verfügbar, daher keine neue Image-Abnahme behauptet.

Das Repository verfolgt historisch trotz .gitignore 20 Dateien unter
node_modules/ws bzw. node_modules/.package-lock.json. Die von npm install
aktualisierten bereits versionierten Dateien werden konsistent mitgeführt,
damit direkter Quellstart nicht weiterhin 8.18.3 verwendet. Keine manuellen
Änderungen am Fremdcode; kein zusätzliches Vendoring und keine nebenläufige
Repository-Bereinigung. Container-Build nutzt weiterhin npm ci und .dockerignore.
