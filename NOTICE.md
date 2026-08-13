# Herkunfts- und Änderungshinweis

## Grundlage

AceMagic S1 Display basiert auf dem GPL-3.0-Projekt
`AceMagic-S1-LED-TFT-Linux` von Tomasz Jaworski:

https://github.com/tjaworski/AceMagic-S1-LED-TFT-Linux

Die ursprünglichen Copyright- und Lizenzhinweise in übernommenen Dateien
bleiben maßgeblich und dürfen nicht entfernt werden.

Die Gallery entstand durch einen vollständigen Umbau der ursprünglichen
`s1panel`-Weboberfläche. Hinweise auf Tomasz Jaworski und die GPL-3.0 bleiben
sowohl im Quellcode als auch in der sichtbaren Credits-Anzeige erhalten.
Wesentlich veränderte und neu hinzugefügte Quelldateien tragen zusätzlich einen
`SPDX-License-Identifier: GPL-3.0-only`-Hinweis.

## Wesentliche Änderungen

Merlin Lietz und Mitwirkende haben 2026 unter anderem folgende Bestandteile
ergänzt oder wesentlich verändert:

- Instrument-Dashboard für das native 170×320-Portrait-Display,
- lesende Proxmox-Metriken mit klaren Quellen und Einheiten,
- aktive Gast-RAM-Berechnung statt Balloon-Zuteilung,
- dynamische VM-/CT- und Offline-Erkennung,
- Backup-, Storage- und zentrale Healthbewertung,
- zeitbasierte Instrumentbewegung und Trenddarstellung,
- Healthcheck, Watchdog, Rollback-Helfer und automatisierte Tests.

Das Gesamtwerk wird unter der GNU General Public License v3.0 weitergegeben.
Für Binärpakete muss der dazu passende vollständige Quellstand verfügbar sein.

## Markenhinweis

Dieses Projekt ist inoffiziell. Es besteht keine Verbindung zu ACEMAGIC oder
zum Hersteller des Geräts. Produkt- und Markennamen dienen ausschließlich der
Beschreibung der unterstützten Hardware.
