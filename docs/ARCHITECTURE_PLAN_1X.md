# Solitaire HighNoon – Architekturplan 1.x

Status: Draft / Proposed  
Datum: 2026-03-30  
Gültig ab: Post-A2 / Stable 1.0

---

## 1. Zweck

Dieses Dokument definiert den **offiziellen Architektur- und Umsetzungsplan nach Abschluss von A2**.

A2 wird als **stabiler Referenzpunkt** behandelt. Danach beginnt nicht mehr die Phase „A2 weiterflicken“, sondern eine neue, klar versionierte Produktlinie:

- **1.0.x = Stable Baseline (A2 eingefroren)**
- **1.1.x+ = kontrollierter Umbau zur echten server-authoritativen Architektur**

---

## 2. Executive Summary

### Entscheidung
1. Die aktuell validierte A2-Basis wird in beide `main`-Branches übernommen.
2. Dieser Stand wird als **Stable 1.0** markiert.
3. Ab dann startet eine neue Entwicklungsphase Richtung:
   - **Server = einzige authoritative Instanz**
   - **Clients = Display/Input-Schichten**
   - **Bot = auf gleichem authoritative Core**

### Warum diese Trennung wichtig ist
Ohne klaren Stable-Freeze bleiben A2-Fixes, Architekturumbau und Regressionen vermischt. Das führt zu:
- unklarem Referenzstand
- teuren Testzyklen
- schwieriger Ursachenanalyse
- dauerhaften Mischsystemen zwischen Client- und Server-Authority

Mit Stable 1.0 entsteht ein sauberer Referenzpunkt:
> „Das war der letzte bekannte stabile Multiplayer-Stand vor dem Architekturumbau.“ 

---

## 3. Aktueller Stand nach A2

### Inhaltlich validiert
A2 gilt für den aktuellen Scope als pragmatisch abgeschlossen:
- T1–T5: PASS
- T6: N/A (im aktuellen Scope nicht sinnvoll reproduzierbar)
- T7: PASS

### Technische Bedeutung
Die A2-Stabilisierung hat die kritischsten Übergangsfehler im hybriden System reduziert, insbesondere:
- serverseitige Move-Validation
- Reject/Resync-Härtung
- Foundation-Semantik über 8 globale Lanes
- Waste/Recycle-Stabilität
- Disconnect-Verhalten
- Kanonisierung von Suit-/CardId-Varianten
- Echo-/Double-Apply-Schutz im iOS-Client

### Wichtige Einordnung
A2 ist **nicht** die Zielarchitektur.
A2 ist der **stabilisierte Übergangsstand**, von dem aus kontrolliert weiterentwickelt wird.

---

## 4. Stable 1.0 Definition

## 4.1 Ziel von 1.0
Stable 1.0 ist der eingefrorene, dokumentierte und reproduzierbare Referenzstand nach A2.

## 4.2 Eigenschaften von 1.0
- spielbar im aktuell definierten Scope
- Goldpfade GP1–GP5 erfüllt
- GP7 mit definierter Disconnect-Semantik erfüllt
- keine bekannte kritische Kartenkorruption im validierten Testumfang
- geeignet als Baseline für Regressionen und spätere Umbauten

## 4.3 Nicht-Ziele von 1.0
1.0 bedeutet **nicht**:
- vollständige Server-Authority in jedem Detail
- vollständige Entfernung lokaler Client-Logik
- Resume/Rejoin-Recovery als ausgereiftes Feature
- perfektes Patch-/Delta-Protokoll
- finaler Architektur-Endzustand

---

## 5. Zielarchitektur ab 1.x

## 5.1 Server
Der Server wird schrittweise zur **einzigen gültigen Regel- und Zustandsinstanz**.

Der Server verantwortet:
- Move-Validierung
- State-Transitions
- Foundation-Lane-Auswahl
- Invariants / Card-Conservation / Uniqueness
- Reject/Resync-Entscheidungen
- Match-Lifecycle
- Snapshot-/Patch-Erzeugung
- Disconnect-/End-Semantik
- spätere Rejoin-/Resume-Logik

## 5.2 Clients (iOS / Web)
Clients werden schrittweise auf folgende Rollen reduziert:
- Rendering / Display
- Input-Erfassung
- Animation / UX
- Senden von Intents an den Server
- Anzeige des vom Server gelieferten Zustands

Clients sollen **keine eigene zweite Regelauslegung** mehr besitzen.

## 5.3 Bot
Der Bot soll mittelfristig denselben authoritative Regelkern nutzen wie Server und Clients.
Damit entfallen Sondersemantiken und divergierende Interpretation von Spielregeln.

---

## 6. Architekturprinzipien

### 6.1 Single Source of Truth
Es gibt genau eine authoritative Wahrheit pro Match: den Server-State.

### 6.2 Clients senden Intents, nicht Wahrheiten
Clients senden Nutzerabsichten wie:
- draw
- recycle
- move waste -> foundation
- move tableau -> tableau

Nicht jedoch eigenständig „fertige Wahrheit“, die der Server nur weiterreicht.

### 6.3 Determinism first
Gleicher Input + gleicher State = gleicher Output.
Dies gilt insbesondere für:
- Foundation-Auswahl
- Move-Apply
- Recovery-Pfade
- Debug/Replays
- Bot-Entscheidungen

### 6.4 Kleine, thematische Change-Blöcke
Jede Weiterentwicklung erfolgt in kleinen Clustern mit klarer Testmatrix.
Kein Vermischen von:
- Architekturänderung
- UI-Komfort
- Recovery-Experimenten
- Regeländerungen

### 6.5 Stable before clever
Bevor komplexe Features wie Resume/Rejoin gebaut werden, muss der authoritative Kern stabil und testbar sein.

---

## 7. Roadmap 1.x

## 7.1 Phase 1 — 1.0.x Stable Freeze
### Ziel
A2 nach `main` übernehmen und als Stable 1.0 markieren.

### Deliverables
- Merge A2-Server-Branch → `main`
- Merge A2-iOS-Branch → `main`
- Versionen auf Stable 1.0 anheben
- Tagging / Release-Dokumentation
- Freeze-Regeln für nachfolgende Änderungen festlegen

### Ergebnis
Ein eindeutig referenzierbarer stabiler Multiplayer-Stand.

---

## 7.2 Phase 2 — 1.1.x Authoritative GameCore
### Ziel
Regellogik im Server explizit als zentralen Core isolieren.

### Inhalt
- Move-Validation zentralisieren
- Apply-Logik zentralisieren
- Foundation-Resolution zentralisieren
- Invariant-Checks formal bündeln
- deterministische Kernlogik sauber kapseln

### Nutzen
- bessere Testbarkeit
- klarere Architekturgrenzen
- weniger implizite Regellogik in mehreren Schichten
- Basis für Bot / Replay / Recovery

---

## 7.3 Phase 3 — 1.2.x Protocol Cleanup
### Ziel
Das Protokoll an die Authorität des Servers anpassen.

### Inhalt
- move-intent statt state-behauptender Client-Events
- klare accepted/rejected/state-update Pfade
- Versionierung des Protokolls schärfen
- eventuelle Trennung von Snapshot vs. Patch-Events
- Zuständigkeiten der Nachrichtentypen vereinheitlichen

### Nutzen
- weniger Mischbetrieb
- weniger Drift-Risiko
- besseres Debugging

---

## 7.4 Phase 4 — 1.3.x Client Simplification
### Ziel
Client-Logik schrittweise entschlacken.

### Inhalt
- doppelte Regellogik abbauen
- lokale Apply-Pfade minimieren
- Optimistic Flows streng kontrollieren oder entfernen
- reine UI-Hilfslogik von Spielregeln trennen

### Nutzen
- weniger Ghost Bugs
- weniger Echo-/Collision-Probleme
- klarere Trennung zwischen Darstellung und Spiellogik

---

## 7.5 Phase 5 — 1.4.x Recovery / Resume Decision
### Ziel
Bewusst entscheiden, ob Disconnect simpel bleibt oder echtes Resume gebaut wird.

### Optionen
#### Option A – simple semantics
- Disconnect beendet Match
- keine Rejoin-/Resume-Logik
- robust, einfach, günstig

#### Option B – echtes Resume
- serverseitig gespeicherter Match-State
- Rejoin-Flow
- Snapshot-Wiederaufnahme
- idempotente Move-Behandlung

### Empfehlung
Nicht vorziehen. Erst nach stabilem authoritative Core.

---

## 7.6 Phase 6 — 1.5.x Bot & Extended Clients
### Ziel
Bot und weitere Clients auf denselben authority-basierten Kern setzen.

### Inhalt
- Bot gegen authoritative Core härten
- Replay-/Decision-Tests
- mögliche spätere Plattformen vorbereiten

---

## 8. Teststrategie nach 1.0

## 8.1 Prinzip
Gerätetests bleiben wichtig, aber nur als letzte Stufe.
Der Großteil der Validierung soll aus reproduzierbaren Testfällen kommen.

## 8.2 Testpyramide
### Stufe A – Core Tests
- definierte States
- definierte Inputs
- erwartete Server-Outputs
- Invariant-Checks

### Stufe B – Protocol / Integration Tests
- Client-Intent → Server-Antwort
- Reject / Accept / Snapshot / Patch
- Disconnect / Match-Ende

### Stufe C – Device / UX Tests
- iPad / Web reale User-Flows
- Goldpfade je betroffenem Cluster
- nur gezielt, nicht blind vollumfänglich

## 8.3 Bug Packs
Für schwere Bugs sollen reproduzierbare Artefakte entstehen:
- Snapshot/State
- Move-Sequenz
- erwartetes Verhalten
- beobachteter Fehler

Damit sinkt der manuelle Re-Test-Aufwand erheblich.

---

## 9. Change-Control-Regeln nach Stable 1.0

Nach dem Freeze gilt:
1. Jede Änderung muss einem klaren Cluster zugeordnet sein.
2. Jede Änderung dokumentiert:
   - was geändert wird
   - welches Risiko berührt wird
   - welche Goldpfade/Core-Tests nötig sind
3. Keine Vermischung von Architekturänderung und kosmetischem UI-Tuning im selben Patch-Block.
4. Jede Änderung braucht klaren Versionsschritt, Commit und Push.
5. Stable 1.0 bleibt als Referenz unangetastet nachvollziehbar.

---

## 10. Operative Empfehlung

### Sofort als Nächstes
1. A2 serverseitig nach `main` integrieren
2. A2 iOS-seitig nach `main` integrieren
3. Stable 1.0 markieren
4. Release-/Freeze-Notiz anlegen
5. ersten 1.1-Block definieren: **Authoritative GameCore**

### Nicht sofort tun
- kein übereilter Resume-/Reconnect-Vollausbau
- keine zusätzliche Feature-Expansion vor Architekturklärung
- kein Weiterflicken unter dem Label „A2“

---

## 11. Schlussformel

Stable 1.0 ist nicht das Ende der Architekturarbeit.
Stable 1.0 ist die notwendige Basis, damit die Architekturarbeit **kontrolliert, testbar und wirtschaftlich** wird.

Ab 1.1.x gilt daher:
> Server wird die Wahrheit. Clients werden exzellente Anzeige- und Eingabeschichten.
