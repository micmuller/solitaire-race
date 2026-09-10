# Bobs Linux-Abnahme und Netzwerkfix

Geprüfter Anwendungskandidat: `233b8ac7529e25d720b77d14fda0da17caad4386`.

- [Abnahmebericht](highnoon-linux-acceptance-233b8ac7.md): Testergebnisse, Image-IDs, behobener Netzwerkblocker und offene Freigabepunkte.
- [Originales Übergabepaket](highnoon-codex-network-fix.zip): Bericht plus Host-Konfiguration, identisch zur Chat-Anlage.
- Die übrigen Dateien sind der entpackte Inhalt des Übergabepakets.

## Für Codex

Dies ist ein dokumentierter Snapshot der auf Linux-host-1 installierten Konfiguration, kein automatisch auszuführender Installer. Insbesondere ist `highnoon-compose.yaml` **nicht** die aktive Repository-Vorlage `../../compose.beta.yaml`.

Bitte die festen Netzwerk-MAC-Adressen und den Firewall-Vertrag beim nächsten Deployment-Paket berücksichtigen; die installierte Compose-Datei darf nicht durch die alte Vorlage überschrieben werden. Die Images bleiben unverändert. Cloudflare ist nicht freigegeben; weitere Abnahmepunkte stehen im Bericht.

Dieser Dokumentationscommit ist kein neuer gebauter oder abgenommener Anwendungskandidat.
