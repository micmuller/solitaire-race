# Task #257 – Visuelle Vorschau blockiert keinen Spielstart

## Umsetzung

Die visuelle Demo ist als lokaler Vorschauzustand gekennzeichnet. Sie öffnet kein
Server-Match und zeigt deshalb auch keinen Online-Status mehr. Beim Start einer
echten Verbindung wird der Vorschauzustand über denselben sicheren Cleanup-Pfad
wie ein regulärer Client verworfen.

Der Menüknopf öffnet während der Vorschau direkt die Lobby. Von dort können ein
Human-vs-Human-, Human-vs-Bot- oder Bot-vs-Bot-Spiel gestartet werden.

## UAT

1. In der Lobby `Visuelle Demo` wählen: Das Board erscheint und der Status nennt
   ausdrücklich eine reine Ansicht ohne eröffnetes Match; der Online-Punkt bleibt aus.
2. Menü öffnen: Es erscheint direkt der Bereich `Lobby`.
3. Von dort `Neuen Tisch eröffnen` wählen und als P1 hosten: Der Tisch wird
   erstellt und wartet auf P2.
4. Zur Lobby zurückkehren, die visuelle Demo erneut öffnen und anschließend
   `Human vs Bot` starten: Das echte Match startet und Karten lassen sich spielen.
5. Den Ablauf noch einmal mit `Bot vs Bot` prüfen; die Beobachteransicht startet
   ohne Neuladen der App.
