# Änderungsprotokoll

Alle wichtigen Änderungen dieses Projekts werden hier dokumentiert. Das Format
orientiert sich an Keep a Changelog; Versionen folgen Semantic Versioning.

## [Unreleased]

### Hinzugefügt

- pixelgenaue RGB565-Tests für begrenzte Instrument-Teilaktualisierungen
- getrennte, von Git ausgeschlossene Bewegungsvorschau für Kandidatentests

### Geändert

- reproduzierbare Laufzeit- und Gallery-Lockfiles auf aktuelle kompatible
  Patchstände aktualisiert
- Instrument überträgt animierte Änderungen per vorhandenem `LCD_REFRESH`;
  Start, Neuverbindung, Fehler und große Änderungen bleiben Vollbilder
- alle zwölf weiteren Designs behalten ihren bisherigen Vollbildweg unverändert

## [0.1.2] - 2026-08-13

### Hinzugefügt

- strukturierte Vorlagen für Fehlerberichte, Feature-Wünsche und Pull Requests
- konsistente SPDX- und Änderungshinweise in projektspezifischen Quelldateien

### Geändert

- dokumentierter Testumfang auf den tatsächlich geprüften Ubuntu-24.04-LXC
  eingegrenzt
- Release-Dateirechte reproduzierbar normalisiert und Archivprüfung gehärtet
- Weboberfläche mit Sicherheitsheadern und begrenzten JSON-Anfragen abgesichert
- systemd-Drop-ins bleiben bei einer erneuten Diensteinrichtung erhalten
- ungenutzte APT-, journald-, Watchdog- und Logtail-Altdateien entfernt

## 0.1.1 - 2026-08-12

### Hinzugefügt

- sichtbare Projekt-, Lizenz- und Upstream-Credits in der Gallery
- geführter Installer für Ubuntu 22.04/24.04 mit sicherer Update- und Rückfalllogik
- lokale Erkennung von AceMagic-S1-LCD und LED-Controller
- vollständige Anleitung für Read-only-Proxmox-Token, CA und LXC-USB-Durchreichung
- separate SHA-256-Datei für jedes Release-Archiv

### Geändert

- Release enthält jetzt Installer, Betriebsdokumentation und eindeutigen Link zum exakten Quellstand
- Autorenhinweise in abgeleiteten WebUI-Dateien vervollständigt

## 0.1.0 - 2026-08-12

### Hinzugefügt

- 13 native 170×320-Designs mit sicherer lokaler Gallery
- direkte Proxmox-Metriken, aktive Gast-RAM-Berechnung und Offline-Erkennung
- atomare Vollbild-Umschaltung ohne Prozessneustart
- Healthcheck, systemd-Watchdog und automatisierter Live-Designtest
- reproduzierbarer Release-Builder und Deployment mit Rollback
- nichtprivilegierter Dienst, gezielte USB-Rechte und Netzwerk-Hardening

### Geändert

- Laufzeit auf Node.js 24 und npm 11 aktualisiert
- ungenutzte Upstream-Editor-, Sensor- und Widget-Bestandteile entfernt
- Font-Nutzung und Cache-Verhalten vereinfacht

[Unreleased]: https://github.com/M-Lietz/acemagic-s1-display/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/M-Lietz/acemagic-s1-display/releases/tag/v0.1.2
