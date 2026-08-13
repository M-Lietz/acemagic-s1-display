# Operations

Status: implementiert und auf einem echten AceMagic S1 unter Proxmox-LXC live geprüft

Operations zeigt den Host als Betriebsübersicht. Gesundheit, Proxmox-Host,
aktive Last und Gäste besitzen jeweils eine klar benannte Karte und lassen sich
ohne Interpretation erfassen.

- Renderer-ID: `operations`
- Theme: `s1panel/themes/operations/operations.json`
- Vorschau: `s1panel/designs/previews/operations.png`
- Hauptlayout: vier beschriftete Betriebskarten
- Akzente: technisches Blau, Cyan und funktionale Warnfarben
- Bewegung: kurze Wertinterpolation; keine dekorative Dauerbewegung
- Zustände: Host- und Gastausfälle werden ausdrücklich bezeichnet
