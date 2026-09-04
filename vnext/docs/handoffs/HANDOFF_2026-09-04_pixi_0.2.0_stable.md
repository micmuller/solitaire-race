# Pixi-Webclient 0.2.0 – stabiler UAT-Stand

## Freigabe

Der PixiJS-8-Webclient `0.2.0` ist der vollständig auf iPad und Desktop
abgenommene Folgestand von `0.1.45`. Die UAT-Aufgaben #251 bis #260 wurden am
4. September 2026 einzeln geprüft und vom Nutzer freigegeben.

Die Versionserhöhung betrifft ausschließlich den Pixi-Webclient. Das gemeinsame
Protokoll bleibt bei `2.5.2`; Spielregeln und Server-Authority wurden nicht
verändert.

## Enthaltener Stand

- #251: Reduced Canvas läuft auf älteren iPads mit maximal 30 FPS.
- #252: Balanced/High zeigen Konfetti und Feuerwerk; Reduced verwendet ein
  leichtes, aussagekräftiges Finale-Banner.
- #253: Nach Aufgabe entscheidet P1 serverautoritativ über Neustart mit neuem
  Seed oder die gemeinsame Rückkehr zur Lobby.
- #254: Normales Hosting erzeugt immer einen frischen Seed; explizite Seeds
  bleiben dem technischen Start vorbehalten.
- #256: App-Start, Menü-Lobby und Rückkehr aus einem Match verwenden dieselbe
  kanonische Lobby-Ansicht.
- #257: Die visuelle Demo ist eine lokale, nicht-interaktive Vorschau und
  blockiert keinen anschließenden Spielstart.
- #258: Nach Aufgabe sehen beide Parteien Gewinner, aufgebenden Spieler und
  Spielstand eindeutig.
- #259: Human-vs-Bot und Bot-vs-Bot unterstützen Split und Shared direkt im
  Bot-Tab.
- #260: Das Settings-Zahnrad verwendet auf Safari/iPadOS eine geprägte
  Messingdarstellung statt einer blau-weißen Emoji-Glyphe.

## Release-Gates

- Pixi-Tests: 74/74 grün.
- Gesamte Repository-Test-Suite: 172/172 grün.
- Vite-Produktionsbuild erfolgreich.
- Generiertes `dist/` enthält Version `0.2.0` und den neuen Service-Worker-Cache.
- Git-Diff-Prüfung ohne Whitespace-Fehler.
- Alle Aufgaben #251 bis #260 vom Nutzer im UAT abgenommen.

## Betrieb

Der Pixi-Client bleibt unter `/vnext/pixi/` erreichbar. Nach der Aktualisierung
sorgt der neue Service-Worker-Cache `solitaire-highnoon-pixi-v0.2.0` dafür, dass
installierte PWAs die bisherigen 0.1.46-Artefakte ersetzen.
