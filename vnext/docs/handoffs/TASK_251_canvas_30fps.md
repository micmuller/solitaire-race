# Task #251 – Canvas-Limit bei reduzierter Qualität

Der Pixi-Ticker wird ausschließlich im Canvas-Profil mit der niedrigsten
Grafikqualität `reduced` auf 30 FPS begrenzt. Canvas mit `balanced` oder `high`
und sämtliche WebGL-Profile bleiben unlimitiert.

Das aktive Limit wird als `tickerMaxFps` in den Renderer-Diagnosen geführt und
erscheint im kopierbaren Fehlerbericht. Damit lässt sich die Einstellung auf
alter und neuer Hardware ohne indirekte Lastmessung verifizieren.

## UAT

1. Auf dem alten iPad Pro Grafikqualität `Niedrig` wählen und die PWA neu laden.
2. Im Diagnosebericht `CanvasRenderer` und `FPS-Limit 30` bestätigen.
3. Stock antippen, Karten auswählen, ziehen und doppelt auf eine Foundation
   legen; State und Revision müssen bei jeder Aktion weiterlaufen.
4. Auf einem neuen Gerät mit WebGL sowie auf Canvas mit `Balanced` prüfen, dass
   der Fehlerbericht `FPS-Limit aus` zeigt.
