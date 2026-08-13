# Horizon

Status: implementiert und auf einem echten AceMagic S1 unter Proxmox-LXC live geprüft

Horizon gliedert das Display in breite horizontale Ebenen. CPU- und RAM-Trends
erhalten viel Raum; Storage, Backup und Uptime bilden darunter eine ruhige
Betriebszone.

- Renderer-ID: `horizon`
- Theme: `s1panel/themes/horizon/horizon.json`
- Vorschau: `s1panel/designs/previews/horizon.png`
- Hauptlayout: horizontale CPU- und RAM-Trendebenen
- Akzente: Cyanlinien auf dunklem Navy
- Bewegung: geglättete Werte und fünfminütige Trends
- Zustände: vollständige Online-, Warning-, Offline- und N/A-Darstellung
