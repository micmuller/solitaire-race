# Task #253 – Folgeentscheidung nach Aufgabe

Nach einem serverautoritativ bestätigten `resign` erhält P1 eines Lobby-Spiels
automatisch die Wahl „Neues Spiel?“:

- **Ja** startet dasselbe Match serverautoritativ mit neuem Seed und gleichem
  Modus. Der Restart-Snapshot setzt beide Clients auf Revision und Sequenz 0.
- **Nein** verwendet den Host-Endpunkt. Der Server sendet `lobbyEnd`, entfernt
  die Matchsession und beide Clients kehren in die Lobby zurück.

P2 sieht bis zur Entscheidung einen Wartetext. Restart schließt alte
Abschlussdialoge und Effekte auf beiden Seiten. Browser-Reconnects verwenden den
bereits vorhandenen markierten Socket-Takeover.

## UAT

1. P2 gibt in einem Shared-Spiel auf. P1 muss automatisch „Neues Spiel?“ sehen.
2. P1 wählt Ja: gleiche Match-ID, neuer Seed, Revision 0, beide können wieder
   spielen und P2 folgt ohne manuelle Navigation.
3. Erneut aufgeben und P1 wählt Nein: beide landen in der Lobby; das alte Match
   ist nicht mehr gelistet oder verbindbar.
4. Ablauf mit P1 als aufgebender Partei und im Split-Modus wiederholen.
5. Während der P1-Frage einmal WLAN kurz trennen oder „Neu verbinden“ nutzen;
   die Frage muss nach dem Finished-Snapshot weiter funktionieren.
