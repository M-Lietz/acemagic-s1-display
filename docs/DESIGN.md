# Design: Instrument

## Entscheidung

Das gewählte Zielbild heißt **Instrument**. Es ist edel, technisch und ruhig,
ohne Neon-Look oder verspielte Sci-Fi-Elemente. Die Umsetzung orientiert sich
am ausgewählten Entwurf, wurde aber direkt für die echte Panelgröße gestaltet
und nicht lediglich als großes Bild verkleinert.

Instrument bleibt die produktive Referenz. Zwölf weitere gemeinsam ausgewählte
Richtungen sind auf derselben technischen Basis nativ implementiert und stehen
im [Designkatalog](DESIGNKATALOG.md) sowie in der
[Einzeldokumentation](designs/README.md).

![Gerenderte Instrument-Ansicht](../s1panel/screenshots/instrument-dashboard.png)

![Bewegungsvorschau mit Lastsprung](../s1panel/screenshots/instrument-motion-preview.gif)

## Native Rahmenbedingungen

- Orientierung: Portrait
- sichtbare Auflösung: 170×320 Pixel
- Renderer: Node Canvas
- Hintergrund: fast schwarzes Blau mit sehr zurückhaltender Tiefenwirkung
- Hauptfarben: Cyan/Blau, Weiß, Amber für Temperatur, Grün für Status
- Schrift: systemnahe Sans-Serif-Fonts ohne zusätzliche Font-Abhängigkeit

## Informationshierarchie

1. großer Header mit vollständigem Produktnamen `ACEMAGIC S1` und klarer
   Statusplakette `ONLINE`, `WARNING` oder `OFFLINE`
2. CPU-Auslastung und Temperatur
3. aktive RAM-Nutzung der laufenden Gäste in Prozent des Host-RAM und in GiB
4. Storage-Auslastung und Alter des letzten erfolgreichen Backups
5. laufende/gesamte VM und CT sowie Host-Uptime

Die Ansicht nutzt bewusst nur einen Screen. Das vermeidet unnötige Rotation,
reduziert Zustandslogik und macht alle zentralen Werte sofort sichtbar.

Zahlen und Zusatzwerte stehen bei einer Messwertänderung sofort korrekt. Der
gefüllte Bogen läuft anschließend zusammen mit seinem hellen Zeiger gleichmäßig
zum neuen Ziel. CPU und RAM bewegen sich bewusst nacheinander, sodass das
langsame USB-Display immer nur einen kleinen Bogenabschnitt übertragen muss.
Bei einem sichtbaren Sprung ab sechs Prozentpunkten läuft der Bogen leicht über
das Ziel und federt in 360 ms auf den exakten Wert zurück. Kleine Schwankungen
bleiben direkt. Die Messquelle wird weiterhin nur alle fünf Sekunden abgefragt.

Zwischen Messwertbewegungen wandert ein breiter, weich leuchtender Scanner
direkt über die Skala. Ein vollständiger Hin-und-zurück-Lauf dauert etwa sechs
Sekunden. Nach einer kurzen echten Firmwarepause wechselt die Bewegung vom
CPU- zum RAM-Bogen. Während einer realen Messwertbewegung hält der Scanner
seine Position, damit nie zwei konkurrierende Bewegungen übertragen werden.
Status und Sparkline bleiben bewusst ruhig; so ist die Bewegung klar sichtbar,
ohne den hochwertigen Instrumentencharakter in einen Neon-Look zu verwandeln.

Eine geglättete Linie unter dem Hauptwert zeigt jeweils die letzten fünf Minuten.
Ihre Skala hat eine Mindestspanne von 24 Prozentpunkten. Kleine Messschwankungen
werden dadurch nicht mehr irreführend auf die gesamte Diagrammhöhe vergrößert.
Eine dezente Flächenfüllung, der helle Endpunkt und die fein abgestufte
Instrumentenskala geben Tiefe, ohne einen Neon- oder Gaming-Look zu erzeugen.

Der Header reserviert bewusst mehr Höhe für Marke und Betriebszustand. Der
Produktname nutzt eine kräftige, systemweit vorhandene Sans-Serif-Schrift; die
Statusplakette kombiniert einen großen farbigen Punkt mit einem ausgeschriebenen
Zustand. Dadurch bleiben Marke und Status auch auf dem echten 170×320-Panel
sofort lesbar.

Die Hauptwerte trennen große Ziffern und ein kleineres Prozentzeichen
typografisch. `CPU LOAD` und `RAM ACTIVE` benennen die gezeigten Kennzahlen
präziser. Temperatur und aktive GiB stehen in ruhigen Informationsplaketten,
anstatt frei im Instrument zu schweben.

Im Storage-Bereich zeigt
`BKP <1H`, `BKP 4H`, `BKP RUN` oder `BKP ERR` den Backupzustand, ohne einen
zweiten Screen oder eine dauerhaft laufende Textrotation einzuführen.
Die Storage-Anzeige wechselt ab 75 Prozent zu Amber und ab 90 Prozent zu Rot.
VM- und CT-Zellen erhalten bei einem Offline-Zustand eine kräftigere Amberkante
und einen amberfarbenen Wert; im Normalzustand bleiben sie zurückhaltend.

VM und CT erscheinen als Verhältnis `laufend/gesamt`, beispielsweise `0/1`
oder `2/3`. Sobald ein vorhandener Gast gestoppt ist, werden sein Wert und der
Statuspunkt amberfarben. Eine unterbrochene Proxmox-Verbindung wird rot. Gelöschte
Gäste verschwinden automatisch aus dem Gesamtbestand und erzeugen keinen
dauerhaften Fehlalarm. Ist eine laufende VM vorhanden, aber ihre RAM-Messung
nicht erreichbar, wird der Wert amberfarben als `N/A` dargestellt.

## Datenbegriffe

`RAM ACTIVE` bezeichnet die aktive Speichernutzung der laufenden VM und Container.
Für QEMU-Gäste gilt `MemTotal − MemAvailable`; für LXC wird die vorhandene
cgroup-Nutzung aus Proxmox verwendet. Die Summe wird ins Verhältnis zum
physischen Host-RAM gesetzt. Freier RAM erscheint nicht als Hauptwert.

Damit wird dynamisch zugeteilter, aber innerhalb einer VM verfügbarer
Balloon-Speicher nicht mehr als aktive Last dargestellt. Die Kennzahl ist
bewusst eine Gastlast und keine Aussage über die physische Hostbelegung.
