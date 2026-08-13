# Mitwirken

Danke für dein Interesse am AceMagic S1 Display. Diese Anleitung gilt für externe Beiträge; Merlins interne Agentenregeln stehen in `AGENTS.md`.

## Änderungen vorbereiten

1. Einen kurzen, fachlich benannten Branch vom aktuellen Standardbranch
   erstellen.
2. Änderungen klein halten und keine Secrets, lokalen Konfigurationen oder
   generierten Abhängigkeiten aufnehmen.
3. Dokumentation auf Deutsch pflegen; gebräuchliche englische Fachbegriffe sind
   willkommen.
4. Vor dem Commit die Prüfungen aus `docs/BETRIEB.md` ausführen.

## Pull Request

Beschreibe Problem, Lösung, Tests und mögliche Auswirkungen auf USB-Hardware,
Konfiguration oder bestehende Installationen. Bei visuellen Änderungen gehören
eine native 170×320-Vorschau und die Prüfung auf einem echten TFT dazu.

Neue Abhängigkeiten brauchen einen klaren Nutzen. Das Projekt bleibt bewusst
ohne Prometheus, Datenbank oder allgemeinen Dashboard-Editor.
