'use strict';
const assert = require('assert');
const E = require('./engine');
const B = require('./bot');

function seed(n) {
  return () => {
    n |= 0; n = (n + 0x6d2b79f5) | 0;
    let t = Math.imul(n ^ (n >>> 15), 1 | n);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function make(expansions, n = 2, random = seed(1)) {
  return E.newGame(Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i })), { rnd: random, expansions });
}

function noTokens() {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 };
}

let groups = 0;
function test(name, fn) {
  try {
    fn();
    groups++;
  } catch (err) {
    err.message = `${name}: ${err.message}`;
    throw err;
  }
}

test('expansion defaults and game setup', () => {
  const g = make({ cities: true, tradingPosts: true, strongholds: true, orient: true });
  assert.deepStrictEqual(g.expansions, { cities: true, tradingPosts: true, strongholds: true, orient: true });
  assert.strictEqual(g.nobles.length, 0);
  assert.strictEqual(g.cities.length, 3);
  assert.strictEqual(new Set(g.cities).size, 3);
  assert.ok(g.strongholds);
  for (const level of [1, 2, 3]) assert.strictEqual(g.strongholds[level].length, 6);
  assert.strictEqual(g.orientBoard[1].length, 2);
  assert.strictEqual(g.orientDecks[1].length, 8);

  const base = make({});
  assert.deepStrictEqual(base.expansions, E.DEFAULT_EXPANSIONS);
  assert.strictEqual(base.cities.length, 0);
  assert.strictEqual(base.strongholds, null);
  assert.strictEqual(base.orientBoard, null);
  assert.ok(base.nobles.length > 0);
});

test('board-reserved cards are visible only to the player who reserved them', () => {
  const g = make({});
  const p = g.players[g.turn], q = g.players.find((x) => x.id !== p.id);
  const cardId = g.board[2][0];

  E.apply(g, p.id, { type: 'reserve', level: 2, index: 0 });

  assert.deepStrictEqual(
    E.viewFor(g, p.id).players.find((x) => x.id === p.id).reserved[0],
    { id: cardId, fromDeck: false },
  );
  assert.deepStrictEqual(
    E.viewFor(g, q.id).players.find((x) => x.id === p.id).reserved[0],
    { hidden: true, level: 2 },
  );
});

test('saved games are upgraded in place', () => {
  const g = make({});
  delete g.expansions;
  delete g.cities;
  delete g.cityClaimed;
  delete g.pendingRefills;
  for (const p of g.players) { delete p.cities; delete p.posts; }
  E.upgradeGame(g);
  assert.deepStrictEqual(g.expansions, E.DEFAULT_EXPANSIONS);
  assert.deepStrictEqual(g.cities, []);
  assert.deepStrictEqual(g.pendingRefills, []);
  for (const p of g.players) { assert.deepStrictEqual(p.cities, []); assert.deepStrictEqual(p.posts, []); }
});

test('undo reverts a gem take before discard finalizes the turn', () => {
  const g = make({});
  const p = g.players[g.turn];
  p.tokens.black = 8;
  const bank = { ...g.bank };

  E.apply(g, p.id, { type: 'take', colors: ['white', 'blue', 'green'] }, { recordUndo: true });
  assert.strictEqual(g.phase, 'discard');
  assert.strictEqual(E.viewFor(g, p.id).canUndo, true);

  E.undo(g, p.id);
  assert.strictEqual(g.phase, 'main');
  assert.strictEqual(g.players[g.turn].id, p.id);
  assert.strictEqual(g.players[g.turn].tokens.black, 8);
  assert.strictEqual(g.players[g.turn].tokens.white, 0);
  assert.deepStrictEqual(g.bank, bank);
  assert.strictEqual(E.viewFor(g, p.id).canUndo, false);
  assert.throws(() => E.undo(g, p.id), /hoàn tác/);
});

test('undo reverts an action that entered an expansion phase', () => {
  const g = make({ strongholds: true });
  const p = g.players[g.turn];
  const cardId = g.board[1][0];
  const card = E.CARDS[cardId];
  E.COLORS.forEach((c) => { p.tokens[c] = card.cost[c] || 0; });
  const tokens = { ...p.tokens };

  E.apply(g, p.id, { type: 'buy', from: 'board', level: 1, index: 0 }, { recordUndo: true });
  assert.strictEqual(g.phase, 'stronghold');
  assert.strictEqual(E.viewFor(g, p.id).canUndo, true);

  E.undo(g, p.id);
  assert.strictEqual(g.phase, 'main');
  assert.strictEqual(g.board[1][0], cardId);
  assert.deepStrictEqual(g.players[g.turn].tokens, tokens);
  assert.strictEqual(E.viewFor(g, p.id).canUndo, false);
});

test('the turn-ending action cannot be undone', () => {
  const g = make({});
  const p = g.players[g.turn];

  E.apply(g, p.id, { type: 'take', colors: ['white', 'blue', 'green'] }, { recordUndo: true });
  assert.notStrictEqual(g.players[g.turn].id, p.id);
  assert.strictEqual(E.viewFor(g, p.id).canUndo, false);
  assert.throws(() => E.undo(g, g.players[g.turn].id), /hoàn tác/);
});

test('cities replace nobles and gate eligibility on score and bonuses', () => {
  const g = make({ cities: true });
  const p = g.players[0];
  g.cities = [2, 7];
  p.cards = [71, 75, 79, 81];
  assert.strictEqual(E.points(p), 17);
  assert.ok(E.eligibleCities(g, p).includes(2));
  assert.strictEqual(E.cityMet(E.CITY_TILES[7], { white: 0, blue: 0, green: 0, red: 0, black: 6 }), true);
  assert.strictEqual(E.cityMet(E.CITY_TILES[7], { white: 5, blue: 1, green: 0, red: 0, black: 6 }), true);
  assert.strictEqual(E.cityMet(E.CITY_TILES[7], { white: 5, blue: 5, green: 5, red: 5, black: 5 }), false);
  assert.strictEqual(E.cityMet(E.CITY_TILES[8], { white: 0, blue: 0, green: 4, red: 0, black: 4 }), true);
  assert.strictEqual(E.cityMet(E.CITY_TILES[8], { white: 0, blue: 0, green: 8, red: 0, black: 0 }), false);

  p.cards = [71, 75, 79];
  assert.strictEqual(E.points(p), 12);
  assert.ok(!E.eligibleCities(g, p).includes(2));
});

test('a city claim completes the round and only city holders can win', () => {
  const g = make({ cities: true });
  const p = g.players[0], q = g.players[1];
  g.turn = 0;
  g.cities = [2];
  g.phase = 'city';
  p.cards = [71, 75, 79, 81];
  E.apply(g, p.id, { type: 'city', id: 2 });
  assert.deepStrictEqual(p.cities, [2]);
  assert.strictEqual(g.cityClaimed, true);
  assert.strictEqual(g.finalRound, true);
  assert.strictEqual(g.phase, 'main');
  assert.notStrictEqual(g.turn, 0);

  q.cards = [73, 77, 81, 85, 89];
  assert.ok(E.points(q) > E.points(p));
  E.apply(g, q.id, { type: 'take', colors: ['white', 'blue', 'green'] });
  assert.strictEqual(g.phase, 'over');
  assert.deepStrictEqual(g.winners, [p.id]);
});

test('trading post eligibility, scoring, and gold payment', () => {
  const g = make({ tradingPosts: true });
  const p = g.players[0];
  p.cards = [16, 17];
  assert.ok(E.eligiblePosts(g, p).includes('doubleToken'));

  p.cards = [24, 25, 26, 27, 28];
  p.nobles = [0];
  assert.ok(E.eligiblePosts(g, p).includes('noblePoints'));

  p.cards = [];
  p.nobles = [];
  p.posts = ['noblePoints', 'coatPoints'];
  assert.strictEqual(E.points(p), 7);

  const paying = g.players[1];
  paying.tokens = noTokens();
  paying.tokens.gold = 2;
  paying.posts = ['goldDouble'];
  assert.strictEqual(E.payment(paying, { cost: { black: 3 } }).gold, 2);
  paying.tokens.gold = 1;
  assert.strictEqual(E.payment(paying, { cost: { black: 3 } }), null);
});

test('an eligible trading post is claimed at end of action', () => {
  const g = make({ tradingPosts: true });
  const p = g.players[0];
  g.turn = 0;
  p.cards = [16, 17];
  E.apply(g, p.id, { type: 'take', colors: ['white', 'blue', 'green'] });
  assert.deepStrictEqual(p.posts, ['doubleToken']);
});

test('a player chooses one when several trading posts are eligible', () => {
  const g = make({ tradingPosts: true });
  const p = g.players[0];
  g.turn = 0;
  p.cards = [16, 17, 24, 25, 26, 27, 28];
  p.nobles = [0];
  E.apply(g, p.id, { type: 'take', colors: ['white', 'blue', 'green'] });
  assert.strictEqual(g.phase, 'tradingPost');
  assert.deepStrictEqual(E.eligiblePosts(g, p), ['doubleToken', 'noblePoints']);
  E.apply(g, p.id, { type: 'tradingPost', id: 'noblePoints' });
  assert.deepStrictEqual(p.posts, ['noblePoints']);
});

test('purchase power can take a token just spent before the card is replaced', () => {
  const g = make({ tradingPosts: true });
  const p = g.players[0];
  g.turn = 0;
  p.posts = ['purchaseToken'];
  p.tokens = noTokens();
  p.tokens.black = 3;
  g.bank.black = 1;
  g.board[1][0] = 14;
  E.apply(g, p.id, { type: 'buy', from: 'board', level: 1, index: 0 });
  assert.strictEqual(g.phase, 'postToken');
  const view = E.viewFor(g, p.id);
  assert.ok(view.tokenChoices.includes('black'));
  E.apply(g, p.id, { type: 'postToken', color: 'black' });
  assert.strictEqual(p.tokens.black, 1);
  assert.ok(!g.pendingRefills.length);
});

test('double-token power takes a different color after two of a kind', () => {
  const g = make({ tradingPosts: true });
  const p = g.players[0];
  g.turn = 0;
  p.posts = ['doubleToken'];
  g.bank.green = 4;
  E.apply(g, p.id, { type: 'take', colors: ['green', 'green'] });
  assert.strictEqual(g.phase, 'postToken');
  assert.deepStrictEqual(E.viewFor(g, p.id).tokenChoices, ['white', 'blue', 'red', 'black']);
  E.apply(g, p.id, { type: 'postToken', color: 'white' });
  assert.strictEqual(p.tokens.green, 2);
  assert.strictEqual(p.tokens.white, 1);
});

test('strongholds block opponents and return to supply when their card is taken', () => {
  const g = make({ strongholds: true });
  const p = g.players[0], q = g.players[1];
  g.turn = 0;
  g.phase = 'stronghold';
  g.strongholdAfter = 'resolve';
  const place = E.strongholdActions(g, p).find((a) => a.mode === 'place' && a.level === 1 && a.index === 0);
  assert.ok(place);
  E.apply(g, p.id, { type: 'stronghold', ...place });
  assert.deepStrictEqual(E.strongholdOwners(g, 1, 0), [p.id]);

  g.turn = 1;
  g.phase = 'main';
  assert.throws(() => E.apply(g, q.id, { type: 'reserve', level: 1, index: 0 }), /Thành trì/);

  g.turn = 0;
  g.phase = 'main';
  const card = E.CARDS[g.board[1][0]];
  p.tokens = { ...card.cost, gold: 0 };
  E.apply(g, p.id, { type: 'buy', from: 'board', level: 1, index: 0 });
  assert.deepStrictEqual(E.strongholdOwners(g, 1, 0), []);
  assert.strictEqual(g.phase, 'stronghold');
  assert.ok(g.pendingRefills.length);
});

test('strongholds can be moved and opponent strongholds removed', () => {
  const g = make({ strongholds: true });
  const p = g.players[0], q = g.players[1];
  g.strongholds[1][0] = [p.id, p.id, p.id];
  g.strongholds[2][0] = [q.id];
  g.turn = 0;
  g.phase = 'stronghold';
  g.strongholdAfter = 'resolve';
  const remove = E.strongholdActions(g, p).find((a) => a.mode === 'remove' && a.level === 2 && a.index === 0);
  assert.ok(remove);
  assert.strictEqual(E.viewFor(g, q.id).players.find((x) => x.id === q.id).strongholdsSupply, 2);
  E.apply(g, p.id, { type: 'stronghold', ...remove });
  assert.deepStrictEqual(E.strongholdOwners(g, 2, 0), []);
  assert.strictEqual(E.viewFor(g, q.id).players.find((x) => x.id === q.id).strongholdsSupply, 3);

  g.turn = 0;
  g.phase = 'stronghold';
  g.strongholdAfter = 'resolve';
  const move = E.strongholdActions(g, p).find((a) => a.mode === 'place' && a.level === 3 && a.index === 0 && a.sourceLevel === 1);
  assert.ok(move);
  E.apply(g, p.id, { type: 'stronghold', ...move });
  assert.deepStrictEqual(E.strongholdOwners(g, 1, 0), [p.id, p.id]);
  assert.ok(E.strongholdOwners(g, 3, 0).includes(p.id));
});

test('a stronghold can be moved even while another is still in supply', () => {
  const g = make({ strongholds: true });
  const p = g.players[0];
  g.strongholds[1][0] = [p.id];
  g.turn = 0;
  g.phase = 'stronghold';
  g.strongholdAfter = 'resolve';
  const move = E.strongholdActions(g, p).find((a) => a.mode === 'place' && a.level === 2 && a.index === 0 && a.sourceLevel === 1);
  assert.ok(move);
  E.apply(g, p.id, { type: 'stronghold', ...move });
  assert.deepStrictEqual(E.strongholdOwners(g, 1, 0), []);
  assert.deepStrictEqual(E.strongholdOwners(g, 2, 0), [p.id]);
});

test('orient setup adds two face-up cards and a separate deck per level', () => {
  const g = make({ orient: true });
  for (const level of [1, 2, 3]) {
    assert.strictEqual(g.orientBoard[level].length, 2);
    assert.strictEqual(g.orientDecks[level].length, 8);
    assert.ok(g.orientBoard[level].every((id) => E.CARDS[id].orient && E.CARDS[id].level === level));
    assert.ok(g.orientDecks[level].every((id) => E.CARDS[id].orient && E.CARDS[id].level === level));
  }
});

test('orient virtual-gold card can pay for a purchase and leaves play', () => {
  const g = make({ orient: true });
  const p = g.players[0];
  g.turn = 0;
  p.cards = [90];
  p.tokens = noTokens();
  p.tokens.blue = 2;
  g.board[1][0] = 7;
  E.apply(g, p.id, { type: 'buy', from: 'board', level: 1, index: 0, virtualGold: true });
  assert.ok(!p.cards.includes(90));
  assert.ok(p.cards.includes(7));
  assert.strictEqual(p.tokens.blue, 0);
});

test('orient copy card pairs with an owned bonus colour', () => {
  const g = make({ orient: true });
  const p = g.players[0];
  g.turn = 0;
  g.orientBoard[1][0] = 95;
  p.cards = [16];
  p.tokens = noTokens();
  p.tokens.red = 3;
  E.apply(g, p.id, { type: 'buy', from: 'orient', level: 1, index: 0 });
  assert.strictEqual(p.cardBonuses[95], 'white');
  assert.strictEqual(E.bonuses(p).white, 2);
});

test('orient cascade takes a lower-tier card for free and defers its refill', () => {
  const g = make({ orient: true });
  const p = g.players[0];
  g.turn = 0;
  g.orientBoard[2][0] = 108;
  g.board[1][0] = 17;
  p.cards = [16];
  p.tokens = noTokens();
  p.tokens = { white: 1, blue: 0, green: 4, red: 3, black: 0, gold: 0 };
  E.apply(g, p.id, { type: 'buy', from: 'orient', level: 2, index: 0 });
  assert.strictEqual(g.phase, 'orientTake');
  E.apply(g, p.id, { type: 'orientTake', from: 'board', level: 1, index: 0 });
  assert.ok(p.cards.includes(17));
  assert.ok(g.board[1][0] != null);
  assert.ok(g.orientBoard[2][0] != null);
});

test('orient double-bonus and noble-reservation cards work', () => {
  const g = make({ orient: true });
  const p = g.players[0];
  g.turn = 0;
  p.cards = [100];
  assert.strictEqual(E.bonuses(p).blue, 2);

  g.orientBoard[2][0] = 105;
  p.cards = [];
  p.tokens = { white: 0, blue: 2, green: 2, red: 2, black: 2, gold: 0 };
  g.nobles = [0, 1];
  E.apply(g, p.id, { type: 'buy', from: 'orient', level: 2, index: 0 });
  assert.strictEqual(g.phase, 'orientNoble');
  E.apply(g, p.id, { type: 'orientNoble', id: 1 });
  assert.deepStrictEqual(p.reservedNobles, [1]);
  assert.ok(!g.nobles.includes(1));
});

test('orient bonus-cost card discards two matching bonus cards', () => {
  const g = make({ orient: true });
  const p = g.players[0];
  g.turn = 0;
  g.orientBoard[3][0] = 110;
  p.cards = [8, 9, 16];
  E.apply(g, p.id, { type: 'buy', from: 'orient', level: 3, index: 0 });
  assert.ok(!p.cards.includes(8));
  assert.ok(!p.cards.includes(9));
  assert.ok(p.cards.includes(110));
  assert.strictEqual(g.phase, 'orientTake');
});

test('strongholds can occupy orient cards', () => {
  const g = make({ orient: true, strongholds: true });
  const p = g.players[0];
  g.turn = 0;
  g.phase = 'stronghold';
  g.strongholdAfter = 'resolve';
  const place = E.strongholdActions(g, p).find((a) => a.mode === 'place' && a.from === 'orient' && a.level === 1 && a.index === 0);
  assert.ok(place);
  E.apply(g, p.id, { type: 'stronghold', ...place });
  assert.ok(E.strongholdOwners(g, 1, 0, 'orient').includes(p.id));
});

test('conquest buys after an action, refunds strongholds, and defers refill', () => {
  const g = make({ strongholds: true });
  const p = g.players[0];
  g.turn = 0;
  g.board[2][0] = 40;
  g.strongholds[2][0] = [p.id, p.id, p.id];
  p.tokens = { white: 3, blue: 2, green: 2, red: 0, black: 0, gold: 0 };
  E.apply(g, p.id, { type: 'take', colors: ['white', 'blue', 'green'] });
  assert.strictEqual(g.phase, 'conquest');
  assert.deepStrictEqual(E.conquestOptions(g, p), [{ from: 'board', level: 2, index: 0, id: 40 }]);

  E.apply(g, p.id, { type: 'conquest', level: 2, index: 0, id: 40 });
  assert.ok(p.cards.includes(40));
  assert.strictEqual(g.board[2][0], null);
  assert.deepStrictEqual(g.strongholds[2][0], []);
  assert.deepStrictEqual(g.pendingRefills, [{ from: 'board', level: 2, index: 0 }]);
  assert.strictEqual(g.phase, 'stronghold');

  const next = E.strongholdActions(g, p)[0];
  assert.ok(next);
  E.apply(g, p.id, { type: 'stronghold', ...next });
  assert.ok(g.board[2][0] != null);
  assert.deepStrictEqual(g.pendingRefills, []);
});

function simulate(expansions, games = 80) {
  for (let n = 0; n < games; n++) {
    const np = 2 + (n % 3);
    const random = seed(1000 + n * 37);
    const g = make(expansions, np, random);
    const oldRandom = Math.random;
    Math.random = seed(2000 + n * 53);
    let steps = 0;
    try {
      while (g.phase !== 'over' && steps++ < 3000) {
        const p = g.players[g.turn];
        B.play(g, p.id, ['balanced', 'noble', 'rush'][g.turn % 3]);
      }
    } finally {
      Math.random = oldRandom;
    }
    assert.strictEqual(g.phase, 'over', `game did not finish for ${JSON.stringify(expansions)} seed ${n}`);
    for (const c of [...E.COLORS, 'gold']) {
      const expected = c === 'gold' ? 5 : np === 2 ? 4 : np === 3 ? 5 : 7;
      const total = g.bank[c] + g.players.reduce((sum, p) => sum + p.tokens[c], 0);
      assert.strictEqual(total, expected, `${c} token leak for ${JSON.stringify(expansions)} seed ${n}`);
    }
    for (const p of g.players) {
      const placed = Object.values(g.strongholds || {}).reduce((sum, row) => sum + row.reduce((x, owners) => x + owners.filter((id) => id === p.id).length, 0), 0);
      assert.ok(placed <= E.MAX_STRONGHOLDS);
    }
    if (g.cityClaimed) assert.ok(g.winners.every((id) => g.players.find((p) => p.id === id).cities.length > 0));
  }
}

const ids = ['cities', 'tradingPosts', 'strongholds', 'orient'];
const combos = [];
for (let mask = 1; mask < 1 << ids.length; mask++) {
  combos.push(Object.fromEntries(ids.map((id, i) => [id, !!(mask & (1 << i))])));
}
for (const combo of combos) simulate(combo);

console.log({ groups, simulations: combos.length * 80 });
