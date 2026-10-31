# Plüschfreunde

Süßes 2D-Koop-Puzzlespiel im Browser: Hase und Dino müssen gemeinsam durchs Kinderzimmer. Online auf zwei Computern oder zu zweit an einer Tastatur. Tutorial und neun Level, alle Sterne sind Pflicht, kein Game-over. Dazu kommt der Endlos-Lauf „Rabenjagd“.

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
3. Beide wählen verschiedene Figuren und klicken **Bereit**. Unter „Spielstart“ lässt sich ein späteres Level oder der Endlos-Lauf wählen. Der Fortschritt wird nicht gespeichert.

| | Online | Lokal: Hase | Lokal: Dino |
| --- | --- | --- | --- |
| Laufen | `A`/`D` oder `←`/`→` | `A`/`D` | `←`/`→` |
| Springen | `Leertaste` | `W` | `↑` |
| Hebel | `E` | `E` | `Enter` |
| Küssen | `Q` | `Q` | über `Q` des Hasen |

`Esc` öffnet das Menü mit Steuerung. `R` eine Sekunde halten oder der Menüpunkt setzt den aktuellen Abschnitt zurück. Sterne und fertige Abschnitte bleiben dabei erhalten. Boxen schiebt ihr durch Dagegenlaufen, auf eine Box steigt ihr per Sprung.

**Räuberleiter:** Stellt euch übereinander und springt gerade hoch, dann landet ihr auf dem Kopf des Partners. Die untere Figur kann dann laufen, aber nicht springen.

**Seil:** Im Sprung den Griff berühren, dann hängt ihr dran. Laufen gibt Schwung, Springen lässt los. Das kommt in Level 5 bis 9 und im Endlos-Lauf vor.

**Kletterwand:** An den blauen Wänden rutscht ihr langsamer und könnt abspringen. So geht es zwischen zwei Wänden hin und her nach oben. Normale Wände funktionieren so nicht, damit Koop-Hindernisse bestehen bleiben.

**Küssen:** Steht ihr nah beieinander auf gleicher Höhe, startet `Q` den Kuss. Beide Figuren stehen dann etwa 1,7 Sekunden still, auch im Endlos-Lauf.

**Endlos-Lauf „Rabenjagd“:** Ein Rabe sitzt euch im Nacken und wird immer schneller. Trifft er einen von euch, ist die Runde vorbei.

- **Sturzflug:** Regelmäßig steigt er auf und zielt mit einem roten Kreis auf eine Figur. Er rechnet eure Laufrichtung ein. Sobald der Kreis fest wird, müsst ihr heraus: abbremsen oder umdrehen.
- **Kuss-Schild:** Ein Kuss friert euch 1,7 Sekunden ein, lädt danach aber ein Herz-Schild, das einen Treffer abfängt. Danach läuft eine Abklingzeit von 12 Sekunden.
- **Punkte:** Meter, Sterne mit Kombo und 15 Punkte, wenn ihr einem Sturzflug knapp entkommt. Der Rekord bleibt im Browser.
- **Abschnitte:** Zufällig gemischt aus Sprüngen, bröckelnden Kissen, Boxen, Fahrstühlen, Fähren, Haltebrücken, Doppelplatten und Hebeln per Räuberleiter, Seilen und Kletterwänden.
- **Absturz:** Wer fällt, steht wieder am Abschnittsanfang. Der Rabe hält dann kurz inne. `R` holt die Box des Abschnitts zurück.

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

Auf Render Free gilt: Solange ihr spielt, fließt Verkehr. Wenn der Server schläft oder neu startet, sind Räume weg, weil sie nur im Arbeitsspeicher liegen. Dann einfach einen neuen Raum erstellen und unter „Spielstart“ das Level wählen.

### Schritt für Schritt

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
node tests/run.js                          # Kuss und Endlos-Lauf in der Simulation
node tests/run-e2e.js                      # Kuss und Endlos-Lauf online und lokal in Chrome
node tests/smooth.js                       # Gleichmäßigkeit der Darstellung online
node tests/solo.js                         # Stichprobe: Kommt man allein durch?
node tests/local.js                        # Lokaler Koop in Chrome, ohne Server
node tests/e2e.js --levels=0,1,2,3,4       # Online mit zwei Chrome-Sitzungen
node tests/deploy-sim.js                   # wie oben mit getrennter Seite, TLS, Origin-Prüfung und Latenz
```

Die Browsertests nutzen das installierte Google Chrome. `deploy-sim.js` braucht `openssl` und die freien Ports 8080, 8443 und 3200.

## Tatsächlich durchgeführte Tests

Alle Läufe fanden am 31.10.2026 auf einem Windows-11-Rechner mit Node 22 und Google Chrome statt. Beide Spieler waren dabei Bots, die nur Eingaben senden.

| Test | Ergebnis |
| --- | --- |
| Physik gemessen (`tests/physics-measure.js`) | Sprunghöhe 118 px, Weite 171 px, von Kante zu Kante etwa 207 px. Daran sind die Level ausgerichtet |
| `tests/playthrough.js` | Alle 5 Level in der Simulation abgeschlossen, alle Sterne, kein Absturz. Bot-Zeit gesamt 394 s |
| `tests/rules.js` | 35 von 35: Stern zählt bei Gleichzeitigkeit einmal, Ausgang braucht alle Sterne und beide Spieler, Abschluss und Levelwechsel nur einmal, alle Spawnpunkte frei, verpasste Sterne erreichbar, Absturz, Box-Rückkehr, Tür ohne Quetschen, Räuberleiter |
| Zufallstest in `rules.js` | In jedem der 23 Abschnitte 25 s Zufallseingaben, dann Reset: Der Rest des Levels war jedes Mal lösbar |
| `tests/e2e.js`, alle Level | 27 von 27 Prüfungen mit zwei getrennten Chrome-Sitzungen über einen echten Server: Raum, falscher Code, dritte Person abgewiesen, Figuren, Bereitschaft, echte Tastatur, Abbruch, automatisches Wiederverbinden, Neuladen, alle Level nacheinander, gleicher Sternestand, „Zusammen geschafft!“, Nochmal spielen, Serverausfall |
| `tests/deploy-sim.js`, Tutorial und Level 1 | 18 von 18, dazu Origin-Prüfung erlaubt und abgelehnt. Getrennte HTTPS-Seite aus dem Vercel-Build, `wss` über TLS-Proxy, rund 100 ms Latenz hin und zurück |
| `tests/local.js` | Alle 5 Level per `file://` ohne Server abgeschlossen. Tasten beider Figuren, gleichzeitiges Laufen, Zoom, geteilter Bildschirm, Esc-Pause bestanden |
| `vercel build` in einer Kopie | Erfolgreich. Ausgabe nur `index.html`, Server-Adresse korrekt eingetragen |
| `tests/solo.js` | Stichprobe mit Suchgrenze, siehe unten |

Hinweise zu den Ergebnissen:

- Im Online-Lauf mussten die Bots 6-mal einen Abschnitt wiederholen, in den lokalen Läufen ebenfalls einzelne Male. Ursache war das Timing der Bot-Skripte im Echtzeitlauf, in den Fällen, die ich angesehen habe, etwa eine Platte im Laufweg. Der Reset führte jedes Mal zum Ziel.
- Der Durchlauf `e2e` lief vor den letzten kleinen Oberflächen-Änderungen an Hinweis-Position und Statuspunkten. `deploy-sim` und `local` liefen danach.
- Allein-Prüfung: In 43 von 46 Suchläufen kam ein einzelner Spieler nicht zum nächsten Ziel, nur 10 davon haben alle Möglichkeiten erschöpft, die übrigen endeten an der Suchgrenze. Allein erreichbar waren der Tutorial-Schluss, der kein Koop-Hindernis enthält, und Level 4, Abschnitt 5. Dort kommt eine Figur mit dem Zeit-Hebel allein durch die Tür, die zweite braucht aber den Partner auf der Platte dahinter.

### Kuss und Endlos-Lauf

Ebenfalls am 31.10.2026 mit Bots ausgeführt:

| Test | Ergebnis |
| --- | --- |
| `tests/run.js` | 41 von 41: Kuss-Regeln, gleicher Zufallswert ergibt denselben Lauf, Sturzflug, Schild, Kombo, bröckelnde Kissen, Game over genau einmal |
| Lösbarkeit ohne Rabe | 3 Läufe mit je 40 Abschnitten geschafft. Der Typ `updown` kam in dieser letzten Fassung nicht vor, wurde aber in der Vorfassung gelöst |
| Mit Rabe | Bots ohne Ausweichen enden nach 8 bis 22 Sekunden. Bots mit einfachem Ausweichen, ohne Kuss-Schild, kamen 33 bis 150 Sekunden weit |
| `tests/playthrough.js` | Alle 10 Level in der Simulation geschafft, Level 5 bis 9 je 92 bis 136 Sekunden Bot-Zeit |
| `e2e` Level 5 bis 9 | 27 von 27 mit zwei Chrome-Sitzungen, inklusive Abbruch, Wiederverbinden und Abschluss. Die Bots wiederholten 3-mal einen Abschnitt |
| `local` Tutorial, Level 6 und 9 | 11 von 11 |
| `tests/run-e2e.js` | 12 von 12, nach einem Lauf, in dem die Bots zu früh am Raben scheiterten. Der Test versucht es nun über mehrere Runden |
| `deploy-sim` | Bei mehreren Läufen: 16 von 16 in Level 5, zweimal. Zweimal direkt nach einem anderen Browsertest hing der Lauf im Warteraum. Die Ursache ist unklar |
| Ruckeln | `tests/smooth.js` misst die Korrektur der eigenen Figur online: im Mittel 0,22 px. Das Spielgefühl auf deinem Rechner konnte ich nicht messen |

Tutorial und Level 1 bis 4 liefen online zuletzt vor diesen Features vollständig, danach nur in der Simulation. Beim Testen fiel ein echter Fehler auf und ist behoben: Nach „Nochmal“ konnte der Server Eingaben einer Person verwerfen.

## Nicht getestet und bekannte Einschränkungen

- **Kein echter Host:** Weder Vercel noch Render wurden tatsächlich benutzt. Die Deployment-Tests bilden den Aufbau auf einem Rechner nach. Echte Latenz, Proxys und Render-Free-Verhalten sind ungeprüft.
- **Keine Menschen:** Spielgefühl, Rätselverständlichkeit und die Spielzeit von 3–5 bzw. 25–40 Minuten sind nicht gemessen. Die Spielzeit ist eine Schätzung aus 23 Abschnitten.
- **Nur Chrome:** Firefox, Safari und Mobilgeräte sind nicht getestet. Das Spiel braucht eine Tastatur.
- **Ton:** Die Geräusche sind eingebaut, aber nicht abgehört worden.
- **Einmaliger Absturz:** Bei einem frühen Testlauf meldete Chrome einmal `Target crashed`. Die Ursache ist unbekannt. In späteren langen Läufen trat es nicht wieder auf, der JS-Speicher lag konstant bei rund 5 MB.
- **Endlos-Lauf:** Tempo und Fairness sind nur mit Bots geprüft. Echte Spieler können es leichter oder schwerer finden, der Lauf ist jetzt bewusst fordernd. Stellschrauben stehen in `RUN` in der Simulation.
- **Fortschritt:** Nichts wird gespeichert. Räume leben im Arbeitsspeicher des Servers und enden mit dessen Neustart.
- **Reset:** Jeder Spieler kann den Abschnitt allein zurücksetzen, ohne Rückfrage beim Partner.
- **Box verloren:** Fällt eine Box in eine Grube, kehrt sie von selbst zurück. Landet sie in einem flachen Aufzugsschacht oder ist blockiert, hilft der Abschnitts-Reset.
- **Lösungswege:** Alternative Lösungen sind möglich. In Level 4, Abschnitt 1 lassen sich beide Boxen zusammen durch die Tür schieben, dann braucht es den Reset.
- **Referenzbild:** Es lag keines bei. Die Grafik folgt der Textbeschreibung.
