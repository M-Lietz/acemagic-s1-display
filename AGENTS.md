# Projektregeln

- Projektdokumentation und Übergaben werden auf Deutsch gepflegt.
- Das Display wird nativ für 170×320 Pixel gestaltet; Lesbarkeit auf dem echten TFT hat Vorrang vor der hochauflösenden Vorschau.
- Produktiver Code enthält keine Proxmox-Tokens, Passwörter oder andere Secrets. Lokale Zugangsdaten liegen ausschließlich in ignorierten Dateien oder systemd-Credentials.
- Neue Displaydaten erhalten eine eindeutige Quelle und Einheit. Host-, VM- und Containerwerte dürfen nicht unbeschriftet vermischt werden.
- Abhängigkeiten werden sparsam eingesetzt und per Lockfile reproduzierbar installiert.
- Vor Live-Änderungen sind Backup, Healthcheck und Rollback zu dokumentieren und zu testen.
- Änderungen werden in kleinen, fachlich geschlossenen Commits festgehalten.
- Für Merlin und seine Agenten gilt das Ampelmodell: kleine geprüfte Einzeländerungen direkt auf `main`; größere, riskante oder experimentelle Arbeit im Branch; ein eigener Worktree nur bei echter paralleler Arbeit.
- Das öffentliche Repository darf seinen geschützten `main` behalten. Wenn GitHub deshalb einen Direkt-Push ablehnt, wird ohne Umgehung ein normaler Branch mit Pull Request verwendet.
- Externe Mitwirkende arbeiten weiterhin über Branch und Pull Request nach `CONTRIBUTING.md`.
- Niemals Force-Push auf `main`. Veröffentlichungen, Hardwareeinsatz und produktive Änderungen bleiben getrennt freigabepflichtig.

