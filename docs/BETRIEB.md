# Entwicklung und Betrieb

Diese Anleitung trennt Entwicklung, Installation und Deployment bewusst. Das
Repository enthält keine Zugangsdaten und verändert ohne ausdrücklichen Aufruf
kein Live-System.

Für eine neue Installation aus einem veröffentlichten Archiv ist die
[geführte Installationsanleitung](INSTALLATION.md) maßgeblich. Dieses Dokument
beschreibt Entwicklung, manuelles Deployment und laufende Wartung.

## Voraussetzungen

- Linux auf x86-64; vollständig geprüft mit Ubuntu 24.04 in einem
  privilegierten Proxmox-LXC
- Ubuntu 22.04 und direkte Ubuntu-Installation werden vom Installer akzeptiert,
  benötigen aber noch unabhängige vollständige Installationstests
- Node.js 24 und npm 11
- USB-Zugriff auf das AceMagic-S1-Display (`04d9:fd01`)
- optional der LED-Controller (`1a86:7523`)
- für native npm-Module: `build-essential`, `libudev-dev`,
  `libusb-1.0-0-dev`, `libcairo2-dev`, `libpango1.0-dev`, `libjpeg-dev`,
  `libgif-dev` und `librsvg2-dev`

Node.js wird auf dem Referenzsystem aus dem offiziellen NodeSource-Repository
`node_24.x` installiert. Die versionierte APT-Definition liegt unter
`ops/apt/nodesource-node24.sources`; ihr Schlüssel gehört systemweit nach
`/usr/share/keyrings/nodesource.gpg`. Es werden keine globalen npm-Pakete
benötigt.

## Entwicklungsprüfung

```bash
cd s1panel
npm ci
npm test
npm run render:instrument
npm run render:designs

cd gui
npm ci
npm run build
```

Abhängigkeiten entstehen ausschließlich in den ignorierten
`node_modules`-Verzeichnissen. `npm ci` verwendet die versionierten Lockfiles.

## Konfiguration

1. `s1panel/config.instrument.example.json` nach `/var/lib/s1panel/config.json`
   kopieren und USB-Gerät, API-Ziel und optionale Gastproben anpassen.
2. Proxmox-Zugang ausschließlich in `/etc/s1panel/credentials.env` ablegen:

   ```text
   S1PANEL_PVE_URL=https://pve.example.internal:8006
   S1PANEL_PVE_TOKEN=PVEAPIToken=BENUTZER!TOKEN=SECRET
   ```

3. `credentials.env` auf `root:root` und Modus `0600` setzen. Das Token braucht
   nur `Sys.Audit`, `Datastore.Audit` und `VM.Audit`.
4. Eine interne CA als `/etc/s1panel/pve-root-ca.pem` ablegen oder in der
   Konfiguration auf den passenden CA-Pfad verweisen. TLS-Prüfung bleibt aktiv.

Die Gallery und `/healthz` binden standardmäßig nur an `127.0.0.1:8686`.
Zugriff erfolgt per SSH-Tunnel:

```bash
ssh -L 8686:127.0.0.1:8686 PANEL-HOST
```

Die Gallery besitzt bewusst keine Benutzerverwaltung. Wer sie erreichen kann,
kann das aktive Design wechseln. Eine Bindung an das LAN ist deshalb nur in
einem vertrauenswürdigen Netz mit passender Firewallregel vorgesehen; für eine
Internetfreigabe ist die Anwendung nicht ausgelegt.

## System vorbereiten

Die Helfer sind absichtlich getrennt, weil Hardware-Host und Panel-System bei
einem Container nicht dasselbe System sein müssen:

```bash
# auf dem Host mit den echten USB-Geräten
sudo ./ops/setup-hardware-access

# im Panel-System nach dem ersten Deployment
sudo ./ops/setup-service

# optionales SSH-/UFW-Hardening; Admin-Netz muss bewusst gesetzt werden
sudo S1PANEL_ADMIN_NETWORK=ADMIN-NETZ/CIDR ./ops/setup-network-hardening
```

`setup-hardware-access` legt die feste Gruppe `acemagic-s1` mit GID 990 an und
installiert nur `/etc/udev/rules.d/70-acemagic-s1.rules`. Bei einem Container
muss dieselbe GID innerhalb des Containers vorhanden sein. `setup-service`
erstellt das nicht anmeldbare Dienstkonto `s1panel`, installiert die
systemd-Unit, bewahrt vorhandene lokale systemd-Drop-ins und verändert keine
Secrets. Eine bestehende
`/etc/s1panel/config.json` wird beim ersten Lauf als Migration nach
`/var/lib/s1panel` kopiert und danach entfernt, damit es nur eine maßgebliche
Laufzeitkonfiguration gibt. Der Helfer startet den Dienst nicht automatisch.

## Release bauen und deployen

```bash
./ops/build-release
sudo ./ops/deploy-release \
  dist/acemagic-s1-display-VERSION-REVISION.tar.gz \
  VERSION-REVISION
```

Der Builder arbeitet in einem temporären Verzeichnis, entfernt es auch bei
Fehlern und schreibt Archiv und passende `.sha256`-Datei nach `dist/`. Im
Archiv befinden sich Laufzeitcode, Production-Abhängigkeiten, Gallery-Build,
Themes, kleine Vorschauen, Installer und Betriebsdokumentation – keine Tests,
Konzepte oder lokalen Zugangsdaten. Die `RELEASE`-Datei verknüpft das Paket mit
dem exakten Git-Quellstand.

Das Deployment entpackt zunächst in ein neues Verzeichnis unter
`/opt/acemagic-s1-display/releases`, prüft Pfade und native Module und schaltet
erst dann den symbolischen Link `current` atomar um. Scheitern Dienst oder
Healthcheck, wird der vorherige Link automatisch wiederhergestellt.

## Abnahme und Rollback

Eine Änderung am Instrument wird zuerst vollständig außerhalb des Live-
Containers geprüft:

```bash
cd s1panel
npm test
node scripts/render_instrument_motion.js \
  ../proofs/processed/instrument-candidate.gif
```

Der zweite Befehl schreibt bewusst eine getrennte, von Git ausgeschlossene
Kandidatenvorschau. Er überschreibt weder die veröffentlichte Vorschau noch das
aktive Display. Erst wenn Bild und Tests passen, wird aus einem sauberen Commit
ein Kandidatenarchiv gebaut. Ein Hardwaretest auf dem TFT ist ein eigener,
ausdrücklich freizugebender Schritt: Vorher werden aktives Release und
Konfiguration gesichert; anschließend werden Healthcheck, Journal und Display
kontrolliert. Ohne Abnahme wird der bisherige `current`-Link wieder aktiviert.

Der vorhandene Produktivstand bleibt während der lokalen Prüfung vollständig
unangetastet. Ein Git-Branch oder Draft-PR verändert CT 102 ebenfalls nicht.

```bash
curl --fail http://127.0.0.1:8686/healthz
systemctl show s1panel -p ActiveState -p MainPID -p NRestarts
journalctl -u s1panel --since '-10 minutes' --no-pager
sudo ./ops/verify-designs-live
```

`verify-designs-live` aktiviert alle 13 Designs nacheinander, verlangt einen
bestätigten Vollbild-Frame und kontrolliert Healthcheck, PID und Journal. Bei
einem Fehler wird `Instrument` wieder aktiviert.

Für einen manuellen Rollback wird `current` auf das vorherige Release gesetzt
und `s1panel` neu gestartet. Produktiv sollten nur das aktive Release und ein
direkter Rollback erhalten bleiben; ältere Stände gehören in eine externe
Sicherung.

## Wartung

- Sicherheitsupdates regelmäßig installieren und danach Dienst, USB und
  Healthcheck prüfen.
- Proxmox-Token und Gastschlüssel nach eigener Richtlinie rotieren.
- `npm audit` für Laufzeit und Gallery sowie die GitHub-CI beobachten.
- Die Gallery ohne zusätzliche Authentifizierung niemals ins Internet stellen;
  eine LAN-Bindung nur mit bewusst begrenzter Firewallregel verwenden.
- Ein Ubuntu-22.04-System vor Ende der Standardwartung 2027 durch einen frisch
  aufgebauten Ubuntu-24.04-Container ersetzen; kein riskantes In-place-Upgrade
  allein für dieses Panel durchführen.

## Gast-RAM ohne Monitoring-Stack

Für eine laufende QEMU-VM kann die eingeschränkte Probe installiert werden:

```bash
sudo ./ops/setup-guest-memory-probe \
  --user BESTEHENDER_BENUTZER \
  --public-key /pfad/zu/guest-memory-ed25519.pub
```

Der Helfer legt weder Pakete noch Benutzer an. Der Schlüssel erhält `restrict`
und einen festen Befehl, der ausschließlich `MemTotal` und `MemAvailable`
liefert. Ohne Probe erscheint für die betroffene laufende VM bewusst `N/A`;
das Panel selbst bleibt vollständig funktionsfähig.
