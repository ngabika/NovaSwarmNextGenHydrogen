import crypto from 'node:crypto';
import type {
  AgentHandoffTask,
  AgentPersonaProfile,
  ArchitectureBlueprint,
  CodeSnippetVaultItem,
  CommunicationDraft,
  DecisionMatrixRun,
  GlossaryTermItem,
  HierarchicalGoalNode,
  IncidentPlaybook,
  MeetingBriefRecord,
  OmniCapabilityEntry,
  ReadingDigestItem,
  RedTeamCritique,
  ScenarioSimulation,
  SmartChecklistTemplate,
  StudyPlanItem,
  TimeBlockSlot,
  UserContextProfile,
  VerifiedFactItem,
  WellnessCheckinItem,
  WritingStyleSample,
} from '../../shared/types';
import { appendAuditLog, getState, updateState } from '../state/store';

/* ============================================================================
 * 1. Built-in Personas, Context Profiles, Playbooks, Checklists & Snippets
 * ============================================================================ */

export function createDefaultAgentPersonas(): AgentPersonaProfile[] {
  return [
    {
      id: 'persona-architect',
      name: 'Szoftverarchitektus',
      roleTitle: 'Rendszertervező & Skálázási Szakértő',
      tone: 'precíz, strukturált, kompromisszum-tudatos',
      systemGuidance:
        'Válaszolj architektúra-szemlélettel: emeld ki az adatáramlást, a szűk keresztmetszeteket, az alternatívákat és a hibakezelést.',
      strengths: ['Rendszertervezés', 'API séma', 'Teljesítmény'],
      builtIn: true,
    },
    {
      id: 'persona-sysadmin',
      name: 'Linux & Homelab Mester',
      roleTitle: 'Debian / ARM64 / Docker Üzemeltető',
      tone: 'tömör, diagnosztikus, biztonságtudatos',
      systemGuidance:
        'Adj közvetlenül futtatható Linux parancsokat, systemd/journalctl/docker diagnosztikát, külön figyelve az ARM64 és alacsony RAM korlátokra.',
      strengths: ['Systemd', 'Hálózat', 'Hibaelhárítás'],
      builtIn: true,
    },
    {
      id: 'persona-researcher',
      name: 'Mélykutató & Elemző',
      roleTitle: 'Adatvezérelt Kritikai Kutató',
      tone: 'objektív, bizonyíték-orientált, alapos',
      systemGuidance:
        'Különítsd el a tényeket a feltételezésektől, jelöld a bizonytalanságokat, és strukturáld a megállapításokat forrás-szempontok szerint.',
      strengths: ['Kutatás', 'Tényellenőrzés', 'Szintézis'],
      builtIn: true,
    },
    {
      id: 'persona-strategist',
      name: 'Üzleti & Termék Stratéga',
      roleTitle: 'ROI, Piac & Prioritás Tanácsadó',
      tone: 'céltudatos, döntésorientált, számszerűsítő',
      systemGuidance:
        'Minden javaslatnál emeld ki a várható üzleti hatást, az idő/költség ráfordítást, a RICE prioritást és a következő konkrét lépést.',
      strengths: ['Stratégia', 'RICE/WSJF', 'Piaci pozicionálás'],
      builtIn: true,
    },
    {
      id: 'persona-socratic',
      name: 'Szókratészi Mentor',
      roleTitle: 'Mélytanulás & Kérdezéstechnikai Tanár',
      tone: 'bátorító, gondolatébresztő, fokozatos',
      systemGuidance:
        'Magyarázz analógiákkal, bontsd lépésekre a komplex fogalmakat, és zárd rövid ellenőrző kérdésekkel a megértés mélyítéséhez.',
      strengths: ['Oktatás', 'Feynman-technika', 'Analógiák'],
      builtIn: true,
    },
    {
      id: 'persona-reviewer',
      name: 'Szigorú Kód Reviewer',
      roleTitle: 'Minőségbiztosítás & Refaktorálási Auditor',
      tone: 'tárgyilagos, hibavadász, konstruktív',
      systemGuidance:
        'Keress peremfeltételeket, versenyhelyzeteket (race condition), N+1 lekérdezéseket, memória-szivárgást és javasolj tiszta teszteseteket.',
      strengths: ['Code Review', 'Tesztelés', 'Tiszta Kód'],
      builtIn: true,
    },
    {
      id: 'persona-secops',
      name: 'DevSecOps Auditor',
      roleTitle: 'Kibervédelmi & Titokkezelési Mérnök',
      tone: 'éber, védelmi fókuszú, szabványkövető',
      systemGuidance:
        'Vizsgálj minden bemenetet hitelesítés, jogosultság, injekció-védelem, TLS és legkisebb jogosultság elve szerint.',
      strengths: ['Biztonság', 'OWASP', 'Titkosítás'],
      builtIn: true,
    },
    {
      id: 'persona-finance',
      name: 'Személyes Pénzügyi Tervező',
      roleTitle: 'Cashflow, Deviza & Befektetési Elemző',
      tone: 'higgadt, számszerű, kockázatkezelő',
      systemGuidance:
        'Számolj pontos nettó/bruttó, reálhozam, infláció és likviditási tartalék mutatókkal magyar környezetre szabva.',
      strengths: ['Pénzügy', 'Adózás', 'Hozamszámítás'],
      builtIn: true,
    },
    {
      id: 'persona-coach',
      name: 'Fókusz & Teljesítmény Coach',
      roleTitle: 'Időmenedzsment & Szokásépítő Partner',
      tone: 'támogató, fegyelmezett, gyakorlatias',
      systemGuidance:
        'Segíts csökkenteni a kognitív terhelést: bontsd a nagy célokat 25 perces első lépésekre és védd a mélymunka idősávokat.',
      strengths: ['Időbeosztás', 'Szokások', 'Energia'],
      builtIn: true,
    },
    {
      id: 'persona-legal',
      name: 'Magyar Ügyintézési & Szerződés Asszisztens',
      roleTitle: 'Hivatalos Iratok & Fogyasztóvédelem',
      tone: 'szabatos, hivatali, közérthető',
      systemGuidance:
        'Fogalmazz szabatos magyar hivatali leveleket és mutass rá a szerződések kockázatos záradékaira (jogi tanácsadás helyetti előkészítésként).',
      strengths: ['Iratminták', 'Szerződés-elemzés', 'Reklamáció'],
      builtIn: true,
    },
    {
      id: 'persona-pm',
      name: 'Agilis Termékmenedzser',
      roleTitle: 'Specifikáció, User Story & Ütemterv',
      tone: 'tiszta, felhasználóközpontú, mérhető',
      systemGuidance:
        'Készíts világos elfogadási kritériumokat (Given/When/Then), MVP határokat és mérhető KPI-okat.',
      strengths: ['Product Spec', 'User Story', 'Prioritás'],
      builtIn: true,
    },
    {
      id: 'persona-writer',
      name: 'Szerkesztő & Kreatív Író',
      roleTitle: 'Stilisztika, Tömörítés & Történetmesélés',
      tone: 'választékos, ritmusos, lényegre törő',
      systemGuidance:
        'Tisztítsd meg a szöveget a töltelékszavaktól, erősítsd az aktív igéket és igazodj a kért célközönséghez.',
      strengths: ['Szövegírás', 'Szerkesztés', 'Prezentáció'],
      builtIn: true,
    },
  ];
}

export function createDefaultUserContexts(): UserContextProfile[] {
  return [
    {
      id: 'ctx-work',
      name: 'Munka & Mély Fejlesztés',
      focusArea: 'Kódolás, architektúra, rendszermérnöki munka',
      rules: 'Elsőbbség a technikai pontosságnak, példakódnak és azonnal futtatható parancsoknak.',
      preferredVerbosity: 'concise',
    },
    {
      id: 'ctx-home',
      name: 'Otthon & Okosotthon',
      focusArea: 'Háztartás, karbantartás, családi teendők, kiadások',
      rules: 'Gyakorlatias, rövid lépések, emlékeztetők és költségkímélő javaslatok.',
      preferredVerbosity: 'balanced',
    },
    {
      id: 'ctx-study',
      name: 'Tanulás & Kutatás',
      focusArea: 'Új technológiák, nyelvek, vizsgafelkészülés',
      rules: 'Lépésről lépésre építkező magyarázatok példákkal és ellenőrző kérdésekkel.',
      preferredVerbosity: 'exhaustive',
    },
    {
      id: 'ctx-travel',
      name: 'Utazás & Mobil',
      focusArea: 'Útvonalak, csomaglisták, gyors Telegram kommunikáció',
      rules: 'Ultra-tömör, mobilbarát válaszok bullet pontokban.',
      preferredVerbosity: 'concise',
    },
    {
      id: 'ctx-finance',
      name: 'Pénzügy & Adminisztráció',
      focusArea: 'Költségvetés, befektetések, hivatalos ügyek',
      rules: 'Számok pontos feltüntetése HUF/EUR bontásban, kockázati figyelmeztetésekkel.',
      preferredVerbosity: 'balanced',
    },
  ];
}

export function createDefaultIncidentPlaybooks(): IncidentPlaybook[] {
  return [
    {
      id: 'pb-oom',
      slug: 'linux-oom',
      title: 'Magas RAM / OOM Killer Elhárítás',
      severity: 'critical',
      symptoms: ['Szolgáltatás hirtelen újraindul', 'dmesg Killed process', 'Swap 95%+'],
      steps: [
        { id: 's1', commandOrCheck: 'free -m && ps aux --sort=-%mem | head -n 10', done: false },
        { id: 's2', commandOrCheck: 'dmesg -T | grep -i -E "oom|killed" | tail -n 15', done: false },
        { id: 's3', commandOrCheck: 'Ollama modell ürítés / Node heap limit ellenőrzése', done: false },
      ],
    },
    {
      id: 'pb-nginx-502',
      slug: 'reverse-proxy-502',
      title: 'Reverse Proxy 502 Bad Gateway',
      severity: 'high',
      symptoms: ['502 válasz böngészőben', 'Upstream kapcsolat elutasítva'],
      steps: [
        { id: 's1', commandOrCheck: 'ss -tulpn | grep :3000', done: false },
        { id: 's2', commandOrCheck: 'systemctl status novaswarm --no-pager', done: false },
        { id: 's3', commandOrCheck: 'nginx -t && journalctl -u nginx -n 40', done: false },
      ],
    },
    {
      id: 'pb-docker-crash',
      slug: 'docker-crashloop',
      title: 'Docker Konténer CrashLoopBackOff',
      severity: 'high',
      symptoms: ['Restarting státusz', 'Kilépési kód 1 vagy 137'],
      steps: [
        { id: 's1', commandOrCheck: 'docker ps -a --format "table {{.Names}}\\t{{.Status}}"', done: false },
        { id: 's2', commandOrCheck: 'docker logs --tail 80 <kontener>', done: false },
        { id: 's3', commandOrCheck: 'docker system df (lemezhely ellenőrzés)', done: false },
      ],
    },
    {
      id: 'pb-sqlite-lock',
      slug: 'sqlite-locked',
      title: 'SQLite Database Locked / WAL Recovery',
      severity: 'medium',
      symptoms: ['SQLITE_BUSY', 'Lassú írási művelet'],
      steps: [
        { id: 's1', commandOrCheck: 'PRAGMA wal_checkpoint(TRUNCATE); PRAGMA quick_check;', done: false },
        { id: 's2', commandOrCheck: 'lsof | grep .sqlite (zároló folyamatok listázása)', done: false },
      ],
    },
    {
      id: 'pb-ssl-exp',
      slug: 'ssl-expiry',
      title: 'TLS / SSL Tanúsítvány Lejárat',
      severity: 'high',
      symptoms: ['ERR_CERT_DATE_INVALID', '< 7 nap hátra'],
      steps: [
        { id: 's1', commandOrCheck: 'certbot certificates || openssl s_client -connect host:443', done: false },
        { id: 's2', commandOrCheck: 'certbot renew --dry-run && systemctl reload nginx', done: false },
      ],
    },
    {
      id: 'pb-io-wait',
      slug: 'sd-iowait',
      title: 'Magas Lemez I/O Wait / SD Lassulás',
      severity: 'medium',
      symptoms: ['Load average magas alacsony CPU mellett', 'wa% > 25%'],
      steps: [
        { id: 's1', commandOrCheck: 'vmstat 1 5 && df -h && df -i', done: false },
        { id: 's2', commandOrCheck: 'SD-kártya Kímélő Mód engedélyezése + WAL flush', done: false },
      ],
    },
  ];
}

export function createDefaultSmartChecklists(): SmartChecklistTemplate[] {
  return [
    {
      id: 'chk-server-setup',
      title: 'Új Linux / Pi Szerver Élesítés',
      category: 'Üzemeltetés',
      items: [
        { id: 'i1', label: 'SSH kulcsos belépés + Fail2ban ellenőrzése', checked: false },
        { id: 'i2', label: 'UFW tűzfal portok szűkítése (22, 80, 443, 3000)', checked: false },
        { id: 'i3', label: 'ZRAM / Swap + loginctl enable-linger beállítása', checked: false },
        { id: 'i4', label: 'Automatikus biztonsági mentés és Telegram tesztüzenet', checked: false },
      ],
    },
    {
      id: 'chk-release-qa',
      title: 'Kódkiadás Előtti Minőség-Ellenőrzés',
      category: 'Fejlesztés',
      items: [
        { id: 'i1', label: 'npm run lint és npm run build zöld', checked: false },
        { id: 'i2', label: 'Teljes unit tesztcsomag futtatása (0 fail)', checked: false },
        { id: 'i3', label: 'Titkos kulcsok (.env / vault) gitignore ellenőrzése', checked: false },
        { id: 'i4', label: 'Changelog frissítése és rollback tag létrehozása', checked: false },
      ],
    },
    {
      id: 'chk-travel',
      title: 'Utazás Indulási Ellenőrzőlista',
      category: 'Élet-OS',
      items: [
        { id: 'i1', label: 'Személyi / Útlevél, bankkártya, biztosítás', checked: false },
        { id: 'i2', label: 'Töltők, powerbank, adapter, fülhallgató', checked: false },
        { id: 'i3', label: 'NovaSwarm "Utazás" üzemmód bekapcsolása', checked: false },
      ],
    },
    {
      id: 'chk-security-audit',
      title: 'Havi Otthoni Hálózat & Adatvédelem Audit',
      category: 'Biztonság',
      items: [
        { id: 'i1', label: 'LAN ismeretlen MAC-címek ellenőrzése', checked: false },
        { id: 'i2', label: 'Kiszivárgott jelszavak (HIBP) és API kulcs rotáció', checked: false },
        { id: 'i3', label: 'Offline biztonsági mentés visszaállítási próba', checked: false },
      ],
    },
    {
      id: 'chk-weekly-reset',
      title: 'Heti Vasárnapi Rendszerezés (GTD)',
      category: 'Produktivitás',
      items: [
        { id: 'i1', label: 'Kanban kártyák és lejárt határidők átnézése', checked: false },
        { id: 'i2', label: 'Havi fix kiadások és előfizetések ellenőrzése', checked: false },
        { id: 'i3', label: 'Következő hét Top 3 céljának rögzítése', checked: false },
      ],
    },
  ];
}

export function createDefaultCodeSnippets(): CodeSnippetVaultItem[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'snip-systemd-tail',
      title: 'Systemd élő hibakereső napló',
      language: 'bash',
      code: 'journalctl -u {{service}} -n {{lines}} -f --no-pager',
      tags: ['linux', 'systemd', 'debug'],
      useCount: 0,
      createdAt: now,
    },
    {
      id: 'snip-docker-cleanup',
      title: 'Biztonságos Docker lemezfelszabadítás',
      language: 'bash',
      code: 'docker image prune -af --filter "until={{hours}}h" && docker builder prune -f',
      tags: ['docker', 'cleanup'],
      useCount: 0,
      createdAt: now,
    },
    {
      id: 'snip-sqlite-backup',
      title: 'Online SQLite konzisztens mentés',
      language: 'bash',
      code: 'sqlite3 {{db_path}} ".backup \'{{out_path}}\'"',
      tags: ['sqlite', 'backup'],
      useCount: 0,
      createdAt: now,
    },
  ];
}

export function createDefaultGlossaryTerms(): GlossaryTermItem[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'gl-rrf',
      term: 'RRF (Reciprocal Rank Fusion)',
      domain: 'AI Memória',
      definition: 'Több keresőalgoritmus (pl. vektoros + BM25 kulcsszavas) rangsorát egyesítő robusztus pontozási eljárás: sum(1 / (k + rank)).',
      example: 'A NovaSwarm hibrid memóriakeresője RRF-fel rangsorolja a találatokat.',
      createdAt: now,
    },
    {
      id: 'gl-mmr',
      term: 'MMR (Maximal Marginal Relevance)',
      domain: 'Információ-visszakeresés',
      definition: 'Olyan szűrési stratégia, amely a relevancia mellett bünteti a túl hasonló (redundáns) találatokat a változatos kontextus érdekében.',
      createdAt: now,
    },
  ];
}

/* ============================================================================
 * 2. Persona, Context, Style Fingerprint, Fact Vault & Tone Tools (Ú361–Ú385)
 * ============================================================================ */

export function setActivePersona(personaIdOrName: string): AgentPersonaProfile {
  const s = getState();
  const personas = s.agentPersonas && s.agentPersonas.length > 0 ? s.agentPersonas : createDefaultAgentPersonas();
  const q = personaIdOrName.trim().toLowerCase();
  const found =
    personas.find((p) => p.id.toLowerCase() === q) ||
    personas.find((p) => p.name.toLowerCase().includes(q)) ||
    personas.find((p) => p.roleTitle.toLowerCase().includes(q));
  if (!found) throw new Error(`Nem található ilyen persona: ${personaIdOrName}`);

  updateState((draft) => {
    if (!draft.agentPersonas || draft.agentPersonas.length === 0) {
      draft.agentPersonas = personas;
    }
    draft.settings.activePersonaId = found.id;
  });
  return found;
}

export function createAgentPersona(input: {
  name: string;
  roleTitle: string;
  tone: string;
  systemGuidance: string;
  strengths?: string[];
}): AgentPersonaProfile {
  const name = input.name.trim();
  if (!name) throw new Error('A persona neve kötelező.');
  const item: AgentPersonaProfile = {
    id: `persona-${crypto.randomUUID().slice(0, 8)}`,
    name,
    roleTitle: input.roleTitle.trim() || 'Egyedi Asszisztens Szakértő',
    tone: input.tone.trim() || 'tárgyilagos, segítőkész',
    systemGuidance: input.systemGuidance.trim() || `Viselkedj úgy, mint ${name}.`,
    strengths: (input.strengths || []).filter(Boolean).slice(0, 6),
    builtIn: false,
  };
  updateState((s) => {
    const base = s.agentPersonas && s.agentPersonas.length > 0 ? s.agentPersonas : createDefaultAgentPersonas();
    s.agentPersonas = [item, ...base].slice(0, 40);
    s.settings.activePersonaId = item.id;
  });
  return item;
}

export function setActiveUserContext(contextIdOrName: string): UserContextProfile {
  const s = getState();
  const contexts =
    s.userContextProfiles && s.userContextProfiles.length > 0
      ? s.userContextProfiles
      : createDefaultUserContexts();
  const q = contextIdOrName.trim().toLowerCase();
  const found =
    contexts.find((c) => c.id.toLowerCase() === q) ||
    contexts.find((c) => c.name.toLowerCase().includes(q));
  if (!found) throw new Error(`Ismeretlen kontextus profil: ${contextIdOrName}`);
  updateState((draft) => {
    if (!draft.userContextProfiles || draft.userContextProfiles.length === 0) {
      draft.userContextProfiles = contexts;
    }
    draft.settings.activeUserContextId = found.id;
    draft.settings.adaptiveVerbosity = found.preferredVerbosity;
  });
  return found;
}

export function analyzeWritingStyle(label: string, sampleText: string): WritingStyleSample {
  const clean = sampleText.trim();
  if (clean.length < 20) throw new Error('Adj meg legalább 20 karakteres szövegmintát az elemzéshez.');
  const sentences = clean.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const words = clean.toLowerCase().match(/[\p{L}\p{N}-]+/gu) || [];
  const uniqueWords = new Set(words);
  const avgSentenceWords = Number((words.length / Math.max(1, sentences.length)).toFixed(1));
  const lexicalDiversity = Number((uniqueWords.size / Math.max(1, words.length)).toFixed(2));

  const formalMarkers = ['tisztelt', 'kérem', 'tájékoztatom', 'amennyiben', 'szíveskedjen', 'üdvözlettel', 'hivatkozással'];
  const informalMarkers = ['szia', 'köszi', 'helló', 'oké', 'szuper', 'üdv', 'haha', 'amúgy'];
  const lower = clean.toLowerCase();
  let formalityScore = 50;
  for (const m of formalMarkers) if (lower.includes(m)) formalityScore += 10;
  for (const m of informalMarkers) if (lower.includes(m)) formalityScore -= 10;
  if (avgSentenceWords > 16) formalityScore += 8;
  formalityScore = Math.max(0, Math.min(100, formalityScore));

  // Extract 2-word frequent bigrams as signature phrases
  const bigramCounts = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i].length < 3 || words[i + 1].length < 3) continue;
    const bg = `${words[i]} ${words[i + 1]}`;
    bigramCounts.set(bg, (bigramCounts.get(bg) || 0) + 1);
  }
  const signaturePhrases = Array.from(bigramCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([p]) => p);

  const sample: WritingStyleSample = {
    id: `style-${crypto.randomUUID().slice(0, 8)}`,
    label: label.trim() || 'Saját Stílusminta',
    avgSentenceWords,
    lexicalDiversity,
    formalityScore,
    signaturePhrases,
    createdAt: new Date().toISOString(),
  };

  updateState((s) => {
    s.writingStyleSamples = [sample, ...(s.writingStyleSamples || [])].slice(0, 20);
  });
  return sample;
}

export function upsertFactVault(input: {
  category?: string;
  factKey: string;
  factValue: string;
  confidence?: number;
}): VerifiedFactItem {
  const factKey = input.factKey.trim();
  const factValue = input.factValue.trim();
  if (!factKey || !factValue) throw new Error('A tény kulcsa és értéke is kötelező.');
  const now = new Date().toISOString();
  let saved!: VerifiedFactItem;
  updateState((s) => {
    const list = [...(s.factVault || [])];
    const existingIdx = list.findIndex((f) => f.factKey.toLowerCase() === factKey.toLowerCase());
    if (existingIdx >= 0) {
      saved = {
        ...list[existingIdx],
        category: input.category?.trim() || list[existingIdx].category,
        factValue,
        confidence: input.confidence ?? 1.0,
        updatedAt: now,
      };
      list[existingIdx] = saved;
    } else {
      saved = {
        id: `fact-${crypto.randomUUID().slice(0, 8)}`,
        category: input.category?.trim() || 'Általános',
        factKey,
        factValue,
        confidence: input.confidence ?? 1.0,
        updatedAt: now,
      };
      list.unshift(saved);
    }
    s.factVault = list.slice(0, 200);
  });
  return saved;
}

export function queryFactVault(query = ''): VerifiedFactItem[] {
  const q = query.trim().toLowerCase();
  const list = getState().factVault || [];
  if (!q) return list;
  return list.filter(
    (f) =>
      f.factKey.toLowerCase().includes(q) ||
      f.factValue.toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q)
  );
}

export function transformTextTone(
  text: string,
  targetTone: 'formal' | 'casual' | 'assertive' | 'empathetic' | 'bullet_executive'
): { transformed: string; changesApplied: string[] } {
  const raw = text.trim();
  if (!raw) throw new Error('Üres szöveg nem alakítható át.');
  const changesApplied: string[] = [];

  if (targetTone === 'bullet_executive') {
    const sentences = raw.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    const tldr = sentences[0] || raw.slice(0, 140);
    const points = sentences.slice(0, 5).map((s) => `- ${s}`);
    changesApplied.push('BLUF összefoglaló + max. 5 végrehajtási pont');
    return {
      transformed: `Lényeg (BLUF): ${tldr}\n\nFő pontok:\n${points.join('\n')}`,
      changesApplied,
    };
  }

  let out = raw;
  if (targetTone === 'formal') {
    out = out
      .replace(/\b[Ss]zia\b[!,.]?\s*/g, 'Tisztelt Címzett!\n\n')
      .replace(/\b[Kk]öszi\b/g, 'Köszönöm szépen')
      .replace(/\b[Ll]égyszi\b/g, 'Kérem szíveskedjen');
    if (!/^(Tisztelt|Kedves)/i.test(out)) out = `Tisztelt Címzett!\n\n${out}`;
    if (!/(Üdvözlettel|Tisztelettel)/i.test(out)) out = `${out}\n\nTisztelettel,\n`;
    changesApplied.push('Hivatali megszólítás és zárás alkalmazva');
  } else if (targetTone === 'casual') {
    out = out
      .replace(/Tisztelt Címzett[,!]?\s*/gi, 'Szia! ')
      .replace(/Tisztelettel[,!]?/gi, 'Üdv,')
      .replace(/\bkérem szíveskedjen\b/gi, 'légyszi nézz rá');
    changesApplied.push('Közvetlen, barátságos megszólításra alakítva');
  } else if (targetTone === 'assertive') {
    out = out.replace(/\btalán\b|\besetleg\b|\bha nem gond\b/gi, '').replace(/\s{2,}/g, ' ').trim();
    if (!out.toLowerCase().includes('határidő')) {
      out = `${out}\n\nKérem a visszajelzést és a következő lépés megerősítését a megbeszélt ütemezés tartása érdekében.`;
    }
    changesApplied.push('Bizonytalan töltelékszavak eltávolítva, határozott lezárás hozzáfűzve');
  } else if (targetTone === 'empathetic') {
    out = `Teljes mértékben megértem a helyzetet és köszönöm a türelmét.\n\n${out}\n\nMindenben segítünk, hogy a lehető leggyorsabban és megnyugtatóan megoldódjon.`;
    changesApplied.push('Empatikus nyitó- és megerősítő zárókeret hozzáadva');
  }
  return { transformed: out, changesApplied };
}

export function analyzeProseQuality(text: string): {
  wordCount: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
  estimatedReadMinutes: number;
  estimatedSpeakSeconds: number;
  fillerHits: string[];
  passiveHits: number;
  readabilityScore: number;
  suggestions: string[];
} {
  const clean = text.trim();
  const words = clean.match(/[\p{L}\p{N}-]+/gu) || [];
  const sentences = clean.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const wordCount = words.length;
  const sentenceCount = Math.max(1, sentences.length);
  const avgWordsPerSentence = Number((wordCount / sentenceCount).toFixed(1));
  const estimatedReadMinutes = Number((wordCount / 210).toFixed(2));
  const estimatedSpeakSeconds = Math.round((wordCount / 135) * 60);

  const fillers = ['igazából', 'gyakorlatilag', 'valahogy', 'tulajdonképpen', 'amúgy', 'bizonyos mértékig', 'alapvetően'];
  const lower = clean.toLowerCase();
  const fillerHits = fillers.filter((f) => new RegExp(`\\b${f}\\b`, 'i').test(lower));
  const passiveHits = (clean.match(/\b(került|lett|van|lesz)\s+\p{L}+(va|ve|tva|tve)\b/giu) || []).length;

  const avgWordLen = words.reduce((a, w) => a + w.length, 0) / Math.max(1, wordCount);
  const readabilityScore = Math.max(
    5,
    Math.min(100, Math.round(115 - avgWordsPerSentence * 1.4 - avgWordLen * 4.5))
  );

  const suggestions: string[] = [];
  if (avgWordsPerSentence > 22) suggestions.push('Törd ketté a 22 szónál hosszabb mondatokat a gyorsabb áttekinthetőséghez.');
  if (fillerHits.length > 0) suggestions.push(`Töltelékszavak csökkentése ajánlott: ${fillerHits.join(', ')}.`);
  if (passiveHits > 1) suggestions.push('Cseréld a passzív szerkezeteket aktív igékre.');
  if (suggestions.length === 0) suggestions.push('Kiegyensúlyozott, tiszta és jól olvasható szövegszerkezet.');

  return {
    wordCount,
    sentenceCount,
    avgWordsPerSentence,
    estimatedReadMinutes,
    estimatedSpeakSeconds,
    fillerHits,
    passiveHits,
    readabilityScore,
    suggestions,
  };
}

export function generateStructuredFramework(
  kind: 'adr' | 'rfc' | 'swot' | '5whys' | 'star' | 'postmortem' | 'eisenhower' | 'bluf',
  topic: string
): { kind: string; markdown: string } {
  const t = topic.trim() || 'Kiválasztott Téma';
  const templates: Record<typeof kind, string> = {
    adr: `# ADR: ${t}\n- **Státusz**: Javasolt\n- **Kontextus**: Milyen technikai vagy üzleti kényszer indokolja a döntést?\n- **Döntés**: Mit választottunk és miért?\n- **Alternatívák**: Elvetett opciók és okaik\n- **Következmények**: Karbantartási, költség- és kockázati hatás`,
    rfc: `# RFC: ${t}\n## 1. Összefoglaló\nCélkitűzés és megoldandó probléma.\n## 2. Részletes Tervezés\nAPI szerződések, adatmodell, migráció.\n## 3. Biztonság & Skálázás\nKockázatok és teljesítmény-keret.\n## 4. Visszaállítási Terv (Rollback)\nMit teszünk hiba esetén?`,
    swot: `# SWOT Elemzés — ${t}\n- **Erősségek (S)**: Belső versenyelőny, meglévő tudás\n- **Gyengeségek (W)**: Erőforrás-korlát, hiányzó képesség\n- **Lehetőségek (O)**: Piaci/technológiai trendek\n- **Veszélyek (T)**: Külső kockázatok, költségnövekedés`,
    '5whys': `# 5 Miért (5 Whys) Gyökérok — ${t}\n1. Miért fordult elő? → \n2. Miért nem jelezte az ellenőrzés? → \n3. Miért hiányzott a védelem? → \n4. Miért nem volt automatikus teszt? → \n5. Rendszerszintű gyökérok & megelőző lépés → `,
    star: `# STAR Interjú / Esettanulmány — ${t}\n- **Situation (Helyzet)**: Kiindulási probléma és kontextus\n- **Task (Feladat)**: Saját felelősség és cél\n- **Action (Cselekvés)**: Konkrét technikai/vezetői lépések\n- **Result (Eredmény)**: Számszerűsített hatás és tanulság`,
    postmortem: `# Hibaelemzés (Post-Mortem) — ${t}\n- **Idővonal**: Észlelés → Vizsgálat → Helyreállítás\n- **Gyökérok**: Közvetlen kiváltó ok\n- **Hatás**: Érintett felhasználók / időtartam\n- **Akciópontok**: Megelőző automatizálás felelőssel és határidővel`,
    eisenhower: `# Eisenhower Prioritási Mátrix — ${t}\n1. **Sürgős + Fontos (Azonnal)**: Kritikus elhárítás\n2. **Nem sürgős + Fontos (Ütemezendő)**: Stratégiai építkezés\n3. **Sürgős + Nem fontos (Delegálandó)**: Admin/rutin\n4. **Egyik sem (Elhagyandó)**: Zaj kiszűrése`,
    bluf: `# BLUF Vezetői Összefoglaló — ${t}\n**Alapállítás (1. mondat)**: Fő döntési javaslat.\n**Háttér**: 3 tömör adatpont.\n**Kért jóváhagyás / Következő lépés**: Konkrét határidővel.`,
  };
  return { kind, markdown: templates[kind] };
}

/* ============================================================================
 * 3. Cognitive Planner: Goal Trees, Handoffs, Decision Matrix, Scenarios, Red Team & Estimations (Ú386–Ú415)
 * ============================================================================ */

export function createGoalTree(input: {
  title: string;
  horizon?: HierarchicalGoalNode['horizon'];
  milestones?: string[];
}): HierarchicalGoalNode {
  const title = input.title.trim();
  if (!title) throw new Error('A cél megnevezése kötelező.');
  const rawSteps =
    input.milestones && input.milestones.length > 0
      ? input.milestones.filter(Boolean)
      : [
          `Kutatás és peremfeltételek rögzítése: ${title}`,
          'MVP / első működő prototípus elkészítése',
          'Tesztelés, visszamérés és élesítés',
        ];
  const node: HierarchicalGoalNode = {
    id: `goal-${crypto.randomUUID().slice(0, 8)}`,
    title,
    horizon: input.horizon || 'monthly',
    milestones: rawSteps.map((s) => ({
      id: `ms-${crypto.randomUUID().slice(0, 6)}`,
      title: s.trim(),
      weight: 1,
      done: false,
    })),
    progressPercent: 0,
    createdAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.goalTrees = [node, ...(s.goalTrees || [])].slice(0, 40);
  });
  return node;
}

export function toggleGoalMilestone(goalId: string, milestoneId: string): HierarchicalGoalNode {
  let updated!: HierarchicalGoalNode;
  updateState((s) => {
    const goal = (s.goalTrees || []).find((g) => g.id === goalId);
    if (!goal) throw new Error('Célfa nem található.');
    const ms = goal.milestones.find((m) => m.id === milestoneId);
    if (!ms) throw new Error('Mérföldkő nem található.');
    ms.done = !ms.done;
    const totalW = goal.milestones.reduce((a, m) => a + (m.weight || 1), 0);
    const doneW = goal.milestones.filter((m) => m.done).reduce((a, m) => a + (m.weight || 1), 0);
    goal.progressPercent = totalW > 0 ? Math.round((doneW / totalW) * 100) : 0;
    updated = { ...goal, milestones: [...goal.milestones] };
  });
  return updated;
}

export function createAgentHandoff(title: string, initialNote = ''): AgentHandoffTask {
  const clean = title.trim();
  if (!clean) throw new Error('A feladat címe kötelező.');
  const now = new Date().toISOString();
  const task: AgentHandoffTask = {
    id: `ho-${crypto.randomUUID().slice(0, 8)}`,
    title: clean,
    stage: 'planner',
    notes: [
      {
        stage: 'planner',
        author: 'Tervező Ágens',
        summary: initialNote.trim() || 'Specifikáció és lépéssor előkészítve.',
        at: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  updateState((s) => {
    s.agentHandoffs = [task, ...(s.agentHandoffs || [])].slice(0, 40);
  });
  return task;
}

export function advanceAgentHandoff(handoffId: string, summary = ''): AgentHandoffTask {
  const order: AgentHandoffTask['stage'][] = ['planner', 'builder', 'reviewer', 'verifier', 'completed'];
  const stageAuthors: Record<AgentHandoffTask['stage'], string> = {
    planner: 'Tervező Ágens',
    builder: 'Végrehajtó Ágens',
    reviewer: 'Kód Reviewer',
    verifier: 'Felügyelő Auditor',
    completed: 'Rendszer Lezárás',
  };
  let result!: AgentHandoffTask;
  updateState((s) => {
    const task = (s.agentHandoffs || []).find((h) => h.id === handoffId);
    if (!task) throw new Error('Handoff feladat nem található.');
    const idx = order.indexOf(task.stage);
    const nextStage = order[Math.min(order.length - 1, idx + 1)];
    const now = new Date().toISOString();
    task.stage = nextStage;
    task.updatedAt = now;
    task.notes.push({
      stage: nextStage,
      author: stageAuthors[nextStage],
      summary: summary.trim() || `${nextStage} fázis ellenőrizve és átadva.`,
      at: now,
    });
    result = { ...task, notes: [...task.notes] };
  });
  return result;
}

export function evaluateDecisionMatrix(input: {
  title: string;
  criteria: Array<{ name: string; weight: number }>;
  options: Array<{ name: string; scores: number[] }>;
}): DecisionMatrixRun {
  const title = input.title.trim() || 'Döntési Mátrix';
  if (!input.criteria || input.criteria.length === 0) throw new Error('Legalább 1 szempont szükséges.');
  if (!input.options || input.options.length < 2) throw new Error('Legalább 2 alternatíva szükséges.');

  const weightSum = input.criteria.reduce((a, c) => a + Math.max(0.1, Number(c.weight) || 1), 0);
  const normalizedCriteria = input.criteria.map((c) => ({
    name: c.name.trim() || 'Szempont',
    weight: Number(((Math.max(0.1, Number(c.weight) || 1) / weightSum) * 100).toFixed(1)),
  }));

  const evaluatedOptions = input.options
    .map((opt) => {
      const scores = normalizedCriteria.map((_, idx) => {
        const raw = Number(opt.scores?.[idx] ?? 5);
        return Math.max(1, Math.min(10, Number.isFinite(raw) ? raw : 5));
      });
      const weightedTotal = Number(
        scores.reduce((acc, sc, idx) => acc + sc * (normalizedCriteria[idx].weight / 100), 0).toFixed(2)
      );
      return { name: opt.name.trim() || 'Opció', scores, weightedTotal };
    })
    .sort((a, b) => b.weightedTotal - a.weightedTotal);

  const best = evaluatedOptions[0];
  const second = evaluatedOptions[1];
  const marginPercent =
    second && second.weightedTotal > 0
      ? Number((((best.weightedTotal - second.weightedTotal) / second.weightedTotal) * 100).toFixed(1))
      : 0;

  const run: DecisionMatrixRun = {
    id: `dm-${crypto.randomUUID().slice(0, 8)}`,
    title,
    criteria: normalizedCriteria,
    options: evaluatedOptions,
    winnerName: best.name,
    marginPercent,
    createdAt: new Date().toISOString(),
  };

  updateState((s) => {
    s.decisionMatrixRuns = [run, ...(s.decisionMatrixRuns || [])].slice(0, 30);
  });
  return run;
}

export function runScenarioSimulation(topic: string): ScenarioSimulation {
  const clean = topic.trim();
  if (!clean) throw new Error('A szimuláció témája kötelező.');
  const sim: ScenarioSimulation = {
    id: `sc-${crypto.randomUUID().slice(0, 8)}`,
    topic: clean,
    optimistic: {
      summary: `${clean}: zökkenőmentes bevezetés, azonnali hatékonyságnövekedés és pozitív visszacsatolás.`,
      probabilityPct: 25,
      triggers: ['Stabil első prototípus 48 órán belül', 'Nincs függőségi vagy kapacitás-szűkület'],
    },
    realistic: {
      summary: `${clean}: 1-2 iterációs finomhangolással és közepes ráfordítással tartósan működő eredmény.`,
      probabilityPct: 55,
      triggers: ['Részleges ütközések korai feltárása', 'Automatizált tesztek és fokozatos átállás'],
    },
    pessimistic: {
      summary: `${clean}: rejtett integrációs hiba, idő/költség csúszás vagy külső API korlátozás.`,
      probabilityPct: 20,
      mitigations: ['Előzetes dry-run / sandbox ellenőrzés', 'Azonnali rollback pillanatkép és offline fallback'],
    },
    createdAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.scenarioSimulations = [sim, ...(s.scenarioSimulations || [])].slice(0, 30);
  });
  return sim;
}

export function runRedTeamCritique(proposal: string): RedTeamCritique {
  const clean = proposal.trim();
  if (!clean) throw new Error('A vizsgálandó javaslat/ötlet megadása kötelező.');
  const lower = clean.toLowerCase();

  const blindSpots: string[] = [];
  const failureModes: string[] = [];
  const recommendations: string[] = [];
  let riskScore = 35;

  if (!lower.includes('mentés') && !lower.includes('backup') && !lower.includes('rollback')) {
    blindSpots.push('Hiányzik az explicit visszaállítási (rollback) vagy biztonsági mentési terv.');
    riskScore += 15;
  }
  if (!lower.includes('teszt') && !lower.includes('mérés') && !lower.includes('ellenőrz')) {
    blindSpots.push('Nincs megadva mérhető elfogadási vagy ellenőrzési feltétel.');
    riskScore += 12;
  }
  if (lower.includes('gyors') || lower.includes('azonnal') || lower.includes('minden')) {
    blindSpots.push('A túl tág vagy azonnali bevezetési elvárás növeli a regresszió esélyét.');
    riskScore += 10;
  }
  if (blindSpots.length === 0) {
    blindSpots.push('Külső függőségek (API rate-limit, hálózati kiesés) hatása részletesebben tisztázandó.');
  }

  failureModes.push(
    'Single Point of Failure: ha az elsődleges szolgáltatás vagy hálózati kapcsolat leáll, van-e lokális tartalék?',
    'Karbantartási teher: ki és milyen gyakran ellenőrzi az állapotát 3 hónap múlva?'
  );
  recommendations.push(
    'Futtass először dry-run vagy részleges próbaüzemet.',
    'Állíts be automatikus riasztást a legfőbb hibajelre és tartsd meg a manuális visszaállás lehetőségét.'
  );

  const critique: RedTeamCritique = {
    id: `rt-${crypto.randomUUID().slice(0, 8)}`,
    proposal: clean,
    riskScore: Math.min(95, riskScore),
    blindSpots,
    failureModes,
    recommendations,
    createdAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.redTeamCritiques = [critique, ...(s.redTeamCritiques || [])].slice(0, 30);
  });
  return critique;
}

export function calculateProjectEstimations(input: {
  optimisticHours: number;
  mostLikelyHours: number;
  pessimisticHours: number;
  reach?: number;
  impact?: number;
  confidencePct?: number;
}): {
  pertExpectedHours: number;
  pertStdDevHours: number;
  safeUpperBound95Hours: number;
  riceScore: number;
} {
  const o = Math.max(0.25, Number(input.optimisticHours) || 1);
  const m = Math.max(o, Number(input.mostLikelyHours) || o);
  const p = Math.max(m, Number(input.pessimisticHours) || m);
  const pertExpectedHours = Number(((o + 4 * m + p) / 6).toFixed(2));
  const pertStdDevHours = Number(((p - o) / 6).toFixed(2));
  const safeUpperBound95Hours = Number((pertExpectedHours + 2 * pertStdDevHours).toFixed(2));

  const reach = Math.max(1, Number(input.reach) || 5);
  const impact = Math.max(0.25, Number(input.impact) || 2);
  const conf = Math.max(0.1, Math.min(1, (Number(input.confidencePct) || 80) / 100));
  const personDays = Math.max(0.5, pertExpectedHours / 8);
  const riceScore = Number(((reach * impact * conf) / personDays).toFixed(2));

  return { pertExpectedHours, pertStdDevHours, safeUpperBound95Hours, riceScore };
}

/* ============================================================================
 * 4. Meeting Processor, Multi-Level Digest, Study & Glossary (Ú416–Ú445)
 * ============================================================================ */

export function processMeetingNotes(title: string, rawNotes: string): MeetingBriefRecord {
  const clean = rawNotes.trim();
  if (!clean) throw new Error('A megbeszélés jegyzete üres.');
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);

  const actionItems: MeetingBriefRecord['actionItems'] = [];
  const openQuestions: string[] = [];

  for (const line of lines) {
    if (line.endsWith('?') || /^kérdés:/i.test(line)) {
      openQuestions.push(line);
      continue;
    }
    const isAction =
      /^[-*]\s*\[\s*\]/.test(line) ||
      /^(todo|teendő|akció|feladat):/i.test(line) ||
      /\b(kell|intézi|elkészíti|ellenőrzi|határidő)\b/i.test(line);
    if (isAction) {
      const ownerMatch = line.match(/@([a-zA-Z0-9_áéíóöőúüűÁÉÍÓÖŐÚÜŰ-]+)/);
      const dueMatch = line.match(/\b(hétfő|kedd|szerda|csütörtök|péntek|holnap|\d{4}-\d{2}-\d{2})\b/i);
      actionItems.push({
        id: `act-${crypto.randomUUID().slice(0, 6)}`,
        text: line.replace(/^[-*]\s*\[\s*\]\s*/, '').replace(/^(todo|teendő|akció|feladat):\s*/i, ''),
        owner: ownerMatch?.[1],
        dueHint: dueMatch?.[1],
        exportedToKanban: false,
      });
    }
  }

  if (actionItems.length === 0 && lines.length > 0) {
    actionItems.push({
      id: `act-${crypto.randomUUID().slice(0, 6)}`,
      text: `Következő lépés egyeztetése: ${lines[0].slice(0, 120)}`,
      exportedToKanban: false,
    });
  }

  const record: MeetingBriefRecord = {
    id: `mtg-${crypto.randomUUID().slice(0, 8)}`,
    title: title.trim() || `Megbeszélés (${new Date().toISOString().slice(0, 10)})`,
    summary: `${lines.length} jegyzetsor feldolgozva · ${actionItems.length} teendő · ${openQuestions.length} nyitott kérdés.`,
    actionItems: actionItems.slice(0, 25),
    openQuestions: openQuestions.slice(0, 15),
    createdAt: new Date().toISOString(),
  };

  updateState((s) => {
    s.meetingBriefs = [record, ...(s.meetingBriefs || [])].slice(0, 30);
  });
  return record;
}

export function importMeetingActionsToKanban(meetingId: string): { createdCount: number } {
  let createdCount = 0;
  const now = new Date().toISOString();
  updateState((s) => {
    const m = (s.meetingBriefs || []).find((x) => x.id === meetingId);
    if (!m) throw new Error('Megbeszélés rekord nem található.');
    for (const act of m.actionItems) {
      if (act.exportedToKanban) continue;
      act.exportedToKanban = true;
      s.kanban.unshift({
        id: `card-${crypto.randomUUID().slice(0, 8)}`,
        title: act.text.slice(0, 120),
        description: `Megbeszélésből importálva: ${m.title}${act.owner ? ` | Felelős: ${act.owner}` : ''}${act.dueHint ? ` | Határidő: ${act.dueHint}` : ''}`,
        status: 'todo',
        priority: 'medium',
        assignedAgentId: null,
        createdAt: now,
        updatedAt: now,
        subtasks: [],
        blockedBy: [],
      });
      createdCount++;
    }
  });
  if (createdCount > 0) {
    appendAuditLog({
      type: 'action',
      sourceAgentId: 'meeting-studio',
      sourceAgentName: 'Meeting Asszisztens',
      message: `${createdCount} megbeszélés akciópont importálva a Kanban táblára.`,
      verifiedExecution: true,
    });
  }
  return { createdCount };
}

export function buildMultiLevelDigest(title: string, rawText: string): ReadingDigestItem {
  const clean = rawText.trim();
  if (!clean) throw new Error('A kivonatoláshoz szöveg megadása kötelező.');
  const sentences = clean.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const quality = analyzeProseQuality(clean);
  const tldrOneLine = sentences[0] || clean.slice(0, 160);
  const bulletPoints =
    sentences.length > 1
      ? sentences.slice(0, 5).map((s) => (s.length > 180 ? `${s.slice(0, 177)}...` : s))
      : [clean.slice(0, 220)];

  const digest: ReadingDigestItem = {
    id: `dig-${crypto.randomUUID().slice(0, 8)}`,
    title: title.trim() || 'Szövegkivonat',
    tldrOneLine,
    bulletPoints,
    wordCount: quality.wordCount,
    estimatedMinutes: Math.max(0.2, quality.estimatedReadMinutes),
    readabilityScore: quality.readabilityScore,
    createdAt: new Date().toISOString(),
  };

  updateState((s) => {
    s.readingDigests = [digest, ...(s.readingDigests || [])].slice(0, 30);
  });
  return digest;
}

export function createStudyPlan(
  topic: string,
  level: StudyPlanItem['level'] = 'intermediate'
): StudyPlanItem {
  const t = topic.trim();
  if (!t) throw new Error('A tanulási témakör megadása kötelező.');
  const plan: StudyPlanItem = {
    id: `st-${crypto.randomUUID().slice(0, 8)}`,
    topic: t,
    level,
    modules: [
      {
        id: 'm1',
        title: `1. Alapfogalmak és mentális modell: ${t}`,
        keyQuestion: `Hogyan magyaráznád el egy 12 évesnek 3 mondatban, mi az a(z) ${t}?`,
        completed: false,
      },
      {
        id: 'm2',
        title: `2. Gyakorlati architektúra és tipikus hibák (${t})`,
        keyQuestion: `Mi a 3 leggyakoribb buktató ${t} alkalmazásakor, és hogyan előzhető meg?`,
        completed: false,
      },
      {
        id: 'm3',
        title: `3. Önálló mini-projekt és Feynman-ellenőrzés (${t})`,
        keyQuestion: `Készíts egy valós példát vagy döntési érvelést a(z) ${t} témában.`,
        completed: false,
      },
    ],
    createdAt: new Date().toISOString(),
  };
  updateState((s) => {
    s.studyPlans = [plan, ...(s.studyPlans || [])].slice(0, 30);
  });
  return plan;
}

export function toggleStudyModule(planId: string, moduleId: string): StudyPlanItem {
  let out!: StudyPlanItem;
  updateState((s) => {
    const plan = (s.studyPlans || []).find((p) => p.id === planId);
    if (!plan) throw new Error('Tanulási terv nem található.');
    const mod = plan.modules.find((m) => m.id === moduleId);
    if (!mod) throw new Error('Modul nem található.');
    mod.completed = !mod.completed;
    out = { ...plan, modules: [...plan.modules] };
  });
  return out;
}

export function addGlossaryTerm(input: {
  term: string;
  domain?: string;
  definition: string;
  example?: string;
}): GlossaryTermItem {
  const term = input.term.trim();
  const definition = input.definition.trim();
  if (!term || !definition) throw new Error('A fogalom és a definíció is kötelező.');
  const item: GlossaryTermItem = {
    id: `gl-${crypto.randomUUID().slice(0, 8)}`,
    term,
    domain: input.domain?.trim() || 'Általános',
    definition,
    example: input.example?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  updateState((s) => {
    const base = s.glossaryTerms && s.glossaryTerms.length > 0 ? s.glossaryTerms : createDefaultGlossaryTerms();
    s.glossaryTerms = [item, ...base].slice(0, 200);
  });
  return item;
}

export function buildKnowledgeConceptGraph(): {
  mermaid: string;
  nodeCount: number;
  edgeCount: number;
} {
  const s = getState();
  const lines = ['graph TD'];
  let edgeCount = 0;
  const nodes = new Set<string>();

  for (const m of s.memories.slice(0, 12)) {
    const a = m.entity.replace(/[^a-zA-Z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ_ -]/g, '').slice(0, 24) || 'Memória';
    const b = (m.tags[0] || 'Tudás').replace(/[^a-zA-Z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ_ -]/g, '').slice(0, 20);
    const idA = `M_${crypto.createHash('md5').update(a).digest('hex').slice(0, 5)}`;
    const idB = `T_${crypto.createHash('md5').update(b).digest('hex').slice(0, 5)}`;
    nodes.add(idA);
    nodes.add(idB);
    lines.push(`  ${idA}["${a}"] --> ${idB}["${b}"]`);
    edgeCount++;
  }
  for (const g of (s.glossaryTerms || []).slice(0, 6)) {
    const idG = `G_${g.id.slice(-5)}`;
    const idD = `D_${crypto.createHash('md5').update(g.domain).digest('hex').slice(0, 5)}`;
    nodes.add(idG);
    nodes.add(idD);
    lines.push(`  ${idG}["${g.term.slice(0, 24)}"] -.-> ${idD}["${g.domain}"]`);
    edgeCount++;
  }

  if (edgeCount === 0) {
    lines.push('  Root["NovaSwarm Tudásbázis"] --> Mem["Memóriák"] & Gloss["Szótár"]');
    nodes.add('Root');
    nodes.add('Mem');
    nodes.add('Gloss');
    edgeCount = 2;
  }

  return { mermaid: lines.join('\n'), nodeCount: nodes.size, edgeCount };
}

/* ============================================================================
 * 5. Developer Copilot: Snippets, Architecture Blueprint, Incident Playbooks, SQL & Infra Audit (Ú446–Ú480)
 * ============================================================================ */

export function saveCodeSnippet(input: {
  title: string;
  language: string;
  code: string;
  tags?: string[];
}): CodeSnippetVaultItem {
  const title = input.title.trim();
  const code = input.code.trim();
  if (!title || !code) throw new Error('A kódrészlet címe és tartalma kötelező.');
  const snip: CodeSnippetVaultItem = {
    id: `snip-${crypto.randomUUID().slice(0, 8)}`,
    title,
    language: input.language.trim() || 'bash',
    code,
    tags: (input.tags || []).filter(Boolean),
    useCount: 0,
    createdAt: new Date().toISOString(),
  };
  updateState((s) => {
    const base = s.codeSnippets && s.codeSnippets.length > 0 ? s.codeSnippets : createDefaultCodeSnippets();
    s.codeSnippets = [snip, ...base].slice(0, 100);
  });
  return snip;
}

export function renderSnippetWithVars(snippetId: string, vars: Record<string, string>): string {
  let out = '';
  updateState((s) => {
    const base = s.codeSnippets && s.codeSnippets.length > 0 ? s.codeSnippets : createDefaultCodeSnippets();
    const found = base.find((x) => x.id === snippetId);
    if (!found) throw new Error('Kódrészlet nem található.');
    found.useCount += 1;
    out = found.code.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
    s.codeSnippets = base;
  });
  return out;
}

export function generateArchitectureBlueprint(
  name: string,
  pattern: ArchitectureBlueprint['pattern']
): ArchitectureBlueprint {
  const cleanName = name.trim() || 'NovaSwarm Rendszerterv';
  const defs: Record<
    ArchitectureBlueprint['pattern'],
    { mermaid: string; components: string[]; capacity: string[] }
  > = {
    microservices: {
      mermaid: `flowchart LR\n  Client --> Gateway[API Gateway / TLS]\n  Gateway --> Auth[Auth Service]\n  Gateway --> Core[Core Worker API]\n  Core --> Queue[Async Job Queue]\n  Core --> DB[(PostgreSQL Primary)]`,
      components: ['API Gateway + Rate Limiter', 'Auth / JWT Middleware', 'Stateless Worker API', 'Message Queue', 'Primary DB'],
      capacity: ['Horizontális skálázás worker példányszámmal', 'Circuit breaker javasolt minden belső HTTP hívásnál'],
    },
    iot_edge: {
      mermaid: `flowchart LR\n  Sensors[ESP32 / Szenzorok] -->|MQTT QoS1| Broker[Mosquitto LAN]\n  Broker --> Edge[Raspberry Pi NovaSwarm]\n  Edge --> LocalDB[(SQLite WAL)]\n  Edge -->|Alert| Telegram[Telegram Bot]`,
      components: ['ESP32 / GPIO Szenzorok', 'MQTT Broker', 'ARM64 Edge Node', 'SQLite WAL helyi tár', 'Telegram értesítő'],
      capacity: ['Offline pufferelés hálózatkiesés esetén', 'SD-kártya kímélő batch flush ajánlott'],
    },
    rag_pipeline: {
      mermaid: `flowchart TB\n  Docs[PDF/MD Dokumentumok] --> Chunker[Syntax-Aware Chunker]\n  Chunker --> Index[BM25 + Embedding Index]\n  Query[Kérdés] --> RRF[Hybrid RRF + MMR]\n  Index --> RRF --> LLM[Helyi / Felhő LLM]`,
      components: ['Dokumentum Feldolgozó', 'Hibrid Vektor+Lexikális Index', 'RRF + MMR Rangsoroló', 'LLM Generátor'],
      capacity: ['Top-K = 6 javasolt 4096 kontextusablak alatt', 'Ékezet-normalizáció növeli a magyar találati arányt'],
    },
    event_driven: {
      mermaid: `flowchart LR\n  Producer --> Bus[Event Bus / Webhook]\n  Bus --> RuleEngine[Szabálykiértékelő]\n  RuleEngine --> ActionA[Auto-Heal]\n  RuleEngine --> ActionB[Audit + Értesítés]`,
      components: ['Eseményforrás', 'Aszinkron Eseménybusz', 'Cooldown-védett Szabálymotor', 'Idempotens Végrehajtók'],
      capacity: ['Minden fogyasztó idempotens kulccsal dolgozzon', 'Dead-letter napló hibás eseményekhez'],
    },
    monolith_sqlite: {
      mermaid: `flowchart TB\n  Browser[React SPA] -->|REST + WS| Express[Node/Express Monolith]\n  Express --> State[(Atomic JSON + SQLite WAL)]\n  Express --> Ollama[Local Ollama / Cloud API]`,
      components: ['React Vite SPA', 'Express + WebSocket Szerver', 'SQLite WAL + Atomi Állapottár', 'Hibrid LLM Router'],
      capacity: ['Zéró külső DB-szerver üzemeltetés', 'Ideális 2–8 GB RAM Pi/VPS csomópontokra'],
    },
  };

  const spec = defs[pattern];
  const bp: ArchitectureBlueprint = {
    id: `bp-${crypto.randomUUID().slice(0, 8)}`,
    name: cleanName,
    pattern,
    mermaidDiagram: spec.mermaid,
    components: spec.components,
    capacityNotes: spec.capacity,
    createdAt: new Date().toISOString(),
  };

  updateState((s) => {
    s.architectureBlueprints = [bp, ...(s.architectureBlueprints || [])].slice(0, 25);
  });
  return bp;
}

export function toggleIncidentPlaybookStep(playbookId: string, stepId: string): IncidentPlaybook {
  let updated!: IncidentPlaybook;
  updateState((s) => {
    const base =
      s.incidentPlaybooks && s.incidentPlaybooks.length > 0
        ? s.incidentPlaybooks
        : createDefaultIncidentPlaybooks();
    const pb = base.find((p) => p.id === playbookId);
    if (!pb) throw new Error('Playbook nem található.');
    const st = pb.steps.find((x) => x.id === stepId);
    if (!st) throw new Error('Lépés nem található.');
    st.done = !st.done;
    s.incidentPlaybooks = base;
    updated = { ...pb, steps: [...pb.steps] };
  });
  return updated;
}

export function auditSqlQuery(sql: string): {
  riskLevel: 'low' | 'medium' | 'high';
  findings: string[];
  recommendations: string[];
} {
  const clean = sql.trim();
  if (!clean) throw new Error('SQL lekérdezés megadása kötelező.');
  const upper = clean.toUpperCase();
  const findings: string[] = [];
  const recommendations: string[] = [];

  if (/\bSELECT\s+\*/i.test(upper)) {
    findings.push('SELECT * használata: felesleges I/O és hálózati adatforgalom.');
    recommendations.push('Sorold fel név szerint csak a szükséges oszlopokat.');
  }
  if ((/\bDELETE\s+FROM\b/i.test(upper) || /\bUPDATE\b/i.test(upper)) && !/\bWHERE\b/i.test(upper)) {
    findings.push('KRITIKUS: UPDATE vagy DELETE záradék WHERE feltétel nélkül — az összes sort módosíthatja!');
  }
  if (/\b(DROP|TRUNCATE)\s+(TABLE|DATABASE)\b/i.test(upper)) {
    findings.push('Destruktív DDL művelet (DROP/TRUNCATE) észlelve.');
  }
  if (/(\$\{|\+\s*['"]|'\s*OR\s*'1'='1)/i.test(clean)) {
    findings.push('Potenciális SQL injection / sztring összefűzéses paraméterátadás.');
    recommendations.push('Használj paraméterezett lekérdezést (? vagy $1 helyőrzőkkel).');
  }
  if (/\bLIKE\s+'%/i.test(upper)) {
    findings.push("Vezető wildcard LIKE '%...' nem tud B-Tree indexet használni.");
    recommendations.push('Nagy táblán használj FTS5 vagy pg_trgm indexet.');
  }

  const riskLevel: 'low' | 'medium' | 'high' = findings.some((f) => f.includes('KRITIKUS') || f.includes('injection') || f.includes('DROP'))
    ? 'high'
    : findings.length > 0
    ? 'medium'
    : 'low';

  if (findings.length === 0) findings.push('Nem található nyilvánvaló SQL hiba vagy biztonsági kockázat.');
  return { riskLevel, findings, recommendations };
}

export function lintInfraManifest(rawManifest: string): {
  issueCount: number;
  issues: Array<{ severity: 'high' | 'medium' | 'info'; message: string }>;
} {
  const clean = rawManifest.trim();
  if (!clean) throw new Error('Konfiguráció vagy Dockerfile/Compose megadása kötelező.');
  const issues: Array<{ severity: 'high' | 'medium' | 'info'; message: string }> = [];

  if (/:latest\b/i.test(clean)) {
    issues.push({ severity: 'medium', message: 'Rögzítetlen `:latest` image verzió — használj konkrét verzió-tagot a reprodukálhatósághoz.' });
  }
  if (/privileged:\s*true/i.test(clean)) {
    issues.push({ severity: 'high', message: '`privileged: true` kritikus biztonsági kockázat — kerüld vagy szűkítsd cap_add-ra.' });
  }
  if (/USER\s+root/i.test(clean)) {
    issues.push({ severity: 'medium', message: 'Konténer root felhasználóval fut — ajánlott nem-root USER beállítása.' });
  }
  if (/services:/i.test(clean) && !/healthcheck:/i.test(clean)) {
    issues.push({ severity: 'info', message: 'Hiányzó `healthcheck:` definíció a Docker Compose szolgáltatásból.' });
  }
  if (/services:/i.test(clean) && !/mem_limit|memory:/i.test(clean)) {
    issues.push({ severity: 'info', message: 'Nincs memóriakorlát (`mem_limit` / `resources.limits.memory`) megadva — Raspberry Pi-n erősen ajánlott.' });
  }
  if (/0\.0\.0\.0:22\b/.test(clean)) {
    issues.push({ severity: 'high', message: 'SSH port publikusan minden interfészre kötve.' });
  }

  return { issueCount: issues.length, issues };
}

export function runDevConverters(
  mode: 'json_to_ts' | 'csv_to_markdown' | 'jwt_decode' | 'env_mask',
  payload: string
): { output: string } {
  const raw = payload.trim();
  if (!raw) throw new Error('Bemeneti adat megadása kötelező.');

  if (mode === 'json_to_ts') {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      throw new Error('JSON objektum ({...}) szükséges a TypeScript interfész generálásához.');
    }
    const fields = Object.entries(obj).map(([k, v]) => {
      const t = Array.isArray(v) ? 'unknown[]' : v === null ? 'null' : typeof v;
      return `  ${k}: ${t};`;
    });
    return { output: `export interface GeneratedModel {\n${fields.join('\n')}\n}` };
  }

  if (mode === 'csv_to_markdown') {
    const rows = raw.split('\n').map((l) => l.split(/[,;]/).map((c) => c.trim()));
    if (rows.length === 0) return { output: '' };
    const header = `| ${rows[0].join(' | ')} |`;
    const sep = `| ${rows[0].map(() => '---').join(' | ')} |`;
    const body = rows.slice(1).map((r) => `| ${r.join(' | ')} |`);
    return { output: [header, sep, ...body].join('\n') };
  }

  if (mode === 'jwt_decode') {
    const parts = raw.split('.');
    if (parts.length < 2) throw new Error('Érvénytelen JWT token formátum (header.payload.sig szükséges).');
    const b64 = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const header = JSON.parse(b64(parts[0]));
    const body = JSON.parse(b64(parts[1]));
    return { output: JSON.stringify({ header, payload: body }, null, 2) };
  }

  // env_mask -> .env.example
  const maskedLines = raw.split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return line;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx);
    return `${key}=`;
  });
  return { output: maskedLines.join('\n') };
}

/* ============================================================================
 * 6. Math, Statistics, Financial Engineering & Unit/Timezone Converter (Ú481–Ú505)
 * ============================================================================ */

export function analyzeNumericSeries(rawNumbers: string): {
  count: number;
  sum: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  p95: number;
  trendSlope: number;
  anomalies: Array<{ index: number; value: number; zScore: number }>;
} {
  const nums = rawNumbers
    .split(/[\s,;|\n]+/)
    .map((x) => Number(x.replace(',', '.')))
    .filter((n) => Number.isFinite(n));
  if (nums.length < 2) throw new Error('Adj meg legalább 2 számot (vesszővel vagy szóközzel elválasztva).');

  const count = nums.length;
  const sum = Number(nums.reduce((a, b) => a + b, 0).toFixed(4));
  const mean = Number((sum / count).toFixed(4));
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(count / 2);
  const median = Number((count % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]).toFixed(4));
  const variance = nums.reduce((a, v) => a + (v - mean) ** 2, 0) / count;
  const stdDev = Number(Math.sqrt(variance).toFixed(4));
  const p95Idx = Math.min(count - 1, Math.floor(0.95 * (count - 1)));
  const p95 = sorted[p95Idx];

  // Linear regression slope
  const xMean = (count - 1) / 2;
  let num = 0;
  let den = 0;
  for (let i = 0; i < count; i++) {
    num += (i - xMean) * (nums[i] - mean);
    den += (i - xMean) ** 2;
  }
  const trendSlope = den > 0 ? Number((num / den).toFixed(4)) : 0;

  const anomalies: Array<{ index: number; value: number; zScore: number }> = [];
  if (stdDev > 0) {
    nums.forEach((v, idx) => {
      const z = Math.abs((v - mean) / stdDev);
      if (z >= 2.0) anomalies.push({ index: idx, value: v, zScore: Number(z.toFixed(2)) });
    });
  }

  return {
    count,
    sum,
    mean,
    median,
    stdDev,
    min: sorted[0],
    max: sorted[count - 1],
    p95,
    trendSlope,
    anomalies,
  };
}

export function calculateFinancialModel(input: {
  mode: 'compound' | 'loan' | 'vat_hu';
  principal: number;
  annualRatePct?: number;
  years?: number;
  monthlyContribution?: number;
  vatRatePct?: number;
}): { summary: string; finalAmount: number; totalInterestOrTax: number; monthlyPaymentOrNet?: number } {
  const P = Math.max(0, Number(input.principal) || 0);
  if (input.mode === 'vat_hu') {
    const rate = Number(input.vatRatePct ?? 27) / 100;
    const net = Number((P / (1 + rate)).toFixed(2));
    const vatFromGross = Number((P - net).toFixed(2));
    const grossFromNet = Number((P * (1 + rate)).toFixed(2));
    return {
      summary: `Bruttó ${P.toLocaleString('hu-HU')} esetén Nettó: ${net.toLocaleString('hu-HU')} (ÁFA: ${vatFromGross.toLocaleString('hu-HU')}) | Ha nettó ${P.toLocaleString('hu-HU')} → Bruttó: ${grossFromNet.toLocaleString('hu-HU')}`,
      finalAmount: grossFromNet,
      totalInterestOrTax: vatFromGross,
      monthlyPaymentOrNet: net,
    };
  }

  const rAnnual = Math.max(0, Number(input.annualRatePct ?? 7)) / 100;
  const years = Math.max(1, Number(input.years ?? 10));
  const months = Math.round(years * 12);
  const rm = rAnnual / 12;

  if (input.mode === 'loan') {
    const payment =
      rm === 0
        ? P / months
        : (P * (rm * (1 + rm) ** months)) / ((1 + rm) ** months - 1);
    const totalPaid = payment * months;
    return {
      summary: `Havi törlesztő: ${Math.round(payment).toLocaleString('hu-HU')} | Összes visszafizetés: ${Math.round(totalPaid).toLocaleString('hu-HU')}`,
      finalAmount: Math.round(totalPaid),
      totalInterestOrTax: Math.round(totalPaid - P),
      monthlyPaymentOrNet: Math.round(payment),
    };
  }

  // compound
  const monthlyAdd = Math.max(0, Number(input.monthlyContribution ?? 0));
  let bal = P;
  for (let i = 0; i < months; i++) {
    bal = bal * (1 + rm) + monthlyAdd;
  }
  const totalContributed = P + monthlyAdd * months;
  return {
    summary: `${years} év múlva várható tőke: ${Math.round(bal).toLocaleString('hu-HU')} (Befizetés: ${Math.round(totalContributed).toLocaleString('hu-HU')}, Hozam: ${Math.round(bal - totalContributed).toLocaleString('hu-HU')})`,
    finalAmount: Math.round(bal),
    totalInterestOrTax: Math.round(bal - totalContributed),
  };
}

export function convertUnitsAndTimezones(value: number, fromUnit: string, toUnit: string): {
  result: number;
  formatted: string;
  worldClocks: Array<{ city: string; time: string }>;
} {
  const f = fromUnit.trim().toLowerCase();
  const t = toUnit.trim().toLowerCase();

  const factorsToBase: Record<string, { group: string; factor: number }> = {
    m: { group: 'len', factor: 1 },
    km: { group: 'len', factor: 1000 },
    cm: { group: 'len', factor: 0.01 },
    mi: { group: 'len', factor: 1609.344 },
    ft: { group: 'len', factor: 0.3048 },
    kg: { group: 'mass', factor: 1 },
    g: { group: 'mass', factor: 0.001 },
    lb: { group: 'mass', factor: 0.45359237 },
    b: { group: 'data', factor: 1 },
    kb: { group: 'data', factor: 1024 },
    mb: { group: 'data', factor: 1024 ** 2 },
    gb: { group: 'data', factor: 1024 ** 3 },
    tb: { group: 'data', factor: 1024 ** 4 },
    mbps: { group: 'net', factor: 1 },
    'mb/s': { group: 'net', factor: 8 },
    gbps: { group: 'net', factor: 1000 },
    kwh: { group: 'energy', factor: 1 },
    mj: { group: 'energy', factor: 1 / 3.6 },
  };

  let result = value;
  if ((f === 'c' || f === 'f' || f === 'k') && (t === 'c' || t === 'f' || t === 'k')) {
    const celsius = f === 'c' ? value : f === 'f' ? ((value - 32) * 5) / 9 : value - 273.15;
    result = t === 'c' ? celsius : t === 'f' ? (celsius * 9) / 5 + 32 : celsius + 273.15;
  } else {
    const ff = factorsToBase[f];
    const tf = factorsToBase[t];
    if (!ff || !tf || ff.group !== tf.group) {
      throw new Error(`Nem kompatibilis vagy ismeretlen mértékegységek: ${fromUnit} → ${toUnit}`);
    }
    result = (value * ff.factor) / tf.factor;
  }

  result = Number(result.toFixed(4));
  const now = new Date();
  const zones: Array<[string, string]> = [
    ['Budapest', 'Europe/Budapest'],
    ['London', 'Europe/London'],
    ['New York', 'America/New_York'],
    ['Tokyo', 'Asia/Tokyo'],
    ['UTC', 'UTC'],
  ];
  const worldClocks = zones.map(([city, tz]) => ({
    city,
    time: new Intl.DateTimeFormat('hu-HU', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(now),
  }));

  return {
    result,
    formatted: `${value} ${fromUnit} = ${result} ${toUnit}`,
    worldClocks,
  };
}

/* ============================================================================
 * 7. Time-Blocking, Checklists, Wellness, Comms & Privacy Sanitizer (Ú506–Ú560)
 * ============================================================================ */

export function addTimeBlock(input: {
  date?: string;
  startHour: string;
  endHour: string;
  title: string;
  kind?: TimeBlockSlot['kind'];
}): { slot: TimeBlockSlot; conflicts: TimeBlockSlot[]; deepWorkMinutesToday: number } {
  const title = input.title.trim();
  if (!title) throw new Error('Az idősáv címe kötelező.');
  const date = input.date || new Date().toISOString().slice(0, 10);
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const sMin = toMin(input.startHour);
  const eMin = toMin(input.endHour);
  if (eMin <= sMin) throw new Error('A befejezési időpont legyen későbbi a kezdésnél.');

  const slot: TimeBlockSlot = {
    id: `tb-${crypto.randomUUID().slice(0, 8)}`,
    date,
    startHour: input.startHour,
    endHour: input.endHour,
    title,
    kind: input.kind || 'deep_work',
  };

  let conflicts: TimeBlockSlot[] = [];
  let deepWorkMinutesToday = 0;

  updateState((s) => {
    const existingToday = (s.timeBlocks || []).filter((x) => x.date === date);
    conflicts = existingToday.filter((x) => {
      const xs = toMin(x.startHour);
      const xe = toMin(x.endHour);
      return Math.max(sMin, xs) < Math.min(eMin, xe);
    });
    const next = [slot, ...(s.timeBlocks || [])].slice(0, 60);
    s.timeBlocks = next;
    deepWorkMinutesToday = next
      .filter((x) => x.date === date && x.kind === 'deep_work')
      .reduce((acc, x) => acc + Math.max(0, toMin(x.endHour) - toMin(x.startHour)), 0);
  });

  return { slot, conflicts, deepWorkMinutesToday };
}

export function toggleChecklistItem(checklistId: string, itemId: string): SmartChecklistTemplate {
  let updated!: SmartChecklistTemplate;
  updateState((s) => {
    const base =
      s.smartChecklists && s.smartChecklists.length > 0 ? s.smartChecklists : createDefaultSmartChecklists();
    const cl = base.find((c) => c.id === checklistId);
    if (!cl) throw new Error('Ellenőrzőlista nem található.');
    const it = cl.items.find((i) => i.id === itemId);
    if (!it) throw new Error('Lista elem nem található.');
    it.checked = !it.checked;
    s.smartChecklists = base;
    updated = { ...cl, items: [...cl.items] };
  });
  return updated;
}

export function logWellnessCheckin(input: {
  sleepHours: number;
  waterMl: number;
  energyScore: number;
  movementMinutes: number;
  note?: string;
}): WellnessCheckinItem {
  const item: WellnessCheckinItem = {
    id: `well-${crypto.randomUUID().slice(0, 8)}`,
    date: new Date().toISOString().slice(0, 10),
    sleepHours: Math.max(0, Math.min(24, Number(input.sleepHours) || 7)),
    waterMl: Math.max(0, Math.min(10000, Number(input.waterMl) || 2000)),
    energyScore: Math.max(1, Math.min(10, Number(input.energyScore) || 7)),
    movementMinutes: Math.max(0, Math.min(600, Number(input.movementMinutes) || 30)),
    note: input.note?.trim() || undefined,
  };
  updateState((s) => {
    s.wellnessLogs = [item, ...(s.wellnessLogs || [])].slice(0, 90);
  });
  return item;
}

export function generateCommunicationDraft(input: {
  purpose: string;
  tone?: CommunicationDraft['tone'];
  keyPoints?: string;
}): CommunicationDraft {
  const purpose = input.purpose.trim() || 'Egyeztetés';
  const tone = input.tone || 'formal';
  const pts = input.keyPoints?.trim() || 'A megbeszélt részletek és határidők megerősítése.';

  const subjects: Record<CommunicationDraft['tone'], string> = {
    formal: `Tárgy: ${purpose} — hivatalos megkeresés`,
    direct: `${purpose} — rövid egyeztetés`,
    empathetic: `Köszönet és egyeztetés: ${purpose}`,
    assertive: `Fontos visszajelzés és határidő: ${purpose}`,
  };

  const greetings: Record<CommunicationDraft['tone'], string> = {
    formal: 'Tisztelt Címzett!',
    direct: 'Szia,',
    empathetic: 'Kedves Partnerünk,',
    assertive: 'Tisztelt Érintett!',
  };

  const closings: Record<CommunicationDraft['tone'], string> = {
    formal: 'Tisztelettel és köszönettel,',
    direct: 'Köszi előre is, üdv:',
    empathetic: 'Minden jót és eredményes hetet kívánok!',
    assertive: 'Várom szíves megerősítését 2 munkanapon belül.',
  };

  const draft: CommunicationDraft = {
    id: `comm-${crypto.randomUUID().slice(0, 8)}`,
    purpose,
    tone,
    subject: subjects[tone],
    body: `${greetings[tone]}\n\n${purpose} kapcsán az alábbi fő pontokat szeretném megosztani:\n- ${pts}\n\n${closings[tone]}`,
    createdAt: new Date().toISOString(),
  };

  updateState((s) => {
    s.communicationDrafts = [draft, ...(s.communicationDrafts || [])].slice(0, 40);
  });
  return draft;
}

export function sanitizeSensitiveText(rawText: string): {
  sanitized: string;
  redactionsCount: number;
  categoriesFound: string[];
} {
  let out = rawText;
  let redactionsCount = 0;
  const categories = new Set<string>();

  const rules: Array<{ name: string; rx: RegExp; replacement: string }> = [
    { name: 'API Kulcs / Token', rx: /\b(sk-[a-zA-Z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|ghp_[0-9A-Za-z]{20,}|Bearer\s+[a-zA-Z0-9._-]{16,})\b/g, replacement: '[TITKOS_KULCS_MASZKOLVA]' },
    { name: 'Email cím', rx: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL_MASZKOLVA]' },
    { name: 'Telefonszám', rx: /(?:\+36|06|00\d{2})[\s-]?\d{1,2}[\s-]?\d{3}[\s-]?\d{3,4}/g, replacement: '[TELEFON_MASZKOLVA]' },
    { name: 'IPv4 Cím', rx: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: '[IP_MASZKOLVA]' },
    { name: 'Kártyaszám-minta', rx: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, replacement: '[KÁRTYA_MASZKOLVA]' },
  ];

  for (const r of rules) {
    out = out.replace(r.rx, () => {
      redactionsCount++;
      categories.add(r.name);
      return r.replacement;
    });
  }

  return {
    sanitized: out,
    redactionsCount,
    categoriesFound: Array.from(categories),
  };
}

export function exportOmniExecutiveReportMarkdown(): { markdown: string; stats: Record<string, number> } {
  const s = getState();
  const goals = s.goalTrees || [];
  const matrices = s.decisionMatrixRuns || [];
  const meetings = s.meetingBriefs || [];
  const facts = s.factVault || [];

  const lines: string[] = [
    `# NovaSwarm Omni-Asszisztens Vezetői Riport (${new Date().toISOString().slice(0, 10)})`,
    `- **Aktív Persona**: ${s.settings.activePersonaId || 'alapértelmezett'} · **Kontextus**: ${s.settings.activeUserContextId || 'általános'}`,
    `- **Ténybank bejegyzések**: ${facts.length} · **Célfák**: ${goals.length} · **Döntési mátrixok**: ${matrices.length} · **Megbeszélések**: ${meetings.length}`,
  ];

  if (goals.length > 0) {
    lines.push('\n## Célfák Állapota');
    for (const g of goals.slice(0, 5)) {
      lines.push(`- **${g.title}** (${g.horizon}): ${g.progressPercent}% kész`);
    }
  }
  if (matrices.length > 0) {
    lines.push('\n## Legutóbbi Döntési Mátrixok');
    for (const dm of matrices.slice(0, 5)) {
      lines.push(`- **${dm.title}** → Győztes: **${dm.winnerName}** (+${dm.marginPercent}% előny)`);
    }
  }
  if (meetings.length > 0) {
    lines.push('\n## Megbeszélés Összefoglalók');
    for (const m of meetings.slice(0, 5)) {
      lines.push(`- **${m.title}**: ${m.summary}`);
    }
  }

  return {
    markdown: lines.join('\n'),
    stats: {
      facts: facts.length,
      goals: goals.length,
      matrices: matrices.length,
      meetings: meetings.length,
      snippets: (s.codeSnippets || []).length,
    },
  };
}

/* ============================================================================
 * 8. Full 200-Capability Singularity Catalog (Ú361–Ú560)
 * ============================================================================ */

const CAPABILITY_GROUPS: Array<{
  start: number;
  category: string;
  endpointOrTool: string;
  items: Array<[string, string]>;
}> = [
  {
    start: 361,
    category: 'Személyiség, Kontextus & Stílus',
    endpointOrTool: '/api/v8/persona · omni_toolkit',
    items: [
      ['Szoftverarchitektus Persona', 'Rendszertervezői nézőpont és adatfolyam-elemzés azonnali aktiválása'],
      ['Linux & Homelab Mester Persona', 'Debian/ARM64/Systemd operátori szaktudás injektálása'],
      ['Mélykutató & Elemző Persona', 'Bizonyíték-alapú, feltételezéseket szétválasztó kutatói stílus'],
      ['Üzleti & Termék Stratéga Persona', 'ROI, piaci pozicionálás és RICE prioritási szemlélet'],
      ['Szókratészi Mentor Persona', 'Lépésenkénti oktatás analógiákkal és ellenőrző kérdésekkel'],
      ['Szigorú Kód Reviewer Persona', 'Peremfeltételek, race condition és tesztelhetőség vizsgálata'],
      ['DevSecOps Auditor Persona', 'OWASP, jogosultság és legkisebb kiváltság elve alapján történő audit'],
      ['Személyes Pénzügyi Tervező Persona', 'HUF/EUR cashflow, kamatos kamat és reálhozam elemzés'],
      ['Fókusz & Teljesítmény Coach Persona', 'Időblokkolás és 25 perces fókuszlépések kialakítása'],
      ['Magyar Ügyintézési Asszisztens Persona', 'Szabatos hivatalos levelek és szerződési záradék-ellenőrzés'],
      ['Agilis Termékmenedzser Persona', 'User story, MVP határ és elfogadási kritérium tervező'],
      ['Szerkesztő & Kreatív Író Persona', 'Stilisztikai tömörítés és aktív mondatszerkezetek'],
      ['Egyedi Ágens Persona Létrehozó', 'Tetszőleges új szakértői karakter mentése és váltása'],
      ['Munka & Mély Fejlesztés Kontextus', 'Technikai pontosságra optimalizált válaszsűrűség profil'],
      ['Otthon & Okosotthon Kontextus', 'Háztartási és költségkímélő asszisztens profil'],
      ['Tanulás & Kutatás Kontextus', 'Részletes magyarázó üzemmód példákkal'],
      ['Utazás & Mobil Kontextus', 'Ultra-tömör bullet-pontos mobil kimeneti profil'],
      ['Pénzügy & Adminisztráció Kontextus', 'Pénzügyi pontosságra állított elemzési profil'],
      ['Írásstílus Ujjlenyomat Elemző', 'Mondathossz, szókincs-diverzitás és formalitás mérése'],
      ['Saját Kifejezés-Bigram Kinyerő', 'Gyakori saját szófordulatok azonosítása stíluskövetéshez'],
      ['Személyes Ténybank (Fact Vault) Tároló', 'Kulcs-érték tények tartós mentése kategóriák szerint'],
      ['Automatikus Ténybank Prompt-Injekció', 'Releváns tények beemelése az ágens minden válaszába'],
      ['Hivatali Hangnem Átalakító', 'Közvetlen üzenet átfogalmazása szabatos hivatalos formába'],
      ['Közvetlen & Barátságos Átalakító', 'Merev szövegek természetes partneri hangnemre alakítása'],
      ['Vezetői BLUF Kivonat Átalakító', 'Lényeg elöl (Bottom Line Up Front) + 5 pont szerkezet'],
    ],
  },
  {
    start: 386,
    category: 'Kognitív Tervező & Döntés-stúdió',
    endpointOrTool: '/api/v8/cognitive · omni_toolkit',
    items: [
      ['Határozott (Assertive) Stílus Szűrő', 'Töltelékszavak és hezitáló kifejezések eltávolítása'],
      ['Empatikus Ügyfélkezelési Átalakító', 'De-eszkalációs nyitó- és lezárókeret alkalmazása'],
      ['Magyar/Angol Olvashatósági Index', 'Mondat- és szóhossz alapú közérthetőségi pontozás'],
      ['Töltelékszó & Passzív Szerkezet Detektor', 'Automatikus stilisztikai gyengeség-jelző'],
      ['Felolvasási & Olvasási Idő Kalkulátor', 'Pontos másodperc és perc becslés beszédekhez'],
      ['ADR Architektúra Döntési Sablon', 'Architecture Decision Record strukturált generátor'],
      ['RFC Műszaki Javaslat Sablon', 'API, migráció és rollback terv vázlat'],
      ['SWOT Stratégiai Elemző Sablon', 'Erősség/Gyengeség/Lehetőség/Veszély mátrix'],
      ['5 Whys Gyökérok-Elemző Sablon', '5 lépcsős hibaok-feltáró lánc'],
      ['STAR Interjú & Esettanulmány Keret', 'Situation-Task-Action-Result strukturáló'],
      ['Post-Mortem Incidens Sablon', 'Idővonal, kiváltó ok és megelőző lépések'],
      ['Eisenhower Sürgősségi Mátrix', '4-kvadránsos napi teendő-válogató'],
      ['Többszintű Célfa Generátor', 'Heti/havi/negyedéves/éves célok mérföldkövekre bontása'],
      ['Súlyozott Haladás-Számító', 'Célfa készültség dinamikus újraszámolása pipa alapján'],
      ['Ágens Handoff Pipeline Létrehozó', 'Planner → Builder → Reviewer → Verifier átadási lánc'],
      ['Handoff Fázis Léptető & Audit Napló', 'Szerepkör-specifikus átadási megjegyzések rögzítése'],
      ['Többkritériumos Döntési Mátrix', 'Súlyozott szempontok szerinti opció-összehasonlítás'],
      ['Automatikus Súly-Normalizáló', 'Tetszőleges szempont-súlyok 100%-ra skálázása'],
      ['Döntési Előny-Rés (%) Elemző', 'Győztes és 2. helyezett közötti bizonyossági rés'],
      ['Optimista Ág Szimulátor', 'Kedvező kimenet és siker-kiváltó triggerek'],
      ['Reális Forgatókönyv Modellező', 'Valószínűsített középút és iterációs ütem'],
      ['Pesszimista Ág & Mitigáció Tervező', 'Kockázati B-tervek automatikus összeállítása'],
      ['Red-Team Vakfolt Detektor', 'Hiányzó mentés, rollback és mérés azonosítása ötletekben'],
      ['Kockázati Pontszám Kalkulátor (0-95)', 'Tervjavaslatok objektív sérülékenységi indexe'],
      ['Single Point of Failure Kereső', 'Rendszertervek egyetlen hibapontjának feltárása'],
      ['PERT 3-Pontos Időbecslő', 'Optimista/Legvalószínűbb/Pesszimista várható munkaóra'],
      ['PERT Szórás & 95%-os Felső Határ', 'Biztonsági puffer számítása csúszás ellen'],
      ['RICE Termék-Prioritási Pontozó', 'Reach × Impact × Confidence / Effort számítás'],
      ['Retorikai CTA Erősség Ellenőrző', 'Hiányzó határidő vagy cselekvési hívás jelzése'],
      ['Hosszú Mondat Kettétörési Tanácsadó', '22+ szavas összetett mondatok kiemelése'],
    ],
  },
  {
    start: 416,
    category: 'Meeting, Tanulás & Tudás-stúdió',
    endpointOrTool: '/api/v8/studio · omni_toolkit',
    items: [
      ['Megbeszélés Jegyzet Feldolgozó', 'Nyers értekezleti jegyzetek strukturált kivonatolása'],
      ['Automatikus Akciópont Kinyerő', 'TODO / [ ] / feladat sorok felismerése szövegből'],
      ['Felelős (@név) Detektor', 'Megbízott személyek kinyerése jegyzetsorokból'],
      ['Határidő-Utalás Felismerő', 'Napok és ISO dátumok kinyerése akciópontokból'],
      ['Nyitott Kérdések Gyűjtője', 'Megválaszolatlan kérdőmondatok elkülönítése'],
      ['1-Kattintásos Kanban Import', 'Meeting akciópontok közvetlen felvétele TODO kártyának'],
      ['Dupla-Import Elleni Védelem', 'Exportált akciópontok idempotens nyilvántartása'],
      ['3-Szintű Olvasási Kivonatoló', '1-mondatos TL;DR + max. 5 fő gondolat generálása'],
      ['Cikk Olvasási Idő & Minőség Mérő', 'Szószám, olvasási perc és Flesch-index kiszámítása'],
      ['Kezdő Tanulási Ütemterv Generátor', 'Alapfogalmakra és analógiákra épülő modulok'],
      ['Haladó Tanulási Terv & Projekt', 'Architektúra és mélygyakorlati kérdéssor'],
      ['Feynman-Teszt Önellenőrző Kérdések', 'Aktív felidézést kényszerítő kulcskérdések minden modulhoz'],
      ['Tanulási Modul Készültségi Pipa', 'Haladáskövetés modulonként'],
      ['Szakterületi Fogalomtár (Glossary)', 'Definíciók és gyakorlati példák tartós tára'],
      ['Fogalomtár Kategória Szűrés', 'AI, Linux, Hálózat és Egyéb szakterületek bontása'],
      ['Szemantikus Fogalom-Gráf Generátor', 'Mermaid graph TD hálózat építése memóriákból'],
      ['Memória ↔ Szótár Összekapcsoló', 'Kereszt-hivatkozott tudásgráf csomópontokkal és élekkel'],
      ['Vezetői Állapot-Riport Export', 'Teljes Markdown összefoglaló célfákból és mátrixokból'],
      ['Felesleges Ismétlés Szűrő Kivonatban', 'Túl hosszú bekezdések 180 karakteres sűrítése'],
      ['Entitás-Alapú Memória Gráf Csomópont', 'MD5-stabil azonosítók a tiszta Mermaid szintaxishoz'],
      ['Kognitív Kérdés-Generátor', 'Továbbgondolásra késztető kritikai kérdések összeállítása'],
      ['Szöveg-Sűrűség & Tagolás Auditor', 'Tömör vs. részletes szövegprofil egyeztetése'],
      ['Önképzési Haladás Statisztika', 'Befejezett modulok arányának követése'],
      ['Meeting Audit Napló Integráció', 'Importált teendők hitelesített naplózása'],
      ['Strukturált Jegyzet Sablon Könyvtár', 'Azonnal beilleszthető értekezlet-struktúrák'],
      ['Gyors Memória Rögzítés Mód', 'Ténybankba mentés közvetlen parancssorból'],
      ['Kereszt-Kultúrális Hangnem Igazító', 'Magyar és angol üzleti stílus eltérések kezelése'],
      ['Vázlatpontból Prózává Alakító Keret', 'Célkitűzésből kerek levél- vagy dokumentum-váz'],
      ['Prioritási Szűrő Nyitott Kérdésekhez', 'Blokkoló kérdések kiemelése meeting végén'],
      ['Tudásbázis Tartalom-Számláló', 'Aktív tények, fogalmak és célok összemoshatatlan statisztikája'],
    ],
  },
  {
    start: 446,
    category: 'Fejlesztői, Architektúra & Infra Copilot',
    endpointOrTool: '/api/v8/dev · omni_toolkit',
    items: [
      ['Kód- & Parancs-Széf (Snippet Vault)', 'Címkézett parancsok és kódrészletek tárolója'],
      ['Dinamikus {{változó}} Behelyettesítő', 'Sablon-parancsok azonnali kitöltése paraméterekkel'],
      ['Snippet Használati Népszerűség Mérő', 'Gyakran futtatott parancsok előresorolása'],
      ['Microservices Architektúra Tervrajz', 'API Gateway, Auth, Worker, Queue, DB Mermaid rajz'],
      ['IoT Edge (Pi + ESP32) Architektúra', 'MQTT + ARM64 + SQLite WAL + Telegram tervrajz'],
      ['Hibrid RAG Pipeline Tervrajz', 'Chunker + BM25/Embedding + RRF + LLM folyamatábra'],
      ['Eseményvezérelt Rendszer Tervrajz', 'Event Bus + Cooldown szabálymotor + Auto-Heal ábra'],
      ['Monolit SQLite Low-RAM Architektúra', 'Raspberry Pi-barát zéró külső DB tervrajz'],
      ['Kapacitás & Hibatűrési Jegyzetek', 'Architektúrához csatolt skálázási ellenőrzőlista'],
      ['Linux OOM Elhárító Playbook', 'Lépésenkénti free/dmesg/heap ellenőrzőlista'],
      ['Reverse Proxy 502 Playbook', 'ss/systemd/nginx diagnosztikai lépéssor'],
      ['Docker CrashLoop Playbook', 'Konténer log, státusz és lemezhely ellenőrzés'],
      ['SQLite Locked / WAL Recovery Playbook', 'wal_checkpoint + lsof zárolás-feloldó lépések'],
      ['TLS / SSL Lejárat Playbook', 'certbot/openssl ellenőrző és megújító lépéssor'],
      ['SD-kártya I/O Wait Playbook', 'vmstat/df -i/kímélő mód diagnosztikai lépések'],
      ['Interaktív Playbook Lépés Követő', 'Végrehajtott hibakereső lépések állapotmentése'],
      ['SQL SELECT * & I/O Auditor', 'Felesleges oszlopolvasások figyelmeztetése'],
      ['SQL WHERE Nélküli UPDATE/DELETE Őr', 'Kritikus tömeges adatvesztési hiba blokkolása'],
      ['SQL Injection Minta Detektor', 'Veszélyes string-összefűzések felismerése'],
      ['SQL Vezető Wildcard Index Tanácsadó', 'LIKE "%..." lassulások kiváltása FTS5/trigram javaslattal'],
      ['Destruktív DDL (DROP/TRUNCATE) Jelző', 'Adatbázis-törlő utasítások azonnali kiemelése'],
      ['Docker `:latest` Tag Linter', 'Nem reprodukálható image verziók szűrése'],
      ['Docker `privileged: true` Biztonsági Őr', 'Kiemelt konténer-jogosultsági kockázat jelzése'],
      ['Konténer `USER root` Ellenőrző', 'Nem-root konténer futtatási javaslat'],
      ['Hiányzó Docker Healthcheck Jelző', 'Szolgáltatás-felügyeleti hiány pótlása'],
      ['Konténer Memóriakorlát Auditor', 'Pi/VPS OOM elleni mem_limit ellenőrzés'],
      ['Nyilvános 0.0.0.0:22 SSH Kitétel Detektor', 'Hálózati kitettségi figyelmeztetés'],
      ['JSON → TypeScript Interfész Generátor', 'Minta JSON objektumból azonnali TS típusok'],
      ['CSV → Markdown Táblázat Konverter', 'Vesszővel/pontosvesszővel tagolt adat szép táblává'],
      ['JWT Payload & Header Dekóder', 'Token tartalom azonnali olvasása aláírás küldése nélkül'],
      ['.env → .env.example Titok-Maszkoló', 'Értékek biztonságos kiürítése verziókezelés előtt'],
      ['Beépített Systemd Debug Parancs Sablon', 'journalctl sablon azonnali kitöltéssel'],
      ['Beépített Docker Prune Sablon', 'Időalapú biztonságos image tisztítás'],
      ['Beépített SQLite Online Backup Sablon', 'Folyamatos üzem melletti DB mentés parancs'],
      ['Kód & Konfig Kockázati Szint Besorolás', 'Low / Medium / High összesített audit eredmény'],
    ],
  },
  {
    start: 481,
    category: 'Matematika, Statisztika & Pénzügyi Motor',
    endpointOrTool: '/api/v8/analytics · omni_toolkit',
    items: [
      ['Kamatos Kamat & Befektetési Modell', 'Havi befizetéssel növelt tőke és hozam számítása'],
      ['Hitel & Annuitás Törlesztő Kalkulátor', 'Havi törlesztőrészlet, teljes visszafizetés és kamatteher'],
      ['Magyar ÁFA Bruttó ↔ Nettó Kalkulátor', '27%, 18%, 5% vagy egyedi ÁFA kulcs kétirányú számítása'],
      ['Adatsor Elemszám & Összeg Analizáló', 'Tetszőleges tagolású számsorok azonnali tisztítása'],
      ['Számtani Átlag & Medián Számító', 'Kiugró értékekre érzéketlen középérték meghatározás'],
      ['Szórás (StdDev) & Variancia Mérő', 'Adatsor ingadozásának pontos számszerűsítése'],
      ['P95 Percentilis Teljesítmény Mutató', '95%-os válaszidő/érték küszöb számítása'],
      ['Lineáris Trend Meredekség Számító', 'Emelkedő vagy csökkenő irányzat matematikai mutatója'],
      ['Z-Score (> 2σ) Anomália Detektor', 'Kiugró mérések indexének és eltérésének jelzése'],
      ['Hosszúság Mértékegység Konverter', 'm, km, cm, mérföld, láb közötti pontos váltás'],
      ['Tömeg Mértékegység Konverter', 'kg, g, font (lb) átváltása'],
      ['Hőmérséklet Skála Konverter', 'Celsius, Fahrenheit és Kelvin pontos konverzió'],
      ['Adatmennyiség (Bináris) Konverter', 'B, KB, MB, GB, TB átváltása 1024-es alappal'],
      ['Hálózati Sebesség Konverter', 'Mbps ↔ MB/s ↔ Gbps sávszélesség számítás'],
      ['Energia Mértékegység Konverter', 'kWh ↔ MJ átváltás rezsi és napelem számításokhoz'],
      ['5-Zónás Élő Világóra Kijelző', 'Budapest, London, New York, Tokió, UTC egyidejűleg'],
      ['Pénzügyi Formázott HUF Kimenet', 'Magyar ezres tagolású olvasható összegek'],
      ['Nulla-Kamat Hitel Peremfeltétel Kezelő', '0% THM áruhitelek pontos osztása'],
      ['Vesszős Tizedes Elfogadó Értelmező', 'Magyar tizedesvessző és pontos formátum kezelése'],
      ['Minimum / Maximum Tartomány Mutató', 'Teljes adatszélesség gyors kijelzése'],
      ['Befizetés vs. Kamathozam Bontás', 'Saját tőke és hozam arányának láthatóvá tétele'],
      ['Számítási Kerekítési Védelem', 'Lebegőpontos zaj kiszűrése 4 tizedesig'],
      ['Telegram /szamol Gyorsparancs', 'Közvetlen statisztikai és kamatszámítás chatből'],
      ['Telegram /atalakit Mértékegység Parancs', 'Azonnali konverzió és világóra mobilon'],
      ['Statisztikai Eszköz Ágens Híváshoz', 'Az AI ágens számítási hibák nélkül használja a motort'],
    ],
  },
  {
    start: 506,
    category: 'Időtervező, Jóllét & Kommunikáció',
    endpointOrTool: '/api/v8/life · omni_toolkit',
    items: [
      ['Napi Time-Blocking Időtervező', 'Mélymunka, admin, megbeszélés és pihenő sávok'],
      ['Automatikus Idősáv Ütközés Detektor', 'Átfedő naptári blokkok azonnali figyelmeztetése'],
      ['Napi Mélymunka Perc/Óra Mérő', 'Fókuszidő arányának összesítése az adott napra'],
      ['Érvénytelen Időtartam Védelem', 'Kezdés előtti befejezés automatikus elutasítása'],
      ['Új Szerver Élesítési Checklist', 'SSH, UFW, ZRAM, Backup beépített ellenőrzőlista'],
      ['Kódkiadás QA Checklist', 'Lint, build, tesztek, titok-ellenőrzés lista'],
      ['Utazási Indulási Checklist', 'Okmányok, eszközök, Utazás üzemmód lista'],
      ['Havi Biztonsági Audit Checklist', 'LAN MAC, HIBP és visszaállítási próba lista'],
      ['Vasárnapi Heti Rendszerezés (GTD)', 'Kanban, költségek és jövő heti célok lista'],
      ['Interaktív Checklist Állapotmentő', 'Bármely lépés azonnali kipipálása'],
      ['Napi Alvásóra Naplózó', 'Pihenés mennyiségének követése (0–24 óra)'],
      ['Napi Vízbevitel (ml) Nyilvántartó', 'Hidratáció követése milliliter pontossággal'],
      ['Szubjektív Energia & Fókusz Pontozó', '1–10 skálán rögzített napi teljesítőképesség'],
      ['Napi Mozgásidő (perc) Napló', 'Aktív fizikai mozgás nyilvántartása'],
      ['Kommunikációs Vázlat Stúdió', 'Tárgy és test generálása cél alapján'],
      ['Formális Üzleti Megkeresés Sablon', 'Hivatalos partneri levélvázlat'],
      ['Rövid Közvetlen Csapat-Üzenet Sablon', 'Pörgős Slack/Telegram hangnemű vázlat'],
      ['Empatikus Partneri Kommunikáció', 'Támogató és feszültségoldó levélkeret'],
      ['Határozott Eszkalációs Sablon', 'Világos határidő-kéréssel záruló vázlat'],
      ['Vázlat-Előzmény Tároló (40 db)', 'Korábbi levelek visszakereshetősége'],
      ['Jóllét 90-Napos Gördülő Napló', 'Hosszú távú energiatrendek megőrzése'],
      ['Időblokk Kategória Színezés Nélküli Címkézés', 'Tisztán szöveges, kontrasztos sávtípus jelölés'],
      ['Beállítás: Alapértelmezett Ágens Hangnem', 'Professzionális / Barátságos / Direkt / Szókratészi'],
      ['Beállítás: Adaptív Válasz-Részletesség', 'Tömör / Kiegyensúlyozott / Részletes profil'],
      ['Beállítás: Proaktív Követő Lépés Javaslat', 'Automatikus következő lépés ötletek engedélyezése'],
    ],
  },
  {
    start: 531,
    category: 'Ágens Eszköztár, Biztonság & Telegram',
    endpointOrTool: '/api/v8/capabilities · bot.ts · tools.ts',
    items: [
      ['Egységes `omni_toolkit` Ágens Eszköz', 'Az AI ágens 12 kognitív/dev/matek módot hívhat meg chatből'],
      ['Dinamikus Persona Injekció Promptba', 'Aktív szakértői profil automatikus beépítése az ágensnek'],
      ['Dinamikus Kontextus Injekció Promptba', 'Munka/Otthon/Utazás szabályok élő alkalmazása'],
      ['Automatikus Fact Vault Kontekstus', 'Személyes ténybank top-8 bejegyzésének befecskendezése'],
      ['Saját Írásstílus Ujjlenyomat Injekció', 'Ágens válaszai igazodnak a felhasználó átlagos mondathosszához'],
      ['Állapot-Migráció v13 (Non-Destructive)', 'Régi adatbázisok automatikus kiegészítése adatvesztés nélkül'],
      ['Adatvédelmi PII & Kulcs Maszkoló', 'API kulcs, email, telefon, IPv4 és bankkártya szanálása'],
      ['Bearer & GitHub PAT Token Detektor', 'Kód- és log-megosztás előtti titoktörlés'],
      ['Kategóriánként Szűrhető 200+ Katalógus', 'Minden funkció kereshető Web UI-n és API-n keresztül'],
      ['Azonnali Kulcsszavas Képesség-Kereső', 'Magyar kifejezésekre kereső szűrőmező'],
      ['Telegram `/omni` Képesség-Katalógus', 'Gyors áttekintés az új asszisztens parancsokról'],
      ['Telegram `/persona <név>` Váltó', 'Szakértői személyiség cseréje egy üzenettel mobilon'],
      ['Telegram `/kontextus <név>` Váltó', 'Munka/Otthon/Utazás üzemmódváltás Telegramból'],
      ['Telegram `/matrix <A,B | X,Y>` Parancs', 'Azonnali döntési mátrix kiértékelés chatben'],
      ['Telegram `/redteam <ötlet>` Parancs', 'Gyors vakfolt- és kockázatelemzés mobilról'],
      ['Telegram `/szamol <számok>` Parancs', 'Statisztika (átlag/medián/P95/anomália) kiszámítása'],
      ['Telegram `/atalakit <érték> <f> <t>`', 'Mértékegység-váltás és világóra chatben'],
      ['Telegram `/anonimizal <szöveg>` Parancs', 'Érzékeny adatok maszkolása másolás előtt'],
      ['Telegram `/teendok <jegyzet>` Parancs', 'Megbeszélés akciópontjainak kinyerése mobilon'],
      ['Telegram `/v8riport` Parancs', 'Teljes vezetői állapotkép célfákkal és döntésekkel'],
      ['Beállítás: Automatikus Önértékelő Pass', 'Ágens válasz előtti minőségi belső ellenőrzés kapcsoló'],
      ['Beállítás: Automatikus Akciópont Kinyerés', 'Megbeszélés/hosszú üzenet teendő-detektálás kapcsoló'],
      ['Beállítás: Fact Vault Injekció Kapcsoló', 'Személyes ténybank promptba illesztésének ki/bekapcsolása'],
      ['Omni-Ágens Stúdió Web UI (4 Al-Fül)', 'Letisztult, magas kontrasztú irányítópult minden eszközhöz'],
      ['Mobil-Reszponzív Kétoszlopos Rács', 'Zero vízszintes görgetés 390px szélességen is'],
      ['Billentyűparancs Integráció (`?` Súgó)', 'Gyors elérés és billentyűs súgó naprakész dokumentálása'],
      ['Válaszidő-Optimalizált Tiszta TypeScript', 'Zéró külső nehéz függőség — Raspberry Pi 2GB-on is azonnali'],
      ['Audit-Naplózott Kanban Importok', 'Minden automatikus teendő-létrehozás visszakereshető'],
      ['Teljes Offline Működőképesség', 'Mind a 200 funkció lokálisan fut internet nélkül is'],
      ['Batch 8 Determinisztikus Unit Tesztek', 'Önálló `node:test` ellenőrzés minden alrendszerre'],
    ],
  },
];

export const OMNI_CAPABILITIES_CATALOG: OmniCapabilityEntry[] = CAPABILITY_GROUPS.flatMap((grp) =>
  grp.items.map(([title, summary], idx) => ({
    code: `Ú${grp.start + idx}`,
    category: grp.category,
    title,
    summary,
    endpointOrTool: grp.endpointOrTool,
  }))
);

export function searchOmniCapabilities(query = '', category = ''): {
  totalCount: number;
  categories: string[];
  items: OmniCapabilityEntry[];
} {
  const q = query.trim().toLowerCase();
  const cat = category.trim().toLowerCase();
  const categories = Array.from(new Set(OMNI_CAPABILITIES_CATALOG.map((c) => c.category)));
  const items = OMNI_CAPABILITIES_CATALOG.filter((c) => {
    if (cat && cat !== 'összes' && c.category.toLowerCase() !== cat) return false;
    if (!q) return true;
    return (
      c.code.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q) ||
      c.summary.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    );
  });
  return { totalCount: OMNI_CAPABILITIES_CATALOG.length, categories, items };
}
