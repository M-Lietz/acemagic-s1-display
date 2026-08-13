# S1Panel-Laufzeit

Dieses Verzeichnis enthält die Node.js-Laufzeit für das AceMagic-S1-Display.
Die USB-/HID-Basis stammt aus dem ursprünglichen `s1panel`; Instrument-Renderer,
Proxmox-Sensor, Healthcheck und Tests wurden für dieses Projekt ergänzt oder
wesentlich überarbeitet.

## Wichtige Bestandteile

- `main.js`: Prozesssteuerung, Rendering und Watchdog-Signal
- `sensors/system_status.js`: lesender Proxmox-Collector
- `lib/instrument_metrics.js`: normalisierte Instrument-Metriken
- `lib/design_catalog.js`: validierter Katalog, atomare Auswahl und Rollback
- `lib/design_renderers.js`: zwölf zusätzliche native Renderer
- `designs/`: gemeinsamer Designkatalog und Vorschauen
- `gui/`: reduzierte Vue-Gallery ohne Editor- oder Uploadfunktionen
- `widgets/instrument_dashboard.js`: natives 170×320-Display
- `widgets/design_dashboard.js`: gemeinsamer Einstieg für zwölf Designs
- `themes/`: 13 freigegebene Themes
- `config.json`: sichere Standardvorlage ohne Zugangsdaten
- `config.instrument.example.json`: Beispiel mit optionaler Gastprobe
- `scripts/`: reproduzierbare Vorschau und Healthcheck
- `test/`: native Node.js-Tests

## Entwicklung

```bash
npm ci
npm test
npm run render:instrument
npm run render:motion
npm run render:designs
```

Abhängigkeiten werden nur in `s1panel/node_modules` installiert. Der Ordner ist
nicht versioniert und kann jederzeit durch `npm ci` reproduziert werden.

## Laufzeit

Die Anwendung erwartet eine gültige USB-Gerätekennung und liest den
Proxmox-Zugang aus `S1PANEL_PVE_URL` und `S1PANEL_PVE_TOKEN`. Zugangsdaten
gehören niemals in `config.json` oder den Quellcode.

Die Design-Gallery ist im Standard nur unter `127.0.0.1:8686` erreichbar. Sie
akzeptiert ausschließlich bekannte, implementierte Design-IDs und schreibt die
Auswahl atomar mit einer vorherigen Konfigurationskopie. Ohne zusätzliche
Authentifizierung und CSRF-Schutz darf sie nicht an LAN oder Internet gebunden
werden.

Architektur, Design, Betrieb und Herkunft werden auf Projektebene unter
`../docs`, `../README.md` und `../NOTICE.md` gepflegt.
