# Changelog

## 2.1.0 – Anpassungen nach Team-Review

- **Startseite:** minimalistisch wie in v1, ohne Max-Story. Slogan „Never Miss a Run.“, Botschaft „Schuhe, die drücken, sind Vergangenheit.“, 3 Nutzenpunkte, die 6 Schritte als kompakte Übersicht.
- **Profil:** Frage zur Fußbreite entfernt (Standard „Normal“, der Scan bestimmt sie). Ziel, Dämpfungsgefühl und Sprengung als Fragen entfernt.
- **Laufdaten:** Strava / Apple Health / GPX direkt nach Gewicht, Größe, Alter und Schuhgröße. Mit Verbindung: Übersicht „Deine Laufdaten“ (Läufe pro Woche, km, längster Lauf, Tempo, Untergrund), jeder Wert per „Ändern“ aufklappbar. Ohne Konto: „Kein Konto: selbst eingeben“ führt zu den manuellen Fragen.
- **Scan-Ergebnis:** gerenderte Fußansichten (3D, oben, Seite, Ferse) als Wisch-Galerie mit Maßen im Bild, dazu das Druckbild. Das Bild steht auch im Scan-Bericht und auf der Zwischenfolie.
- **Feedback:** optional, mit „Feedback überspringen“ auf der Produktionsseite und in der Umfrage. Überspringen führt trotzdem zur Aufklärung.

## 2.0.0 – Überarbeitung nach Feedback (Prof. Granig)

| Feedback | Umsetzung |
|---|---|
| Landing page, Storytelling, „why you need this shoe“ | Neue Startseite: Hero, Geschichte von „Max“ in 3 Karten, 3 Nutzenversprechen, Ablauf in 6 Schritten, „Was du brauchst“ |
| Einfacher bedienbar, Schritte einfacher | Profil in 9 kurze Fragen aufgeteilt, eine Frage pro Screen, Auswahlkarten statt Zahlenfelder (Größenraster, Tempo-Stufen, Kilometer-Bänder, Untergrund-Kacheln) |
| Bessere Führung / Messaging | Jeder Screen: Titel als Frage, grüne „Warum wir fragen“-Zeile, ein klarer Weiter-Button unten, Details eingeklappt |
| Nutzen zeigen | Ring „Fit accuracy“ wächst mit jedem Schritt (Erklärung per Tipp), Zwischenslide nach jedem Schritt mit persönlichem Ergebnis und Nutzen |
| Schrittprozess zeigen | Beschriftete Schrittleiste (6 Icons) im Kopf, „Schritt X von 6 · ca. Y Min. übrig“, Unterschritt-Punkte |

Weitere Änderungen:
- Video: eigener Anleitungsscreen mit 3 Bildern, Ergebnis zuerst als Kurzfazit.
- Scan: Vorbereitungs-Checkliste, Gerätecheck läuft unsichtbar, Ergebnis zuerst als 3 Kennzahlen, alle Maße eingeklappt.
- Analyse: „Kurz gesagt“ in 3 Sätzen + Härtezonen, Begründungen und Druckvergleich eingeklappt.
- Design: Einsatz → Empfehlung übernehmen oder selbst anpassen → Farbe & Details. AR bleibt optional.
- Letzter Check: 3 statt 5 Slides.
- Umfrage: 2 neue Fragen zur Orientierung („clarity“) und zum Nutzen („benefit_clear“), Feld `app_version` = v2, um v1 und v2 in Netlify Forms zu vergleichen.
- Eigener Speicher-Schlüssel (`nsf_state_v2`), damit sich v1 und v2 im selben Browser nicht stören.

## 1.0.0 – Test-Prototyp

### Was echt ist
- **Eingaben:** Profil, Komfortkarte, Einsatzzweck, Design, Versanddaten und Umfrage werden wirklich erfasst und gespeichert (nur im Browser).
- **Kamera:** Videoaufnahme (MediaRecorder), Live-Kamerabild im Scan und in der AR-Anprobe.
- **Laufanalyse (wenn verfügbar):** Pose-Erkennung mit MediaPipe auf dem Gerät. Schrittfrequenz, Aufsatz, Kniewinkel, Rumpfneigung und vertikale Bewegung werden aus den erkannten Körperpunkten berechnet.
- **GPX/TCX-Import:** Distanz, Tempo und Höhenmeter werden aus der Datei berechnet.
- **Bewegungssensoren:** Der Scan-Fortschritt reagiert auf die Bewegung des Handys, sofern Sensoren verfügbar sind.
- **Umfrage:** wird an Netlify Forms gesendet (SUS-Wert wird berechnet).

### Was simuliert ist
- **Strava/Apple Health:** keine echte Verbindung. Die Aktivitäten werden aus dem Profil erzeugt und mit „Demo-Daten“ gekennzeichnet.
- **Fußscan:** Es wird nichts gemessen. Punktwolke, Netz, 3D-Modell und Maße werden aus dem Profil (Größe, Schuhgröße, Fußbreite) erzeugt, mit dem Spitznamen als Seed.
- **Laufanalyse (Fallback):** Wenn MediaPipe nicht lädt oder niemand erkannt wird, werden die Werte aus dem Profil geschätzt.
- **KI-Analyse:** regelbasierte Logik (`js/data.js`), kein trainiertes Modell. Die Ladeanimation ist inszeniert.
- **Experten-Prüfung, Chat, Produktions-Tracker, E-Mail:** inszeniert. Keine echte Person, kein Versand.
- **Zahlung und Bestellung:** Demo. Es werden keine Zahlungsdaten abgefragt.

Am Ende der App klärt ein Debriefing-Screen die Testpersonen darüber auf.
