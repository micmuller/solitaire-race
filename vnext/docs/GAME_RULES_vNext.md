# 🃏 Solitaire HighNoon – Game Rules (vNext)

Version: **vNext-1.0**  
Status: **Normative / Server-Authoritative**  
Scope: **Server Engine, Bot, Replay Harness, Clients (iOS/Web)**

---

## 0. Purpose & vNext Stance

Dieses Dokument ist das **normative Regelwerk** für *Solitaire HighNoon vNext*.

vNext bedeutet:
- **Server-authoritative** (Single Source of Truth)
- **Deterministisch** (Seed + Actions ⇒ identischer State)
- **Replay-verifizierbar**
- **Bot-first validiert**
- Clients senden ausschließlich **Action-Intents**, niemals Regeln

Dieses Dokument beschreibt **was gilt**, nicht **wie es technisch umgesetzt ist**  
(→ siehe `PROTOCOL.md`, `DETERMINISM.md`).

---

## 1. Core Concept

Solitaire HighNoon ist ein **kompetitives Klondike-Derivat** mit **zwei simultan spielenden Spielern**,  
bei dem **beide Spieler gleichzeitig auf gemeinsame Foundations spielen**.

Der Server ist **allein verantwortlich** für:
- Regelinterpretation
- Move-Validierung
- State-Transitions
- Deterministische Tie-Breaks
- Snapshots & Replays

Clients (iOS / Web / Bot):
- erzeugen nur **Action-Intents**
- wenden **ausschließlich serverseitige Ergebnisse** an

---

## 2. Decks & Cards

### 2.1 Decks
- Es existieren **immer genau 2 vollständige Standarddecks**
- Gesamtanzahl Karten: **104**
- Jede Karte besitzt eine **globale, eindeutige `cardId`**
- `cardId` ist **stabil** über:
  - Snapshots
  - Deltas
  - Replays

### 2.2 Card Properties (normativ)
- `suit`: ♣ ♦ ♥ ♠
- `rank`: A–K
- `faceDown`: true | false
- `cardId`: global eindeutig

---

## 3. Foundations (Global)

### 3.1 Struktur
- **8 Foundations**, global
- Pro Suit existieren **2 Foundations**
- Keine Besitzzuordnung (kein you/opp)

### 3.2 Platzierungsregeln
Eine Karte darf auf eine Foundation gelegt werden, wenn:
- Suit übereinstimmt **und**
- entweder:
  - Foundation leer **und** Karte ist ein Ass
  - oder `rank == topRank + 1`

### 3.3 Deterministische Auswahl (Pflicht)
Sind mehrere Foundations desselben Suits gültig, erfolgt die Auswahl **immer deterministisch**:

1. Foundation mit höherem `topRank`
2. Bei Gleichstand: niedrigster Foundation-Index

Diese Regel ist **bindend** für:
- Server
- Bot
- Replays

---

## 4. Game Modes (Initialverteilung)

### 4.1 Split Mode
- Jeder Spieler erhält **ein vollständiges Deck (52 Karten)**
- Karten werden **ausschließlich** in die eigenen Zonen verteilt:
  - `you.stock / waste / tableau`
  - `opp.stock / waste / tableau`
- Foundations bleiben **global**

### 4.2 Shared Mode
- Beide Decks (104 Karten) werden **zufällig über beide Spielerzonen verteilt**
- Jeder Spieler erhält einen zufälligen Anteil
- Foundations bleiben **global**

➡️ **Split vs Shared beeinflusst ausschließlich die Initialverteilung**  
➡️ Alle weiteren Regeln sind identisch

---

## 5. Zones & Ownership

### 5.1 Player-owned Zones
Jeder Spieler besitzt exklusiv:
- `stock`
- `waste`
- `tableau[7]`

Ein Spieler darf **nur Karten aus seinen eigenen Zonen** bewegen.

### 5.2 Global Zone
- `foundations[8]`
- Für beide Spieler jederzeit spielbar

---

## 6. Legal Actions (Server-seitig)

Alle Aktionen sind **atomar** und werden ausschließlich serverseitig validiert.

### 6.1 Draw
- `draw`: `stock → waste`
- Nur erlaubt, wenn `stock.length > 0`

### 6.2 Recycle
- `recycle`: `waste → stock`
- Nur erlaubt, wenn:
  - `stock.length == 0`
  - `waste.length > 0`

### 6.3 Flip
- `flip`: oberste Karte eines Tableau-Stacks wird aufgedeckt
- Nur erlaubt, wenn:
  - Karte ist **Top-Card**
  - `faceDown == true`

### 6.4 Tableau Move
- Bewegung einer oder mehrerer **Top-Cards**
- Regeln:
  - abwechselnde Farben
  - absteigende Ranks
- Quelle und Ziel müssen valide sein

### 6.5 Foundation Move
- Quelle: `waste` oder `tableau`
- Nur **Top-Card**
- Siehe Foundation-Regeln (Kapitel 3)

---

## 7. Invariants (Hard Rules)

Nach **jedem** `applyAction` muss gelten:

1. **Card Conservation**
   - Summe aller Karten über alle Zonen + Foundations = **104**
2. **Uniqueness**
   - Jede `cardId` existiert **genau einmal**
3. **Top-Card Rule**
   - Keine Aktion bewegt Karten aus der Mitte eines Stacks
4. **Ownership**
   - Kein Spieler manipuliert fremde Player-Zonen
5. **Determinism**
   - Gleicher State + gleiche Action ⇒ gleicher Next-State

Verletzungen führen zu:
- **Reject** oder
- **AIRBAG Snapshot-Convergence**

---

## 8. Determinism & Replay (Pflicht)

- RNG ist **seed-basiert**
- Initialverteilung + Tie-Breaks sind deterministisch
- Ein Replay (Seed + Action-Log) muss:
  - exakt denselben Final-State erzeugen
  - denselben State-Hash liefern

Ohne erfüllte Replay-Gleichheit gilt eine Implementierung als **inkorrekt**.

---

## 9. Client Constraints (normativ)

Clients dürfen **nicht**:
- lokale Regeln anwenden
- Moves lokal validieren (außer UI-Hints)
- State eigenständig mutieren

Clients dürfen:
- Actions vorschlagen
- Server-Rejects anzeigen
- Server-Snapshots jederzeit neu anwenden

---

## 10. Change Policy

- Änderungen an diesem Dokument:
  - erfordern eine neue Version
  - müssen explizit beschlossen werden (ADR)
- Stille Regeländerungen sind **nicht erlaubt**

---

**End of Game Rules – vNext**
