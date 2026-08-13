# Sicherheitsrichtlinie

## Unterstützte Versionen

Sicherheitskorrekturen werden für die jeweils aktuelle `0.1.x`-Version auf dem
Standardbranch bereitgestellt. Ältere Entwicklungsstände werden nicht separat
gepflegt.

## Schwachstellen melden

Bitte keine Sicherheitslücke als öffentliches Issue veröffentlichen. Nutze im
GitHub-Repository **Security → Report a vulnerability**, damit Details zunächst
vertraulich bleiben.

Bitte nenne betroffene Version, Auswirkungen, reproduzierbare Schritte und –
falls bekannt – eine mögliche Abhilfe. Zugangsdaten, Tokens, private Schlüssel
und produktive Messwerte dürfen nicht mitgesendet werden.

## Sicherheitsmodell

- Die Gallery bindet ohne zusätzliche Authentifizierung nur an Loopback.
- Proxmox wird mit einem getrennten Read-only-Token abgefragt.
- Secrets liegen außerhalb des Repositorys in root-geschützten Dateien.
- Der Dienst läuft ohne Login, ohne Linux-Capabilities und mit systemd-Sandbox.
- USB-Zugriff wird über eine eigene Gruppe auf genau die unterstützten Geräte
  begrenzt.
