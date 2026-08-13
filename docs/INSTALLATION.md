# Installation

Diese Anleitung führt von einem frischen Ubuntu-System bis zum laufenden
AceMagic-S1-Display. Praktisch vollständig geprüft ist Ubuntu 24.04 auf `amd64`
in einem dedizierten privilegierten Proxmox-LXC. Der Installer akzeptiert auch
Ubuntu 22.04 und eine direkte Ubuntu-Installation; für diese Varianten fehlen
noch unabhängige vollständige Installationstests.

## Was installiert wird

Der Installer nennt jeden Schritt und verwendet feste Orte:

| Bestandteil | Quelle | Ort |
|---|---|---|
| Node.js 24 | offizielles NodeSource-Repository `node_24.x` | `/usr/bin/node` |
| USB-Laufzeitbibliotheken | vorhandene Ubuntu-APT-Quellen | systemweit |
| Anwendung | geprüftes GitHub-Release | `/opt/acemagic-s1-display` |
| veränderbare Konfiguration | lokale Eingabe | `/var/lib/s1panel/config.json` |
| Proxmox-Zugang und CA | lokale Eingabe | `/etc/s1panel` |
| systemd-Dienst | Release | `/etc/systemd/system/s1panel.service` |

Es werden keine globalen npm-Pakete installiert. Die benötigten
Production-Abhängigkeiten liegen bereits im Release. Temporäre Schlüssel- und
Installationsdateien werden nach erfolgreicher Verwendung entfernt.

Falls Node.js 24 fehlt, lädt der Installer den offiziellen NodeSource-Schlüssel
über HTTPS und akzeptiert ihn nur mit dem fest hinterlegten Fingerprint
`6F71 F525 2828 41EE DAF8 51B4 2F59 B5F9 9B1B E0B4`. Erst danach wird der
Schlüssel unter `/usr/share/keyrings/nodesource.gpg` installiert. Ändert
NodeSource den Schlüssel, bricht die Installation sicher ab und der erwartete
Fingerprint muss nach einer bewussten Prüfung im Projekt aktualisiert werden.

## 1. Release laden und prüfen

Auf der Seite [Releases](https://github.com/M-Lietz/acemagic-s1-display/releases)
das Archiv für die gewünschte Version und die gleichnamige `.sha256`-Datei
laden. Beide Dateien müssen im selben Verzeichnis liegen.

```bash
sha256sum --check acemagic-s1-display-*.tar.gz.sha256
tar -xzf acemagic-s1-display-*.tar.gz
cd acemagic-s1-display
```

Nicht das automatisch von GitHub erzeugte „Source code“-ZIP verwenden: Es
enthält bewusst keine fertig gebauten nativen Laufzeitmodule.

## 2. Read-only-Token in Proxmox anlegen

Diese Befehle laufen einmalig als `root` auf dem Proxmox-Host. Sie erzeugen
einen eigenen technischen Benutzer und einen getrennten Token mit ausschließlich
lesenden Rechten:

```bash
pveum user add s1panel@pve --comment "AceMagic S1 Display"
pveum role add S1PanelAudit --privs "Sys.Audit Datastore.Audit VM.Audit"
pveum acl modify / --users s1panel@pve --roles S1PanelAudit
pveum user token add s1panel@pve display --privsep 1
pveum acl modify / --tokens 's1panel@pve!display' --roles S1PanelAudit
```

Existiert Benutzer oder Rolle bereits, wird der jeweilige `add`-Befehl
übersprungen. Proxmox zeigt das Token-Geheimnis nur einmal an. Es gehört nicht
in Git, Screenshots oder Dokumentation. Der Installer speichert es später als
`root:root` mit Dateimodus `0600`.

## 3A. Direkte Installation auf Ubuntu

Wenn Ubuntu direkt auf dem AceMagic S1 läuft, genügt:

```bash
sudo ./install
```

Der Installer richtet die udev-Regel für LCD `04d9:fd01` und LED-Controller
`1a86:7523` selbst ein, erkennt sichtbare Geräte und fragt Proxmox-URL, Knoten,
Storage, Zertifikat und Token ab. Das Token wird bei der Eingabe nicht gezeigt.

## 3B. Installation in einem Proxmox-LXC

Für den vom überwachten System unabhängigen Betrieb eignet sich ein kleiner
Ubuntu-24.04-LXC mit 1 CPU, 512 MiB RAM und 4 GiB Disk. Praktisch geprüft ist
derzeit ein privilegierter Container. Ein unprivilegierter LXC ist noch nicht
freigegeben. Der Container sollte automatisch mit Proxmox starten. USB wird auf
dem Proxmox-Host durchgereicht; der Installer im Container verändert niemals
die Hostkonfiguration.

Zuerst auf dem Proxmox-Host die udev-Regel aus dem entpackten Release anwenden:

```bash
sudo ./ops/setup-hardware-access
```

Danach den Container stoppen und seiner Datei `/etc/pve/lxc/CTID.conf` diese
Gerätefreigaben hinzufügen. Die tatsächlich vorhandenen `hidraw`- und
`ttyUSB`-Nummern vorher unter `/dev` prüfen:

```text
lxc.cgroup2.devices.allow: c 238:* rwm
lxc.cgroup2.devices.allow: c 188:* rwm
lxc.cgroup2.devices.allow: c 189:* rwm
lxc.mount.entry: /dev/hidraw0 dev/hidraw0 none bind,optional,create=file
lxc.mount.entry: /dev/hidraw1 dev/hidraw1 none bind,optional,create=file
lxc.mount.entry: /dev/ttyUSB0 dev/ttyUSB0 none bind,optional,create=file
lxc.mount.entry: /dev/bus/usb dev/bus/usb none bind,optional,create=dir
```

Diese manuelle Durchreichung entspricht dem praktisch geprüften Referenzaufbau.
Neuere Proxmox-Versionen bieten zusätzlich native `dev[n]`-Einträge; diese
Variante ist für dieses Projekt noch nicht auf echter Hardware geprüft. Die
Freigabe von `/dev/bus/usb` ist im Referenzaufbau für den von `node-hid`
verwendeten `libusb`-Zugriff nötig. Sie sollte nur in einem eigenen
Panel-Container verwendet werden. Das Dienstkonto im Container erhält trotzdem
nur die über udev und Gruppe `acemagic-s1` freigegebenen Geräte.

Das Proxmox-Root-Zertifikat kann sicher in den Container kopiert werden:

```bash
pct push CTID /etc/pve/pve-root-ca.pem /root/pve-root-ca.pem
```

Nach dem Start des Containers das Release dorthin übertragen, entpacken und
ausführen:

```bash
sudo ./install --ca /root/pve-root-ca.pem
```

Ist USB noch nicht sichtbar, kann die Installation mit `--no-start`
vorbereitet werden. Geräte zeigt anschließend dieser Befehl:

```bash
sudo node /opt/acemagic-s1-display/current/s1panel/scripts/detect_devices.js
```

Danach den erkannten LCD-Pfad in `/var/lib/s1panel/config.json` eintragen und
den Dienst starten:

```bash
sudo systemctl start s1panel
```

## 4. Prüfung und Gallery

```bash
systemctl is-active s1panel
curl --fail http://127.0.0.1:8686/healthz
journalctl -u s1panel --since '-10 minutes' --no-pager
```

Die Gallery bleibt standardmäßig sicher auf `127.0.0.1:8686`. Zugriff vom
Arbeitsplatz erfolgt per SSH-Tunnel:

```bash
ssh -L 8686:127.0.0.1:8686 PANEL-HOST
```

Danach ist sie unter `http://localhost:8686` erreichbar. Eine LAN-Freigabe
ohne zusätzliche Anmeldung sollte nur in einem vertrauenswürdigen Netz und mit
einer passenden Firewallregel erfolgen. Eine Internetfreigabe ist nicht
vorgesehen.

## Updates und Rückweg

Für ein Update das neue Release prüfen, entpacken und wieder `sudo ./install`
ausführen. Bestehende Konfiguration, Token und CA bleiben unverändert. Das neue
Release wird erst vollständig kopiert und dann atomar aktiviert. Bei einem
fehlgeschlagenen Dienststart oder Healthcheck stellt der Installer den
vorherigen Release-Zeiger wieder her.

Installierte Releases liegen unter `/opt/acemagic-s1-display/releases`. Für
einen manuellen Rückweg zeigt `readlink -f /opt/acemagic-s1-display/current`
den aktiven Stand. Produktiv sollten nur der aktive und ein geprüfter direkter
Rückfallstand aufbewahrt werden.

## Automatisierte Installation

Ohne Terminal müssen Konfiguration und Secrets ausdrücklich übergeben werden:

```bash
sudo ./install \
  --config /sicherer/pfad/config.json \
  --credentials /sicherer/pfad/credentials.env \
  --ca /sicherer/pfad/pve-root-ca.pem \
  --no-start
```

Vorlagen sind `s1panel/config.instrument.example.json` und die beiden Zeilen
`S1PANEL_PVE_URL=...` sowie `S1PANEL_PVE_TOKEN=...`. Übergabedateien nach der
Installation sicher entfernen oder in einer geschützten Sicherung ablegen.
