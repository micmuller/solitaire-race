# Task #252 – Leichtgewichtiger Abschluss auf alten iPads

Die Abschlussdarstellung verwendet drei explizite Profile:

- `full`: Konfetti und drei Feuerwerke bei High/Balanced auf WebGL und Canvas.
  Auf Canvas werden sie mit reduziertem Partikelbudget in einem einzigen
  wiederverwendeten Graphics-Objekt gezeichnet.
- `lite`: ein klar beschriftetes, animiertes `FINALE!`-Banner mit wenigen
  goldenen Konfettisternen bei manuell gewählter Qualität `reduced`.
- `static`: dasselbe sichtbare Finale-Banner ohne Bewegung, wenn das Betriebssystem
  reduzierte Bewegung verlangt.

Die Menüvorschau und ein echtes Spielende verwenden dieselbe Policy. `force`
wiederholt nur die Vorschau und hebt das Ressourcenbudget nicht mehr auf.

## UAT

1. Auf dem alten iPad Pro unter Balanced und High jeweils „Finale testen“:
   Konfetti und drei Feuerwerke müssen eindeutig sichtbar sein.
2. Unter Niedrig muss das animierte `FINALE!`-Banner mit wenigen goldenen
   Konfettisternen sichtbar sein, ohne den vollen Partikelregen.
3. Mit iPadOS „Bewegung reduzieren“ wiederholen: statisches Banner und sofortiger
   Dialog, keine Bewegung.
4. Ein echtes Match beenden und danach Dialog, Menü und Board bedienen; kein
   Freeze und kein zurückbleibender Effekt.
5. Auf Desktop/WebGL unter Balanced oder High prüfen, dass Konfetti und
   Feuerwerk unverändert erscheinen.
