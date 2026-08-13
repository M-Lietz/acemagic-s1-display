# Projektregeln

- Projektdokumentation und Übergaben werden auf Deutsch gepflegt.
- Das Display wird nativ für 170×320 Pixel gestaltet; Lesbarkeit auf dem echten TFT hat Vorrang vor der hochauflösenden Vorschau.
- Produktiver Code enthält keine Proxmox-Tokens, Passwörter oder andere Secrets. Lokale Zugangsdaten liegen ausschließlich in ignorierten Dateien oder systemd-Credentials.
- Neue Displaydaten erhalten eine eindeutige Quelle und Einheit. Host-, VM- und Containerwerte dürfen nicht unbeschriftet vermischt werden.
- Abhängigkeiten werden sparsam eingesetzt und per Lockfile reproduzierbar installiert.
- Vor Live-Änderungen sind Backup, Healthcheck und Rollback zu dokumentieren und zu testen.
- Änderungen werden in kleinen, fachlich geschlossenen Commits festgehalten. Pushes und Veröffentlichungen erfolgen nur nach ausdrücklicher Freigabe.

