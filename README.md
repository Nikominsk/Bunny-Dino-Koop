# Plüschfreunde

Süßes 2D-Koop-Puzzlespiel im Browser: Hase und Dino müssen gemeinsam durchs Kinderzimmer. Online auf zwei Computern oder zu zweit an einer Tastatur. Tutorial und vier Level, alle Sterne sind Pflicht, kein Game-over.

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Gesamtes Frontend. Der Block `<script id="shared">` enthält Leveldaten und Simulation |
| `server.js` | Node-Server: liefert die Seite aus, hostet Räume, rechnet den verbindlichen Spielzustand |
| `vercel.json`, `scripts/vercel-build.js`, `.vercelignore` | Statisches Frontend auf Vercel |
| `render.yaml`, `Dockerfile` | Spielserver bei einem Node-Host |
| `tests/` | Bots, Regeltests, Browsertests, Deployment-Nachbau |

`server.js` liest die Simulation direkt aus der `index.html`. Es gibt also keine zweite Kopie der Spielregeln.

## Installation und lokaler Start

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install --omit=dev
npm start
```

Dann http://localhost:3000 öffnen. Der Port lässt sich mit `PORT` ändern.

Nur lokaler Koop: `index.html` per Doppelklick öffnen. Dafür braucht es keinen Server.

## Gemeinsam spielen

1. Eine Person klickt **Raum erstellen** und schickt den vierstelligen Code.
2. Die andere Person gibt den Code ein und klickt **Raum beitreten**.
3. Beide wählen verschiedene Figuren und klicken **Bereit**. Unter „Start bei“ lässt sich ein späteres Level wählen, weil der Fortschritt nicht gespeichert wird.

| | Online | Lokal: Hase | Lokal: Dino |
| --- | --- | --- | --- |
| Laufen | `A`/`D` oder `←`/`→` | `A`/`D` | `←`/`→` |
| Springen | `Leertaste` | `W` | `↑` |
| Hebel | `E` | `E` | `Enter` |

`Esc` öffnet das Menü mit Steuerung. `R` eine Sekunde halten oder der Menüpunkt setzt den aktuellen Abschnitt zurück. Sterne und fertige Abschnitte bleiben dabei erhalten. Boxen schiebt ihr durch Dagegenlaufen, auf eine Box steigt ihr per Sprung.

**Räuberleiter:** Stellt euch übereinander und springt gerade hoch, dann landet ihr auf dem Kopf des Partners. Die untere Figur kann dann laufen, aber nicht springen.

**Verpasste Sterne:** Wird ein Checkpoint aktiviert, hüpfen verpasste Sterne der fertigen Abschnitte zur Flagge. So bleibt kein Pflichtstern unerreichbar.

## Für zwei Geräte erreichbar machen

**Im selben WLAN:** `npm start` auf einem Rechner, dann auf beiden `http://<IP-des-Rechners>:3000` öffnen. Die IP zeigt `ipconfig`. Die Windows-Firewall muss Node eingehend erlauben.

**Über das Internet ohne Hosting:** Portfreigabe im Router oder ein Tunnel, der WebSockets kann, auf Port 3000. Die Spielseite kommt dann gleich vom selben Rechner.

**Dauerhaft:** siehe nächster Abschnitt.

## Öffentliches Hosting mit Vercel

### Warum die HTML-Datei auf Vercel nicht reicht

Geprüft in der Vercel-Doku am 31.10.2026 ([WebSocket-Guide](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections), [Function-Limits](https://vercel.com/docs/functions/limitations)):

- Vercel Functions können seit Juni 2026 WebSockets annehmen, aber als öffentliche Beta.
- Eine Verbindung endet, wenn die Funktion ihre Maximaldauer erreicht: Hobby 5 Minuten, Pro 800 Sekunden, als Beta bis 30 Minuten.
- Speicher gilt pro Instanz, und eine Verbindung bleibt an ihrer Instanz. Zwei Spieler könnten auf verschiedenen Instanzen landen.

Dieses Spiel braucht einen durchgehend laufenden 60-Hz-Prozess, der beide Spieler im selben Speicher führt. Das passt nicht zu Functions. Darum läuft das **Frontend auf Vercel** und der **Spielserver bei einem Node-Host**. Der Browser verbindet sich direkt mit `wss://…`, ohne Umweg über Vercel-Rewrites.

```
Browser ── https ──> Vercel (statische index.html)
Browser ── wss ────> Node-Host (server.js, Räume im Arbeitsspeicher)
```

### Hosts für den Spielserver

Stand 31.10.2026 laut Doku der Anbieter. Preise können sich ändern.

| Host | WebSockets laut Doku | Kosten | Hinweis |
| --- | --- | --- | --- |
| **Render** (empfohlen, `render.yaml` liegt bei) | Ja, ohne Maximaldauer ([Doku](https://render.com/docs/websocket)) | Free: 0 €. Bezahlter Tarif 0,5 CPU/512 MB: Preis konnte ich nicht auslesen, siehe [Preisseite](https://render.com/pricing) | Free schläft nach [15 Minuten ohne Verkehr](https://render.com/docs/free), Aufwachen dauert etwa 1 Minute |
| Railway | Ja, ohne Dauerlimit ([Doku](https://docs.railway.com/networking/public-networking/specs-and-limits)) | [Hobby 5 $/Monat](https://docs.railway.com/reference/pricing/plans) inklusive 5 $ Nutzung | Start über `npm start` oder `Dockerfile` |
| Fly.io | Auf den gelesenen Seiten nicht ausdrücklich bestätigt | [ab 2,19 $ pro 30 Tage](https://docs.fly.io/about/pricing) | Kein Free-Tarif. Mit dem `Dockerfile` startbar, ungetestet |

Vercel selbst: statisches Hosting reicht, der Hobby-Tarif genügt für ein privates Projekt.

Auf Render Free gilt: Solange ihr spielt, fließt Verkehr. Wenn der Server schläft oder neu startet, sind Räume weg, weil sie nur im Arbeitsspeicher liegen. Dann einfach einen neuen Raum erstellen und unter „Start bei“ das Level wählen.

### Schritt für Schritt

Das Projekt liegt aktuell in einem Ordner innerhalb eines Git-Repos deines Benutzerordners. Lege deshalb vorher ein eigenes Repo an: `git init` im Projektordner, committen, zu GitHub pushen.

**1. Spielserver bei Render**

1. Render → *New* → *Blueprint* → Repo wählen. `render.yaml` wird erkannt.
2. Bei der Abfrage `ALLOWED_ORIGINS` eintragen, z. B. `https://dein-projekt.vercel.app`. Mehrere Adressen trennst du per Komma.
3. Nach dem Deploy `https://<dienst>.onrender.com/health` öffnen. Erwartet wird `{"ok":true,...}`.

**2. Frontend bei Vercel**

1. Repo in Vercel importieren. `vercel.json` setzt alles: kein Framework, Build `node scripts/vercel-build.js`, Ausgabe `public`.
2. Unter *Settings → Environment Variables* setzen: `PLUESCH_WS_URL=wss://<dienst>.onrender.com`.
3. Deployen. Änderungen an der Variable wirken erst beim nächsten Deploy, weil sie beim Build in die Seite geschrieben wird.

**3. Abgleich**

Die Vercel-Adresse muss in `ALLOWED_ORIGINS` stehen. Sonst lehnt der Server die Verbindung ab. Nutzt du auch Preview-Deployments, trage deren Adresse zusätzlich ein. Eine Leer-Einstellung erlaubt alle Origins.

Änderst du Regeln oder Level, müssen Vercel und der Server dieselbe Version haben. Erhöhe dann `VERSION` in der Simulation. Bei Abweichung meldet das Spiel: „Spielversion passt nicht zum Server“.

**Alternative ohne Vercel:** Render liefert die Seite ebenfalls aus. Öffnet ihr direkt `https://<dienst>.onrender.com`, braucht es weder `PLUESCH_WS_URL` noch Vercel.

### Umgebungsvariablen

| Variable | Wo | Pflicht | Bedeutung |
| --- | --- | --- | --- |
| `PLUESCH_WS_URL` | Vercel, Build | Für Online auf Vercel | Adresse des Spielservers, `wss://…` ohne `/ws` |
| `PORT` | Server | Nein, Standard 3000 | Setzen die Hoster meist selbst |
| `HOST` | Server | Nein | Standard `0.0.0.0` |
| `ALLOWED_ORIGINS` | Server | Empfohlen | Kommagetrennte erlaubte Seiten-Adressen |
| `ROOM_TTL_MINUTES` | Server | Nein, Standard 30 | So lange bleibt ein Raum ohne Verbindung erhalten |
| `MAX_ROOMS` | Server | Nein, Standard 200 | Obergrenze gleichzeitiger Räume |

### WebSocket-Konfiguration

- Pfad: `/ws` am Spielserver. Das Frontend hängt ihn selbst an.
- Auf einer HTTPS-Seite muss es `wss://` sein. Der Client erzwingt das. TLS beendet der Host, `server.js` selbst spricht einfaches HTTP.
- Der Server braucht nur einen Prozess und eine Instanz. Räume liegen im Speicher, daher nicht auf mehrere Instanzen skalieren.
- Datenmenge: 30 Zustände pro Sekunde, grob 60 KB/s je Spieler. Der Wert ist geschätzt, nicht auf einem Host gemessen.
- Testweise lässt sich die Serveradresse im Menü unter „Server-Adresse“ oder per `?server=wss://…` überschreiben.

## So prüft ihr Raumbeitritt, Synchronisierung und Wiederverbinden

Nach einem Deploy, zu zweit oder mit zwei Browserprofilen:

1. **Raumbeitritt:** Raum erstellen, falschen Code testen (Fehlermeldung), richtigen Code eingeben. Ein dritter Browser muss „schon voll“ melden.
2. **Figuren:** Die vom Partner gewählte Figur ist gesperrt. Das Spiel startet erst, wenn beide bereit sind.
3. **Synchronisierung:** Beide sammeln im Tutorial denselben Stern. Der Stand muss auf beiden Seiten gleich sein. Oben rechts steht die Latenz in Millisekunden.
4. **Wiederverbinden:** Bei einer Person das WLAN kurz trennen oder die Seite neu laden. Die andere sieht „Partner getrennt“. Nach der Rückkehr läuft das Spiel an derselben Stelle weiter.
5. **Serverausfall:** Beide sehen „Verbindung verloren“ mit „Erneut verbinden“ und „Zum Hauptmenü“.

Automatische Tests, dafür zusätzlich `npm install` ohne `--omit=dev`:

```bash
npm test                                   # Durchspielen aller Level und Regeln in der Simulation
node tests/solo.js                         # Stichprobe: Kommt man allein durch?
node tests/local.js                        # Lokaler Koop in Chrome, ohne Server
node tests/e2e.js --levels=0,1,2,3,4       # Online mit zwei Chrome-Sitzungen
node tests/deploy-sim.js                   # wie oben mit getrennter Seite, TLS, Origin-Prüfung und Latenz
```

Die Browsertests nutzen das installierte Google Chrome. `deploy-sim.js` braucht `openssl` und die freien Ports 8080, 8443 und 3200.

<!--TESTS-->
