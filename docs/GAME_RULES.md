# 🃏 Solitaire HighNoon – Game Rules (Authoritative)

Version: v1.0  
Status: **Frozen (Normative)**  
Scope: Server, Bot, iOS, Web Clients

---

## 1. Core Concept

Solitaire HighNoon ist ein **kompetitives Klondike-Derivat** mit **zwei Spielern**,  
bei dem **beide Spieler gleichzeitig auf gemeinsame Foundations spielen**.

Der Server ist **authoritative** für:
- Spielregeln
- Move-Validierung
- State-Transitions
- Snapshots

Clients (iOS/Web/Bot) sind **state-driven** und dürfen keine eigenen Regeln anwenden.

---

## 2. Decks & Foundations

### 2.1 Decks
- Es sind **immer genau 2 vollständige Kartensätze** im Spiel  
  → **104 Karten total**
- Jede Karte hat eine **globale, eindeutige `cardId`**

### 2.2 Foundations
- Es existieren **8 Foundations**
- Pro Suit gibt es **2 Foundations**:
  - ♣ Clubs (2)
  - ♦ Diamonds (2)
  - ♥ Hearts (2)
  - ♠ Spades (2)
- Foundations sind **global**
  - **Beide Spieler dürfen jederzeit auf alle 8 Foundations legen**
  - Es gibt **keine Besitzzuordnung** (`you` / `opp`) für Foundations

### 2.3 Foundation-Regeln
Eine Karte darf auf eine Foundation gelegt werden, wenn:
- Suit zur Foundation passt **und**
- entweder:
  - Foundation leer **und** Karte ist ein Ass
  - oder `rank == topRank + 1`

Wenn **mehrere Foundations desselben Suits** gültig sind:
- Die Auswahl erfolgt **deterministisch**
- Empfohlene Tie-Break-Regel:
  1. Foundation mit höherem `topRank`
  2. bei Gleichstand: niedrigster Foundation-Index

---

## 3. Game Modes

### 3.1 Split Mode
- Jeder Spieler erhält **ein vollständiges Deck (52 Karten)**
- Die Karten werden **nur in die eigenen Zonen** verteilt:
  - `you.stock / waste / tableau`
  - `opp.stock / waste / tableau`
- Foundations sind **gemeinsam** (global)

### 3.2 Shared Mode
- Beide Decks (104 Karten) werden **über beide Spielerzonen verteilt**
- Jeder Spieler erhält einen **zufälligen Anteil**
- Foundations sind **gemeinsam** (global)

➡️ **Unterschied Split vs Shared betrifft ausschließlich die Startverteilung**  
➡️ Die Spielregeln danach sind identisch

---

## 4. Zones & Ownership

### 4.1 Player-Zones
Jeder Spieler besitzt exklusiv:
- `stock`
- `waste`
- `tableau[7]`

Ein Spieler darf **nur aus seinen eigenen Zonen** Karten bewegen.

### 4.2 Foundations
- Sind **keinem Spieler zugeordnet**
- Jeder Spieler darf jederzeit auf jede Foundation spielen

---

## 5. Legal Moves (Overview)

### 5.1 Draw
- `draw`: `stock → waste`
- Nur möglich, wenn `stock.length > 0`

### 5.2 Recycle
- `recycle`: `waste → stock`
- Nur möglich, wenn `stock.length == 0 && waste.length > 0`

### 5.3 Flip
- `flip`: oberste Karte eines Tableau-Stacks wird aufgedeckt
- Nur erlaubt, wenn:
  - Karte **top of stack** ist
  - und `faceDown == true`

### 5.4 Tableau Moves
- Nur **Top-Cards** dürfen bewegt werden
- Regeln:
  - abwechselnde Farben
  - absteigende Ranks

### 5.5 Foundation Moves
- Von `waste` oder `tableau`
- Nur **Top-Card**
- Siehe Foundation-Regeln (2.3)

---

## 6. Invariants (Server-Enforced)

Nach **jedem Apply** muss gelten:

1. **Card Conservation**
   - Summe aller Karten über alle Zonen + Foundations = **104**
2. **Uniqueness**
   - Jede `cardId` existiert **genau einmal**
3. **Top-Card Rule**
   - Kein Move darf Karten aus der Mitte eines Stacks bewegen
4. **Server Authority**
   - Nur serverseitige Apply-Logik ist gültig

Bei Verletzung:
- `[AIRBAG] card_conservation_failed`
- sofortige Snapshot-Convergence

---

## 7. Determinism

- Bei mehreren legalen Optionen (z. B. Foundations):
  - Auswahl muss **deterministisch** erfolgen
- Gleicher State + gleiche Inputs ⇒ gleicher nächster State

Dies ist **Pflicht** für:
- Bot
- Replays
- Debugging
- iOS ↔ Web Konsistenz

---

## 8. Compatibility Note

Dieses Regelwerk:
- bricht **kein bestehendes Protokoll**
- definiert **Interpretation & Semantik**
- ist **bindend** für:
  - Server
  - Bot
  - iOS Client
  - Web Client

Änderungen erfordern:
- neue Version dieses Dokuments
- explizite Entscheidung