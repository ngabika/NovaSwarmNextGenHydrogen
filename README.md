# NovaSwarm

**NovaSwarm** egy teljesen autonóm, önfejlesztő személyi AI-ágens raj (Swarm), OpenAI-kompatibilis AI Gateway, univerzális AI Munkapad, hibrid Második Agy tudástár és teljes Linux/Raspberry Pi rendszerműveleti központ — otthoni szerverre, Raspberry Pi-re vagy dedikált munkaállomásra tervezve.

**Hivatalos GitHub repository:** https://github.com/ngabika/NovaSwarmNextGenHydrogen

---

## Teljes Funkciótérkép

### 1. Áttekintő Vezérlőpult, Parancspaletta & PWA
- **Áttekintő Irányítópult (`OverviewDashboard`)**: Egyetlen átlátható kezdőképernyő élő CPU/RAM/hőmérséklet telemetriával, kulcs nélküli **Open-Meteo élő időjárással**, **Biztonsági Keményítési Pontszámmal (0–100%)**, **Reggeli Álmodás Kivonattal**, havi költség-előrejelzéssel, függőben lévő jóváhagyásokkal, elakadt Kanban feladatokkal, naptári eseményekkel, RSS/Release hírekkel, napi fókusz összegzéssel és 1-kattintásos **Autonóm Küldetés** / **Raj Auto-Doktor** indítással.
- **Globális Parancspaletta (`Ctrl+K` / `⌘K`)**: Azonnali billentyűzetes navigáció az összes nézet, ágens, Kanban kártya és memória között, gyors parancsok indítása (új chat, diagnosztika, Raj Auto-Doktor, Ollama RAM ürítés, OTA frissítés, vészleállító).
- **Telepíthető PWA (Progressive Web App)**: Mobilra és asztalra telepíthető Web App Manifesttel, egyedi ikonokkal, offline shell támogatással, mobil alsó navigációs sávval és natív böngészős értesítésekkel (`reminder:alert`).

### 2. Raj Chat, Konzilium, Multimédia & Hang
- **Valós idejű SSE Token Streaming + Megállító Gomb + Üzenet Elágaztatás (`Fork` / `Újragenerálás`)**: A válaszok szavanként streamelődnek, bármikor megszakíthatók, elágaztathatók vagy újragenerálhatók, teljes token/késleltetés/költség kijelzéssel és 1-kattintásos másolással + szintaxiskiemelt kódblokkokkal.
- **Többszereplős Konzilium Mód & Konszenzus Mátrix**: Több specialista ágens párhuzamosan véleményez és szavaz (`approve` / `caution` / `reject` + megbízhatóság), majd a koordinátor szintetizálja a végső döntést.
- **Párhuzamos Eszközlánc (Multi-Tool Execution)**: `fast` / `deep` / `precise` profilokkal, állítható max lépésszámmal és dinamikusan létrehozott futásidejű eszközökkel.
- **Gyors `/` Prompt Sablonok & Könyvtár**: Saját slash-parancsok létrehozása és beillesztése közvetlenül a chat mezőbe.
- **Multimodális Chat, Képgenerálás & Vizuális Artifact Drawer**: Képfeltöltés és `Ctrl+V` vágólap-beillesztés, beépített AI képgenerálás, homokozott **Code Interpreter** (JavaScript/Python + SVG diagram), külön Artifact előnézeti fiókkal.
- **Folyamatos Hangos Beszélgetés, Ébresztőszó & Helyi Piper / `espeak-ng` TTS**: Folyamatos WebSpeech diktálás, testreszabható ébresztőszó (pl. *"Szia Nova"*), szerveroldali hangfájl-átírás, valamint `piper` neurális TTS / `espeak-ng` hangszóró kimenet.

### 3. Univerzális AI Munkapad (`WorkbenchView`)
1. **Autonóm Küldetés Tervező-Végrehajtó (`B1`)**: Egyetlen nagy cél megadásával az ágens automatikusan részfeladatokra bontja a tervet, végrehajtja az eszközláncokat és elkészíti a végső jelentést.
2. **Dinamikus Eszközépítő (`B2`)**: Új `http_get`, `http_post` vagy izolált `sandbox_js` egyéni eszközök létrehozása futásidőben — újrafordítás nélkül azonnal használható az ágensek számára.
3. **Mélykutatás Motor (`Deep Research`)**: Többlépcsős párhuzamos webes kutatás, oldalak letöltése, szintetizált magyar nyelvű Markdown jelentés forráshivatkozásokkal.
4. **REST API Stúdió & Írásvédett SQLite / PostgreSQL Böngésző**: Postman-szerű HTTP kérésküldő mentett kérésekkel + natív `node:sqlite` / `psql` kizárólag olvasásra korlátozott (`SELECT`/`PRAGMA`/`EXPLAIN`) adatbázis-felfedező.
5. **Side-by-Side Diff & Git/PR Code Review**: Soronkénti LCS diff + AI összehasonlítás, valamint helyi `git diff` vagy GitHub Pull Request automatikus mérnöki kódellenőrzése.
6. **Tolmács, SM-2 Tanulókártyák & Jelentésgenerátor**: Kétirányú szinkrontolmács, Anki-kompatibilis SM-2 időközönkénti ismétlés + CSV export, valamint nyomtatható munkanapló/audit/számla/meeting jegyzőkönyv generátor.
7. **Prompt Aréna (A/B)**: Egyetlen prompt párhuzamos futtatása akár 3 különböző modellen/szolgáltatón, válaszidő-, token- és költség-összehasonlítással.

### 4. Intelligens AI Gateway (`/v1/*`) & Alacsony-RAM Optimalizáló
- **OpenAI-kompatibilis Proxy**: `POST /v1/chat/completions` (SSE stream + `tools`/`tool_calls` + `image_url`), `POST /v1/embeddings`, `GET /v1/models`.
- **Virtuális API Kulcsok (`ns-vk-...`)**: Külön költségkeret, RPM korlát, modell-engedélylista, **lejárati dátum (`expiresAt`)** és **IP/CIDR szűrés (`allowedIps`)**.
- **Szolgáltatói Egészség & Késleltetés Ranglista + Normalizált Cache**: Élő hiba- és válaszidő-statisztika szolgáltatónként, valamint szóköz/kis-nagybetű-független gyorsítótárazás.
- **Ollama Low-RAM Optimalizáló (Raspberry Pi barát)**: Kézzel hangolható `num_ctx`, `keep_alive`, üresjárat utáni automatikus RAM-ból kiürítés (`ollamaAutoUnloadMinutes` + 1-kattintásos gomb), előmelegítés (`Pre-warm`), kulcs-rotáció és 429 cooldown.
- **PII / Secret / Prompt-Injection Guardrails**.

### 5. Szervezeti Raj, Kanban (Worktree + Sprint), Ötletláda & Föderáció
- **Zero-Prebuilt-Agents + 6 Lépéses Setup Wizard**: Gyárilag csak az állandó Felügyelő Auditor őr létezik; ágensenkénti fallback modell-lánccal (`modelChain`) és beépített **Ágens Benchmark Teszttel** (0–100%).
- **Gazdag Kanban, Git Worktree & Sprint Követés**: `blockedBy` függőségek, kártyánkénti izolált **Git branch + `.worktrees/` könyvtár**, becsült vs. valós idő (`estimatedMinutes` / `actualMinutes`), Sprint mező, prioritások és **Ötletláda** (`Impact - Effort` pontozással + 1-kattintásos AI felbontással).
- **P2P Raj Föderáció & SVG Topológia**: Interaktív hálózati gráf, tömeges élő ping (`POST /api/federation/ping-all`), Kanban feladat-átadás és megosztott memória-szinkron.

### 6. Rétegzett Hibrid Memória, Álmodás, Kód-RAG & Obsidian Második Agy
- **Rétegzett Memória (`hot` / `warm` / `cold` / `shared`) & Memória Időgép**: Ellentmondás-feloldás (`supersededBy`) és 1-kattintásos visszavonás (`POST /api/memories/:id/restore`), interaktív zoomolható/szűrhető **Tudásgráf**.
- **Hibrid Keresés (BM25 + Vektor RRF) & Ollama `nomic-embed-text`**: AES-256-GCM kulcstárral és atomikus `.state.json` tárolóval.
- **3 Fázisú Éjszakai Álmodás (`Light → Deep → REM`) + Reggeli Kivonat**: Automatikus `DreamSkillDraft` szkript-tervezetek, Reflexion javaslatok és közérthető reggeli összefoglaló.
- **Helyi Kód- & Dokumentum-RAG + Offline Túlélő Tudástár**: PDF, TXT, MD, CSV, JSON, HTML és forráskód (TS/JS/PY/GO/RS/SQL AST-határ tudatos darabolás) + internet nélküli keresés `man` oldalakkal.
- **Obsidian Vault Teljes Kereső, Backlinkek & Napi Jegyzet**: Teljes szöveges keresés, `[[wikilink]]` visszamutató hivatkozások listázása és napi jegyzet automatikus létrehozása.

### 7. Képességek (MCP), GitHub Skill Biztonsági Szkenner & Headless Böngésző
- **MCP Szerverek (`http` és `stdio`)**, Discord/Slack/Telegram 6 jegyű párosítással.
- **GitHub Skill Import + Statikus Biztonsági Szkenner**: URL-ről letöltött skillek automatikus vizsgálata `eval()`, `rm -rf`, `curl|sh` és beégetett titkok ellen importálás előtt.
- **Adatvédelmi Élő Web Kereső** (SearXNG, Brave, DuckDuckGo) + **Valódi Headless Chromium/Chrome** DOM-ellenőrzéshez és PNG képernyőképekhez.

### 8. Ökoszisztéma Hub (13 Beépített Modul)
1. **Többlépcsős Munkafolyamatok (Workflows)**: Trigger (`manual` / `cron` / `webhook` / `uptime_down` / `feed_item` / `ha_state`) → feltétel → szekvenciális lépés-lánc (`web_search`, `http_call`, `agent_prompt`, `kanban_create`, `notify`).
2. **Egyedi Webhookok (`/hooks/:slug`)**: Titkos kulccsal vagy GitHub/Stripe-kompatibilis **HMAC-SHA256** aláírással (`x-hub-signature-256`).
3. **RSS / Atom / GitHub Release Hírolvasó** & AI Napi Briefing (élő időjárással).
4. **Valódi SMTP / IMAP Email Ügyfél**: Beérkező levelek listázása, teljes levéltörzs olvasása (`GET /api/email/body/:uid`) és 1-kattintásos válasz (`In-Reply-To`).
5. **Naptár, `.ics` Import & Emlékeztetők**.
6. **Okosotthon (Home Assistant REST + TCP MQTT + `ha_state` Trigger Kiértékelő)**.
7. **GitHub Repo Figyelő**.
8. **Weboldal Változás-figyelő (Watchdog)**, **Podcast/Hanganyag Fejezet-elemző**, és **YouTube Videó Elemző + SM-2 Kártya Készítő**.
9. **Második Agy Napi Napló**: Hangulat, energia, napi célok automatikus mentéssel az Obsidian napi jegyzetbe.
10. **Megosztott Listák (Telegram `/lista` szinkron)** & **Előfizetés/Garancia Követő**.
11. **Szokások & Fókusz Időzítő**.
12. **Költségkövető & Banki CSV Importőr**.
13. **Titokmentes Csomag Export / Import**.

### 9. Rendszerüzemeltetés, SuperAdmin Linux Suite & Biztonság
- **Valódi Linux Kernel Sandbox** (`docker --network none` → `bwrap --unshare-net` → `unshare -rn` → izolált `tmpfs`).
- **Biztonsági Keményítési Pontszám (0–100%)**, **Raj Auto-Doktor (`B3`)**, **Jelszó Entrópia + HIBP k-Anonymity Ellenőrző** (jelszó továbbítása nélkül).
- **SuperAdmin Linux Eszköztár**: Docker + Docker Compose Stack Generátor, Systemd + Részletek (RAM/újraindítás/függőségek) + Journalctl AI Elemző, **Tűzfal (`ufw`/`nft`) & Portok (`ss`)**, **Hardver/RPi GPIO/I2C Szenzorok**, **DNS/Ping/Traceroute Hálózati Diagnosztika**, **Linux Crontab & Systemd Timers**, **AES-256-GCM Fájl Széf (`.nsenc`)**, **Nginx/Caddy Reverse Proxy Sablon**, **LAN/VPN**, **Lemez/SMART/Rsync**, **SSH Flotta Párhuzamos Parancsfuttatás**, **SSL Figyelő**.
- **Valós PTY Web Terminál (`xterm.js` + `node-pty`) & Munkamenet Visszajátszás**: Felvétel listázása és képkockánkénti idővonal-lejátszó.
- **GitHub OTA Automatikus Frissítés + Commit Előzmény Visszaállás**, **Scoped Diff Önmódosítás**, és **Terminál CLI (`npm run cli`)**.

---

## Követelmények (Linux / Raspberry Pi ARM64)

- Debian 12/13 (Trixie), Ubuntu 22.04+, Fedora vagy Arch Linux (`x86_64` vagy `aarch64` / Raspberry Pi)
- Node.js 20+ (az `install.sh` automatikusan telepíti a Node.js 22 LTS-t, ha hiányzik)
- `git`, `curl`, `build-essential` (`python3`, `make`, `g++` a `node-pty` fordításhoz)
- Opcionális ajánlott csomagok: `bubblewrap`, `espeak-ng`, `ollama`, `chromium`, `sqlite3`, `ufw`

---

## Telepítés Parancssorból (Első telepítés)

```bash
git clone https://github.com/ngabika/NovaSwarmNextGenHydrogen.git
cd NovaSwarmNextGenHydrogen
chmod +x install.sh update.sh
./install.sh
```

### Tiszta újratelepítés (régi verzió teljes eltávolításával)

Ha már fut egy korábbi telepítés (például `/home/ngabika/NovaSwarmNextGenHydrogen` alatt), ez a teljes parancssor leállítja és eltávolítja a régit, majd tisztán telepíti a legfrissebb verziót:

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
- Hálózatról (pl. Raspberry Pi): `http://<SZERVER-IP>:3000`

---

## Fejlesztés, CLI és Tesztelés

```bash
# Fejlesztői szerver indítása (3000-es port)
npm run dev

# Típusellenőrzés és production build
npm run lint && npm run build

# Teljes egységteszt-csomag futtatása
npm test

# Terminál CLI használata
npm run cli -- status
npm run cli -- doctor
npm run cli -- mission "Elemezd a rendszer terhelését"
```
