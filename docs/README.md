# Projektdokumentation

Diese Dokumentation beschreibt den aktuellen, bewusst kleinen Zielumfang des
AceMagic-S1-Displays. Historische Entwicklungsstände sind keine zweite Quelle;
maßgeblich sind immer der aktuelle Git-Stand und der verifizierte Live-Zustand.

## Dokumente

- [Design](DESIGN.md): visuelles Zielbild, Auflösung und Informationshierarchie
- [Designkatalog](DESIGNKATALOG.md): alle 13 implementierten Designs und gemeinsame Freigabekriterien
- [Designs im Detail](designs/README.md): Ziel, Layout und Laufzeitdateien je Design
- [Architektur](ARCHITEKTUR.md): Bausteine, Datenfluss und Sicherheitsgrenzen
- [Installation](INSTALLATION.md): geführte Erstinstallation auf Ubuntu und in Proxmox-LXC
- [Betrieb](BETRIEB.md): Installation, Entwicklung, Deployment und Rollback

## Verbindliche Grundsätze

- Deutsch für Projektdokumentation, englische Fachbegriffe dort, wo sie helfen.
- So nativ und einfach wie möglich; nur so komplex wie wirklich nötig.
- Keine Zugangsdaten, Tokens oder lokalen Konfigurationen in Git.
- Kleine, nachvollziehbare Änderungen mit Tests und Rollback-Möglichkeit.
- Live-Systeme werden erst nach lokaler Prüfung und mit ausdrücklicher Ansage
  verändert.
