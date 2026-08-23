# Instrument

Status: implementiert, produktive Referenz und auf einem echten AceMagic S1 unter Proxmox-LXC live geprüft

Instrument verwendet zwei große Halbkreisskalen für CPU und aktive
Gast-RAM-Nutzung. Temperatur, Storage, Backup, Gäste und Uptime bleiben trotz
der instrumentellen Hauptansicht direkt ablesbar.

- Renderer: `s1panel/widgets/instrument_dashboard.js`
- Theme: `s1panel/themes/instrument/instrument.json`
- Vorschau: `s1panel/designs/previews/instrument.png`
- Charakter: technisch, präsent, hochwertig
- Hauptakzent: Cyan/Blau; Grün nur für gesunde Zustände, Amber für Temperatur
- Bewegung: gefüllter Bogen und heller Zeiger laufen für CPU und RAM
  nacheinander zum neuen Ziel; der Renderer plant höchstens etwa alle 100 ms
  einen neuen Animationsstand. Deutliche Sprünge federn leicht nach. In den
  Ruhephasen wandert ein breiter Scanner in etwa sechs Sekunden über einen
  Bogen und zurück; nach einer kurzen Firmwarepause folgt der andere Bogen.
- Zustände: `ONLINE`, `WARNING`, `OFFLINE` und RAM `N/A`

Dieses Design bleibt der visuelle und funktionale Regressionstest für die
gesamte Kollektion.

Für die Bewegung zeichnet Instrument intern weiterhin das vollständige
170×320-Bild. Zum TFT werden im Normalfall nur veränderte RGB565-Bereiche
übertragen. Statische Beschriftungen, Rahmen und Skalen bleiben damit ruhig;
nach Start, Neuverbindung oder Fehler wird automatisch ein kompletter Frame
gesendet. Tests setzen die Teilbereiche wieder zusammen und vergleichen das
Ergebnis pixelgenau mit dem vollständigen Zielbild.

Messwertbewegung hat immer Vorrang vor den dekorativen Akzenten. Dadurch bleibt
der große Bogen flüssig und die langsame USB-Verbindung muss nie mehrere
Bewegungsbereiche gleichzeitig übertragen. Die angezeigte Zahl entspricht
sofort dem echten Messwert; nur der Bogen darf bei Sprüngen kurz nachfedern.
Feine 8-Pixel-Kacheln halten die übertragenen Bereiche klein. Teilbild-Pakete
sind auf der Referenzhardware auf 1024 RGB565-Pixel begrenzt und werden bei
einem einzelnen Firmwarefehler nach kurzer Pause kontrolliert wiederholt.
