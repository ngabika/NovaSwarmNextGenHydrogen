import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  HU_PHRASE_LIST,
  LOCALES,
  SUPPORTED_LANGUAGES,
  getIntlLocale,
  getLanguageDir,
  isSupportedLanguage,
  tr,
  tx,
} from '../src/locales/translations';

const ROOT = process.cwd();

function walkSrc(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkSrc(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('i18n: all 11 supported languages have complete, non-empty core keys and phrase catalogs', () => {
  assert.equal(SUPPORTED_LANGUAGES.length, 11);
  const huCoreKeys = Object.keys(LOCALES.hu.core) as Array<keyof typeof LOCALES.hu.core>;
  assert.ok(huCoreKeys.length >= 300, `Expected 300+ core keys, got ${huCoreKeys.length}`);
  assert.ok(HU_PHRASE_LIST.length >= 2400, `Expected 2400+ phrase keys, got ${HU_PHRASE_LIST.length}`);

  for (const { code } of SUPPORTED_LANGUAGES) {
    const bundle = LOCALES[code];
    assert.ok(bundle, `Missing locale bundle for ${code}`);

    for (const k of huCoreKeys) {
      const val = bundle.core[k];
      assert.equal(typeof val, 'string', `Missing core key ${String(k)} in ${code}`);
      assert.ok(val.trim().length > 0, `Empty core key ${String(k)} in ${code}`);
    }

    for (const phrase of HU_PHRASE_LIST) {
      const val = bundle.phrases[phrase];
      assert.equal(typeof val, 'string', `Missing phrase ${JSON.stringify(phrase)} in ${code}`);
      assert.ok(val.trim().length > 0, `Empty phrase ${JSON.stringify(phrase)} in ${code}`);
    }
  }
});

test('i18n: positional {N} and {{var}} placeholders match Hungarian source across all 11 languages', () => {
  const getPos = (s: string) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',');
  const getMustache = (s: string) => [...s.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)].map((m) => m[1]).sort().join(',');

  const huCoreEntries = Object.entries(LOCALES.hu.core);
  for (const { code } of SUPPORTED_LANGUAGES) {
    const bundle = LOCALES[code];
    for (const [k, huVal] of huCoreEntries) {
      const targetVal = bundle.core[k as keyof typeof bundle.core];
      assert.equal(getPos(targetVal), getPos(huVal), `Positional placeholder mismatch in ${code}.core.${k}`);
      assert.equal(getMustache(targetVal), getMustache(huVal), `Mustache placeholder mismatch in ${code}.core.${k}`);
    }

    for (const phrase of HU_PHRASE_LIST) {
      const targetVal = bundle.phrases[phrase];
      assert.equal(
        getPos(targetVal),
        getPos(phrase),
        `Positional placeholder mismatch in ${code}.phrases for ${JSON.stringify(phrase)}`
      );
      assert.equal(
        getMustache(targetVal),
        getMustache(phrase),
        `Mustache placeholder mismatch in ${code}.phrases for ${JSON.stringify(phrase)}`
      );
    }
  }
});

test('i18n: non-Hungarian locales do not contain leaked Hungarian-only characters or untranslated Hungarian strings', () => {
  const huOnlyChars = /[őűŐŰ]/;
  for (const { code } of SUPPORTED_LANGUAGES) {
    if (code === 'hu') continue;
    const bundle = LOCALES[code];

    for (const [k, val] of Object.entries(bundle.core)) {
      assert.equal(huOnlyChars.test(val), false, `Hungarian char leaked into ${code}.core.${k}: ${val}`);
    }

    for (const phrase of HU_PHRASE_LIST) {
      const val = bundle.phrases[phrase];
      assert.equal(huOnlyChars.test(val), false, `Hungarian char leaked into ${code}.phrases[${JSON.stringify(phrase)}]: ${val}`);
      if (/[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(phrase) && !/^Memória:?$/i.test(phrase)) {
        assert.notEqual(
          val,
          phrase,
          `Untranslated Hungarian phrase fallback detected in ${code}: ${JSON.stringify(phrase)}`
        );
      }
    }
  }
});

test('i18n: all static tx() phrase literals in src/ are registered in HU_PHRASE_LIST', () => {
  const huSet = new Set<string>(HU_PHRASE_LIST);
  const srcFiles = walkSrc(path.join(ROOT, 'src')).filter(
    (f) => !f.includes(`${path.sep}locales${path.sep}`)
  );
  const re = /\btx\s*\(\s*(?:[a-zA-Z_][a-zA-Z0-9_]*\s*,\s*)?(['"])((?:\\.|(?!\1)[\s\S])*?)\1/g;

  const missing: string[] = [];
  for (const file of srcFiles) {
    const content = fs.readFileSync(file, 'utf8');
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const lit = Function(`return ${match[1]}${match[2]}${match[1]}`)() as string;
      if (!huSet.has(lit)) {
        missing.push(`${path.relative(ROOT, file)}: ${lit}`);
      }
    }
  }
  assert.deepEqual(missing, [], `Unregistered tx() phrase literals found:\n${missing.join('\n')}`);
});

test('i18n: components avoid bare toLocaleString() calls and hardcoded hu-HU formatting', () => {
  const srcFiles = walkSrc(path.join(ROOT, 'src')).filter(
    (f) => !f.includes(`${path.sep}locales${path.sep}`)
  );
  for (const file of srcFiles) {
    const content = fs.readFileSync(file, 'utf8');
    assert.equal(
      /\.toLocale(?:Date|Time)?String\(\s*\)/.test(content),
      false,
      `Bare toLocale*String() call without intlLocale in ${path.relative(ROOT, file)}`
    );
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.includes('hu-HU') && !line.includes('geminiProjectReport')) {
        assert.fail(`Unexpected hardcoded 'hu-HU' in ${path.relative(ROOT, file)}: ${line.trim()}`);
      }
    }
  }
});

test('i18n: helper functions handle RTL, Intl locales, and placeholder interpolation correctly', () => {
  assert.equal(isSupportedLanguage('hu'), true);
  assert.equal(isSupportedLanguage('ar'), true);
  assert.equal(isSupportedLanguage('xx'), false);

  assert.equal(getLanguageDir('ar'), 'rtl');
  assert.equal(getLanguageDir('en'), 'ltr');
  assert.equal(getLanguageDir('hu'), 'ltr');

  assert.equal(getIntlLocale('hu'), 'hu-HU');
  assert.equal(getIntlLocale('de'), 'de-DE');
  assert.equal(getIntlLocale('ar'), 'ar-SA');

  assert.equal(tr('en', 'navAutonomy'), 'Autonomy Center');
  assert.equal(tr('de', 'navAutonomy'), 'Autonomie-Zentrum');
  assert.equal(tx('en', 'Ágens törlése: {0}', 'Alpha'), 'Delete agent Alpha');
  assert.equal(tx('ar', 'Ágens törlése: {0}', 'Alpha'), 'حذف الوكيل: Alpha');
});
