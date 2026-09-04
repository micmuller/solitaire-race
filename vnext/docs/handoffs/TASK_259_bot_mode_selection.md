# Task #259 – Split-/Shared-Auswahl im Bot-Tab

## Umsetzung

Der Menübereich `Bot` besitzt eine eigene Auswahl `Spielmodus` mit `Split` und
`Shared`. Die Auswahl wird vor dem Erstellen des Matches übernommen und gilt
sowohl für `Match mit Bot` als auch für `Bot vs Bot`.

Der gewählte Modus bleibt mit der allgemeinen Modusanzeige synchron und wird im
Header des gestarteten Matches angezeigt.

## UAT

1. Im Bot-Tab `Split` und anschließend `Match mit Bot` wählen. Im Header muss
   `SPLIT` erscheinen; das Match muss spielbar sein.
2. Zur Lobby zurückkehren, im Bot-Tab `Shared` wählen und erneut `Match mit Bot`
   starten. Im Header muss `SHARED` erscheinen; das Match muss spielbar sein.
3. Dieselben beiden Prüfungen mit `Bot vs Bot` wiederholen. Die Beobachteransicht
   muss jeweils den ausgewählten Modus anzeigen und beide Bots müssen ziehen.
4. Zwischen Lobby-, Neues-Spiel- und Bot-Tab wechseln und prüfen, dass die
   zuletzt gewählte Variante konsistent angezeigt wird.
