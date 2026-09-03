# Pixi-Webclient 0.1.45 – UAT-Abnahme

Stand: 2026-09-03
Branch: `feature/pixijs8-webclient-mockup-4-2`

## Ergebnis

Der Nutzer hat drei vollständige Human-vs-Human-Spiele im Shared-Modus mit
Pixi Client 0.1.45 durchgeführt. Es traten keine Display-Freezes und keine
Verbindungsunterbrüche mehr auf. Der Stabilisierungsschritt ist damit im UAT
abgenommen.

## Behobene Fehlerklassen

- Veralteter Pixi-Boardstand nach einem während Drag/Handover zurückgestellten
  autoritativen State wird nach Interaktionsende zuverlässig reconciled.
- Verlorene Action-Antworten lösen nach einem Timeout einen Reconnect mit
  autoritativem Snapshot aus; die Sequenz bleibt dabei korrekt erhalten.
- Serververwaltete Bots reconnecten nach einem Transportabbruch und setzen den
  Lauf fort.
- Der Pixi-Renderer vermeidet unnötiges Neuzeichnen stabiler Karten und
  Spielfeldgeometrie und liefert erweiterte Rendererdiagnosen.
- Apple-Touch-Geräte verwenden den CanvasRenderer. Im Canvas-Profil werden
  autoritative Kartenpositionen für Spieler und Beobachter synchron gesetzt;
  der sichtbare Zustand hängt nicht mehr vom Safari-Animationsticker ab.
- Diagnoseberichte verwenden bei Lobby-Spielen die tatsächlichen
  Teilnehmerdaten statt eines möglicherweise veralteten Bot-Kontexts.

## Nachweise

- Das gemeldete Shared-Match
  `m-e34ed129-daf4-4904-a19c-5d044c6255e9` wurde deterministisch bis Revision
  260 und State-Hash
  `5f3f2e1a1ff42abcbfdd983c88f6925157157d61d62ca5fc1db49d546333afa1`
  erfolgreich nachgespielt.
- Produktionsbuild für Pixi Client 0.1.45 erfolgreich.
- Gesamttests: 159/159 bestanden.
- Pixi-Webclient-Tests: 62/62 bestanden.
- UAT: drei Shared Human-vs-Human-Spiele ohne Freeze oder Unterbruch.
