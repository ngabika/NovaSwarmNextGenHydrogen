# NovaSwarm

**NovaSwarm** egy **100%-ban autonóm**, önfejlesztő személyi AI-ágens raj (Swarm), OpenAI-kompatibilis AI Gateway, univerzális DevOps & Adat Munkapad, hibrid Második Agy tudástár, privát hálózati/fürt (Cluster) menedzser és teljes Linux/Raspberry Pi rendszerműveleti operációs rendszer — helyi LAN hálózati Web UI-ra és távoli Telegram vezérlésre optimalizálva.

**Hivatalos GitHub repository:** https://github.com/ngabika/NovaSwarmNextGenHydrogen

---

## Alapértelmezett Működési Elv (Zero Friction + Teljes Autonómia)

- **Nulla alapértelmezett biztonsági korlát (Single-Owner LAN + Telegram)**: Az alkalmazás kifejezetten saját hálózaton futó, egyfelhasználós privát példányhoz készült:
  - `webAuthEnabled: false` — nincs bejelentkezési fal a helyi hálózaton (`http://<LAN-IP>:3000`).
  - `hostPermissionsGranted: true` — a gazdagép parancsfuttatása és fájlműveletei azonnal elérhetők.
  - `guardrailsEnabled: false` (PII/Secret/Injection blokkolás kikapcsolva alapból, igény szerint bekapcsolható).
  - `channelPairingRequired: false` — nincs 6 jegyű párosítási akadály.
  - `supervisorStrictness: 'permissive'` — engedékeny felügyelet.
- **100% Teljes Autonóm Mód (`fullAutonomousMode: true`)**: Az ágensek **soha nem kérdeznek rá** engedélyre destruktív vagy rendszer-szintű parancsok előtt — önállóan megtervezik, homokozva/végrehajtva elvégzik a kért munkát, az Éjszakai Műszak (`Night Shift`) pedig háttérben feldolgozza a Kanban feladatokat. *(Igény esetén a Beállításokban bármikor visszakapcsolható a manuális jóváhagyás.)*

---

## Teljes Funkciótérkép

### 1. Áttekintő Vezérlőpult, Téma & Gyorsbillentyűk
- **Áttekintő Irányítópult (`OverviewDashboard`)**: Élő CPU/RAM/hőmérséklet telemetria, kulcs nélküli **Open-Meteo élő időjárás**, **Heti Időkapszula (`Ú157`)**, **Éjszakai Műszak (`Ú61`)** állapotkártya, költség-előrejelzés, naptár, RSS/Release hírek, napi fókusz összegzés és 1-kattintásos **Autonóm Küldetés** / **Raj Auto-Doktor**.
- **Sötét / Világos Téma & Privát Adatmaszkolás (`Ú158`)**: A fejlécben azonnal kapcsolható Sötét/Világos mód, valamint „Szem” gomb az API kulcsok és összegek elmosásához (pl. képernyőmegosztás előtt).
- **Parancspaletta (`Ctrl+K` / `⌘K`) & Billentyűparancsok (`?`)**: Gyorsnavigáció (`g` majd `o`/`c`/`w`/`a`/`m`/`s`) az összes nézet között.
- **Telepíthető PWA**: Web App Manifest, offline shell, mobil alsó navigációs sáv és böngészős értesítések.

### 2. Raj Chat, Red-Team, Time-Travel & Multimédia
- **SSE Token Streaming + Megállító Gomb + Elágaztatás (`Fork`) + Idővonal Visszapörgetés (`Rewind`)**: Bármely üzenetnél visszatekerheted a beszélgetést pontosan arra a pontra (`POST /api/v3/chat/rewind`).
- **Red-Team Ördög Ügyvédje Kritikus (`Ú63`)**: 1-kattintásos adverzariális bírálat bármely ágens-válaszra (`POST /api/v3/chat/redteam`) logikai rések és stabilitási hibák feltárásához.
- **Élő HTML & SVG Előnézet**: A válaszokban szereplő ```html``` és ```svg``` kódblokkok közvetlenül homokozott `<iframe>`-ben előnézhetők.
- **Konzilium Mód & Szavazási Mátrix**, **Multimodális Kép/Hang**, **Helyi Piper / `espeak-ng` TTS** és **Folyamatos Hangmód**.

### 3. Univerzális AI Munkapad (`WorkbenchView` — 9 Modul)
1. **Autonóm Küldetés Tervező-Végrehajtó (`B1`)**: Cél → részfeladat-terv → eszközlánc → összegzés.
2. **Dinamikus Eszközépítő (`B2`)**: Futásidőben létrehozható `http_get`, `http_post` és izolált `sandbox_js` eszközök.
3. **Mélykutatás Motor (`Deep Research`)**: Párhuzamos webkutatás és magyar nyelvű forrásmegjelölt jelentések.
4. **REST API Stúdió & Írásvédett SQLite / PostgreSQL Böngésző**.
5. **Side-by-Side Diff & Git/PR Code Review**.
6. **Tolmács, SM-2 Tanulókártyák & Jelentésgenerátor**.
7. **Prompt Aréna (A/B)**: Párhuzamos modell-összehasonlítás.
8. **DevOps & CVE Stúdió (`Ú72–Ú80, Ú134, M144`)**:
   - **Repo X-Ray** (fájl/sor statisztika + Mermaid függőségi gráf),
   - **Függőségi CVE Sebezhetőségi Szkenner** (`npm audit` + OSV.dev),
   - **Regex Tesztelő & Természetes Nyelv -> Cron Generátor**,
   - **SQL DDL -> Mermaid ER Diagram Generátor**,
   - **HTTP P50/P95/P99 Terhelési Teszter**, **Dockerfile Biztonsági Auditor**, **Git Changelog**, **Headless UI & SEO Auditor**, és **OpenAPI 3.1 Specifikáció**.
9. **Adat, QR, Pénzügy & Közjegyző Stúdió (`Ú83, Ú88, Ú90, Ú131, Ú136, Ú141, Ú150`)**:
   - **CSV/JSON Data Wrangler** (szűrés, csoportosítás, min/max/átlag statisztika),
   - **Natív SVG Diagramok** (oszlop/vonal/kör) & **Valódi Reed-Solomon QR Kód SVG Generátor**,
   - **Szöveg-átalakító** (`JSON`, `SQL`, `Base64`, `JWT`, `SHA-256`) + vágólap-előzmények,
   - **WCAG 2.1 Kontraszt Ellenőrző**, **ÁFA & Kamatos Kamat Kalkulátor**,
   - **EXIF/Metaadat Tisztító (JPEG/PNG)**, **Tudományos Publikáció Kereső (CrossRef)**, és **SHA-256 Dokumentum Közjegyző (Notary)**.

### 4. Szervezeti Raj, Éjszakai Műszak, Kanban & Föderáció
- **Éjszakai Műszak (`Night Shift` — `Ú61`)**: Önálló háttér-ciklus, amely feldolgozza a nyitott Kanban feladatokat és naplózza az eredményeket (`POST /api/v3/nightshift/run`).
- **Szervezeti Hierarchia, MCP Jogosultsági Mátrix, Ágens Benchmark (0–100%)**, **Git Worktree Kanban + Ötletláda** és **P2P Raj Föderáció SVG Topológiával**.

### 5. SQLite WAL Memória, Álmodás, Kód-RAG & Obsidian Második Agy
- **SQLite WAL Gyorsítótár & Index (`M61`)**: Beépített `node:sqlite` WAL adatbázis (`novaswarm.sqlite`) az audit naplók, üzenetek és memóriák villámgyors indexeléséhez.
- **SHA-256 Audit Hash-Lánc (`M117`)**: Hamisításbiztos kriptográfiai láncellenőrzés (`POST /api/v3/audit/verify`).
- **Rétegzett Memória (`hot` / `warm` / `cold` / `shared`)**, **Memória Időgép**, **3 Fázisú Éjszakai Álmodás (`Light → Deep → REM`)**, **Kód-RAG**, és **Obsidian Vault** teljes kereső.

### 6. Ökoszisztéma Hub (14 Beépített Modul)
- Munkafolyamatok (`Workflows`), HMAC-SHA256 Webhookok, RSS & AI Briefing, Valódi IMAP/SMTP Email, Naptár & `.ics`, Okosotthon (Home Assistant + MQTT), GitHub Figyelő, Oldalfigyelő & Média (YouTube/Hang), Napi Napló, Megosztott Listák & Előfizetések, Szokások & Fókusz, Pénzügyek & CSV, Csomag Export/Import,
- **Életvitel, CRM & Megosztott Portál (`Ú91, Ú99, Ú100, Ú107, Ú113–Ú115, Ú147`)**:
  - **Személyes CRM** születésnap és követési emlékeztetőkkel,
  - **Csomagkövető** (GLS/MPL/Foxpost), **Otthoni Készlet (Kamra)**, **Heti Étrend -> Bevásárlólista Automatikus Szinkron**, **Jármű & Karbantartási Napló**,
  - **Read-It-Later Könyvjelző Archiváló**, **Időkorlátos Megosztott Portál Linkek**, **Borítékkal (Envelope) Költségvetés**, és **Élő Devizaváltó (EKB/Frankfurter)**.

### 7. Rendszerüzemeltetés, Többgépes Fürt & Hálózati Eszköztár
- **Wake-on-LAN (Valódi UDP Magic Packet)** & **WireGuard X25519 Kulcspár + Kliens Konfig + QR Kód**.
- **LAN ARP Eszközszkenner**, **Hálózati Sebességteszt**, **OSINT Domain Ellenőrző (DNS / SPF / DMARC / TLS)**, **SSH Auth Log & Titkos Fájl Jogosultság Auditor**.
- **Többgépes Fürt & Távoli GPU Ollama Csomópontok (`Cluster`)** automatikus terhelés-átadással.
- **Phoenix Teljes Rendszer-Visszaállítási Pillanatkép (`Ú160`)**, **Valós Linux Kernel Sandbox** (`docker` / `bwrap` / `unshare`), **PTY Terminál (`xterm.js` + `node-pty`)**, **GitHub OTA Frissítés** és **Terminál CLI (`npm run cli`)**.

---

## Telegram Parancsok (Teljes Távoli Vezérlés)

A Telegram botban közvetlenül használható parancsok (belső üzenetek automatikus AI raj-feldolgozása mellett):
- `/statusz` — Rendszer állapot, hőmérséklet, napi költség és futó feladatok
- `/mission <cél>` — Autonóm küldetés indítása azonnal
- `/nightshift` — Éjszakai Műszak azonnali indítása
- `/kapszula` — Heti Időkapszula összefoglaló lekérése
- `/kanban` — Aktív Kanban kártyák listázása
- `/lista` — Bevásárlólista / megosztott lista megtekintése és bővítése
- `/crm` — CRM kapcsolatok gyors elérése
- `/wol <MAC>` — Hálózati gép ébresztése Wake-on-LAN csomaggal
- `/lan` — Helyi hálózati ARP eszközök listázása
- `/cluster` — Távoli fürt / GPU Ollama csomópontok állapota és pingje
- `/audit` — SHA-256 audit lánc épségének ellenőrzése
- `/openapi` — OpenAPI 3.1 API specifikáció összegző
- `/idojaras` — Élő Open-Meteo időjárás jelentés
- `/stop` — Vészleállító (Kill-Switch) azonnali aktiválása

---

## Követelmények (Linux / Raspberry Pi ARM64)

- Debian 12/13 (Trixie), Ubuntu 22.04+, Fedora vagy Arch Linux (`x86_64` vagy `aarch64` / Raspberry Pi)
- Node.js 20+ (az `install.sh` automatikusan telepíti a Node.js 22 LTS-t, ha hiányzik)
- `git`, `curl`, `build-essential` (`python3`, `make`, `g++` a `node-pty` fordításhoz)
- Opcionális ajánlott csomagok: `bubblewrap`, `espeak-ng`, `ollama`, `chromium`, `sqlite3`

---

## Telepítés Parancssorból (Első telepítés)

```bash
git clone https://github.com/ngabika/NovaSwarmNextGenHydrogen.git
cd NovaSwarmNextGenHydrogen
chmod +x install.sh update.sh
./install.sh
```

### Teljes Törlés és Tiszta Újratelepítés (1 Parancssorral)

Ha már fut egy korábbi telepítés (például `/home/ngabika/NovaSwarmNextGenHydrogen` alatt), ez a parancssor leállítja a régi szolgáltatást, törli a teljes régi könyvtárat és adatbázist, majd tisztán klónozza és telepíti a legújabb verziót:

```bash
sudo systemctl stop novaswarm 2>/dev/null || true
sudo systemctl disable novaswarm 2>/dev/null || true
sudo rm -f /etc/systemd/system/novaswarm.service
sudo systemctl daemon-reload
pkill -f "NovaSwarmNextGenHydrogen" 2>/dev/null || true
cd /home/ngabika && rm -rf /home/ngabika/NovaSwarmNextGenHydrogen && git clone https://github.com/ngabika/NovaSwarmNextGenHydrogen.git && cd NovaSwarmNextGenHydrogen && chmod +x install.sh update.sh uninstall.sh && ./install.sh
```

Telepítés után nyisd meg böngészőből:
- Lokálisan: `http://localhost:3000`
- Helyi hálózatról (LAN): `http://<SZERVER-IP>:3000`

---

## Fejlesztés, CLI és Tesztelés

```bash
# Fejlesztői szerver indítása (3000-es port)
npm run dev

# Típusellenőrzés és production build
npm run lint && npm run build

# Teljes egységteszt-csomag futtatása
npx --yes tsx --test tests/*.test.ts

# Terminál CLI használata
npm run cli -- status
npm run cli -- doctor
npm run cli -- mission "Elemezd a rendszer terhelését"
```
