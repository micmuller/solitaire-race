# Task #256 – Lobby und Spielmenü synchronisieren

## Umsetzung

Der Pixi-Client verwendet nur noch den Menübereich `Lobby` als Lobby-Ansicht.
Die vorherige, separat gepflegte Start-Lobby wurde entfernt. App-Start, Menüaufruf
ohne aktives Match und Rückkehr aus einem Match führen damit in dieselbe Ansicht
mit demselben Nickname, Spielmodus und derselben Liste offener Spiele.

Bei einem aktiven Match öffnet der Menüknopf weiterhin direkt den Bereich `Spiel`.
Ohne aktives Match bleibt die Lobby als notwendige Navigation geöffnet.

## UAT

1. App ohne Match-Link neu laden: Der Menübereich `Lobby` ist sofort sichtbar.
2. Nickname und Modus ändern, in andere Menübereiche wechseln und zurück zur
   Lobby wechseln: Beide Werte bleiben unverändert.
3. Ein Spiel starten, das Menü öffnen und `Spiel beenden` beziehungsweise
   `Platz verlassen` verwenden: Danach erscheint derselbe Lobby-Menübereich.
4. Ohne aktives Spiel den Menüknopf betätigen: Es öffnet sich die Lobby, keine
   zweite Willkommen-/Lobby-Ansicht.
5. Eine offene Partie über die Lobby-Liste öffnen und prüfen, dass das Menü im
   aktiven Match direkt den Bereich `Spiel` öffnet.
