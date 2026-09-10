# Ferienzugang – Vorbereitung, NICHT aktiviert

## Verbindlicher Zustand

Keine Cloudflare-Route, DNS-Veröffentlichung, Access-Allow-Policy oder Enrollment-Freigabe wurde in dieser Abnahme aktiviert. FinanceHub bleibt unberührt. Die folgende Konfiguration ist ein Entwurf, kein API-Payload und kein Nachweis einer vorhandenen Zugangssperre.

Anwendungsname: `highnoon-holiday-beta`
Geplanter HTTPS-Hostname: `solitairehighnoon-test.stillorbit.net`
Vorhandenes internes Tunnelziel: `http://highnoon-beta-origin:8080` im Netz `cloudflare-test-edge`.
Backend `app:3011` bleibt ausschliesslich über Origin erreichbar; keine Host-Ports, keine LAN-/CIDR-Freigabe.

## Von Michael erfasste Geräte

| Gerät | Gemeldetes OS | Status |
|---|---|---|
| Mic's iPad Pro | iPadOS 26.6.1 | Noch nicht registriert/geprüft |
| Mic's iPhone 15 | iOS 26.6.1 | Noch nicht registriert/geprüft |
| Nathalies iPAD | iPadOS 16.7.16 | Von Michael in dieser Sitzung zusätzlich genannt; Identität noch festzulegen |

Teamname, Account-Auswahl und Anmeldeidentitäten sind gemeinsam mit Michael festzulegen. Keine E-Mail aus FinanceHub ungefragt als neue Zugangsidentität übernehmen. Geräte-Namen sind keine eindeutigen Sicherheitsmerkmale. Die OS-Angaben sind Nutzerauskünfte, keine Device-Posture-Messungen.

## Vorgeschlagener enger Aufbau

1. Im vorhandenen Cloudflare-Account den Zero-Trust-Stand prüfen; nicht aufgrund der Aussage „noch keine Konfiguration“ den existierenden Tunnel ersetzen. Teamname erst nach Bestätigung anlegen/auswählen.
2. Exakte Personenidentitäten festlegen. Login über vorhandenen IdP mit MFA bevorzugen; alternativ OTP an einzeln erlaubte Adressen prüfen. Kein pauschales „alle gültigen E-Mails“ und kein Domain-Wildcard.
3. Cloudflare **One Agent** auf jedem Gerät installieren, dem Team beitreten, registrierte Geräte gemeinsam identifizieren. Nicht mit der Consumer-App 1.1.1.1 oder einer beliebigen WARP-Verbindung gleichsetzen.
4. Enrollment nur in einem begleiteten Zeitfenster für die ausgewählten Identitäten öffnen. Nach Aufnahme der Geräte wieder schliessen; fremde/bereits vorhandene Registrierungen vorher inventarisieren und gegebenenfalls gezielt widerrufen. Dieser Ablauf ist eine mögliche einfache Gerätebegrenzung, aber noch nicht live validiert und kein Ersatz für Hardware-Attestation.
5. Eine Access-Anwendung für genau den Beta-Host vorbereiten. Allow nur für exakte Identitäten **UND** das eigene verwaltete Gateway/WARP; alle anderen Anfragen standardmässig verweigern. Keine Bypass-/Service-Auth-Ausnahme für API oder WebSocket. Sitzungsdauer als Vorschlag 24 Stunden, durch Michael zu bestätigen.
6. Für native iOS-URLSession/WSS die WARP-basierte Identitätsübernahme prüfen, bevor diese Variante gewählt wird: keine ungeprüften Browser-Login-Redirects und keine Annahme, dass Safari-Cookies für die native App gelten. Wenn dies nicht funktioniert, private Hostname-/Gateway-Alternative mit gültigem HTTPS separat ausarbeiten; nicht spontan ein LAN-CIDR routen.
7. Route erst nach Behebung/Bewertung des Security-Blockers, überprüfter Policy und Michaels ausdrücklicher Aktivierungsfreigabe hinzufügen. Connector-Ziel bleibt der obige Origin; FinanceHub-Routen/Policies nicht ändern.

## Harte Geräte-Whitelist: offener Entscheid

Cloudflares dokumentierter „Unique Client ID / Device UUID“-Posturecheck benötigt UUID-Zuweisung über verwaltete Bereitstellung/MDM; laut Dokumentation ist manuelle Zuweisung nicht möglich. Die im Dashboard angezeigte Registrierungs-ID darf nicht ungeprüft als solche MDM-UUID eingesetzt werden.

Deshalb vor Aktivierung entscheiden und prüfen:
- Reicht das begleitete Registrieren mit anschliessend geschlossenem Enrollment und Widerruf aller anderen Registrierungen für diese kurze Familien-Beta?
- Oder wird eine technisch erzwungene MDM-Geräte-Whitelist verlangt? Dann ist zuerst die passende Geräteverwaltung einzurichten.

Keine dieser Varianten ist bereits eingerichtet oder abgenommen. App-Kompatibilität auf Nathalies älterem iPad praktisch prüfen; Dokumentation allein ersetzt keinen Installations-/Verbindungstest.

## Zugangsentzug und Negativtests

- Verlust eines Geräts: Registrierung und aktive Sessions widerrufen; falls der Entzug nicht zeitnah greift, Beta-Route entfernen.
- Testmatrix: erlaubtes Gerät mit WARP, dasselbe ohne WARP, fremde Identität, nicht registriertes Gerät mit erlaubter Identität, widerrufene Registrierung, abgelaufene Sitzung.
- Native App und PWA jeweils über Mobilfunk; WLAN-Wechsel, Sperrbildschirm, Reconnect, HTTPS/WSS und Service Worker prüfen.
- Bei unberechtigtem Zugriff Route wieder deaktivieren, keinen Auth-Bypass öffnen.

## Offizielle Quellen, in dieser Sitzung gelesen

- https://developers.cloudflare.com/cloudflare-one/access-controls/policies/
- https://developers.cloudflare.com/cloudflare-one/reusable-components/posture-checks/client-checks/device-uuid/
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/private-net/cloudflared/
- https://developers.cloudflare.com/cloudflare-one/traffic-policies/network-policies/
- https://developers.cloudflare.com/cloudflare-one/team-and-resources/devices/warp/download-warp/
- https://apps.apple.com/ch/app/cloudflare-one-agent/id6443476492
