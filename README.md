# NovaSwarm

**NovaSwarm** egy **100%-ban autonóm**, önfejlesztő személyi AI-ágens raj (Swarm), OpenAI-kompatibilis AI Gateway, univerzális DevOps & Adat Munkapad, hibrid Második Agy tudástár, privát hálózati/fürt (Cluster) menedzser és teljes Linux/Raspberry Pi rendszerműveleti operációs rendszer — helyi LAN hálózati Web UI-ra és távoli Telegram vezérlésre optimalizálva.

**Hivatalos GitHub repository:** https://github.com/ngabika/NovaSwarmNextGenHydrogen

---

### Alapértelmezett Biztonságos Működés (Secure-by-Default)

Az alkalmazás alapértelmezett állapota biztonságos konfigurációval indul, hogy se helyi hálózaton, se Telegramon ne nyíljon ki akaratlanul parancsfuttatás vagy adminisztráció:
- `webAuthEnabled: true` — a hálózati (LAN) hozzáféréshez jelszavas vagy session cookie-s belépés szükséges. Lokális (`127.0.0.1`) első indításkor egy kattintással beállítható a mester jelszó.
- `hostPermissionsGranted: false` — gazdagép parancsfuttatás és fájlműveletek alapból letiltva, csak kifejezett operátori engedéllyel kapcsolhatók be.
- `fullAutonomousMode: false` — destruktív rendszerparancsok (csomagtörlés, `rm -rf`, tűzfal, partíció, `curl|sh`) jóváhagyást kérnek.
- `guardrailsEnabled: true` — kimeneti titokmaszkolás és prompt-injection védelem aktív.
- `channelPairingRequired: true` — Telegram bot alapból **fail-closed** (`telegramAllowedChatIds` vagy `telegramChatId` nélkül minden üzenetet elutasít).
- `supervisorStrictness: 'balanced'` — szigorúbb ellenőrzés, `nightShiftEnabled: false` és `autonomousKanbanWorkerEnabled: false` alapértelmezéssel.

### „Teljes autonómia” Profil, Időkorlátok és Sudo (`NOPASSWD`)

A Web UI **Beállítások** oldalán található 1-kattintásos **„Teljes autonómia” profil** operátori jelszó és figyelmeztető megerősítés után együtt kapcsolja be a gazdagép-jogosultságot, a teljes autonóm módot és a parancsfuttatási jóváhagyásmentességet (kikapcsoláskor pedig visszaállítja a korábbi kapcsolóállapotokat). A profil mellett is aktív marad a Telegram chat-ID engedélylista, a webes belépési jelszó, a `/stop` vészleállító (amely azonnali `SIGKILL`-lel lelövi a futó host folyamatfát) és az ágens vezérlősík-tiltás.

- **Konfigurálható `exec` időkorlátok:** `execTimeoutSeconds` (5–3600 mp, alap `12`) rövid parancsokhoz, valamint `longExecTimeoutSeconds` (30–7200 mp, alap `600`) hosszú telepítésekhez (`apt`, `npm`, `vite build`, OS frissítés).
- **Jelszó nélküli `sudo` (`NOPASSWD`) a Raspberry Pi-n:** A háttérfolyamat nem interactive módban (`sudo -n`) fut, és induláskor + Telegram `/sudo` paranccsal + a **Rendszer & Költöztetés** oldalon ellenőrzi a jogosultságot. Beállítása a gazdagépen:
  ```bash
  sudo visudo -f /etc/sudoers.d/novaswarm
  # Add hozzá:
  <felhasználónév> ALL=(ALL) NOPASSWD:ALL
  ```
- **Napi automatikus Phoenix mentés:** Teljes autonómiában a rendszer naponta automatikus Phoenix pillanatképet készít, és figyelmeztet, ha a legutóbbi mentés 24 óránál régebbi.

### „Totális autonómia” Mód & 3 Sérthetetlen Garancia

A **Beállítások** piros „Totális autonómia” kártyájával és a dedikált **Autonómia központ** nézettel kapcsolható be a teljes önálló működés (cél -> terv -> végrehajtás -> verifikáció -> reflexió ciklus, beállítás-adminisztráció, belső világmodell, memória-higiénia, heti önértékelő benchmark és kereshető döntési napló). A tulajdonosi szabadság mellett **3 sérthetetlen garancia** aktív:
1. **Hamisításbiztos append-only audit-lánc + napi Telegram anchor:** Az ágensek nem törölhetik és nem vághatják meg az auditnaplót; a HMAC-SHA256 fej-hash naponta Telegramra rögzíthető.
2. **Többcsatornás vészleállítás (`/stop` LOCKDOWN):** Aktiválható Telegramról (`/stop`), CLI-ből (`lockdown`), Web UI-ból vagy zárfájllal (`/etc/novaswarm/LOCKDOWN`). Feloldani kizárólag a hitelesített tulajdonosi jelszóval lehet.
3. **Automatikus biztonsági visszaállítási pontok + Security Watchdog:** Kockázatos/beállítás-módosítás előtt automatikus pillanatkép készül, és a 15 mp-es `/healthz` próba hibája esetén automatikusan visszaáll.

- **Öngyógyító üzemmódok & Külső védelem:** Napi felhő keret elérésekor automata átállás helyi Ollamára; 3 hiba után feladat Circuit Breaker nyit; minden külső szöveg `[NEM MEGBÍZHATÓ KÜLSŐ TARTALOM]` jelölést kap, és a Kritikus Felülvizsgáló blokkolja a külső tartalomból érkező `settings_admin` / injekciós kísérleteket.
- **Hálózati Felderítés (RFC1918) & 12-Adapteres Eszközvezérlő:** Kizárólag privát LAN IP-kre szkennel, 12 beépített adapterrel (Proxmox, TrueNAS, Synology, SSH Linux/Pi, Router/UniFi/OpenWrt/MikroTik, Hue, Tasmota, Shelly, MQTT, Home Assistant, Docker API, Systemd). Eszközjelszót soha nem találgat — hiányzó adathoz belépési kártyát hoz létre, a végrehajtásokat pedig visszavonási naplóval követi.
- **Telegram parancsok:** `/stop [ok]`, `/visszaallit [n]`, `/autonomia`, `/eszkozok`.

---

## Moduláris Felépítés (Mag + Opcionális Modulok)

A NovaSwarm funkcionalitása két rétegre oszlik:

1. **Mag (Core):**
   - **Központi, feladat-alapú AI Router (`server/providers/router.ts`):** Egyetlen belépési pont minden felhő és helyi hívásra; többkulcsos széf tömeges bevitellel és Google Cloud `projectId` tudatosítással, kulcsonkénti 24 órás modellfelderítéssel (`keyModelMatrix`), terheléselosztással (80% RPM/TPM előreváltás + párhuzamossági szemafór), `Modell -> Kulcs1..N -> Modell2 -> Helyi Ollama (degradált mód + szigorú verifikáció) -> Várólista` lánccal és Telegram `/kulcsok` paranccsal.
   - **Hardver-érzékeny Helyi Ollama Csomag (`config/ollama-models.json` + `ollamaSelector.ts`):** Automatikusan felméri a CPU (AVX2/NEON), RAM, swap/zram, GPU VRAM és szabad lemez/SD állapotot; külön optimalizál Raspberry Pi (2 GB, SD-kímélő, szekvenciális mutex), asztali CPU és GPU munkaállomás profilokra, offline módban késlelteti a letöltést, és méri a valós `tok/s` sebességet.
   - Raj Chat (SSE streaming, elágaztatás, visszatekerés, Red-Team elemző) + OpenAI-kompatibilis `/v1/*` proxy
   - Memória & Tudástár (`novaswarm.sqlite` WAL + FTS5, Obsidian Vault, rétegzett hot/warm/cold memória)
   - Hitelesítés, `.secrets.vault.json` (`.secrets.key` + scrypt + AES-256-GCM), HMAC-SHA256 audit-lánc, Telegram csatorna-engedélylista
2. **Opcionális Modulok (Beállításokban vagy menüből kapcsolhatók):**
   - **Munkapad & Fejlesztés:** Mélykutatás, Prompt Aréna, SQL böngésző, Diff, DevOps CVE/Regex/Docker/OpenAPI, Data Wrangler & QR/SVG eszközök
   - **Életvitel & Automatizálás:** Munkafolyamatok, Webhookok, Naptár/Email/RSS, Okosotthon (Home Assistant/MQTT), Költségvetés, Csomagkövető, Kamra & Okmányszéf
   - **Rendszer & Költöztetés (Opt-in):** PTY terminál, kernel/bwrap homokozó, Docker/systemd kezelő, Pi GPIO/I2C/kamera/CUPS, LAN szkenner, SSH 1-kattintásos költöztető, Multi-Node Fürt

*(Megjegyzés: a B3–B8 laborok egyes speciálisabb eszközei sablon-/számológép alapú vagy helyi parancssori segédeszközök — lásd részletesen az `AUDIT.md` funkció-mátrixát.)*

---

## Főbb Nézetek

### 1. Napi munka
- **Áttekintő**: Rendszerállapot, időjárás, költség-becslés, közelgő teendők és gyorsindítók.
- **Csapat Chat**: Valós idejű AI beszélgetés több ágenssel, megállítással, válasz-ellenőrzéssel (Red-Team) és előzmény-visszatekeréssel.
- **Munkapad**: Kutatás, kód-összehasonlítás, API tesztelő, adatszerkesztő, dokumentum-közjegyző és QR/diagram generátor.
- **Terminál**: Böngészőből elérhető valódi Linux parancssor (csak gazdagép-engedéllyel).

### 2. Tudás & AI
- **Ágensek & Csapat**: AI szerepek, hierarchia, automatikus küldetések, Éjszakai Műszak és Kanban tábla.
- **Memória & Tudástár**: Tartós jegyzetek, SQLite FTS5 kereső, éjszakai memória-rendszerezés és Obsidian integráció.
- **AI Modellek & Költség**: Modellválasztó, költségkeret és havi előrejelzés.
- **Képességek & Eszközök**: MCP szerverek, skillek, mini-app építő, API mock és tudásstúdió.

### 3. Mindennapok & Otthon
- **Életvitel & Automatizálás**: Szabályok, naptár, emailek, RSS hírek, okosotthon, kamra, kiadások, utazási csomaglista és okmányszéf.

### 4. Rendszer
- **Rendszer & Költöztetés**: Hardver-adaptív optimalizálás, 1-kattintásos SSH költöztető új gépre, Phoenix biztonsági mentés, LAN eszközök és fürt.
- **Autonómia központ**: A 3 sérthetetlen garancia élő állapota, LOCKDOWN vészleállítás/feloldás, Watchdog próba, felhő keret + Circuit Breaker, célciklus, RFC1918 LAN felderítés & 12-adapteres eszközvezérlő, biztonsági visszaállítási pontok, világmodell és kereshető döntési napló.
- **Beállítások**: Belépési jelszó, Telegram csatorna, API kulcsok széfje, „Totális autonómia” piros kártya, vészleállító és modulok engedélyezése.

---

## Követelmények (Linux / Raspberry Pi ARM64)

- Debian 12/13 (Trixie), Ubuntu 22.04+, Fedora vagy Arch Linux (`x86_64` vagy `aarch64` / Raspberry Pi)
- **Node.js 22.5+** (kötelező a beépített `node:sqlite` modul miatt; az `install.sh` automatikusan telepíti a Node.js 22 LTS-t, ha régebbi van fent)
- `git`, `curl`, `build-essential` (`python3`, `make`, `g++` a `node-pty` fordításhoz)
- Opcionális csomagok: `bubblewrap`, `espeak-ng`, `ollama`, `chromium`, `sqlite3`

---

## Telepítés Parancssorból

```bash
git clone https://github.com/ngabika/NovaSwarmNextGenHydrogen.git
cd NovaSwarmNextGenHydrogen
chmod +x install.sh update.sh uninstall.sh
./install.sh
```

A `install.sh` **zéró kézi lépéses**: automatikusan telepíti a `bubblewrap`-ot, függőségeket, buildet, systemd szolgáltatást; `visudo -cf` ellenőrzéssel hozza létre a `/etc/sudoers.d/novaswarm` (`0440`) fájlt; beállítja az operátori jelszót az egyszeri setup-kóddal (kézi másolás nélkül); opcionálisan bekéri a Telegram bot tokent és chat ID-t; bekapcsolja a Teljes és Totális autonómiát; majd zöld/piros önellenőrzéssel zár (`/healthz`, `sudo -n true`, `bwrap`, első Phoenix pillanatkép).

### Tiszta újratelepítés (a jelenlegi felhasználó saját mappájába)

```bash
sudo systemctl stop novaswarm 2>/dev/null || true
sudo systemctl disable novaswarm 2>/dev/null || true
sudo rm -f /etc/systemd/system/novaswarm.service
sudo systemctl daemon-reload
pkill -f "NovaSwarmNextGenHydrogen" 2>/dev/null || true
cd "$HOME" && rm -rf "$HOME/NovaSwarmNextGenHydrogen" && git clone https://github.com/ngabika/NovaSwarmNextGenHydrogen.git && cd NovaSwarmNextGenHydrogen && chmod +x install.sh update.sh uninstall.sh && ./install.sh
```

Telepítés után nyisd meg böngészőből:
- Lokálisan: `http://localhost:3000` (első belépéskor állítsd be a kezelői jelszót!)
- Helyi hálózatról (LAN): `http://<SZERVER-IP>:3000`

---

## Fejlesztés, CLI és Tesztelés

```bash
# Függőségek telepítése (egységesen npm + package-lock.json)
npm ci

# Fejlesztői szerver indítása (3000-es port)
npm run dev

# Típusellenőrzés és production build
npm run lint && npm run build

# Teljes egységteszt-csomag futtatása
npm test

# Terminál CLI használata
npm run cli -- status
npm run cli -- doctor
npm run cli -- ollama-reselect
npm run cli -- mission "Elemezd a rendszer terhelését"
npm run cli -- autonomy-status
npm run cli -- lockdown "Kézi vészleállítás"
npm run cli -- unlock
npm run cli -- restore-security 1
```
