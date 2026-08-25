# Änderungsprotokoll

Alle wichtigen Änderungen dieses Projekts werden hier dokumentiert. Das Format
orientiert sich an Keep a Changelog; Versionen folgen Semantic Versioning.

## [Unreleased]

### Geändert

- Swap-Belegung allein erzeugt keine Warnung mehr; erst kombinierter
  Speicherdruck aus knappem Host-RAM und deutlich belegtem Swap wird gemeldet
- Warn- und Erholungszustände werden über mehrere Messungen stabilisiert, damit
  kurze Lastspitzen die Statusanzeige nicht flackern lassen

## [0.1.3] - 2026-08-23

### Hinzugefügt

- native GitHub-Automation, die beim veröffentlichten Release das geprüfte
  Installationsarchiv und seine SHA-256-Datei direkt am Release bereitstellt
- pixelgenaue RGB565-Tests für begrenzte Instrument-Teilaktualisierungen
- getrennte, von Git ausgeschlossene Bewegungsvorschau für Kandidatentests
- rollierende, geheimnisfreie Leistungswerte für Renderer und USB-Übertragung
  unter `/api/performance`
- gut sichtbare Living-Motion für Instrument: ein breiter, weich leuchtender
  Scanner wandert direkt über CPU- und RAM-Bogen

### Geändert

- reproduzierbare Laufzeit- und Gallery-Lockfiles auf aktuelle kompatible
  Patchstände aktualisiert
- Deployment stellt die Ausführungsrechte der geprüften Installations- und
  Wartungshelfer nach dem sicheren Entpacken gezielt wieder her
- Instrument überträgt animierte Änderungen per vorhandenem `LCD_REFRESH`;
  Start, Neuverbindung, Fehler und große Änderungen bleiben Vollbilder
- CPU- und RAM-Bogen laufen nacheinander mit ihrem Zeiger; Zahlen stehen sofort
  auf dem neuen Messwert und pro Animationsschritt ändern sich nur kleine Bereiche
- deutliche Lastsprünge federn leicht zum echten Zielwert zurück; kleine
  Alltagsschwankungen bleiben direkt und ressourcenschonend
- Messwert- und Scanner-Bewegung konkurrieren nicht: Bei einer echten
  Messwertänderung hält der Scanner seine Position; nach einem vollständigen
  Hin-und-zurück-Lauf folgt eine kurze Firmwarepause und der andere Bogen
- Teilbildbereiche werden mit feinen 8-Pixel-Kacheln erkannt, innerhalb der
  auf echter S1-Hardware stabilen Paketgröße zusammengefasst und pixelgenau
  geprüft
- fehlgeschlagene Teilbilder werden nach kurzer Pause begrenzt wiederholt;
  ein nötiges Vollbild verwirft veraltete Bildaufträge statt sie nachträglich
  abzuarbeiten
- der Instrument-Bildtakt wurde für kleine Teilbilder von 160 auf 100 ms
  verkürzt; laufende USB-Übertragungen werden weiterhin sicher übersprungen
- wiederholte Redraw-Anforderungen werden zusammengefasst, damit einzelne
  HID-Fehler keinen wachsenden Vollbild-Rückstand erzeugen
- ein flüchtiger Proxmox-Verbindungsabbruch wird genau einmal kurz wiederholt,
  bevor der Sensor den Host als nicht erreichbar meldet
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

[Unreleased]: https://github.com/M-Lietz/acemagic-s1-display/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/M-Lietz/acemagic-s1-display/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/M-Lietz/acemagic-s1-display/releases/tag/v0.1.2
