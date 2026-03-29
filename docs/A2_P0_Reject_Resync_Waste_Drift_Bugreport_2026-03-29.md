# A2 P0 Bugreport — Reject/Resync/Waste Drift mit echter State-Korruption

**Datum:** 2026-03-29  
**Projekt:** Solitaire HighNoon / solitaire-race  
**Status:** Behoben und auf 2 iPads erfolgreich retestet (`fixed / retested green`)  
**Ursprünglicher Status:** P0 / Release Blocker  
**Erstbefund-Test-Setup:** 2 iPads mit iOS Client-Build `0.7.22 (3)` gegen Server `v2.4.21`
**Fix-validierter Stand:** Server `v2.4.23`, iOS `0.7.25 (6)`

---

## Kurzfassung

Ein illegaler Move wird zunächst korrekt rejected. Führt man direkt danach einen legalen Move aus dem Waste auf die Foundation aus, driftet der Waste-State zwischen den beiden Clients auseinander. Ein nachgelagerter Zusatztest zeigt, dass das Problem **nicht nur Anzeige/UI** ist: Später ist der Foundation-Count zu tief, wodurch Karten im weiteren Spielverlauf effektiv fehlen.

Damit liegt sehr wahrscheinlich **echte Zustandskorruption** vor, nicht bloß ein Render- oder Anzeigeproblem.

---

## Bewertung

**Severity:** P0  
**Warum:**
- Client-State driftet nach Reject + Folgezug auseinander
- Snapshot/Resync scheint den Zustand nicht zuverlässig zu heilen
- spätere Foundation-/Kartenzählung ist falsch
- dadurch fehlen Karten im weiteren Spielverlauf
- Build ist für A2-Stabilisierung nicht releasefähig

---

## Reproduktionsszenario (bestätigt)

### T3 — initialer Befund
1. Laufenden Match auf zwei iPads verwenden
2. Einen klar illegalen Move provozieren
3. Beobachten: Move wird korrekt rejected
4. Direkt danach legalen Move durchführen
5. Danach zeigen beide Clients unterschiedliche Waste-Zustände

### T3b — Folgeprüfung
1. Drift-Zustand bestehen lassen
2. Waste zwei weitere Male bedienen / auffüllen
3. Anzeige synchronisiert sich scheinbar wieder
4. Später zeigt sich: Foundation-Count ist deutlich zu tief
5. Daraus folgt: Karten fehlen effektiv im Match-State

---

## Konkrete Beobachtungen aus dem Test

### Re-Test T3
- **Illegaler Move (iPad B):** `Herz 10` auf Foundation `Herz 2`
- **Erwartung:** sauberer Reject ohne Folgeschaden
- **Beobachtung:** Reject selbst wirkt korrekt

### Legaler Folgezug
- **Legal Move (iPad B):** `Waste Herz 2` zu `Foundation Herz Ass`

### Danach sichtbarer Drift
- **iPad A Waste danach:** `Kreuz 6`
- **iPad B Waste danach:** `leer`
- Anzeige ist also nicht identisch, obwohl beide denselben Match sehen sollten

### Zusatztest T3b
- Nach zweimaligem weiteren Waste-Bedienen synchronisiert sich die Anzeige optisch wieder
- **Aber:** Foundation-Count reduziert sich auf `14`, obwohl er bei ca. `18` oder `19` liegen sollte
- Schlussfolgerung: Es fehlen später Karten im Match; damit liegt **keine reine UI-Abweichung** vor

---

## Fail-Codes

- `DRIFT`
- `RESYNC_FAIL`
- `MISSING_CARD`
- optional als Folgesymptom: `FOUNDATION_WRONG`

---

## Relevante Server-Logs (vom Folgezug)

```text
[MOVE] 2026-03-29T13:07:05.507Z room="EMN7M" kind=flip from=ios cid=8h69bfhp2fx hasMoveId=true
[MOVE-PAYLOAD] {"stockCount":21,"count":1,"wasteCount":2,"to":{"kind":"waste","sideOwner":"Y"},"kind":"flip","from":{"sideOwner":"Y","kind":"stock"},"owner":"Y","cardId":"Y-14-♥️-1"}
[MOVE_APPLY] matchId=EMN7M rev=11 kind=flip cardId=Y-14-♥️-1 moveId=- sig=- hash=4183ec408a6d70ad counts=you:stock=21 waste=2 tab=28 fnd=4 | opp:stock=22 waste=2 tab=25 fnd=0
[BROADCAST] 2026-03-29T13:07:05.510Z room="EMN7M" kind=move total=2 open=2 targets=2 sampleCid=8h69bfhp2fx,oqki4tz6vq bytes=283
[SNAPSHOT_RESYNC_SENT] 2026-03-29T13:07:05.510Z matchId="EMN7M" reason=after_move
[STATUS] 2026-03-29T13:07:05.510Z — Clients=2, Rooms=1 [EMN7M:2]
[MOVE] 2026-03-29T13:08:20.376Z room="EMN7M" kind=toPile from=ios cid=oqki4tz6vq hasMoveId=true
[MOVE-PAYLOAD] {"owner":"O","to":{"sideOwner":"O","kind":"pile","uiIndex":5},"cardId":"O-48-♣️-9","count":1,"from":{"sideOwner":"O","kind":"pile","uiIndex":4},"kind":"toPile"}
[MOVE_APPLY] matchId=EMN7M rev=12 kind=toPile cardId=O-48-♣️-9 moveId=- sig=- hash=674da9281997efd8 counts=you:stock=21 waste=2 tab=28 fnd=4 | opp:stock=22 waste=2 tab=25 fnd=0
[BROADCAST] 2026-03-29T13:08:20.378Z room="EMN7M" kind=move total=2 open=2 targets=2 sampleCid=8h69bfhp2fx,oqki4tz6vq bytes=276
[SNAPSHOT_RESYNC_SENT] 2026-03-29T13:08:20.379Z matchId="EMN7M" reason=after_move
[STATUS] 2026-03-29T13:08:20.379Z — Clients=2, Rooms=1 [EMN7M:2]
[MOVE] 2026-03-29T13:08:59.570Z room="EMN7M" kind=toFound from=ios cid=8h69bfhp2fx hasMoveId=false
[MOVE-PAYLOAD] {"from":{"kind":"waste","sideOwner":"Y"},"to":{"kind":"found","f":1},"kind":"toFound","owner":"Y","cardId":"Y-14-♥️-1","count":1}
[MOVE_APPLY] matchId=EMN7M rev=13 kind=toFound cardId=Y-14-♥️-1 moveId=- sig=- hash=02f588a153fd2bdc counts=you:stock=21 waste=1 tab=28 fnd=5 | opp:stock=22 waste=2 tab=25 fnd=0
[FOUND_RESOLVED] 2026-03-29T13:08:59.573Z matchId="EMN7M" cid=8h69bfhp2fx cardId=Y-14-♥️-1 f=1 owner=Y moveId=srv-8h69bfhp2fx-1774789739570-p5tybr
[BROADCAST] 2026-03-29T13:08:59.573Z room="EMN7M" kind=move total=2 open=2 targets=2 sampleCid=8h69bfhp2fx,oqki4tz6vq bytes=279
[SNAPSHOT_RESYNC_SENT] 2026-03-29T13:08:59.573Z matchId="EMN7M" reason=after_move
[STATUS] 2026-03-29T13:08:59.573Z — Clients=2, Rooms=1 [EMN7M:2]
```

---

## Interpretation der Logs

Der Server verarbeitet den legalen `toFound`-Move und zählt danach `waste=1`. Direkt im Anschluss wird ein `SNAPSHOT_RESYNC_SENT` ausgelöst. Trotzdem sehen die Clients danach unterschiedliche Waste-Zustände (`Kreuz 6` vs. `leer`).

Das spricht stark dafür, dass mindestens einer der folgenden Pfade defekt ist:
- clientseitige Snapshot-Anwendung
- Reject-Rollback nach illegalem Move
- Waste-Topcard / Waste-Index-Ableitung
- Zusammenspiel aus Reject → Folgezug → Broadcast → Snapshot
- lokale Pending-Move-/Optimistic-UI-State-Maschine

Da später zusätzlich Foundation-/Kartenzahlen nicht mehr stimmen, ist ein **tieferer State-Schaden** wahrscheinlich.

---

## Technische Hypothesen

### H1 — Reject-Rollback hinterlässt lokalen Schattenzustand
Ein illegaler Move wird serverseitig rejected, aber lokal nicht vollständig zurückgerollt. Der folgende legale Move arbeitet dann auf einem teilweise inkonsistenten Client-State.

### H2 — Snapshot ersetzt Derived Waste State nicht vollständig
Der Snapshot kommt an, aber die Darstellung oder Rekonstruktion des Waste-Top-Zustands wird lokal aus veralteten Feldern berechnet.

### H3 — Doppel-/Fehlanwendung eines Folge-Moves
Nach Reject + Folgezug wird der legale Move lokal und/oder aus Snapshot inkonsistent zusammengeführt. Dadurch passt die sichtbare Karte zunächst nicht mehr; später kippt dann auch die Zählung.

### H4 — Foundation-/Waste-Transfer beschädigt Count-Rekonstruktion
Die Karte wird aus dem Waste genommen, aber Count / pile reconstruction / foundation tally stimmt danach nicht mehr konsistent über beide Clients.

---

## Konkrete Dev-Fragen für die Analyse

1. Was passiert clientseitig exakt nach einem Reject eines illegalen Moves?
2. Wird der lokale Move-/Animation-/Pending-State vollständig zurückgesetzt?
3. Ersetzt ein `SNAPSHOT_RESYNC_SENT` den kompletten Waste/Foundation-State oder nur Teile?
4. Gibt es derived selectors / cached top-card rendering für Waste, die nicht invalidiert werden?
5. Kann ein `toFound` ohne `moveId` (`hasMoveId=false`) in diesem Ablauf relevant sein?
6. Wird Foundation-Count aus realen Karten oder aus inkonsistenten Summen/Derived-State berechnet?

---

## Auflösung / verifizierter Fixstand

Nach mehreren Analyse- und Patch-Runden zeigte sich als wirksamste Root Cause:

- **iOS-Client hat eigene lokale Moves optimistisch sofort angewendet**
- der Server hat diese Moves an den Sender zurückge-echoed
- der Sender hat den eigenen Move **nochmals inbound verarbeitet**
- dadurch kam es im Waste-Pfad zu **Double-Apply / Double-Remove**
- sichtbares Symptom: bei einer Ablage verschwand effektiv **eine Karte zu viel** aus dem Waste; daraus folgten Drift und spätere Count-/Missing-Card-Probleme

Zusätzliche Härtung erfolgte über:
- Unicode-/Suit-/CardId-Kanonisierung (`♣` vs `♣️` etc.)
- robustere Gleichheitsprüfung für Card IDs im iOS-Client und auf dem Server

### Wirksame Fixes
- **Server Branch `bugfix/A2-server-move-validation`**
  - `ac72721` — `A2: harden reject resync flow for stale optimistic clients`
  - `948fb7c` — `A2 canonicalize FE0F card ids on server`
- **iOS Branch `bugfix/A2-client-collision-hardening`**
  - `aae2c15` — `A2 normalize FE0F card ids in iOS client`
  - `fb07a95` — `Fix echoed iOS moves double-applying waste`

### Verifizierter Re-Test (grün)
Getestet auf zwei frisch kompilierten iPads mit neuem Server- und iOS-Build.

**Ergebnis:**
- kein Waste-Drift mehr zwischen iPad A und iPad B
- Illegal-Move → legaler Folgezug (`waste -> foundation`) bleibt stabil
- Waste-Count bleibt nach vollständigem Durchlauf plausibel und korrekt
- kein erneutes "eine Karte gelegt, aber zwei weg"-Symptom

Damit gilt dieser konkrete P0-Pfad aktuell als **funktional geschlossen**.

---

## Nächste Empfehlung

- Bugreport als **fixed / retested green** stehen lassen
- denselben Match **nicht** weiter für Grundlagenbefunde missbrauchen
- nun geordnet mit den nächsten A2-Goldpfaden weitertesten (insb. T4/T5/T6/T7)

---

## Minimaler Akzeptanztest für den Fix

Ein Fix gilt erst als glaubwürdig, wenn folgendes mehrfach stabil grün ist:

1. illegalen Move provozieren
2. Reject beobachten
3. direkt legalen Waste→Foundation-Move ausführen
4. beide Clients zeigen denselben Waste-Top-State
5. mehrere Folgezüge verändern Counts korrekt
6. Foundation- und Gesamtkartenzahl bleiben über beide Geräte konsistent
7. kein späteres „Karten fehlen“-Symptom

---

## Empfohlener Cluster-Name

**A2-C3 — Reject/Resync/Waste Drift mit echter State-Korruption**
