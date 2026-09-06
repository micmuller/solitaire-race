# Task #269 – Pixi Stock/Waste Pointer Recovery

Stand: 2026-09-06  
UAT-Kandidat: Pixi Client 0.2.2

## Ursache

Bei sehr schneller Mausbedienung konnte eine begonnene Drag-Sequenz ihr
`pointerup` verlieren. Der Pixi-Renderer hielt dadurch `drag` und `selection`
weiterhin aktiv. Autoritative Acks wurden während eines aktiven Drags bewusst
zurückgestellt, sodass das sichtbare Board auf einer älteren Revision stehen
bleiben konnte. Zusätzlich konnten verspätete Stock-/Zielereignisse vor der
Pending-Prüfung transiente UI-Zustände verändern.

## Korrektur

- Eine Mausbewegung ohne gedrückte Taste erkennt eine verlorene
  Pointer-Sequenz und verwirft sie.
- `pointercancel`, `lostpointercapture` und Fenster-Fokusverlust führen zum
  gleichen Recovery-Pfad.
- Recovery löscht Drag, Handoff, Auswahl und Double-Tap-Zustand und rendert den
  neuesten autoritativen State als Snapshot.
- Eine neue Pointer-Sequenz kann einen alten Drag nicht mehr überschreiben.
- Source-, Stock-, Target- und Auto-Foundation-Ereignisse prüfen den zentralen
  Input-/Pending-Lock, bevor sie transiente Zustände verändern.
- Stock-Klicks, die während eines laufenden Draw-Acks eintreffen, werden in
  einer kleinen begrenzten Queue gesammelt und anschließend Ack für Ack
  ausgeführt. Kein Klick startet parallele Intents.
- Ein zweiter schneller Mausklick, dessen ursprüngliche Kartenansicht bereits
  in den Waste verschoben wurde, wird anhand seiner physischen Position dem
  aktuellen Stock zugeordnet.
- Eine gezogene Karte bleibt in der ersten Bewegungshälfte als Rückseite
  sichtbar, dreht sich während des Wegs und wechselt erst am Mittelpunkt auf
  die Vorderseite.
- Nicht mehr sichtbare Waste-Karten beenden ihre laufenden Tweens vor dem
  Pruning, damit überlappende schnelle Draw-Animationen keine zerstörten
  Displayobjekte aktualisieren.
- Service-Worker-Cache und sichtbare Clientversion wurden nach der UAT-Nachschärfung auf 0.2.2 erhöht.

Spielregeln, Protocol und Server-Authority bleiben unverändert.

## Verifikation

- Pixi-Tests: 82/82 bestanden.
- Gesamttests: 180/180 bestanden.
- Vite-Produktionsbuild erfolgreich.
- Browser-Gegenprobe mit Human-vs-Bot:
  - fünf schnelle Doppelklicks wurden exakt als zehn Draws verarbeitet
    (Stock 24 auf 14, Revision 3 auf 13),
  - schnelle Stock/Waste-Wechsel ohne Freeze,
  - verworfener Drag mit anschließendem Stock-Zug,
  - Draw/Recycle-Grenze mehrfach passiert,
  - Revisionen liefen bis mindestens 72 weiter,
  - keine Browser-Warnungen oder -Fehler nach der finalen Tween-Pruning-Korrektur.

## Hardware-UAT

1. Installierte PWA vollständig schließen und neu als P1 öffnen.
2. Version 0.2.2 im Menü kontrollieren.
3. Stock schnell mehrfach klicken, Waste dazwischen auswählen und wieder Stock
   klicken.
4. Eine Waste-Karte kurz ziehen, außerhalb eines gültigen Ziels loslassen und
   sofort weiter auf Stock/Waste klicken.
5. Stock bis leer spielen und Draw/Recycle mehrfach wechseln.
6. Prüfen, dass Auswahl und Pending-Zustand jeweils verschwinden, Revision und
   Hash weiterlaufen und kein Reload oder manueller Resync nötig ist.
