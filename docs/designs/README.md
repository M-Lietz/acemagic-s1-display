# Implementierte Designs

Stand: 12. August 2026

Alle Ansichten werden nativ mit Node Canvas für 170×320 Pixel gerendert. Sie
verwenden denselben Messwertvertrag und führen keine eigenen Proxmox-Abfragen
aus. Die Gallery zeigt echte Renderer-Snapshots; die ursprünglichen Konzepte
bleiben getrennt als gestalterische Referenz erhalten.

## Designgruppen

- Referenz: [Instrument](INSTRUMENT.md)
- Premium: [Grand Touring](GRAND-TOURING.md), [Atelier](ATELIER.md), [Obsidian](OBSIDIAN.md)
- Betrieb: [Executive](EXECUTIVE.md), [Operations](OPERATIONS.md), [Horizon](HORIZON.md)
- Reduktion: [Telemetry](TELEMETRY.md), [Minimal](MINIMAL.md), [Architect](ARCHITECT.md)
- Instrumente: [Precision](PRECISION.md), [Signature](SIGNATURE.md), [Chronometer](CHRONOMETER.md)

## Gemeinsame Freigabe

Für jedes Design werden native Ausgabe, Warning, Offline, fehlende RAM-Messung,
Animation, eindeutige Renderer-Ausgabe, gültiges Theme und Gallery-Zuordnung
automatisiert geprüft. Am 12. August 2026 lief außerdem jedes Design auf dem
echten TFT in einem Proxmox-LXC mindestens 50 Sekunden stabil. Die Hardwarefreigabe ist im
Betriebs- und Änderungsprotokoll dokumentiert.
