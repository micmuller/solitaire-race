# Pixi-Webclient 0.1.46 – UAT-Kandidat

Der lokale, noch nicht gepushte 0.1.46-Kandidat umfasst die Dashboard-Tasks
#251 bis #254 in vier getrennten Commits. Die automatisierten Gates müssen vor
dem Feldtest vollständig grün sein; ein Push erfolgt erst nach bestätigtem UAT.

## Einzelabnahmen

- #251: Canvas + Niedrig zeigt `FPS-Limit 30`; Drag, Tap, Doppeltipp,
  State-Updates und Diagnose bleiben korrekt. Andere Profile zeigen kein Limit.
- #252: Canvas/Niedrig zeigt den leichten Goldabschluss, OS-Reduced-Motion den
  statischen Abschluss und WebGL weiterhin das volle Finale.
- #253: Nach Aufgabe entscheidet P1. Ja startet dasselbe Match mit neuem Seed;
  Nein bringt beide Clients serverautoritativ in die Lobby. Reconnect prüfen.
- #254: Zwei normale Hoststarts liefern verschiedene Seeds; nur der technische
  Start übernimmt einen expliziten Test-Seed.

## Gemeinsamer Abschlusslauf

1. Ein vollständiges Shared Human-vs-Human-Spiel auf altem iPad Pro und zweitem
   Gerät spielen, inklusive Drag, Tap, Doppeltipp und Finale.
2. Nach Aufgabe einmal Ja und im Folgematch einmal Nein wählen.
3. Einen kurzen WLAN-Unterbruch oder manuellen Reconnect während des
   Finished-Dialogs durchführen.
4. Fehlerbericht beider Geräte sichern: Client 0.1.46, korrekte Rollen,
   Revision/Hash, Canvas-Profil und FPS-Limit prüfen.
5. Split Human-vs-Bot kurz gegenprüfen und auf Desktop/WebGL die volle
   Finalanimation ansehen.

Nach erfolgreichem Feldtest werden Dashboard-Tasks #251–254 auf `done` gesetzt
und die vier lokalen Commits gemeinsam gepusht.
