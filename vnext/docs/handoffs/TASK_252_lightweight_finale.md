# Task #252 – Leichtgewichtiger Abschluss auf alten iPads

Die Abschlussdarstellung verwendet drei explizite Profile:

- `full`: bisheriges Konfetti und Feuerwerk auf WebGL mit High/Balanced.
- `lite`: ein einzelner kurz eingeblendeter Goldakzent auf Canvas oder bei
  manuell gewählter Qualität `reduced`.
- `static`: derselbe sichtbare Goldakzent ohne Bewegung, wenn das Betriebssystem
  reduzierte Bewegung verlangt.

Die Menüvorschau und ein echtes Spielende verwenden dieselbe Policy. `force`
wiederholt nur die Vorschau und hebt das Ressourcenbudget nicht mehr auf.

## UAT

1. Auf dem alten iPad Pro unter Balanced und Niedrig jeweils „Finale testen“:
   Goldakzent und Abschlussdialog müssen sichtbar sein, ohne Partikelregen.
2. Mit iPadOS „Bewegung reduzieren“ wiederholen: statischer Akzent und sofortiger
   Dialog, keine Bewegung.
3. Ein echtes Match beenden und danach Dialog, Menü und Board bedienen; kein
   Freeze und kein zurückbleibender Effekt.
4. Auf Desktop/WebGL unter Balanced oder High prüfen, dass Konfetti und
   Feuerwerk unverändert erscheinen.
