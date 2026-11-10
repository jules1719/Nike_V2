# Nike Shoe Fit v2 – Test-Prototyp (MCI Design Sprint)

Version 2 nach dem Feedback von Prof. Granig (Details in `CHANGELOG.md`). Version 1 bleibt unverändert im bisherigen Ordner bzw. Repo.

Interaktiver Web-App-Prototyp für den Design Sprint in *Product & Innovation Management* (MCI Innsbruck).
Sprint-Frage: *How can we use AI and additive manufacturing to find the perfect running shoe for your feet?*

Studentischer Prototyp. Keine Verbindung zu Nike oder Strava. Es wird nichts bestellt, bezahlt oder produziert.

## Inhalt

Alle Dateien liegen in **einem** Ordner (keine Unterordner), damit der Upload über die GitHub-Weboberfläche funktioniert.

```
index.html, app.css, manifest.webmanifest, sw.js, netlify.toml
app.js (Ablauf, Screens, Testleiter-Modus) · data.js ("KI"-Logik) · scan.js (simulierter Scan)
foot3d.js (3D-Fuß) · video.js (Video + Pose) · ui.js (Grafiken) · util.js (Zustand, Sprache)
three.module.min.js (three.js r160) · shoe.jpg · shoe-ar.png · icon-180/192/512.png
foot-iso/top/side/rear.jpg (Fußansichten im Scan-Ergebnis, vom Team erstellt)
```

Kein Build nötig: Es ist eine statische Seite mit nativen ES-Modulen.

## Lokal starten

Die Kamera funktioniert nur über `https://` oder `http://localhost`.

```bash
python3 -m http.server 8080
# Browser: http://localhost:8080
```

Zum Testen am Handy im gleichen WLAN braucht ihr HTTPS, also am einfachsten direkt auf Netlify.

## Auf Netlify veröffentlichen

**Variante A, ohne Git (2 Minuten):**
1. https://app.netlify.com/drop öffnen und einloggen.
2. Den ganzen Ordner (nicht die ZIP-Datei) ins Browserfenster ziehen.
3. Netlify zeigt die URL, z. B. `https://xyz.netlify.app`. Unter *Site configuration → Change site name* einen besseren Namen wählen.

**Variante B, mit GitHub:** Ordner als Repository hochladen, in Netlify *Add new site → Import an existing project*,
Build command leer lassen, Publish directory `.`.

**Formulare aktivieren (für die Umfrage):**
1. In Netlify unter *Forms* die Formularerkennung aktivieren (*Enable form detection*).
2. Danach die Seite **einmal neu deployen** (Ordner nochmals per Drop hochladen bzw. *Trigger deploy*).
3. Antworten erscheinen unter *Forms → survey*. Export als CSV über *Download as CSV*.

Ohne Netlify (lokal) wird die Umfrage nur im Browser gespeichert. Die App zeigt das am Ende an.

## Testleiter-Modus (Wizard of Oz)

Dreimal schnell auf das **NS-Logo** oben links tippen. Dort könnt ihr:
- Gewölbe, Pronation, Aufsatz, Schrittfrequenz und Fußlängen überschreiben,
- für den Scan zwischen Kamera und generiertem Hintergrund wechseln,
- den Lite-Modus für schwache Handys erzwingen,
- einen Schritt-Timer einblenden,
- ein Demo-Profil ausfüllen, zu jedem Screen springen, die Sitzung als JSON exportieren oder zurücksetzen.

## Ablauf für eure Testpersonen

Startseite → Einwilligung → **1 Profil** (Gewicht/Größe/Alter, Schuhgröße, Laufdaten verbinden: Strava- oder Apple-Health-Demo oder GPX/TCX; ohne Konto manuelle Fragen; Komfortkarte) →
**2 Laufen** (Anleitung, Video, Kurzfazit) → **3 Scan** (Checkliste, rechts, links, optional Einlage, 3D-Ansichten) →
**4 Analyse** → **5 Design** (Einsatz, Empfehlung oder Feintuning, Farbe/Details, optional AR) →
**6 Bestellen** (Übersicht, Demo-Bestellung, letzter Check) → Produktions-Tracker → Umfrage (optional) → Aufklärung (Debriefing).
Nach jedem der 6 Schritte kommt eine kurze Zwischenfolie, die nach ca. 5 Sekunden automatisch weitergeht.

Für den Test braucht jede Person: ein Blatt A4-Papier, barfuß, gutes Licht, etwa 15 Minuten.

## Testcheckliste

| Gerät / Fall | Erwartung |
|---|---|
| iPhone, Safari | Kamera fragt vor Video und Scan; Bewegungssensoren über „Prüfung starten“ |
| Android, Chrome | wie oben; Vibration bei Scan-Schritten |
| Desktop, Chrome | läuft; Scan mit Webcam oder generiertem Hintergrund |
| Kamera verweigert | Video: Galerie-Upload oder überspringen; Scan: generierter Hintergrund; AR: Beispielbild oder Foto |
| Kein WebGL / schwaches Handy | Lite-Modus, Maßzeichnung statt 3D |
| Offline (nach erstem Besuch) | App startet aus dem Cache; Pose-Analyse fällt auf Schätzung zurück |
| Seite neu geladen | Fortschritt bleibt erhalten (Video wird aus Datenschutzgründen nicht gespeichert) |
| Menü (⋯) → Meine Daten löschen | alles aus dem Browser entfernt |

## Datenschutz

- Fotos und Videos verlassen das Gerät nie. Profil und Ergebnisse liegen nur im `localStorage` des Browsers.
- An Netlify geht nur die anonyme Umfrage samt anonymem Ereignisprotokoll (Zeit pro Schritt, Wiederholungen, Überspringen).
- Die Pose-Analyse lädt das MediaPipe-Modell von `cdn.jsdelivr.net` und `storage.googleapis.com`. Das Video selbst wird nicht hochgeladen.

## Quellen und Hinweise

- 3D: three.js r160 (MIT-Lizenz).
- Pose-Erkennung: MediaPipe Pose Landmarker (Apache-2.0), zur Laufzeit geladen.
- Umfrage: 10 Aussagen in Anlehnung an die System Usability Scale (Brooke), eigene Formulierung, Auswertung nach SUS-Schema.
- Schuhfoto: aus eurer Figma-Datei übernommen. Nur für den nicht-öffentlichen Uni-Test verwenden.
