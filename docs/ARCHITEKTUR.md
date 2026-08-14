# Architektur

## Zielaufbau

```text
Proxmox API ──────────────┐
Eingeschränkte Gastprobe ─┼─→ system_status Sensor
Host-hwmon ───────────────┘            │
                                │ neutrales Messwertobjekt
                                ▼
                       Instrument Widget
                                │
                                │ natives 170×320 Canvas
                                ▼
                       s1panel LCD-Treiber → AceMagic S1

Designkatalog → sichere Gallery → atomare Konfigurationsauswahl → Live-Umschaltung
```

Releasecode liegt unveränderlich unter `/opt/acemagic-s1-display/releases`.
`S1PANEL_CONFIG=/var/lib/s1panel` trennt die veränderbare `config.json` vom
jeweiligen Release und von den schreibgeschützten Secrets unter `/etc/s1panel`.
Theme- und Rendererdateien werden weiterhin ausschließlich aus dem aktiven
Release geladen.

## Verantwortlichkeiten

- Der Sensor `system_status` liest CPU, Storage, Gastzustände, LXC-Speicher und
  Uptime direkt und ausschließlich lesend aus der vorhandenen Proxmox-API. Aus
  der Aufgabenliste wird zusätzlich der letzte `vzdump`-Status gelesen.
- Für laufende QEMU-VMs liest ein eigener, stark eingeschränkter SSH-Schlüssel
  ausschließlich `MemTotal` und `MemAvailable` aus `/proc/meminfo`. Dafür läuft
  kein zusätzlicher Agent oder Exporter.
- Die CPU-Temperatur kommt ohne zusätzlichen Dienst aus dem vorhandenen
  `coretemp`-Eintrag unter `/sys/class/hwmon`.
- Es gibt keinen Prometheus-, Grafana-, InfluxDB- oder Exporter-Unterbau.
- Der Sensor hält bei einem kurzen Ausfall die letzte Antwort vor und markiert
  die Verbindung als unterbrochen.
- Eine zentrale Healthbewertung priorisiert kritischen Storage-, Temperatur-,
  RAM-, Swap- und Backupzustand vor Warnungen zu alten Backups, fehlenden
  Messwerten oder gestoppten Gästen.
- Die Gastliste wird ohne feste VMID dynamisch gelesen. Für VM und CT werden
  jeweils laufende und insgesamt vorhandene Instanzen gezählt; Templates zählen
  nicht als offline.
- `instrument_metrics.js` normalisiert Feldnamen, Wertebereiche und das alte
  kompakte Payload-Format während der Übergangszeit.
- `instrument_dashboard.js` zeichnet ausschließlich die Oberfläche.
- CPU- und RAM-Verläufe werden nur fünf Minuten im Arbeitsspeicher gehalten.
  Es gibt dafür keine Datenbank und keine dauerhafte Historie.
- Der vorhandene `s1panel`-Treiber übernimmt Orientierung, RGB565-Konvertierung
  und USB-HID-Übertragung. Einzelne bekannte HID-Aussetzer werden toleriert;
  nach drei aufeinanderfolgenden Fehlern öffnet der Worker das Gerät neu.
- Instrument wird weiterhin als vollständiger Frame in zwei RGB565-Bildpuffer
  gezeichnet. Ein pixelgenauer Vergleich fasst Änderungen in 16×16-Kacheln
  zusammen und überträgt nur diese Bereiche per vorhandener `LCD_REFRESH`-
  Funktion. Der statische Rest bleibt unverändert im TFT-Speicher stehen.
- Start, Designwechsel, USB-Neuverbindung und Übertragungsfehler erzwingen
  weiterhin einen vollständigen Frame. Wären mindestens so viele HID-Pakete
  wie bei einem Vollbild nötig, fällt der Renderer ebenfalls automatisch auf
  den bewährten Vollbildweg zurück. Alle anderen Designs behalten diesen
  bisherigen Vollbildweg unverändert bei.
- Ein lokaler `/healthz`-Endpunkt und der systemd-Watchdog überwachen, ob LCD,
  Renderer und Hauptprozess tatsächlich aktiv bleiben.
- Die Gallery liest ausschließlich den versionierten Designkatalog. Eine
  Auswahl ist nur möglich, wenn der Eintrag als implementiert markiert ist und
  seine Theme-Datei innerhalb des S1Panel-Verzeichnisses gültig geladen werden
  kann. Vor dem atomaren Konfigurationswechsel entsteht `config.json.previous`.

## Sicherheitsgrenzen

- URL und Proxmox-API-Token kommen standardmäßig aus `S1PANEL_PVE_URL` und
  `S1PANEL_PVE_TOKEN`.
- Ein Token wird nie in Theme, Konfiguration, Testfixture oder Log geschrieben.
- HTTPS-Zertifikate werden geprüft; eine interne CA kann über `ca_file`
  angegeben werden.
- HTTP ist nur für automatisierte lokale Tests ausdrücklich freigegeben.
- Die Web-UI bindet im Beispiel nur an `127.0.0.1`.
- Der Healthcheck bindet zusammen mit der Web-UI ausschließlich an Loopback.
- Die Gallery besitzt keine Anmeldung. Jeder erlaubte HTTP-Client kann das
  aktive Design wechseln; eine LAN-Freigabe ist daher eine bewusste
  Vertrauensgrenze und keine Internet-Schnittstelle.
- Sicherheitsheader sperren fremde Einbettung, MIME-Sniffing und nicht
  benötigte Browser-Funktionen. JSON-Anfragen sind klein begrenzt.
- Die frühere freie Editor-API einschließlich Uploads, Widget-, Sensor- und
  Theme-Manipulation gehört nicht mehr zur Anwendung.
- Der Gastschlüssel verwendet `restrict` und einen erzwungenen Befehl. Shell,
  Port-, Agent- und X11-Forwarding sind damit gesperrt. Der private Schlüssel
  liegt nur im Panel-Container und nie im Repository.
- Ein laufender, aber nicht messbarer QEMU-Gast erzeugt `N/A` statt eines
  unbemerkt zu kleinen RAM-Werts.

## Bewusste Vereinfachung

Die generischen Chart-Widgets zeichnen direkt auf Canvas. Dadurch entfallen
`Chart.js` und `chartjs-node-canvas`; das reduziert Abhängigkeiten und behebt
den Build unter aktuellem Node.js, ohne die Widget-Schnittstellen zu ändern.

Der sichtbare RAM-Wert beschreibt die aktive Nutzung der laufenden Gäste und
nicht den von Proxmox an eine VM zugeteilten Balloon-Speicher:

```text
QEMU aktiv = MemTotal − MemAvailable
LXC aktiv  = cgroup-Nutzung aus der Proxmox-API
Gastlast   = Summe aus QEMU aktiv und LXC aktiv
Prozent    = Gastlast ÷ physischer Host-RAM × 100
```

Gestoppte Gäste verbrauchen in dieser Rechnung keinen RAM. Der Hostzustand,
Gastzählung und Storage bleiben auch dann verfügbar, wenn eine VM ausgeschaltet
oder gelöscht wurde.

## Bewusste Bildstrategie

Es gibt kein zweites, separat gepflegtes Standbild und keine ausgeschnittenen
Flächen im Design. Der Canvas erzeugt stets das komplette gewünschte Bild. Der
Vergleich der beiden letzten Bildpuffer entscheidet anschließend nur, welche
Pixel wirklich zum Display gesendet werden müssen. Damit bleiben Vorschau,
Vollbildübertragung und Teilaktualisierung optisch identisch und können nicht
auseinanderlaufen.

Während eine HID-Übertragung läuft, wird kein weiterer Transferstapel erzeugt.
Spätere Animationsstände werden beim nächsten freien Durchlauf frisch gerendert.
Die Warteschlange bleibt dadurch auf höchstens einen begrenzten Bildstand
beschränkt und kann sich bei einem langsamen USB-Gerät nicht endlos aufbauen.
