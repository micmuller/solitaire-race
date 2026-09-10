# Nächste Schritte zur Ferien-Beta

Stand 10.09.2026, nach Übernahme von Bobs Bericht für Anwendungskandidat 233b8ac.
Vertragsangleichung b3c77d2 ist gepusht. Sie verlangt keinen Image-Neubuild und
keine Änderung der laufenden Image-Auswahl. Sie übernimmt bereits installierte
MACs in die Repository-Vorlage. Bestehende Host-Konfiguration zuerst vergleichen;
keine Recreates oder Firewall-Neuladungen nur wegen dieser Dokumentationsänderung.

## Bob: interne Abnahme mit den bestehenden Images fortsetzen

Priorität 1 — verbleibende betriebliche Voraussetzungen:

1. Zwei unabhängige Browserprofile mit verschiedenen Spielern verwenden.
   Spiel eröffnen/beitreten, beidseitige Züge, WebSocket-Reconnect, Profil und
   Historie nach regulärem Spielende prüfen. Tokens nicht ins Protokoll schreiben.
2. Täglichen SQLite-Backupjob, Fehlererkennung und NAS-Zweitkopie integrieren.
   Erst nach verifizierter Kopie kalendarische Retention 30 Tage / 12 Monate
   aktivieren. NAS-Restore isoliert mit Login, Historie und Match prüfen;
   tatsächliche RTO und Zeitpunkt des letzten erfolgreichen Backups melden.
3. Image-Vulnerability-Scan für genau die laufenden Image-IDs durchführen.
   Befunde einordnen, insbesondere Runtime-relevante kritische/hohe Befunde.
   Nicht ohne Abstimmung auf andere Base-Images oder :latest wechseln.
4. Upgrade/Rollback an Scratch-Daten prüfen. Keine reale Beta-Datenbank für
   einen destruktiven Drill ersetzen. Automatische Recovery nach Prozessabsturz
   separat von docker kill + manuellem start nachweisen.

Priorität 2 — Stabilität und Gerätetests vorbereiten:

5. Begrenzten Lauf mit zwei Spielern plus separater Bot-Partie und Online-Backup
   durchführen. Dauer, CPU/RAM, OOM/Throttling, SQLite-Lockfehler und Reconnects
   protokollieren; zunächst 30 Minuten. Start-/Endzeit und Testlast angeben.
6. Im Browser Console/Netzwerk auf Fehler prüfen. PWA-/Service-Worker-Abnahme auf
   der endgültigen HTTPS-Adresse bleibt bis zum geschützten Zugang offen.
7. Firewall-Vertrag erhalten: per-Netzwerk-MACs, geladene nft-Tabellen und
   Connector→Origin→App-Pfad prüfen. Bei notwendiger Recreation Negativtests
   wiederholen. Kein Docker-/Host-Reboot ohne abgestimmtes Wartungsfenster für
   die parallel laufenden Dienste; Reboot-Persistenz bis dahin offen ausweisen.

Rückmeldung als neuer Bericht im reports-Verzeichnis: tatsächliche Image-IDs,
Prüfungen PASS/FAIL/OFFEN, Belege, Backup-Zeitpunkt/RPO/RTO und konkrete Blocker.
Ein Dokumentationscommit ist keine neue Image-Abnahme. FinanceHub unverändert
lassen. Keine öffentliche Route und keinen Auth-Bypass aktivieren.

## Codex: Beobachtung zu Namen nach Reload

Codeprüfung bestätigt zwei Lücken im Pixi-Wiederanlauf:
- main.js startet bei URL mit matchId direkt connect(), ohne ensurePlayer().
  lobbyPlayer bleibt dabei zunächst null; das eigene Label fällt auf P1 zurück.
- prepareMatchContext() sucht nur in Lobby-Spielen. Direkte Bot-Matches sind
  dort nicht enthalten; nach Reload bleibt activeKind auf seinem Default human.
  participantNames() liefert dann Spieler 1 / Spieler 2 statt Nickname / Bot.

Damit ist Bobs Anzeige-Beobachtung erklärbar, aber kein Profil-/Datenverlust
bewiesen. In diesem Vertragsupdate keine Spiel-/Client-Änderung vorgenommen.
Eine Korrektur muss Profil und Match-Metadaten wiederherstellen, ohne neue
Spieler anzulegen, den falschen Lobby-Sitz zu übernehmen oder einen visuellen
Autopiloten ungefragt neu zu starten. Match-State und Ergebniszuordnung bleiben
serverautoritativ. Nicht bloss Bot anhand einer URL oder Rolle vermuten.

Geplante Regression: Human-vs-Bot und Human-vs-Human vor/nach Reload; gleicher
Spieler, richtige Namen/Gegnerart, laufende Revision, anschliessende Zuordnung
von Profil/History. Fehler/abgelaufener Token und Gast-/Observer-Pfad mitprüfen.
Für einen späteren Client-Fix eigener Commit, Build-Smoke und gezielte UAT;
laufende Images währenddessen beibehalten.

## Michael + Bob: geschützten Zugang vorbereiten

Michael hat für den ersten Test ausdrücklich nur seine Feriengeräte über
verwaltetes Cloudflare WARP/Zero Trust ausgewählt. Konkrete Geräte noch erfassen.
Keine weiteren Tester zulassen. Exakte Kombination aus
Routing, Geräteanmeldung und Access-/Gateway-Policy gemeinsam prüfen; eine
installierte WARP-App allein ist keine Zugriffsbeschränkung.

Vor dem Aktivieren müssen feststehen:
- erlaubte Identitäten/Geräte und Entzug des Zugangs;
- Routing zur Beta ohne Freigabe des übrigen Netzes;
- HTTPS/WSS mit gültigem Zertifikat;
- PWA und native iOS-URLSession ohne ungeprüften Browser-Login-Redirect;
- erwartetes Verhalten bei ausgeloggtem/nicht berechtigtem Gerät.

Policy zuerst einrichten. Route erst nach Michaels expliziter Freigabe aktivieren.
Anschliessend iPhone über Mobilfunk: PWA + native App, erlaubter/unberechtigter
Zugriff, abgelaufene Anmeldung, WLAN-Wechsel, Sperrbildschirm und Reconnect.
Bei fehlender Zugriffssperre Route wieder deaktivieren, keinen API-Bypass öffnen.
