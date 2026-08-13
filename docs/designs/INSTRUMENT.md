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
- Bewegung: geglättete Werte und fünfminütige CPU-/RAM-Historie
- Zustände: `ONLINE`, `WARNING`, `OFFLINE` und RAM `N/A`

Dieses Design bleibt der visuelle und funktionale Regressionstest für die
gesamte Kollektion.
