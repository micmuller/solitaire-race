---
# STATE_SNAPSHOT – Normatives State-Schema

## Zweck & Geltungsbereich
Dieses Dokument definiert das **normative State-Schema** für `STATE_SNAPSHOT` im Projekt *Solitaire HighNoon*.  
Es ist die **Single Source of Truth** für Server, iOS-Client, Web/PWA und Bot.

Ziele:
- Vermeidung von Client/Server-Drift
- Sicherstellung von Determinismus (Seed + Shuffle)
- Klare Grundlage für server-authoritativen Initial State
- Explizite Dokumentation statt impliziter Logik in Clients

---

## Versionierung & Kompatibilität
- Aktuelle Version: **STATE_SNAPSHOT v1**
- Additive Erweiterungen sind erlaubt (neue optionale Felder).
- Entfernen oder Umbenennen bestehender Felder ist **nicht erlaubt** ohne Protocol-Version-Bump.
- Clients müssen unbekannte Felder ignorieren.

---

## Begriffe & Typen

### Owner
Kennzeichnet die lokale Perspektive im Snapshot.

```text
Owner := "Y" | "O"
```

- `"Y"` = lokaler Spieler (you)
- `"O"` = Gegner (opp)

---

### Suit
```text
Suit := "♠" | "♥" | "♦" | "♣"
```

---

### Rank
```text
Rank := 0..12   // 0 = Ace, 12 = King
```

---

### CardLite
Minimale Kartenrepräsentation im Protokoll.

```json
{
  "id": "string",
  "suit": "♠|♥|♦|♣",
  "rank": 0,
  "up": true
}
```

#### Invarianten
- `id` muss **global eindeutig** sein (matchweit).
- Gleiche `id` darf niemals in zwei Zonen gleichzeitig existieren.
- `up = false` bedeutet verdeckte Karte.

---

## Top-Level STATE_SNAPSHOT

```json
{
  "version": 1,
  "at": 1700000000000,
  "room": "ABCD",
  "seed": "jzrmdxvh",
  "owner": "Y",
  "shuffleMode": "shared",
  "foundations": [ FoundationState x8 ],
  "you": SideState,
  "opp": SideState,
  "moves": 0,
  "over": false
}
```

### Pflichtfelder
| Feld | Beschreibung |
|-----|--------------|
| version | Schema-Version (aktuell 1) |
| room | Match-ID |
| seed | Shuffle/Deal-Seed |
| owner | Perspektive dieses Snapshots |
| foundations | Foundations beider Spieler (immer 8) |
| you | Eigener Spielzustand |
| opp | Gegner-Spielzustand |
| moves | Anzahl ausgeführter Züge |
| over | Match beendet |

### Optionale Felder
| Feld | Beschreibung |
|-----|--------------|
| at | Timestamp der Snapshot-Erstellung |
| shuffleMode | `"shared"` oder `"split"` (Default: `"shared"`) |

---

## FoundationState

```json
{
  "suit": "♠",
  "cards": [ CardLite ]
}
```

### Invarianten
- `foundations.length === 8`
- Jede Foundation ist fest an **genau eine Suit** gebunden.
- Reihenfolge der Karten ist aufsteigend nach Rank.

---

## SideState (you / opp)

```json
{
  "stock": [ CardLite ],
  "waste": [ CardLite ],
  "tableau": [
    [ CardLite ],
    [ CardLite ],
    [ CardLite ],
    [ CardLite ],
    [ CardLite ],
    [ CardLite ],
    [ CardLite ]
  ]
}
```

### Invarianten
- `tableau.length === 7`
- Jede Tableau-Spalte ist ein Stapel (bottom → top)
- Letzte Karte einer Spalte darf `up=true` sein, alle davor typischerweise `up=false`

---

## Card-ID-Regeln (kritisch)

Card IDs sind **determinismus-kritisch** und eine Hauptursache für Drift/Corruption.

### Pflicht (v1 – aktuell in iOS/PWA)
- Jede Karte besitzt eine **matchweit eindeutige** `id`.
- Die `id` muss **Suit** und **Rank** so enthalten, dass Clients sie ohne zusätzliche Lookup-Tabellen ableiten können.
- Gleiche `id` darf niemals in zwei Zonen gleichzeitig existieren.
- Server und Clients müssen **dieselbe ID-Konvention** verwenden.

#### Normatives Format (v1)
```text
<Owner>-<Index>-<Suit>-<Rank>
```

- `Owner`: `"Y"` oder `"O"` (Seite/Perspektive)
- `Index`: fortlaufende Nummer (string/int), nur zur Eindeutigkeit
- `Suit`: `"♠"|"♥"|"♦"|"♣"`
- `Rank`: `0..12` (0=Ace, 12=King)

Beispiele:
```text
Y-28-♠-4
O-57-♦-12
```

> Hinweis: iOS extrahiert `suit` und `rank` derzeit aus der `id` via `split("-")`.  
> Daher ist dieses Format für v1 **bindend**, bis ein koordinierter v2-Wechsel erfolgt.

### Ausblick (v2 – nur mit Protocol-Version-Bump)
Für v2 kann eine seed-zentrierte ID sinnvoll sein (bessere Stabilität/Portabilität), **aber nur** wenn alle Clients gleichzeitig angepasst werden.

Mögliche v2-Strategie:
```text
<seed>::<suit>::<rank>::<serial>
```

Beispiel:
```text
jzrmdxvh::♠::12::01
```

---

## Determinismus & Shuffle

### Shared Shuffle
- Ein gemeinsames Deck
- Gleicher Seed → identische Kartenreihenfolge
- Snapshot enthält vollständigen State beider Spieler

### Split Shuffle
- Zwei getrennte Decks
- Gleicher Seed, aber getrennte Ableitung pro Side
- State-Leak zwischen `you` und `opp` ist verboten

Der verwendete Modus muss:
- im Match-Handshake
- **und** im Snapshot (`shuffleMode`)
konsistent sein.

---

## Server-Authoritative Regeln (ab P1.3)
- Der Server ist **alleiniger Autor** für:
  - Initial Deal
  - STATE_SNAPSHOT
- Client-supplied Snapshots dürfen:
  - nicht gecached
  - nicht via AIRBAG verteilt
  - nicht als Autorität verwendet werden

---

## Beispiel (gekürzt)

```json
{
  "version": 1,
  "room": "45P7B",
  "seed": "jzrmdxvh",
  "owner": "Y",
  "shuffleMode": "shared",
  "foundations": [ ...8 items... ],
  "you": { "stock": [], "waste": [], "tableau": [ ...7 piles... ] },
  "opp": { "stock": [], "waste": [], "tableau": [ ...7 piles... ] },
  "moves": 0,
  "over": false
}
```

---

## Referenzen
- `game.js` (PWA Referenzimplementierung)
- `matches.js` (Server Authoritative State)
- `WebSocketManager.swift` (iOS Client Reducer)
- `protocol_notes.md`

---

**Dieses Dokument ist normativ.**  
Abweichungen in Implementierungen gelten als Bug.