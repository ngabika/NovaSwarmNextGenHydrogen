# NovaSwarm

Autonóm, önfejlesztő személyi AI-ágens raj (Swarm) és helyi Linux üzemeltetési központ — egyetlen felhasználóra, otthoni szerverre vagy dedikált Linux gépre tervezve.

**Hivatalos GitHub repository:** https://github.com/ngabika/NovaSwarmNextGenHydrogen

---

## Főbb képességek

- **Zero-Prebuilt-Agents + Induló Varázsló:** Gyárilag nincs előre bedrótozott ágens-csapat (kivéve az állandó Felügyelő Auditor őrt). Az első ágenst te hozod létre a 6 lépéses Setup Wizardban, utána a raj organikus módon növekszik és specializálódik.
- **LiteLLM-szintű Gateway & OpenAI Kompatibilis `/v1/*` Proxy:**
  - `POST /v1/chat/completions`, `POST /v1/embeddings`, `GET /v1/models`
  - Natív OpenAI `tools` / `tool_calls` (function calling) és multimodális `image_url` támogatás (Gemini, OpenAI, OpenRouter, Anthropic, Ollama felé)
  - Virtuális API kulcsok (`ns-vk-...`) kérésenkénti költségkerettel, RPM limittel és modell-engedélylistával
  - Round-robin API kulcs rotáció és hibatűrő failover + TTL válasz-cache + PII/Secret/Prompt-Injection védőkorlátok
- **OpenClaw Architektúra-Minták:**
  - Munkamenet-szintű elszigetelés (`main_host` vs `sandboxed` munkaszálak és alágensek)
  - Többcsatornás csatlakozók (Telegram, Discord, Slack, általános Webhook) 6 jegyű párosítási jóváhagyó sorral
  - Valódi Linux kernel sandbox automatikus felderítéssel (`docker --network none` → `bubblewrap / bwrap --unshare-net` → `unshare -rn` → izolált `tmpfs` alfolyamat)
  - Autonóm Heartbeat (Kanban elakadás-figyelés + Two-Strikes Uptime Monitor)
- **Marveen Architektúra-Minták:**
  - Ágensenkénti dedikált Telegram bot (saját token + saját karakter + multimodális fotó és hangjegyzet feldolgozás)
  - Ötletláda (`Impact - Effort` pontozással és 1-kattintásos AI Kanban-felbontással)
  - Rich Kanban tábla (WIP limit, prioritások, részfeladatok, swimlane-ek, elakadás-jelzés) + **Autonóm Kanban Backlog Munkás**
  - P2P Föderáció több NovaSwarm példány között
- **Rétegzett Hibrid Memória & Éjszakai Álmodás (Light → Deep → REM):**
  - SQL-mentes fájlalapú perzisztencia (`.state.json` + AES-256-GCM `.secrets.vault.json` + Markdown Obsidian Vault)
  - BM25 + n-gram vektoros hibrid keresés RRF fúzióval + opcionális helyi **Ollama neurális embedding (`nomic-embed-text`)**
  - Memória rétegzés (`hot` / `warm` / `cold` / `shared`) és salience decay
- **Multimodális Chat & Hang:**
  - Képfeltöltés és vágólap-beillesztés (`Ctrl+V`) a webes chatben
  - Telegram fotó-elemzés (Vision) és `.ogg` hangjegyzet átírás (STT)
  - Böngészőoldali WebSpeech diktálás + ágensenként szabályozható `voiceReplyMode` (`always` | `on_voice` | `off`) és Linux `espeak-ng` hangszóró
- **Biztonság & Üzemeltetés:**
  - Opcionális **LAN Operátori Jelszó Zár** (`scrypt` jelszó-hash + `HttpOnly` HMAC süti)
  - Egységes Gazdagép Jogosultsági Kapu, Destruktív Jóváhagyási Sor, Emergency Kill Switch (`/stop`)
  - Védett önmódosítás (`git` commit + típusellenőrzés + automatikus rollback hiba esetén, tiltott zónák védelme)
  - **GitHub OTA Automatikus Frissítés** közvetlenül a bal oldali menüből és a Beállításokból

---

## Követelmények (Linux)

- Ubuntu 22.04+ / Debian 12+ / Fedora / Arch Linux
- Node.js 20+ (az `install.sh` automatikusan telepíti a Node.js 22 LTS-t, ha hiányzik)
- `git`, `curl`, `build-essential` (`python3`, `make`, `g++` a `node-pty` terminálhoz)
- Opcionális, de ajánlott: `bubblewrap` (valódi Linux namespace sandboxhoz — az `install.sh` automatikusan telepíti), `ollama`, `espeak-ng`

---

## Gyors Telepítés (1 parancssoros Linux telepítő)

Futtasd a következő parancsokat a cél Linux gépen:

```bash
git clone https://github.com/ngabika/NovaSwarmNextGenHydrogen.git
cd NovaSwarmNextGenHydrogen
chmod +x install.sh update.sh
./install.sh
```

A telepítő automatikusan:
1. Ellenőrzi és telepíti a rendszerfüggőségeket (`git`, `build-essential`, `python3`, `espeak-ng`, `bubblewrap`, Node.js 22 LTS).
2. Profilozza a hardvert (CPU, RAM, GPU) és ajánl/telepít egy lokális Ollama modellt.
3. Létrehozza a `.env` fájlt, telepíti az npm csomagokat és lefordítja az alkalmazást (`npm run build`).
4. Beállítja és elindítja a `novaswarm.service` systemd háttérszolgáltatást (alapértelmezett port: `3000`).

Telepítés után nyisd meg böngészőben:

```text
http://localhost:3000
```

Ha gyors helyi Ollama embeddinget is szeretnél használni a memóriakereséshez:

```bash
ollama pull nomic-embed-text
```

---

## Frissítés a GitHubról (Kézi & Automatikus OTA)

### 1. Frissítés a Web UI menüből (1 kattintás vagy automatikus)
- A bal oldali főmenüben található **GitHub Frissítés (OTA)** panelen bármikor kattinthatsz az **Ellenőrzés** vagy a **Frissítés** gombra.
- A **Rendszer & Doksik** fülön a **Git Diff Előnézet** gombbal előre megtekintheted a letöltendő változásokat, majd alkalmazhatod a frissítést.
- A **Beállítások** fülön bekapcsolhatod a **GitHub OTA Automatikus Frissítés** opciót és megadhatod az ellenőrzési intervallumot (alapértelmezett repo: `ngabika/NovaSwarmNextGenHydrogen`).

### 2. Frissítés parancssorból (`update.sh`)
A frissítő szkript biztonsági mentést készít az állapotról és memóriáról (`backups/`), lehúzza az új kódot, ellenőrzi a fordítást, hiba esetén automatikusan visszaáll az előző commitra, majd újraindítja a systemd szolgáltatást:

```bash
cd ~/NovaSwarmNextGenHydrogen
./update.sh
```

---

## Fejlesztés és Tesztelés

```bash
# Fejlesztői szerver indítása (3000-es port)
npm run dev

# Típusellenőrzés és production build
npm run lint && npm run build

# Egységtesztek futtatása
npm test
```
