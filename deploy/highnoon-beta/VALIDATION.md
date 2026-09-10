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
