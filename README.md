# NovaSwarm

**NovaSwarm** egy teljesen autonóm, önfejlesztő személyi AI-ágens raj (Swarm), OpenAI-kompatibilis AI Gateway, hibrid tudástár és teljes Linux/Raspberry Pi rendszerműveleti központ — otthoni szerverre, Raspberry Pi-re vagy dedikált munkaállomásra tervezve.

**Hivatalos GitHub repository:** https://github.com/ngabika/NovaSwarmNextGenHydrogen

---

## Teljes Funkciótérkép

### 1. Áttekintő Vezérlőpult, Parancspaletta & PWA
- **Áttekintő Irányítópult (`OverviewDashboard`)**: Egyetlen átlátható kezdőképernyő élő CPU/RAM/hőmérséklet telemetriával, havi költség-előrejelzéssel, függőben lévő jóváhagyásokkal, elakadt Kanban feladatokkal, naptári eseményekkel, RSS/Release hírekkel és napi fókusz/szokás összegzéssel.
- **Globális Parancspaletta (`Ctrl+K` / `⌘K`)**: Azonnali billentyűzetes navigáció az összes nézet között, gyors parancsok indítása (új chat, diagnosztika, OTA frissítés, vészleállító).
- **Telepíthető PWA (Progressive Web App)**: Mobilra és asztalra telepíthető Web App Manifesttel, egyedi ikonokkal, offline shell támogatással és natív böngészős értesítésekkel (`reminder:alert`).

### 2. Raj Chat, Konzilium, Multimédia & Hang
- **Valós idejű SSE Token Streaming + Megállító Gomb**: A válaszok azonnal, szavanként streamelődnek a felületre, és bármikor megszakíthatók.
- **Többszereplős Konzilium Mód (Council)**: Több specialista ágens párhuzamosan véleményez egy komplex döntést vagy kódrészletet, majd a koordinátor szintetizálja a végső választ.
- **Párhuzamos Eszközlánc (Multi-Tool Execution)**: Az ágensek több eszközhívást is képesek láncban és párhuzamosan végrehajtani, gyorsítási/alaposság/precizitás profilokkal (`fast` / `deep` / `precise`) és állítható max lépésszámmal.
- **Gyors `/` Prompt Sablonok & Könyvtár**: Saját slash-parancsok létrehozása és beillesztése közvetlenül a chat mezőbe.
- **Multimodális Chat, Képgenerálás & Vizuális Artifact Drawer**:
  - Képfeltöltés és vágólap-beillesztés (`Ctrl+V`).
  - Beépített AI képgenerálás és homokozott **Code Interpreter** (JavaScript/Python futtatás + SVG diagram generálás).
  - Külön előnézeti fiók HTML/SVG/kód/kép artifactok interaktív megnyitásához.
- **Folyamatos Hangos Beszélgetés & Whisper/Gemini STT**:
  - Folyamatos WebSpeech diktálás + opcionális szerveroldali hangfájl-átírás.
  - Ágensenként állítható `voiceReplyMode` (`always` | `on_voice` | `off`) + Linux `espeak-ng` hangszóró kimenet.

### 3. Intelligens AI Gateway (`/v1/*`) & Alacsony-RAM Optimalizáló
- **OpenAI-kompatibilis Proxy**: `POST /v1/chat/completions` (SSE stream + `tools`/`tool_calls` + `image_url`), `POST /v1/embeddings`, `GET /v1/models`.
- **Virtuális API Kulcsok (`ns-vk-...`)**: Külön költségkeret, RPM korlát és modell-engedélylista külső eszközökhöz.
- **Költség-előrejelzés & Kontextus-diéta**: Napi kiadás alapján számolt havi költségprojekció riasztási határral + automatikus prompt tömörítés kontextusablak-túllépés előtt.
- **Ollama Low-RAM Optimalizáló (Raspberry Pi barát)**: Kézzel hangolható `num_ctx` (pl. 2048/4096), `keep_alive` és 1-kattintásos modell-előmelegítés (`Pre-warm`), valamint kulcs-rotáció, 429 cooldown és LRU válasz-cache.
- **PII / Secret / Prompt-Injection Védőkorlátok (Guardrails)**.

### 4. Szervezeti Raj, Kanban, Ötletláda & Föderáció
- **Zero-Prebuilt-Agents + 6 Lépéses Setup Wizard**: Gyárilag csak az állandó Felügyelő Auditor őr létezik; a csapatot te építed fel.
- **Finomhangolt Ágens Jogok & Ütemezés**:
  - Ágensenként külön engedélyezhető MCP szerverek (`allowedMcpIds`).
  - Aktív idősáv (`activeHoursStart`–`activeHoursEnd`) és óránkénti futtatási limit (`maxRunsPerHour`).
- **Gazdag Kanban & Függőségek**:
  - `blockedBy` feladatfüggőségek (az Autonóm Kanban Munkás csak a feloldott kártyákat veszi fel).
  - Kártyákhoz kötött **izolált Git branch** (`kanban/...`).
  - Prioritások, részfeladatok, WIP limit és **Ötletláda** (`Impact - Effort` pontozással + 1-kattintásos AI Kanban felbontással).
- **P2P Raj Föderáció**: Kanban feladat-átadás (`Handoff`) és megosztott memória-szinkron több NovaSwarm példány között.

### 5. Rétegzett Hibrid Memória, Álmodás, Helyi RAG & Obsidian Wiki
- **Rétegzett Memória (`hot` / `warm` / `cold` / `shared`) & Ellentmondás-feloldás**: Új tények automatikusan megjelölik (`supersededBy`) és lehűtik az elavult állításokat; relációs tudásgráf (`relations`).
- **Hibrid Keresés (BM25 + Vektor RRF) & Ollama `nomic-embed-text`**: AES-256-GCM titkosított kulcstárral (`.secrets.vault.json`) és atomikus `.state.json` tárolóval.
- **3 Fázisú Éjszakai Álmodás (`Light → Deep → REM`) + Reflexion**: Az álmodás automatikusan `DreamSkillDraft` szkript-tervezeteket és Reflexion önkritikai szabályokat termel.
- **Helyi Dokumentum RAG Pipeline**: PDF, TXT, MD, CSV, JSON, HTML fájlok feltöltése, darabolása és indexelése külső felhő nélkül (`rag-docs/`).
- **Offline Túlélő Tudástár**: Internet nélküli keresés a memóriákban, feltöltött dokumentumokban, Obsidian jegyzetekben és a helyi Linux `man` oldalakban.
- **Beépített Obsidian Markdown Wiki Szerkesztő**: Élő fájlfa, szerkesztés, mentés és törlés közvetlenül a `memory-vault/` mappában.

### 6. Képességek (MCP), Élő Web & Headless Böngésző
- **MCP Szerverek (`http` és helyi `stdio` szubprocessz)**: Kiterjeszthető külső eszközök és kétirányú Discord/Slack/Telegram csatornák 6 jegyű párosítással.
- **Adatvédelmi Élő Web Kereső**: SearXNG (önállóan futtatva), Brave Search API és DuckDuckGo HTML fallback + HTML→Markdown tisztító (`M7`).
- **Valódi Headless Böngésző Automatizálás**: Rendszerszintű Chromium/Chrome felismerésével DOM-ellenőrzés, linkkinyerés és valós PNG képernyőkép-készítés.

### 7. Ökoszisztéma Hub (10 Beépített Modul)
1. **Vizuális Munkafolyamatok (Workflows)**: Trigger (`manual` / `cron` / `webhook`) → feltétel → Kanban / értesítés / ágens lánc.
2. **Egyedi Webhookok (`/hooks/:slug`)**: Titkos kulccsal védett külső REST belépési pontok.
3. **RSS / Atom / GitHub Release Hírolvasó** & AI Napi Briefing generálás.
4. **Valódi SMTP / IMAP Email Ügyfél**: Beérkező levelek TLS lekérdezése és jóváhagyáshoz kötött levélküldés.
5. **Naptár, `.ics` Import & Emlékeztetők**: 60 másodperces háttérfigyelő böngésző + Telegram értesítéssel.
6. **Okosotthon (Home Assistant REST + Natív TCP MQTT)**: Szenzorok lekérdezése, eszközök kapcsolása és MQTT publikálás.
7. **GitHub Repo Figyelő**: Commitok és nyitott Issue-k követése.
8. **Szokások & Fókusz Időzítő**: Napi pipa, Pomodoro / fókusz blokkok naplózása.
9. **Költségkövető & Banki CSV Importőr**: Automatikus kereskedő-kategorizálással.
10. **Biztonságos Csomag Export / Import**: Ágensek, skillek, munkafolyamatok és sablonok mentése/visszatöltése — **szigorúan 0 API kulccsal vagy jelszóval**.

### 8. Rendszerüzemeltetés, Kernel Sandbox & Gazdagép Felügyelet
- **Valódi Linux Kernel Sandbox**: Automatikus felderítéssel (`docker --network none` → `bubblewrap / bwrap --unshare-net` → `unshare -rn` → izolált `tmpfs`).
- **LAN Operátori Jelszó Zár (`scrypt` + `HttpOnly` HMAC süti)**, időzített Destruktív Jóváhagyási Sor, Emergency Kill Switch (`/stop`), CSV/JSON Audit export.
- **Docker & Systemd + Journalctl AI Naplóelemző**: Konténerek kezelése/logolása, `systemd` egységek hibáinak AI-alapú megfejtése.
- **LAN Eszközfelderítő (`ip neigh` / `arp`)**, **Tailscale / WireGuard VPN Státusz**, **Lemez & SMART Egészség + Külső `rsync` Mentés**.
- **SSH Flotta Kezelő**, **SSL/TLS Tanúsítvány Lejárat Figyelő** (`node:tls`), **1-Kattintásos Host Öndiagnosztika** és **Biztonságos `.env` Szerkesztő**.
- **Valós PTY Web Terminál (`xterm.js` + `node-pty`)**: Gyors diagnosztikai gombokkal és 1-kattintásos **"Küldés a Rajnak (utolsó 50 sor)"** funkcióval.
- **GitHub OTA Automatikus Frissítés**: Előzetes `git diff` előnézettel és hiba esetén automatikus rollbackkel.

---

## Követelmények (Linux / Raspberry Pi ARM64)

- Debian 12/13 (Trixie), Ubuntu 22.04+, Fedora vagy Arch Linux (`x86_64` vagy `aarch64` / Raspberry Pi)
- Node.js 20+ (az `install.sh` automatikusan telepíti a Node.js 22 LTS-t, ha hiányzik)
- `git`, `curl`, `build-essential` (`python3`, `make`, `g++` a `node-pty` fordításhoz)
- Opcionális ajánlott csomagok: `bubblewrap`, `espeak-ng`, `ollama`, `chromium` (headless böngészőhöz)

---

## Telepítés Parancssorból (Első telepítés)

```bash
git clone https://github.com/ngabika/NovaSwarmNextGenHydrogen.git
cd NovaSwarmNextGenHydrogen
chmod +x install.sh update.sh
./install.sh
```

### Tiszta újratelepítés (régi verzió teljes eltávolításával)

Ha már fut egy korábbi telepítés (például `/home/ngabika/NovaSwarmNextGenHydrogen` alatt) és teljesen tiszta lappal szeretnéd újratelepíteni a legfrissebb verziót:

```bash
sudo systemctl stop novaswarm 2>/dev/null || true
sudo systemctl disable novaswarm 2>/dev/null || true
sudo rm -f /etc/systemd/system/novaswarm.service
sudo systemctl daemon-reload
pkill -f "NovaSwarmNextGenHydrogen" 2>/dev/null || true
cd /home/ngabika
rm -rf /home/ngabika/NovaSwarmNextGenHydrogen
git clone https://github.com/ngabika/NovaSwarmNextGenHydrogen.git
cd NovaSwarmNextGenHydrogen
chmod +x install.sh update.sh uninstall.sh
./install.sh
```

A telepítő automatikusan elvégzi:
1. Rendszerfüggőségek (`git`, `build-essential`, `python3`, `espeak-ng`, `bubblewrap`) és Node.js ellenőrzése.
2. Hardverprofilozás (CPU, RAM, GPU) és alacsony RAM (<1.5 GB) esetén automatikus 1 GB `/swapfile` védelem a stabil buildhez.
3. Lokális Ollama telepítése és hardverhez illeszkedő modell letöltése (`qwen2.5:1.5b` / `3b` / `7b`).
4. Függőségek telepítése (`--legacy-peer-deps` vésztartalékkal), production build (`npm run build`).
5. A `novaswarm.service` systemd szolgáltatás regisztrálása, elindítása a `0.0.0.0:3000` címen és a `/healthz` végpont ellenőrzése.

Telepítés után nyisd meg böngészőből:
- Lokálisan: `http://localhost:3000`
- Hálózatról (pl. Raspberry Pi): `http://<SZERVER-IP>:3000`

---

## Automatikus Frissítés GitHubról (OTA)

### 1. A Web UI Menüből
- A bal oldali menüben látható **GitHub Frissítés (OTA)** panelen bármikor kattinthatsz az **Ellenőrzés** vagy **Frissítés** gombra.
- A **Beállítások** fülön kapcsold be a **GitHub OTA Automatikus Frissítés** opciót (alapértelmezett tároló: `ngabika/NovaSwarmNextGenHydrogen`).
- A **Rendszerüzemeltetés** fülön előre megnézheted a letöltendő `git diff` tartalmat is.

### 2. Parancssorból (`update.sh`)
Biztonsági mentést készít az állapotról (`.state.json`), a titkosított kulcstárról (`.secrets.vault.json`), a memóriáról (`memory-vault/`) és a RAG dokumentumokról (`rag-docs/`), frissít, ellenőrzi a fordítást, majd újraindítja a szolgáltatást:

```bash
cd /home/ngabika/NovaSwarmNextGenHydrogen
./update.sh
```

---

## Fejlesztés és Tesztelés

```bash
# Fejlesztői szerver indítása (3000-es port)
npm run dev

# Típusellenőrzés és production build
npm run lint && npm run build

# Teljes egységteszt-csomag futtatása
npm test
```
