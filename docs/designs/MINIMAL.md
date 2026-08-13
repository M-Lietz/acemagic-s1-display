# Minimal

Status: implementiert und auf einem echten AceMagic S1 unter Proxmox-LXC live geprüft

Minimal reduziert die Ansicht auf Gesundheitsstatus, große CPU-/RAM-Werte und
wenige eindeutig beschriftete Sekundärdaten. Es bietet die höchste
Fernablesbarkeit der Kollektion.

- Renderer-ID: `minimal`
- Theme: `s1panel/themes/minimal/minimal.json`
- Vorschau: `s1panel/designs/previews/minimal.png`
- Hauptlayout: große Statusfläche und zweispaltige Messwerte
- Akzente: Grün nur für Gesundheit, Cyan für Bezeichnungen
- Bewegung: kurze Wertinterpolation ohne sichtbare Dekoration
- Zustände: vollständige Online-, Warning-, Offline- und N/A-Darstellung
