# Telemetry

Status: implementiert und auf einem echten AceMagic S1 unter Proxmox-LXC live geprüft

Telemetry stellt die zeitliche Entwicklung in den Mittelpunkt. Zwei große
Trendkarten zeigen CPU und aktive Gast-RAM-Nutzung über das gemeinsame
Fünf-Minuten-Fenster.

- Renderer-ID: `telemetry`
- Theme: `s1panel/themes/telemetry/telemetry.json`
- Vorschau: `s1panel/designs/previews/telemetry.png`
- Hauptlayout: zwei große Messwert- und Trendkarten
- Akzente: feine Cyanlinien auf dunklem Navy
- Bewegung: geglättete Werte und kontinuierlich fortgeschriebene Historie
- Zustände: vollständige Online-, Warning-, Offline- und N/A-Darstellung
