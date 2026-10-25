'use strict';
const assert = require('assert');
const E = require('./engine');
const { DICT, LANGS, normalizeLang, tr } = require('./public/i18n.js');

const players = [{ id: 'p0', name: 'Alice' }, { id: 'p1', name: 'Bob' }];

assert.deepStrictEqual(LANGS, ['vi', 'en']);
assert.deepStrictEqual(Object.keys(DICT.vi).sort(), Object.keys(DICT.en).sort(), 'translation key sets must match');
for (const key of Object.keys(DICT.vi)) {
  const placeholders = (text) => [...new Set(text.match(/\{\w+\}/g) || [])].sort().join(',');
  assert.strictEqual(placeholders(DICT.vi[key]), placeholders(DICT.en[key]), `placeholder mismatch: ${key}`);
}

assert.strictEqual(normalizeLang('en-US'), 'en');
assert.strictEqual(normalizeLang('EN'), 'en');
assert.strictEqual(normalizeLang('vi-VN'), 'vi');
assert.strictEqual(normalizeLang('fr'), 'vi');
assert.strictEqual(normalizeLang(), 'vi');

const viGame = E.newGame(players);
assert.strictEqual(viGame.lang, 'vi');
assert.strictEqual(viGame.log[0].t, `Ván bắt đầu. ${viGame.players[0].name} đi trước.`);

const enGame = E.newGame(players, { lang: 'en' });
assert.strictEqual(enGame.lang, 'en');
assert.strictEqual(enGame.log[0].t, `Game started. ${enGame.players[0].name} goes first.`);

assert.throws(() => E.newGame([players[0]], { lang: 'en' }), /2–4 players are required/);

const postsGame = E.newGame(players, { lang: 'en', expansions: { tradingPosts: true } });
const view = E.viewFor(postsGame, players[0].id);
assert.strictEqual(view.lang, 'en');
assert.deepStrictEqual(
  view.tradingPosts.map((post) => post.name),
  E.TRADING_POSTS.map((post) => tr('en', post.nameKey))
);
assert.ok(view.tradingPosts.every((post) => post.text === tr('en', post.textKey)));

const legacy = E.newGame(players, { lang: 'en' });
delete legacy.lang;
E.upgradeGame(legacy);
assert.strictEqual(legacy.lang, 'vi');

console.log('i18n: key parity, placeholders, defaults, logs, errors and trading posts OK');
