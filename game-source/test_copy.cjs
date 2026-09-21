const assert = require('assert');
const { execFileSync } = require('child_process');
const { create } = require('./copy.js');
const en = require('./locales/en.json');
const { harness, source } = require('./test_rotation_harness.cjs');
const copy = create(en);
assert.equal(copy.t('rotation.clock', { time: '00:01', count: 1 }), '00:01 / 1 rotation');
assert.equal(copy.t('rotation.clock', { time: '00:01', count: 2 }), '00:01 / 2 rotations');
assert.throws(() => copy.t('missing.key'), /Missing copy key/);
assert.throws(() => copy.t('cell.label', { number: 1 }), /requires state/);
assert.throws(() => copy.t('rotation.clock'), /requires count/);
assert.equal(copy.html('editor.exportTitle', { name: '<b>"&</b>' }), '&lt;b&gt;&quot;&amp;&lt;/b&gt; · Delta Triplex');
const russian = create({ count: { one: 'one', few: 'few', many: 'many', other: 'other' } }, 'ru');
assert.equal(russian.t('count', { count: 2 }), 'few');
assert.equal(russian.t('count', { count: 5 }), 'many');

(async () => {
  // Compile a partial translation through the real HTML builder and run it with
  // the actual embedded engine, then verify a standalone export retains it.
  const translated = {
    'theme.welcome.title': '<Bienvenue & amis>',
    'theme.light.label': 'Clair',
    'editor.puzzle-settings': '<Réglages>',
    'rotation.clock': { one: '{count} tour / {time}', other: '{count} tours / {time}' },
  };
  const shell = execFileSync('python3', ['-c',
    'import build_shell,json,sys; messages=build_shell.load_catalog(); messages.update(json.loads(sys.argv[1])); build_shell.load_catalog=lambda locale: messages; print(build_shell.build_shell("fr"))',
    JSON.stringify(translated)], { cwd: __dirname, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const original = harness(source);
  const engine = [...original.d.scripts].find(script => script.textContent.includes('AGFzb')).outerHTML;
  original.close();
  const h = harness(shell.replace('{{{ SCRIPT }}}', () => engine), 'https://tri.test/', {}, { firstGame: true });
  assert.equal(h.d.documentElement.lang, 'fr');
  h.startPuzzle();
  assert.equal(h.d.getElementById('theme-welcome-title').textContent, translated['theme.welcome.title']);
  assert.equal(h.d.getElementById('theme-welcome-title').children.length, 0, 'catalog markup remains literal text');
  assert.equal(h.d.querySelector('#theme-mode option[value="light"]').textContent, 'Clair');
  assert.equal(h.d.querySelector('input[value="light"]').closest('label').querySelector('strong').textContent, 'Clair');
  assert.equal(h.d.getElementById('theme-welcome-help').textContent, en['theme.welcome.help']);
  h.d.getElementById('theme-welcome').dispatchEvent(new h.w.Event('cancel', { cancelable: true }));
  h.click('turn-right');
  assert.equal(h.d.getElementById('session-clock').textContent, '1 tour / 00:00');
  h.click('editor-open');
  assert.equal(h.d.querySelector('#editor-settings h3').textContent, '<Réglages>');
  assert.equal(h.d.querySelector('#editor-settings h3').children.length, 0);
  h.click('editor-export');
  const exported = await h.download();
  const restored = harness(exported);
  assert.equal(restored.d.documentElement.lang, 'fr');
  assert.equal(restored.d.getElementById('theme-welcome-title').textContent, '<Bienvenue & amis>');
  assert.equal(restored.d.querySelector('#editor-settings h3').textContent, '<Réglages>');
  restored.close(); h.close();
  console.log('PASS: copy interpolation/plurals, escaped text, translated HTML/runtime, English fallback and offline exports.');
})().catch(error => { console.error(error); process.exitCode = 1; });
