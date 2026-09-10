# Entscheidungsvorlage: geschlossene Ferien-Beta

Stand 10.09.2026. **Vorschlag an Michael, noch keine Risikoannahme oder
Aktivierungsfreigabe.** Ziel ist ein brauchbarer Spieltest im vereinbarten
kleinen Teilnehmerkreis. Keine CVE-freie Plattform, keine zusätzliche HA-/MDM-
oder Monitoring-Plattform als Voraussetzung.

## Bereits ausreichend geprüft

[BOBs erfolgreiche Nachabnahme](reports/2026-09-10-lifecycle-4a7c3c6c/README.md),
übernommen mit 28dc75547d283cc3478cd029bbbf255f3e840e3a:
Kandidat **4a7c3c6c4e3dd7df5ac92276e7aa909d9a4fd5cc** hat 233 native Tests
und 5 Security-/Lifecycle-Tests im fertigen Image bestanden. Fragment-, UTF-8-
und Transportfehler bleiben bei derselben laufenden Prozessinstanz lokal zur
Verbindung; andere Spieler und Reconnect funktionieren. Spielabschluss,
Profile/History und Onlinebackup sind nachgeprüft. Diesen Fix nicht erneut öffnen.

Die [Betriebsabnahme](reports/2026-09-10-remaining-acceptance/README.md)
belegt zusätzlich zwei Browserprofile, NAS-Kopie mit Rücklesen, isolierten
Restore samt Profil/History/Spiel und einen begrenzten 30-Minuten-Lauf.
Die [Netzwerk-Abnahme](reports/2026-09-10-linux-233b8ac7/README.md) belegt
Sperren zu Host/FinanceHub/LAN/Internet bei funktionierendem Connector→Origin→App.
Diese Ergebnisse gelten für den dokumentierten MAC-/Guard-Vertrag. Nach dem
notwendigen Imagewechsel nur dessen Erhalt kurz nachprüfen, keine Vollabnahme
oder neue allgemeine Scanrunde starten.

## Restbefunde nach tatsächlicher Relevanz

Grundlage sind die vorhandenen Raw-Scans und [Einzelbewertungen](security/FINDINGS.md).
Paket-Schweregrade und mehrfach zugeordnete Source-Package-CVEs sind keine
Zählung tatsächlich erreichbarer Angriffe. Ohne zusätzliche Image-Belege bleiben
modul-/binärspezifische Nichtbetroffenheiten teilweise unsicher.

| Befundgruppe | Konkrete Voraussetzung / Erreichbarkeit | Auswirkung | Entscheidungsvorschlag |
|---|---|---|---|
| ws-Fragment-/Parserfehler | Über eine Spielverbindung erreichbar; im abgenommenen Kandidaten behoben, in laufender alter Beta noch nicht ersetzt | Früher gesamter Spielprozess/aktive Partien; kein belegter Hostzugriff | **Jetzt beheben:** exakt abgenommenes Image vor externem Zugang übernehmen, kein weiterer Fix nötig |
| Fehlende durchgängige Match-/Sitzautorisierung | Ein bereits zugelassener Teilnehmer kann technische Match-/Bot-APIs nutzen; externe Sperre muss alle API-/WS-Pfade umfassen | Fremde Partien/Statistiken im Testkreis stören; kein daraus belegter FinanceHub-Zugriff | **Restrisiko vorlegen:** nur vertrauenswürdiger kleiner Kreis; vor offener Beta beheben |
| npm-internes tar, pacote, Glob-/Signatur-/Adresspakete | In mitgeliefertem npm; kein Aufruf aus geprüftem Spiel-/SQLite-Backup-Code. Angriff benötigt Werkzeugverwendung mit untrusted Eingaben oder bereits anderen Codeausführungspfad | Werkzeug-DoS/Dateizugriff; bei Ausführung mit App-Rechten auch eigene SQLite-/Backupdaten, nicht nur Spielfluss | **Restrisiko vorlegen; später pflegen.** Keine Runtime-Paketinstallation, keine fremden Archive; jetzt kein npm-Umbau |
| util-linux/mount/nsenter, ACL; Origin-libuuid-Zuordnung | Beschriebene Angriffe brauchen privilegierte lokale Aufrufe, passende fstab-/Pfadkontrolle; kein HTTP-Aufrufpfad gefunden. Nonroot/NNP/cap_drop begrenzen Voraussetzungen; Bibliothekszuordnung allein beweist nicht betroffenen ausführbaren Code | Unter erfüllten Voraussetzungen lokale Rechte-/Dateigrenzen gefährdet; deshalb nicht pauschal als Spiel-DoS abtun | **Restrisiko vorlegen; später pflegen.** Guard/Containerrechte nicht lockern; kein bekannter direkter Spiel→Host-Exploit aus diesen Belegen |
| Perl, gzip, infocmp, systemd-homed | Nicht verwendete Interpreter-/CLI-/Dienstpfade; Modulpräsenz teils offen. Perl laut Bob 64 Bit, daher 32-Bit-Befund nicht passend; keine Ausnahme für alle Perl-CVEs | Je nach tatsächlich aufgerufenem Werkzeug DoS, falsche Verarbeitung oder Dateien mit dessen Rechten | **Restrisiko vorlegen; später pflegen.** Keine neuen Werkzeugeingänge für Clientdaten |
| zlib/MiniZip CVE-2023-45853 | Gemeldetes Bookworm-zlib1g baut laut Debian den betroffenen contrib/minizip-Code nicht mit; keine Aussage zu anderen gebündelten ZIP-Bibliotheken | Für diesen gemeldeten Binärpaketpfad kein betroffener Code belegt | **Später pflegen:** dokumentierte Paketzuordnung, kein Beta-Blocker |
| Node 22.22.3 / gebündelte Bibliotheken | Nachfolgende Security-Fixes existieren. HTTP/2 und Node-Permission-Model werden hier nicht verwendet; App nutzt HTTP/1 hinter Nginx. Scan deckt das Node-Binary nicht vollständig ab | Abhängig vom erreichbaren Pfad DoS oder Grenzverletzung; aus vorliegenden Belegen kein weiterer konkret nachgewiesener leicht erreichbarer Spielabsturz | **Restrisiko vorlegen; kleiner separater Wartungsschritt empfohlen**, keine universelle Nichtbetroffenheit behauptet |

Ein neuer konkreter Hinweis auf einen über den vorgesehenen HTTP/WS-Pfad
leicht auslösbaren Absturz, Credential-Abfluss oder Host-/FinanceHub-Zugriff
ändert diese Entscheidung. Nur dann gezielt weiter untersuchen. Geschlossener
Zugang begrenzt Angreifer, ersetzt aber keine Behebung eines belegten Angriffs.

## Echte verbleibende Blocker für Zugang

1. **Abgenommener Kandidat ist noch nicht aktiv.** Nach Michaels gesondertem
   Auftrag kontrolliert die bereits gebauten/geprüften Image-IDs aus Bobs
   Bericht übernehmen; vorher aktuelles Backup. Kein Neubuild/kein Base-Wechsel.
2. **Beschränkter Zugang ist noch nicht eingerichtet/nachgewiesen.** Nur die
   vereinbarten Identitäten und Feriengeräte, alle Host-/API-/WS-Pfade erfassen,
   keine Bypass-Ausnahme für native iOS. Geräteliste/Identitäten aus
   [Access-Vorbereitung](reports/2026-09-10-remaining-acceptance/ACCESS_PREPARATION.md)
   mit Michael abschliessen; dort ist auch Nathalies iPad zur Bestätigung erfasst.
3. **Kurzer Check des aktivierten Stacks vor Freischaltung:** richtige Images,
   Health/Spielzug, MACs/geladene Guard-Regeln, Connector positiv und Zugriff
   auf FinanceHub/Host negativ. Keine neuen Secrets im Frontend, in ausgelieferter
   Konfiguration oder Diagnoseausgaben; keine Host-/FinanceHub-Credentials in
   App-Mounts. Bisher keine Offenlegung gemeldet, aber keine universelle
   Secret-Freiheit aus dem Scan ableiten. Nur diese konkreten Ausgaben prüfen.

Profile/History und nutzbares Backup/Restore sind bereits belegt. Vor Start
letzten erfolgreichen NAS-Backupzeitpunkt kontrollieren; kein weiterer Restore-
Drill allein wegen des unveränderten Datenschemas erforderlich.

## Bewusst akzeptierbare Einschränkungen — Michael entscheidet

- Neustart verliert aktive In-memory-Partien; abgeschlossene Profile/History
  sind persistent. Gelegentliche Unterbrechung und manuelle Recovery zulässig.
- Tägliches Backup begrenzt Datenverlust nur bei erfolgreichem Lauf. Externe
  Alarmierung/Stale-Warnung fehlt noch. Für die Ferien reicht als Vorschlag
  eine benannte Person mit täglichem Blick auf letzten Erfolg/systemd-Status;
  bei Fehler manuell handeln. Keine automatische Überwachung behaupten.
- Offene Paketgruppen aus obiger Tabelle unter unveränderten Betriebsgrenzen
  zeitlich bis Ferienende akzeptieren; danach neu priorisieren. Kein automatisches
  oder dauerhaftes Akzeptieren und keine Scanner-Suppression.
- Noch kein Host-/Docker-Reboot-Abnahmetest, keine HA, kein Kapazitätsmaximum,
  kein vollständiger Schema-Migrationsdrill. Kein Umbau allein für diese Beta.
- Anzeigenamen können nach Reload auf generische Namen fallen; kein belegter
  Verlust von Profil/History. UI-Fix darf nach dem ersten Gerätetest folgen.

## Base-Vorschläge: für Zugang nicht zwingend, getrennt halten

| Vorschlag aus Bobs Scan | Empfehlung für diese Beta | Begründung / Grenze |
|---|---|---|
| Node-Digest 83f487e0… → Node 22.23.2 | **Sinnvoller kleiner separater Wartungsschritt**, bevorzugt nach erstem geschütztem Gerätetest; mit obiger Risikoannahme auch nach den Ferien vertretbar | Runtime-Security-Fixes, aber kein Rückgang High/Critical; eigener App-/SQLite-Smoke erforderlich. Nicht als CVE-Bereinigung verkaufen |
| Nginx stable-alpine-slim, Digest d6d5b298… | **Nach den Ferien ausreichend** | Kleineres Inventar und 0 Treffer im konkreten Scan sind positiv; derzeitige Befunde nicht als direkter HTTP-Exploit belegt. Variantenwechsel benötigt noch vollständige Origin-/HTTP-/WS-Abnahme |

Vollständige vorgeschlagene Digests und Paketdelta stehen im
[Base-Bericht](reports/2026-09-10-ws-7f5ca0a4/README.md).
Keine Base-Änderung oder npm-Entfernung in diesem Auftrag. Michaels ausdrückliche
Zustimmung bleibt Voraussetzung eines späteren Wartungskandidaten.

## Kürzester Weg zum ersten Feriengerätetest

1. **Michael:** obige befristete Restrisiken akzeptieren oder konkret abweichende
   Punkte benennen; Identitäten/Geräte und Person für Backupkontrolle festlegen.
   Für die kleine Familien-Beta begleiteten Gerätebeitritt mit anschliessend
   geschlossenem Enrollment vorschlagen, statt MDM als neues Projekt zu verlangen.
   Das muss technisch funktionieren und ist keine attestierte Hardware-Whitelist.
2. **Bob, nach separatem Übernahmeauftrag:** aktuelles Backup, geprüften
   Lifecycle-Kandidaten übernehmen, kurze Checks aus Blocker 3. MAC-/Guard- und
   installierten NAS-Vertrag erhalten. Kein Neubuild, keine Scanwiederholung.
3. **Michael + Bob:** Zugangspolicy/Enrollment aufsetzen, zuerst mit einem
   Feriengerät. WARP allein genügt nicht: eigene Identität/Registrierung und
   Policy müssen zusammen greifen. Native URLSession/WSS darf nicht an einem
   Browser-Login scheitern. Keine API-Ausnahme als Abkürzung.
4. **Erst mit separater Aktivierungsfreigabe:** Beta-Route aktivieren; sofort
   berechtigtes Gerät positiv und Zugriff ohne WARP/fremde Identität bzw.
   nicht zugelassenes Gerät negativ prüfen. Bei Lücke Route zurücknehmen.
5. **Erster Spieltest über Mobilfunk:** native App und installierte PWA,
   anschliessend zweites Gerät; Spielzug/Aufgabe/History, WLAN-Wechsel und
   Sperrbildschirm/Reconnect kurz prüfen. TLS/PWA und iOS-Kompatibilität erst
   dabei als bestanden melden; bei Erfolg verbleibende Feriengeräte aufnehmen.

Diese Vorlage ersetzt frühere umfangreichere Freigabe-Checklisten für die
kleine geschlossene Ferien-Beta, nicht die technischen Host-/MAC-Verträge.
In diesem Auftrag wurden nur Dokumente gelesen/erstellt: keine Tests/Scans
wiederholt, keine Images übernommen, keine Route aktiviert, FinanceHub unverändert.
