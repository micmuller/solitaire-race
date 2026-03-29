# A2-C3 — Fix-Cluster: Reject / Resync / Waste Drift / Foundation-Konsistenz

**Datum:** 2026-03-29  
**Projekt:** Solitaire HighNoon / solitaire-race  
**Priorität:** P0  
**Bezug:** `A2_P0_Reject_Resync_Waste_Drift_Bugreport_2026-03-29.md`

---

## Ziel des Clusters

Diesen Cluster so fixen, dass nach einem illegalen Move plus legalem Folgezug:
- kein Client-Drift entsteht,
- Snapshot/Resync den Zustand zuverlässig heilt,
- Waste/Foundation korrekt bleiben,
- keine Karten verschwinden,
- Counts später im Spiel noch stimmen.

Kurz: **Reject darf niemals zu versteckter State-Korruption führen.**

---

## Scope

### In Scope
- Illegal-Move-Reject-Pfad
- Client-Rollback nach Reject
- Snapshot/Resync-Anwendung
- Waste-State / Waste-Topcard-Ableitung
- Foundation-Transfer nach Waste→Foundation
- Count-/Pile-Konsistenz nach Reject + Folgezug
- Logging/Assertions zur Kartenzahl-Konsistenz

### Out of Scope
- allgemeine UI-Politur
- neue Spielregeln
- Disconnect-Endgame-Semantik außerhalb dieses Pfads
- unrelated foundation UX improvements

---

## Bekannter Repro-Pfad

1. Match auf zwei iPads starten
2. illegalen Move provozieren
3. Reject beobachten
4. direkt legalen Move `waste -> foundation` ausführen
5. Waste-State driftet
6. spätere Aktionen heilen Anzeige teilweise, aber Counts/Kartenbestand stimmen nicht mehr

---

## Vermutete Root-Cause-Bereiche

### 1) Client Reject-Rollback
Prüfen, ob nach einem Reject:
- pending move queues geleert werden
- optimistic UI state vollständig zurückgerollt wird
- temporäre derived states (waste top, foundation previews etc.) invalidiert werden
- nachfolgende Eingaben auf garantiert konsistentem State basieren

### 2) Snapshot / Resync Merge-Strategie
Prüfen, ob Snapshot wirklich:
- alle piles vollständig ersetzt
- alle foundation lanes vollständig ersetzt
- waste/stock atomar neu setzt
- derived selectors/cache invalidiert

Achtung auf Fälle, wo Snapshot nur teilweise merged statt hart ersetzt wird.

### 3) Waste → Foundation Transfer-Pfad
Prüfen, ob bei `toFound` aus Waste:
- dieselbe Karte aus Waste entfernt wird, die auf Foundation landet
- die neue Waste-Topcard korrekt berechnet wird
- beide Clients nach Snapshot denselben Waste top sehen
- Count-Rekonstruktion aus tatsächlichem State erfolgt, nicht aus Zwischenwerten

### 4) Karten-Invariante / Count-Integrity
Es sollte jederzeit verifizierbar sein:
- jede Karte existiert genau einmal
- total cards remain constant
- Summe aus tableau + stock + waste + foundation + hidden state = erwartete Kartenzahl
- keine Karte verschwindet oder dupliziert sich nach Reject/Resync

---

## Umsetzungsvorschlag

### Phase 1 — Instrumentierung
Vor dem Fix zuerst Diagnose schärfen:

- zusätzliche Debug-Logs nach Reject
- Snapshot-Inhalt für Waste/Foundation im Debug-Modus loggen
- nach jedem Move optionale Invariant-Prüfung:
  - unique card ids
  - expected total card count
  - waste top matches waste array tail
  - foundation counts match actual piles

**Ziel:** nicht im Nebel stochern.

### Phase 2 — Hartes Resync-Verhalten prüfen/anpassen
Wenn Snapshot aktuell nur merge-basiert verarbeitet wird:
- für A2 ggf. konservativer werden
- kritische Zonen (`waste`, `stock`, `foundation`, `tableau`) nach Resync vollständig ersetzen
- temporäre Animation-/Pending-Stati nach Reject/Resync verwerfen

### Phase 3 — Reject-Folgezug absichern
Sicherstellen, dass nach Reject:
- kein stale local move state bleibt
- der nächste legale Move sauber gegen den echten aktuellen State läuft
- keine doppelte Anwendung des Folgezugs passiert

### Phase 4 — Foundation/Waste Count-Rekonstruktion härten
- Counts nur aus echter Datenstruktur ableiten
- keine UI-Caches als Wahrheitsquelle
- Assertions für Mismatch einbauen

---

## Konkrete Deliverables

1. **Analyse-Notiz / Root-Cause-Fund**
2. **Code-Fix für Reject/Resync/Waste/Foundation-Konsistenz**
3. **gezielte Regression-Tests** für genau diesen Pfad
4. **Testprotokoll auf 2 Geräten** mit bestandenem Repro-Pfad

---

## Minimaler Regression-Test-Katalog

### R1 — Illegaler Move + Reject
- illegalen Move senden
- Board bleibt identisch
- kein Drift

### R2 — Reject gefolgt von legalem Waste→Foundation
- direkt nach Reject legalen Waste→Foundation-Move
- beide Clients zeigen denselben Waste-State
- Foundation stimmt auf beiden Seiten

### R3 — Folgezüge nach Resync
- nach dem Problemzug noch mehrere normale Züge
- Counts bleiben stabil
- kein späteres Fehlen von Karten

### R4 — Karten-Invariante
- nach jedem Schritt: alle Karten genau einmal vorhanden
- keine negative oder unerklärliche Count-Differenz

---

## Akzeptanzkriterien

Der Cluster ist erst fertig, wenn:

- der beschriebene Repro-Pfad auf 2 iPads nicht mehr driftet
- Waste-Topcard auf beiden Geräten immer gleich ist
- Foundation-/Kartenzahl nach Folgezügen korrekt bleibt
- keine Karten später fehlen
- Debug-Assertions / Logs keine Invarianten verletzen

---

## Dev-Brief für Bit / Implementierer

### Auftrag
Untersuche und behebe einen P0-Bug im A2-Pfad: Nach illegalem Move + Reject + legalem Waste→Foundation-Move entsteht Client-Drift; spätere Counts zeigen echte State-Korruption.

### Erwartetes Vorgehen
1. Repro-Pfad lokal nachvollziehen
2. Reject-/Snapshot-/Waste-/Foundation-Pfad instrumentieren
3. Root Cause isolieren
4. konservativen Fix implementieren
5. Regressionstest für exakt diesen Pfad ergänzen
6. kurze Abschlussnotiz: Ursache, Fix, Restrisiken

### Nicht tun
- kein breites Refactoring ohne Diagnose
- keine kosmetische UI-Lösung, wenn die State-Quelle kaputt ist
- keine "works on my machine"-Abnahme ohne 2-Client-Repro-Test

---

## Empfohlene Arbeitsbezeichnung

**A2-C3 — Reject/Resync/Waste Drift mit echter State-Korruption**
