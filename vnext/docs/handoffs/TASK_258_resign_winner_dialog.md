# Task #258 – Gewinner nach Aufgabe eindeutig anzeigen

## Umsetzung

Der Abschlussdialog verwendet bei einer Aufgabe auf beiden Geräten das
serverautoritative Feld `winner` als klaren Titel (`<Name> gewinnt!`). Im Text
steht zusätzlich, welcher Spieler laut `endedBy` aufgegeben hat, gefolgt vom
Spielstand.

P1 erhält weiterhin die Auswahl zwischen neuem Spiel und Lobby. P2 sieht
weiterhin den Hinweis, dass P1 diese Folgeentscheidung trifft.

## UAT

1. Human-vs-Human starten und P1 aufgeben lassen. Auf beiden Geräten muss
   `<Name von P2> gewinnt!` als Dialogtitel erscheinen; der Text nennt P1 als
   aufgebenden Spieler.
2. Wiederholen und P2 aufgeben lassen. Auf beiden Geräten muss P1 als Gewinner
   und P2 als aufgebender Spieler genannt werden.
3. Prüfen, dass der angezeigte Spielstand auf beiden Geräten identisch ist.
4. Prüfen, dass nur P1 weiterhin `Ja, neues Spiel` und `Nein, zur Lobby` wählen
   kann und P2 auf P1s Entscheidung hingewiesen wird.
