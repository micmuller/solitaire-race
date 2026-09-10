# Vollständige HIGH/CRITICAL-Einordnung der gelieferten Scans

Quelle: Bobs unveränderte trivy074-app.json und trivy074-origin.json unter
../reports/2026-09-10-remaining-acceptance/. Eine Zeile pro Image/CVE;
Paketnamen zusammengefasst, Severity und Fixstände aus genau diesem Scan.
Beschreibung/Voraussetzungen stammen aus den Scan-Advisory-Daten; die
Runtime-Erreichbarkeitsbewertung ist Codex-Codeanalyse. Zusätzliche extern
verifizierte Primärquellen und Grenzen: WS_FIX_AND_REVIEW.md.
Keine formelle Risikoakzeptanz oder VEX-Suppression; offene Image-Belege
bleiben offen. Für jede Zeile gilt erneute Bewertung bei Runtimeänderungen.

| Image | CVE | Severity | Gemeldete Pakete | Fix laut Scan | Bewertung / nächste Massnahme |
|---|---|---|---|---|---|
| app | CVE-2026-53613 | HIGH | bsdutils, libblkid1, libmount1, libsmartcols1, libuuid1, mount, util-linux, util-linux-extra | kein Fix im Scan | Privilegierter mount/nsenter-/fstab-Pfad, keine App-Nutzung. Nonroot/NNP/cap_drop begrenzen Voraussetzungen; Binary-/SUID-/fstab-Beleg vor spezifischer Ausnahme nachreichen. |
| app | CVE-2026-76642 | HIGH | bsdutils, libblkid1, libmount1, libsmartcols1, libuuid1, mount, util-linux, util-linux-extra | kein Fix im Scan | Privilegierter mount/nsenter-/fstab-Pfad, keine App-Nutzung. Nonroot/NNP/cap_drop begrenzen Voraussetzungen; Binary-/SUID-/fstab-Beleg vor spezifischer Ausnahme nachreichen. |
| app | CVE-2026-78408 | HIGH | bsdutils, libblkid1, libmount1, libsmartcols1, libuuid1, mount, util-linux, util-linux-extra | kein Fix im Scan | Privilegierter mount/nsenter-/fstab-Pfad, keine App-Nutzung. Nonroot/NNP/cap_drop begrenzen Voraussetzungen; Binary-/SUID-/fstab-Beleg vor spezifischer Ausnahme nachreichen. |
| app | CVE-2026-78409 | HIGH | bsdutils, libblkid1, libmount1, libsmartcols1, libuuid1, mount, util-linux, util-linux-extra | kein Fix im Scan | Privilegierter mount/nsenter-/fstab-Pfad, keine App-Nutzung. Nonroot/NNP/cap_drop begrenzen Voraussetzungen; Binary-/SUID-/fstab-Beleg vor spezifischer Ausnahme nachreichen. |
| app | CVE-2026-78410 | HIGH | bsdutils, libblkid1, libmount1, libsmartcols1, libuuid1, mount, util-linux, util-linux-extra | kein Fix im Scan | Privilegierter mount/nsenter-/fstab-Pfad, keine App-Nutzung. Nonroot/NNP/cap_drop begrenzen Voraussetzungen; Binary-/SUID-/fstab-Beleg vor spezifischer Ausnahme nachreichen. |
| app | CVE-2026-41992 | HIGH | gzip | kein Fix im Scan | CLI-Dekompression präparierter LZW/LZH-Dateien erforderlich; Spiel/SQLite-Backup rufen gzip nicht auf. Build-/Adminpfade gesondert halten. |
| app | CVE-2026-54369 | HIGH | libacl1 | kein Fix im Scan | Privilegierter Caller mit angreiferkontrolliertem Dateipfad erforderlich; kein solcher Runtime-Pfad erkennbar. Host-Betrieb separat bewerten. |
| app | CVE-2026-16742 | HIGH | libsystemd0, libudev1 | kein Fix im Scan | systemd-homed erforderlich; nicht als Dienst konfiguriert. Source-Mapping auf libsystemd/libudev allein kein Beleg; Binary-Inventar offen. |
| app | CVE-2025-69720 | HIGH | libtinfo6, ncurses-base, ncurses-bin | kein Fix im Scan | infocmp-CLI betroffen; kein Aufruf im Spiel. Source-Mapping zu libtinfo/ncurses beachten, CLI-Präsenz prüfen. |
| app | CVE-2026-13221 | CRITICAL | perl-base | kein Fix im Scan | Perl-Regex bzw. pack/unpack erforderlich; kein App-Aufruf. Restbefund für installierten Interpreter, separat aktualisieren/minimieren. |
| app | CVE-2026-42496 | CRITICAL | perl-base | kein Fix im Scan | Archive::Tar-Verarbeitung erforderlich; kein App-Aufruf. Modulpräsenz im perl-base-Image prüfen; Ausnahme bis Beleg offen. |
| app | CVE-2026-8376 | CRITICAL | perl-base | kein Fix im Scan | Erfordert 32-Bit-Perl und Regex-Kompilation. Kein Perl-Aufrufpfad; Buildbreite des konkreten Perl-Binary nachweisen. |
| app | CVE-2026-42497 | HIGH | perl-base | kein Fix im Scan | Archive::Tar-Verarbeitung erforderlich; kein App-Aufruf. Modulpräsenz im perl-base-Image prüfen; Ausnahme bis Beleg offen. |
| app | CVE-2026-48962 | HIGH | perl-base | kein Fix im Scan | IO::Compress mit kontrolliertem Ausgabe-Glob erforderlich; kein App-Aufruf. Modulpräsenz prüfen; kein entfernter Spielpfad belegt. |
| app | CVE-2026-57432 | HIGH | perl-base | kein Fix im Scan | Perl-Regex bzw. pack/unpack erforderlich; kein App-Aufruf. Restbefund für installierten Interpreter, separat aktualisieren/minimieren. |
| app | CVE-2026-57433 | HIGH | perl-base | kein Fix im Scan | Storable-Deserialisierung erforderlich; kein App-Aufruf. Modulpräsenz prüfen; kein entfernter Spielpfad belegt. |
| app | CVE-2026-9538 | HIGH | perl-base | kein Fix im Scan | Archive::Tar-Verarbeitung erforderlich; kein App-Aufruf. Modulpräsenz im perl-base-Image prüfen; Ausnahme bis Beleg offen. |
| app | CVE-2023-45853 | CRITICAL | zlib1g | kein Fix im Scan | Debian Bookworm baut betroffenen contrib/minizip-Code nicht in zlib1g; Source-Mapping-Nichtbetroffenheit für diesen Treffer begründet (siehe Review). |
| app | CVE-2026-13149 | HIGH | brace-expansion | 5.0.7, 1.1.16, 2.1.2 | npm-Toolchain, kein Aufruf im geprüften Spiel-/Backup-Code. Separat Runtime-Toolchain entfernen; bis dahin paketbezogener Restbefund, keine globale Ausnahme. |
| app | CVE-2026-14257 | HIGH | brace-expansion | 5.0.8, 3.0.3, 2.1.3, 1.1.17 | npm-Toolchain, kein Aufruf im geprüften Spiel-/Backup-Code. Separat Runtime-Toolchain entfernen; bis dahin paketbezogener Restbefund, keine globale Ausnahme. |
| app | CVE-2026-69152 | HIGH | brace-expansion | 1.1.18, 2.1.4, 3.0.6, 5.0.9 | npm-Toolchain, kein Aufruf im geprüften Spiel-/Backup-Code. Separat Runtime-Toolchain entfernen; bis dahin paketbezogener Restbefund, keine globale Ausnahme. |
| app | CVE-2026-69192 | HIGH | ip-address | 10.3.1 | npm-Toolchain, kein Aufruf im geprüften Spiel-/Backup-Code. Separat Runtime-Toolchain entfernen; bis dahin paketbezogener Restbefund, keine globale Ausnahme. |
| app | CVE-2026-9496 | HIGH | pacote | 21.5.1 | npm-Toolchain, kein Aufruf im geprüften Spiel-/Backup-Code. Separat Runtime-Toolchain entfernen; bis dahin paketbezogener Restbefund, keine globale Ausnahme. |
| app | CVE-2026-33671 | HIGH | picomatch | 4.0.4, 3.0.2, 2.3.2 | npm-Toolchain, kein Aufruf im geprüften Spiel-/Backup-Code. Separat Runtime-Toolchain entfernen; bis dahin paketbezogener Restbefund, keine globale Ausnahme. |
| app | CVE-2026-48815 | HIGH | sigstore | 4.1.1 | npm-Toolchain, kein Aufruf im geprüften Spiel-/Backup-Code. Separat Runtime-Toolchain entfernen; bis dahin paketbezogener Restbefund, keine globale Ausnahme. |
| app | CVE-2026-59873 | CRITICAL | tar | 7.5.19 | npm-Toolchain, kein Aufruf im geprüften Spiel-/Backup-Code. Separat Runtime-Toolchain entfernen; bis dahin paketbezogener Restbefund, keine globale Ausnahme. |
| app | CVE-2026-59874 | HIGH | tar | 7.5.18 | npm-Toolchain, kein Aufruf im geprüften Spiel-/Backup-Code. Separat Runtime-Toolchain entfernen; bis dahin paketbezogener Restbefund, keine globale Ausnahme. |
| app | CVE-2026-73566 | HIGH | tar | 7.5.21 | npm-Toolchain, kein Aufruf im geprüften Spiel-/Backup-Code. Separat Runtime-Toolchain entfernen; bis dahin paketbezogener Restbefund, keine globale Ausnahme. |
| app | CVE-2026-48779 | HIGH | ws | 5.2.5, 6.2.4, 7.5.11, 8.21.0 | Direkt erreichbar; Update 8.21.3 in diesem Kandidaten. Nachscan offen. |
| origin | CVE-2026-53612 | HIGH | libuuid | 2.42.3-r0 | Privilegierter mount/nsenter-/fstab-Pfad, keine App-Nutzung. Nonroot/NNP/cap_drop begrenzen Voraussetzungen; Binary-/SUID-/fstab-Beleg vor spezifischer Ausnahme nachreichen. |
| origin | CVE-2026-53613 | HIGH | libuuid | 2.42.3-r0 | Privilegierter mount/nsenter-/fstab-Pfad, keine App-Nutzung. Nonroot/NNP/cap_drop begrenzen Voraussetzungen; Binary-/SUID-/fstab-Beleg vor spezifischer Ausnahme nachreichen. |
| origin | CVE-2026-53614 | HIGH | libuuid | 2.42.3-r0 | Privilegierter mount/nsenter-/fstab-Pfad, keine App-Nutzung. Nonroot/NNP/cap_drop begrenzen Voraussetzungen; Binary-/SUID-/fstab-Beleg vor spezifischer Ausnahme nachreichen. |
| origin | CVE-2026-76642 | HIGH | libuuid | 2.42.3-r0 | Privilegierter mount/nsenter-/fstab-Pfad, keine App-Nutzung. Nonroot/NNP/cap_drop begrenzen Voraussetzungen; Binary-/SUID-/fstab-Beleg vor spezifischer Ausnahme nachreichen. |
| origin | CVE-2026-78408 | HIGH | libuuid | 2.42.3-r1 | Privilegierter mount/nsenter-/fstab-Pfad, keine App-Nutzung. Nonroot/NNP/cap_drop begrenzen Voraussetzungen; Binary-/SUID-/fstab-Beleg vor spezifischer Ausnahme nachreichen. |
| origin | CVE-2026-78409 | HIGH | libuuid | 2.42.3-r0 | Privilegierter mount/nsenter-/fstab-Pfad, keine App-Nutzung. Nonroot/NNP/cap_drop begrenzen Voraussetzungen; Binary-/SUID-/fstab-Beleg vor spezifischer Ausnahme nachreichen. |
| origin | CVE-2026-78410 | HIGH | libuuid | 2.42.3-r0 | Privilegierter mount/nsenter-/fstab-Pfad, keine App-Nutzung. Nonroot/NNP/cap_drop begrenzen Voraussetzungen; Binary-/SUID-/fstab-Beleg vor spezifischer Ausnahme nachreichen. |

Abdeckung: 75 hohe/kritische Pakettreffer, 36 Image/CVE-Zeilen.
