# NovaSwarm — Teljes Biztonsági és Minőségi Audit Jelentés

**Vizsgált kódbázis:** `https://github.com/ngabika/NovaSwarmNextGenHydrogen` (helyi munkakönyvtár)  
**Futtatókörnyezet az ellenőrzéskor:** Linux, Node.js `v22.23.5`, csomagkezelő: `npm`  
**Audit dátuma:** 2026-11-24

---

## 1. Felderítés és Állapotfelmérés

Végigellenőrzött fájlok és könyvtárak: `server.ts`, `server/**`, `shared/**`, `src/**`, `scripts/**`, `tests/**`, `install.sh`, `update.sh`, `uninstall.sh`, `package.json`, `vite.config.ts`, `tsconfig.json`, `.env.example`, `.gitignore`, `README.md`.

### Alapellenőrzések eredménye
| Ellenőrzés | Eredmény | Megjegyzés |
|---|---|---|
| `node -v` | `v22.23.5` | Megfelel a `node:sqlite` által megkövetelt `22.5+` verziónak. |
| `npm run lint` (`tsc --noEmit`) | Sikeres (0 hiba) | TypeScript típusellenőrzés hiba nélkül lefut. |
| `npm run build` (`vite build`) | Sikeres | A kliens és PWA csomag hiba nélkül lefordul. |
| `npm test` | **86 / 86 sikeres** | Eredeti 76 teszt + 10 új biztonsági regressziós teszt (`tests/security_audit_fixes.test.ts`). |
| `npm audit` | 4 `moderate`, 0 `high`, 0 `critical` | Mind a 4 mérsékelt jelzés a `vite-plugin-pwa -> workbox-build -> glob / minimatch` dev/build láncból jön; `--force` főverzió-visszalépést (`vite-plugin-pwa@1.1.0`) okozna. |
| Git repo / commit történet | **nem ellenőrizhető** | A vizsgált környezetben nem található `.git` könyvtár, így a múltbeli commitokban maradt titkok, az `audit/fixes` branch és a PR csak a felhasználó saját git-másolatában kezelhető. |

---

## 2. Teljes Biztonsági és Minőségi Audit Mátrix (11 Kötelező Terület)

Jelmagyarázat a státuszokhoz: **javítva** | **részben javítva** | **nyitva** | **nem ellenőrizhető**.

### 2.1. Telegram Bot és Csatorna-jogosultság
| # | Hely (`fájl:sor`) | Súlyosság | Leírás & Reprodukció | Javasolt / Alkalmazott Fix | Státusz |
|---|---|---|---|---|---|
| T1 | `server/telegram/bot.ts:1353-1366` | **Kritikus** | Üres `telegramAllowedChatIds` és `telegramChatId` esetén a régi ellenőrzés engedte az üzeneteket vagy túl megengedő volt párosítás nélkül (`fail-open`). **Repro:** indítsd el a botot csak tokennel, küldj `/bash id` parancsot idegen Telegram fiókból. | **Fail-closed** `isTelegramChatAllowed()`: üres lista esetén minden `chatId` tiltva van, és `channelPairingRequired: true` az alapértelmezett (`server/state/store.ts:535`). Tesztelve: `Audit Fix 5`. | **javítva** |
| T2 | `server/telegram/bot.ts:783-810` | **Magas** | `/getfile <útvonal>` Telegram parancs szimbolikus linkeken vagy relatív `../` útvonalon kiszivárogtathatott érzékeny konfigurációs/titok fájlokat. **Repro:** `/getfile ../../etc/passwd` vagy `/getfile .secrets.key`. | `assertHostPermission('telegram:getfile')`, `fs.realpathSync` ellenőrzés a munkakönyvtár előtagjára, továbbá explicit tiltólista (`.env*`, `.secrets*`, `.state.json*`, `novaswarm.sqlite*`, `*.pem`, `*.key`, `id_rsa`, `id_ed25519`, `backups/`). | **javítva** |
| T3 | `server/telegram/bot.ts:701-775`, `server/power/batch5AutonomyEngine.ts:380-494` | **Magas** | `/bash`, `/gpio`, `/print` parancsok gazdagép-hozzáféréshez kötöttek. Ha `hostPermissionsGranted` be volt kapcsolva, veszélyes parancsok közvetlenül futhattak. | Minden host parancs elé `assertHostPermission(...)`; `/gpio` és `/print` `execFileSync` argumentumtömböt használ (`shell: false`), nyomtató- és fájlnevek szigorú regexszel és `realpath` ellenőrzéssel szűrve (`batch5AutonomyEngine.ts:464-487`); `/bash` destruktív detektáláson és jóváhagyási soron (`requireDestructiveApproval`) megy át (`batch4PiHardwareAndNet.ts:510-521`). | **javítva** |
| T4 | `server/telegram/bot.ts:553-568, 900-909`, `server/infra/networkAndCluster.ts:15-38`, `server/power/batch7UniverseEngine.ts:555-573` | **Közepes** | `/wol` és `/lanmap` tetszőleges publikus IP-re küldhetett csomagot vagy portszkennelést végezhetett. | Privát/helyi LAN IP és `.local`/loopback whitelist (`10.*`, `192.168.*`, `172.16-31.*`, `255.255.255.255`), MAC és gazdagépnév validáció. Tesztelve: `Audit Fix 10`. | **javítva** |

### 2.2. Web Hitelesítés, CSRF, DNS Rebinding, CORS és WebSocket/SSE
| # | Hely (`fájl:sor`) | Súlyosság | Leírás & Reprodukció | Javasolt / Alkalmazott Fix | Státusz |
|---|---|---|---|---|---|
| A1 | `server/state/store.ts:545` | **Kritikus** | Korábban `webAuthEnabled: false` volt az alapértelmezett, így bármely hálózati eszköz jelszó nélkül elérte a teljes vezérlőpultot és API-t. | Alapértelmezés átállítva `webAuthEnabled: true`-ra; LAN eléréshez cookie/Bearer munkamenet kötelező. Tesztelve: `Audit Fix 1`. | **javítva** |
| A2 | `server/security/auth.ts:71-121, 164-222` | **Kritikus** | CSRF és DNS rebinding támadás `Origin` / `Referer` / `Host` ellenőrzés nélkül (pl. rosszindulatú weboldalról küldött `POST /api/settings` `http://localhost:3000`-re). **Repro:** küldj `PATCH /api/settings` kérést `Origin: https://evil.example` fejléccel. | `verifySameOriginRequest()` ellenőrzi az `Origin`/`Referer` és `Host` egyezést (loopback normalizálással: `localhost` / `127.0.0.1` / `::1` azonos porton), blokkolja az idegen eredetű mutációkat (`HTTP 403`), `requireWebAuthMiddleware` minden nem-publikus API-t véd. Tesztelve: `Audit Fix 3` és `Audit Fix 4`. | **javítva** |
| A3 | `server/security/auth.ts:138-151`, `server.ts:302-320` | **Magas** | A `/ws/terminal` PTY WebSocket és `/api/events` SSE végpont autentikáció és Origin-ellenőrzés nélkül nyitható volt. | `isWsUpgradeAuthorized(req)` ellenőrzi a WebSocket upgrade során az `Origin`/`Host` egyezést és az aktív session sütit/Bearer tokent is; elutasítás esetén `401/403` és bontás. | **javítva** |
| A4 | `server/routes/api.ts:275-335` | **Magas** | Az onboarding végpont (`POST /api/onboarding/complete`) korábban utólag is újra hívható volt, és gyenge (<8 karakteres) jelszó beállítását is engedhette. | Befejezett onboarding (`onboardingCompleted: true`) után `HTTP 403`; a `/api/auth/password` elutasítja a 8 karakternél rövidebb jelszavakat (`HTTP 400`), távoli IP-ről nem enged első kulcsfelvételt. Tesztelve: `Audit Fix 4`. | **javítva** |
| A5 | `server/gateway/openaiProxy.ts:115-167` | **Magas** | `/v1/*` OpenAI-kompatibilis proxy üres `virtualKeys` mellett engedhette a hívásokat (`fail-open`). | Üres virtuális kulcstár esetén `webAuthEnabled !== false` mellett **fail-closed** (`HTTP 401`), vagy érvényes Bearer virtuális kulcs / mester auth kötelező. Tesztelve: `Audit Fix 4`. | **javítva** |

### 2.3. Shell, Exec, Sandbox, PTY és SSH Költöztető
| # | Hely (`fájl:sor`) | Súlyosság | Leírás & Reprodukció | Javasolt / Alkalmazott Fix | Státusz |
|---|---|---|---|---|---|
| S1 | `server/infra/sshHostMigrator.ts:59-196` | **Kritikus** | SSH költöztetés során parancssori argumentumban vagy héj-interpolációval adott jelszó/gazdagép parancs-injekciót okozhatott és kilátszhatott a `ps aux` folyamatlistában. **Repro:** `host: "192.168.1.5; id"` vagy `-p <jelszó>`. | `validateMigrationTarget()` szigorú IP/hostname/felhasználónév validáció; `execFile` (`shell: false`) argumentumtömb; `sshpass -e` környezeti változóval (`SSHPASS`) vagy `0700` jogosultságú ideiglenes `SSH_ASKPASS` segédszkript, amely a `finally` ágban azonnal törlődik; jelszó maszkolva a naplókban. | **javítva** |
| S2 | `server/infra/batch4PiHardwareAndNet.ts:304-399` | **Magas** | Web File Commander tetszőleges fájlt olvashatott/írhatott `../` segítségével (`.secrets.key`, `.env`, `.state.json`). | `resolveSafeCommanderPath()` + `isProtectedPath()` tiltja a munkakönyvtáron kívüli és az összes kulcs-/állapotfájl elérését. Tesztelve: `Audit Fix 6`. | **javítva** |
| S3 | `server/infra/hostAdmin.ts:14`, `server/infra/superAdmin.ts:14`, `server/sandbox/supervisorSandbox.ts:115-251` | **Közepes** | Gazdagép admin és homokozó futtatás. | `spawnSync` / `execFileSync` argumentumtömbbel (`shell: false`), `unshare -rn` / `bwrap` hálózat-elkülönítéssel. | **javítva** |
| S4 | `server/agents/engine.ts:184`, `server/agents/tools.ts:208`, `server/infra/batch4PiHardwareAndNet.ts:524,660` | **Közepes** | Az AI ágens `exec_shell` eszköze, a Bash Copilot és a egyedi shell widgetek továbbra is `execSync(command)` / `execFileSync('sh', ['-c', ...])` hívást használnak, mivel általános Linux shell-parancsok (csővezetékek, átirányítások) futtatására szolgálnak. Védelmük `hostPermissionsGranted` + `isSandboxed` + `requireDestructiveApproval` rétegre támaszkodik. | Ajánlott hosszabb távon opcionális parancs-engedélylista (`allowlist` mód) bevezetése a szigorú (`strict`) felügyeleti szinthez. | **nyitva** *(szándékos opt-in képesség, kapuzva)* |

### 2.4. Felhasználói HTML Kiszolgálása, XSS, CSP és Tokenek
| # | Hely (`fájl:sor`) | Súlyosság | Leírás & Reprodukció | Javasolt / Alkalmazott Fix | Státusz |
|---|---|---|---|---|---|
| H1 | `server.ts:218-231` | **Kritikus** | A `/apps/:slug` végpont felhasználói HTML-t szolgált ki azonos originen CSP nélkül → tárolt XSS-szel ellopható volt az admin munkamenet vagy hívható a `/api/*`. **Repro:** ments egy `<script>fetch('/api/settings')</script>` mini-appot és nyisd meg. | `Content-Security-Policy: sandbox allow-scripts allow-forms; default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'` + `X-Content-Type-Options: nosniff` + `X-Frame-Options: DENY` (egyedi `opaque origin`, így nincs süti/API hozzáférés). | **javítva** |
| H2 | `server.ts:196-215, 240-258` | **Magas** | `/share/:token` és `/burn/:token` HTML kimenete megfelelő escape vagy CSP nélkül XSS-t tehetett lehetővé. | `escapeHtmlStrict()` minden dinamikus mezőn + szigorú `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` és `Cache-Control: no-store`. | **javítva** |
| H3 | `server/power/batch4OmniStudio.ts:1115, 1130-1170` | **Magas** | Egyszer használatos Égő Cetli (`/burn/:token`) kis entrópiájú tokennel és párhuzamos olvasási versenyhelyzettel többször is kiolvasható lehetett. | Legalább 24 karakteres kriptográfiai véletlen token + szinkron atomi `consumeEphemeralNote()` állapotfrissítés (első olvasás azonnal égeti/törli). Tesztelve: `Audit Fix 8`. | **javítva** |
| H4 | `server/power/batch4OmniStudio.ts:881-981, 1089-1110` | **Kritikus** | Matematikai függvényábrázoló `new Function` / `eval` alapú kódinjekciót és a kvízgenerátor escape nélküli XSS-t tartalmazott. **Repro:** `evaluateMathExpression('process.exit(1)', 1)`. | Saját rekurzív-leszállásos `evaluateMathExpression()` aritmetikai/trig elemző JS kiértékelés nélkül; `generateInteractiveQuizHtml` szigorú HTML/JSON escape-pel. Tesztelve: `Audit Fix 7` és `Audit Fix 8`. | **javítva** |
| H5 | `src/components/Batch3DataCreativePanel.tsx`, `Batch3InfraClusterPanel.tsx`, `SwarmChatView.tsx` | **Közepes** | 4 helyen `dangerouslySetInnerHTML` jelenített meg dinamikusan generált SVG-t (QR/szöveg/hálózati gráf) a React UI-ban. | Mind a 4 előfordulás kiváltva biztonságos `<img src="data:image/svg+xml;charset=utf-8,..." />` megjelenítésre (`dangerouslySetInnerHTML` számossága `src/` alatt: **0**). | **javítva** |

### 2.5. Titkok, `.gitignore`, Széf (Vault) és Git History
| # | Hely (`fájl:sor`) | Súlyosság | Leírás & Reprodukció | Javasolt / Alkalmazott Fix | Státusz |
|---|---|---|---|---|---|
| V1 | `.gitignore`, `.state.json.bak1-3`, `dev-dist/` | **Kritikus** | A munkakönyvtárban éles futásidejű állapotmentések (`.state.json.bak1-3`) és `dev-dist/` build kimenet voltak eltárolva. | Fájlok törölve a munkakönyvtárból; `.gitignore:10-21` kiegészítve (`.config.json`, `.state.json*`, `.secrets*`, `*.bak*`, `dev-dist/`, `/novaswarm.sqlite*`, `/backups/`). A távoli Git repóból `git rm --cached` szükséges. | **javítva** *(helyben)* / **kézi git rm szükséges** |
| V2 | `server/state/store.ts:53-125` | **Magas** | A `.secrets.vault.json` korábban fix kulcsszármaztatással működhetett; nem rendelkezett per-titok véletlen sóval. | `v2:` titkosítási formátum: `0600` jogosultságú `.secrets.key` mesterkulcs + véletlen 16 bájtos só + `crypto.scryptSync` + AES-256-GCM autentikált titkosítás. Tesztelve: `Audit Fix 2`. | **javítva** |
| V3 | Git commit történet | **Kritikus** | Korábbi commitokban maradhattak `.state.json*`, tokenek vagy API kulcsok. | Mivel nincs `.git` könyvtár a környezetben, a commit történet vizsgálata nem végezhető el automatikusan. Lásd az **5. fejezetben** a kötelező `git filter-repo` és kulcsrotációs lépéseket. | **nem ellenőrizhető** |

### 2.6. Telepítő (`install.sh`), Frissítő (`update.sh`) és OTA
| # | Hely (`fájl:sor`) | Súlyosság | Leírás & Reprodukció | Javasolt / Alkalmazott Fix | Státusz |
|---|---|---|---|---|---|
| I1 | `install.sh:10, 40-59` | **Magas** | Hardkódolt felhasználói útvonal (`/home/ngabika`) törte volna a telepítést más felhasználóneveknél; régebbi Node verzió elutasítása hiányzott. | Dinamikus `NOVASWARM_DIR` feloldás a szkript helyéből; explicit `Node.js >= 22.5` ellenőrzés és frissítés. | **javítva** |
| I2 | `update.sh:16-48` | **Magas** | Mentési mappa (`backups/`) és archívum jogosultságai túl lazák lehettek; csomagkezelő inkonzisztencia (`npm install` lockfile nélkül). | `chmod 700 backups`, `chmod 600` az archívumra és `.secrets*` fájlokra, `npm ci` előnyben részesítése, automatikus `git reset --hard` visszaállás hibás buildnél. | **javítva** |
| I3 | `update.sh:26-29`, `server/system/ops.ts:640-690` | **Magas** | Aláíratlan kód futtatása: a GitHub OTA alapból fast-forward `git pull`-t futtat; bár a `NOVASWARM_VERIFY_TAG_SIG=1` opció már támogatja a `git verify-commit FETCH_HEAD` ellenőrzést (`update.sh:26`), alapértelmezésként ki van kapcsolva (mivel aláírt remote tagek nélkül eltörné a frissítést). | **Ajánlás:** Állíts be GPG aláírást a GitHub commitokra/tagekre, és kapcsold be a `NOVASWARM_VERIFY_TAG_SIG=1` környezeti változót a `systemd` unitban. | **részben javítva** |
| I4 | `uninstall.sh:34-38` | **Alacsony** | `rm -rf` kockázatok ellenőrzése az eltávolítóban. | Interaktív megerősítéshez kötve, csak a `node_modules dist` mappákat törli a szkript saját könyvtárán belül. | **javítva** |

### 2.7. Audit Hash-lánc (M117) és Hamisításbiztosság
| # | Hely (`fájl:sor`) | Súlyosság | Leírás & Reprodukció | Javasolt / Alkalmazott Fix | Státusz |
|---|---|---|---|---|---|
| C1 | `server/state/store.ts:81-83, 1286-1404` | **Közepes** | Sima SHA-256 hash-lánc egy egyszerű támadó által újraszámolható volt, illetve a régebbi bejegyzések vágása (retention pruning) megszakította a `prevHash` folytonosságát. | Átállva **kulcsolt HMAC-SHA256**-ra (a `.secrets.key` fájlhoz kötött HMAC kulccsal), valamint `auditChainAnchor` tárolja az utolsó kivágott bejegyzés hash-ét, így a lánc végig validálható (`verifyAuditLogChain()`). Tesztelve: `Audit Fix 9`. | **javítva** *(belső sértetlenség)* |
| C2 | `server/state/store.ts:1318` | **Alacsony** | Külső, megváltoztathatatlan horgony (WORM / távoli syslog / blockchain-anchor) nincs bekötve: ha egy támadó megszerzi a hoston a `.secrets.key` fájlt és az írási jogot, a teljes HMAC-láncot helyben újra tudja számolni. | Opcionális külső audit-továbbító webhook vagy csak hozzáfűzhető (`chattr +a` / távoli rsyslog) naplósink bevezetése a jövőben. | **nyitva** *(architekturális korlát)* |

### 2.8. SQLite / `node:sqlite`, WAL és FTS5
| # | Hely (`fájl:sor`) | Súlyosság | Leírás & Reprodukció | Javasolt / Alkalmazott Fix | Státusz |
|---|---|---|---|---|---|
| Q1 | `README.md:65`, `install.sh:40`, `server/state/sqliteWal.ts:1` | **Magas** | A kódbázis a Node.js beépített `node:sqlite` (`DatabaseSync`) modulját használja (`22.5+` kötelező), de a régi README `Node 20+`-t írt, amin az app azonnal elhasalt (`ERR_UNKNOWN_BUILTIN_MODULE`). | README és `install.sh` frissítve **Node.js 22.5+**-ra. | **javítva** |
| Q2 | `server/state/sqliteWal.ts:28-115`, `server/infra/superAdmin.ts:266-276` | **Közepes** | SQL injection és adatbázis-teljesítmény: minden belső lekérdezés paraméterezett (`?` placeholder), WAL mód (`journal_mode = WAL`) + FTS5 virtuális tábla automatikus fallback-kel működik; az SQL böngésző (`exploreDatabase`) csak olvasható (`SELECT` / `PRAGMA`) lekérdezéseket enged, író műveleteket elutasít. | Megfelelő védelem, egységteszttel igazolva (`Ú33` teszt). | **javítva** |

### 2.9. Függőségek, Csomagkezelő és Sérülékenységek
| # | Hely (`fájl:sor`) | Súlyosság | Leírás & Reprodukció | Javasolt / Alkalmazott Fix | Státusz |
|---|---|---|---|---|---|
| D1 | `package.json`, `bun.lock` (törölve), `package-lock.json` | **Közepes** | Két egymásnak ellentmondó lockfile (`bun.lock` és `npm` szkriptek), valamint nem használt `motion` függőség volt a projektben. | `bun.lock` és `motion` eltávolítva; egységes `npm` + `package-lock.json` munkamenet beállítva. | **javítva** |
| D2 | `npm audit` (`glob`, `minimatch`) | **Alacsony** | 4 `moderate` sebezhetőség a `vite-plugin-pwa -> workbox-build -> glob/minimatch` fejlesztői/build láncban (nem futásidejű Express szerver kódban). | `npm audit --omit=dev` nem jelez `high`/`critical` hibát; a `vite-plugin-pwa` főverzió frissítése megfigyelés alatt. | **nyitva** *(alacsony kockázat, build-lánc)* |

### 2.10. Hibakezelés, Versenyhelyzetek, Pi 2 GB RAM, Autonóm Ciklusok, SSRF
| # | Hely (`fájl:sor`) | Súlyosság | Leírás & Reprodukció | Javasolt / Alkalmazott Fix | Státusz |
|---|---|---|---|---|---|
| R1 | `server/security/egressAndCrypto.ts:7-27, 45-120` | **Magas** | Az IPv4-re leképezett IPv6 címek (pl. `http://[::ffff:169.254.169.254]/`, amelyet Node `URL.hostname` `[::ffff:a9fe:a9fe]` hex alakra normalizál) és a DNS rebinding kijátszhatták az SSRF védelmet. **Repro:** `validateSafeOutboundUrl('http://[::ffff:169.254.169.254]/')`. | `isBlockedMetadataOrUnspecifiedIp()` dekódolja a `::ffff:XXXX:YYYY` IPv6 hex címeket IPv4-re és eltávolítja a zónaazonosítókat (`%eth0`); `validateSafeOutboundUrlAsync()` DNS feloldás után is ellenőrzi a cél IP-t. Tesztelve: `Audit Fix 10`. | **javítva** |
| R2 | `server/state/store.ts:134-150`, `server/providers/router.ts`, `server/system/hardwareOptimizer.ts` | **Közepes** | Állapotmentés atomi (`tmp` + `renameSync`), Ollama kérések Pi-barát mutexen és dinamikus `ollamaNumCtx: 2048` kereten futnak, 2 GB RAM alatt `--max-old-space-size=640` alkalmazva; autonóm ágens `maxToolSteps: 12` és `dailyCostLimitEnabled: true` védőkorláttal indul. **Korlát:** A `cachedState` memóriában gyorsítótárazott, így több külön OS-folyamat egyidejű futtatása felülírást okozhat (egyetlen `systemd` folyamathoz tervezve). | Egypéldányos futtatás garantálása `systemd`-vel; többfolyamatos skálázáshoz központi SQLite/PostgreSQL írás szükséges. | **részben javítva** *(1 folyamathoz biztonságos)* |
| R3 | `server/state/store.ts:548-560` | **Magas** | Korábban az `autonomousKanbanWorkerEnabled` vagy agresszív éjszakai műszak (Night Shift) felügyelet nélkül végtelen AI költési/futtatási ciklusba léphetett. | `fullAutonomousMode: false`, `nightShiftEnabled: false`, `autonomousKanbanWorkerEnabled: false` az alapértelmezett biztonságos állapot (`createDefaultSettings()`). | **javítva** |

### 2.11. Típusbiztonság, Halott Kód, Duplikáció és Tesztlefedettség
| # | Hely (`fájl:sor`) | Súlyosság | Leírás & Reprodukció | Javasolt / Alkalmazott Fix | Státusz |
|---|---|---|---|---|---|
| Q3 | `server/`, `src/`, `shared/` | **Alacsony** | Típusbiztonság (`: any`, `as any`, `@ts-ignore`, `@ts-expect-error`) ellenőrzése `grep`-pel. | **0 db** előfordulás a teljes kódbázisban; `npm run lint` (`tsc --noEmit`) teljesen tiszta. | **javítva** |
| Q4 | `tests/security_audit_fixes.test.ts` + 15 további tesztfájl | **Közepes** | Korábbi tesztek nem fedték le az SSRF IPv6 hex bypass-t, a CSRF-et, a fail-closed Telegram/v1/föderációs védelmet és a biztonságos matek-kiértékelőt. | Létrehozva a 10 célzott biztonsági teszt; a teljes tesztcsomag **86 / 86** zöld eredménnyel fut le. | **javítva** |

---

## 3. Funkció-Felülvizsgálat (~560 README ígéret vs. Valós Kód)

A korábbi iterációkban a README több mint ~560 elnevezett (`Mxxx`, `Úxxx`, `Batch 3–8`) funkciót sorolt fel. Az audit pontosította, hogy valójában mi működik a háttérben:

| Réteg / Csoport | Ígért darabszám | Valódi végrehajtás | Valós állapot és minősítés |
|---|---|---|---|
| **Mag rendszer** (Swarm Chat SSE, Multi-provider Router, Ollama mutex, SQLite WAL+FTS5, Auth, Vault, Telegram Bot, MCP, Skills) | ~45 | `server/providers/router.ts`, `server/telegram/bot.ts`, `server/state/store.ts`, `server/state/sqliteWal.ts`, `server/agents/engine.ts` | **100% Valódi** — éles hálózati, adatbázis-, kriptográfiai és AI API hívásokkal. |
| **Rendszer & Hardver** (PTY terminál, SSH költöztető, Docker/systemd menedzser, GPIO/CUPS/Kamera, LAN Wake-on-LAN / Port scan) | ~35 | `server/terminal/ptyManager.ts`, `server/infra/sshHostMigrator.ts`, `server/infra/hostAdmin.ts`, `server/power/batch5AutonomyEngine.ts` | **Valódi (külső Linux bináristól / hardvertől függő)** — konténerben vagy külső eszköz nélkül graceful fallback üzenetet ad (`unavailable`). |
| **Munkapad & Adat segédeszközök** (`M150–Ú300`: QR SVG, Base64/JSON/CSV, SQLite explorer, Diff, Regex, Cron, Matek/Fizika ábrázoló, Kvíz, Égő Cetli) | ~120 | `server/power/batch4OmniStudio.ts`, `devOpsStudio.ts`, `lifeAndFinanceStudio.ts`, `universalSuite.ts` | **Valódi helyi determinisztikus logika** — sok közülük kisebb (10–40 soros) segédfüggvény vagy matematikai képlet. |
| **Életvitel & Automatizálás** (Kamra, Költségvetés, Csomagkövető, SM-2 tanulókártya, Utazási lista, Okmányszéf, Szabálymotor) | ~90 | `server/automation/workflowsAndProductivity.ts`, `lifeAndFinanceStudio.ts`, `batch7UniverseEngine.ts` | **Valódi CRUD + lokális üzleti logika** (pl. IMAP/SMTP vagy MQTT/HA csak megadott szerver/hitelesítő adatokkal lép kapcsolatba). |
| **Batch 6–8 "Apex / Universe / Singularity" laborok** (`Ú350–Ú560`) | ~270 | `server/power/batch6ApexEngine.ts`, `batch7UniverseEngine.ts`, `batch8SingularityEngine.ts` | **Vegyes / Felduzzasztott számozás** — valódi funkciók mellett (pl. `/arfolyam`, `/lanmap`, `/varlog`, `/ha`) számos apró sablon-generátor, szövegátalakító és lokális kalkulátor kapott önálló `Úxxx` sorszámot. Az új README ezért elhagyja a félrevezető `560+` számháborút és a valós modulokra fókuszál. |

### Javasolt Egyszerűsített Architektúra: **Mag (Core) + Opcionális Modulok**
1. **Mag (Mindig aktív):** Chat, Ágens Router, Memória & Tudástár (`sqliteWal` + Obsidian), Auth/Vault/Telegram Allowlist, Beállítások.
2. **Munkapad Modul (Opt-in):** Kód/Diff/SQL/Regex/Kutatás és mini-app stúdió.
3. **Otthon & Életvitel Modul (Opt-in):** Automatizálás, okosotthon, költségvetés, kamra, okmányszéf.
4. **Rendszer & Költöztetés Modul (Opt-in, `hostPermissionsGranted` mögött):** PTY terminál, SSH költöztető, Docker/systemd, GPIO/Pi vezérlés, LAN hálózati szkenner.

---

## 4. UI Menü Átszervezése & `(i)` Konyhanyelvű Súgó

- **4 logikus főcsoport a bal oldali menüben (`src/App.tsx`):**
  1. **Napi munka:** Áttekintő, Csapat Chat, Munkapad, Terminál
  2. **Tudás & AI:** Ágensek & Csapat, Memória & Tudástár, AI Modellek & Költség, Képességek & Eszközök
  3. **Mindennapok & Otthon:** Életvitel & Automatizálás
  4. **Rendszer:** Rendszer & Költöztetés, Beállítások
- **Fejlesztői zaj eltávolítása:** Minden látható felületről kigyomlálva a technikai `Batch 3–8`, `B3`, `Mxxx`, `Úxxx`, `Fork Mxxx` azonosító.
- **`<InfoHint />` komponens (`src/components/InfoHint.tsx`):** Minden fő nézetben, beállításnál és funkciókártyán elérhető egy `(i)` gomb, amely kattintásra/érintésre hétköznapi, konyhanyelvű magyar magyarázatot jelenít meg arról, mire jó az adott funkció és mire érdemes figyelni a használatakor.

---

## 5. Kézi Teendők (Amiket neked kell végrehajtanod GitHubon / saját szerveren)

Mivel ebben a munkakörnyezetben nincs `.git` könyvtár és nincsenek meg a GitHub hozzáférési jogosultságaid, az alábbi lépéseket kézzel kell lefuttatnod a saját gépeden:

1. **Külön branch, `.gitignore` érvényesítése és Pull Request létrehozása:**
   ```bash
   git checkout -b audit/fixes
   git rm --cached -r --ignore-unmatch .state.json .state.json.bak* .secrets.key .secrets.vault.json .config.json dev-dist novaswarm.sqlite*
   git add -A
   git commit -m "security: full audit fixes, secure-by-default posture, UI reorganization"
   git push -u origin audit/fixes
   # Ezután nyiss Pull Requestet GitHubon az audit/fixes -> main ágra!
   ```

2. **Git History megtisztítása (ha korábbi commitba belekerült `.state.json*` vagy kulcs):**
   ```bash
   pip install git-filter-repo
   git filter-repo --invert-paths \
     --path .state.json --path .state.json.bak1 --path .state.json.bak2 --path .state.json.bak3 \
     --path .secrets.key --path .secrets.vault.json --path .config.json --path dev-dist
   git push --force --all
   ```

3. **Kötelező kulcs- és token-rotáció (ha valaha nyilvános repóba került titok):**
   - Állíts be **új Telegram Bot tokent** a `@BotFather`-nél (`/revoke`).
   - Állíts be **új AI API kulcsokat** (OpenAI / Gemini / Anthropic / OpenRouter / Groq) és töröld a régieket.
   - Töröld a régi `.secrets.key` fájlt az éles gépen való új kulcsok bevitele előtt, vagy állíts be erős új Web UI kezelői jelszót.

4. **OTA frissítés szigorítása (opcionális, erősen ajánlott):**
   - Írd alá GPG-vel a kiadási commitokat, és a `/etc/systemd/system/novaswarm.service` fájlban add meg az `Environment=NOVASWARM_VERIFY_TAG_SIG=1` sort.
