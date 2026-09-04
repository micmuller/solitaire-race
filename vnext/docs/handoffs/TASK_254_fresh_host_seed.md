# Task #254 – Frischer Seed beim normalen Hosting

Jeder normale P1-Hoststart erzeugt den Seed jetzt unmittelbar beim Start neu.
Ein im Menü noch sichtbarer Seed wird dabei bewusst ignoriert und nach
erfolgreicher Erstellung durch den tatsächlich verwendeten Seed ersetzt.

Der separate „Technischer Start“ behält die Möglichkeit, einen expliziten
Diagnose- oder Reproduktions-Seed zu verwenden. Ein leeres Diagnosefeld fällt
ebenfalls auf einen frisch erzeugten Seed zurück.

## UAT

1. Ein Lobby-Spiel normal hosten und den angezeigten Seed notieren.
2. Zur Lobby zurückkehren und erneut normal hosten, ohne das Seed-Feld zu ändern.
3. Bestätigen, dass der zweite Seed vom ersten abweicht.
4. Einen festen Seed eintragen und „Technischer Start“ wählen; exakt dieser Seed
   muss im Match verwendet werden.
5. Danach wieder normal hosten; der feste Test-Seed darf nicht übernommen werden.
