# BOB — Folge-Kandidat zur isolierten Linux-Abnahme

Getesteter Code-/Fix-Commit:
**4a7c3c6c4e3dd7df5ac92276e7aa909d9a4fd5cc**

Branch: feature/pixijs8-webclient-mockup-4-2.
Dieser nachfolgende Eintrag ergänzt nur die vollständige Kandidatenidentität;
für Build/Abnahme ausdrücklich den oben genannten Commit auschecken.

Zuerst README.md in diesem Verzeichnis lesen. RED: tatsächlicher alter Server
stürzt durch Fragmente/UTF-8 ab. GREEN: Verbindung lokal geschlossen, Prozess
und Health bleiben erreichbar; andere Spieler/Matches sowie Neu-/Reconnect
funktionieren. Vollständige lokale Suite: 232 PASS, 0 FAIL, 1 Linux-SKIP.

Gleiche Bases wie bisher:

```sh
NODE_IMAGE=node@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752
NGINX_IMAGE=nginx@sha256:dc5069ad14f19660b141b21236140b91656bf89bbc3e2417c70ae650cd66104c
```

BOB: eigener Build-Smoke, native vollständige Tests inklusive
vnext/test/ws-lifecycle.test.js (vnext/test-support mitnehmen), fertige Image-
Fragmentprobe ausschliesslich auf Scratch, normaler Spiel-/Reconnect-/Profil-/
History-/Backup-Pfad und Trivy-Nachscan. IDs/Logs/Ergebnis zurückmelden.
Keine Beta-Imageauswahl, Cloudflare-Freischaltung oder FinanceHub-Änderung.

Node-/Nginx-Slim-Vorschläge sind nur separat bewertet, nicht übernommen oder
freigegeben. Vorhandener MAC-/Host-Guard-Vertrag unverändert.
