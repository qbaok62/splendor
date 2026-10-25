(function (g) {
  'use strict';
  // 30 thẻ Orient (Cities of Splendor). id 90-119 nối tiếp 90 thẻ gốc.
  const cards = [
    { id: 90, level: 1, bonus: null, points: 0, cost: { white: 0, blue: 2, green: 0, red: 3, black: 0 }, orient: true, virtualGold: true },
    { id: 91, level: 1, bonus: null, points: 0, cost: { white: 3, blue: 0, green: 0, red: 2, black: 0 }, orient: true, virtualGold: true },
    { id: 92, level: 1, bonus: null, points: 0, cost: { white: 0, blue: 3, green: 2, red: 0, black: 0 }, orient: true, virtualGold: true },
    { id: 93, level: 1, bonus: null, points: 0, cost: { white: 0, blue: 0, green: 3, red: 0, black: 2 }, orient: true, virtualGold: true },
    { id: 94, level: 1, bonus: null, points: 0, cost: { white: 2, blue: 0, green: 0, red: 0, black: 3 }, orient: true, virtualGold: true },
    { id: 95, level: 1, bonus: 'gold', points: 0, cost: { white: 0, blue: 0, green: 0, red: 3, black: 0 }, orient: true, copy: true },
    { id: 96, level: 1, bonus: 'gold', points: 0, cost: { white: 0, blue: 0, green: 3, red: 0, black: 0 }, orient: true, copy: true },
    { id: 97, level: 1, bonus: 'gold', points: 0, cost: { white: 0, blue: 3, green: 0, red: 0, black: 0 }, orient: true, copy: true },
    { id: 98, level: 1, bonus: 'gold', points: 0, cost: { white: 3, blue: 0, green: 0, red: 0, black: 0 }, orient: true, copy: true },
    { id: 99, level: 1, bonus: 'gold', points: 0, cost: { white: 0, blue: 0, green: 0, red: 0, black: 3 }, orient: true, copy: true },

    { id: 100, level: 2, bonus: 'blue', points: 0, bonusCount: 2, cost: { white: 3, blue: 0, green: 0, red: 0, black: 4 }, orient: true },
    { id: 101, level: 2, bonus: 'white', points: 0, bonusCount: 2, cost: { white: 0, blue: 4, green: 3, red: 0, black: 0 }, orient: true },
    { id: 102, level: 2, bonus: 'green', points: 0, bonusCount: 2, cost: { white: 4, blue: 0, green: 0, red: 3, black: 0 }, orient: true },
    { id: 103, level: 2, bonus: 'red', points: 0, bonusCount: 2, cost: { white: 0, blue: 4, green: 0, red: 0, black: 3 }, orient: true },
    { id: 104, level: 2, bonus: 'black', points: 0, bonusCount: 2, cost: { white: 0, blue: 3, green: 0, red: 4, black: 0 }, orient: true },
    { id: 105, level: 2, bonus: 'white', points: 1, cost: { white: 0, blue: 2, green: 2, red: 2, black: 2 }, orient: true, reserveNoble: true },
    { id: 106, level: 2, bonus: 'green', points: 1, cost: { white: 2, blue: 2, green: 0, red: 2, black: 2 }, orient: true, reserveNoble: true },
    { id: 107, level: 2, bonus: 'red', points: 1, cost: { white: 2, blue: 2, green: 2, red: 0, black: 2 }, orient: true, reserveNoble: true },
    { id: 108, level: 2, bonus: 'gold', points: 0, cost: { white: 1, blue: 0, green: 4, red: 3, black: 0 }, orient: true, copy: true, freeTier: 1 },
    { id: 109, level: 2, bonus: 'gold', points: 0, cost: { white: 4, blue: 3, green: 0, red: 0, black: 1 }, orient: true, copy: true, freeTier: 1 },

    { id: 110, level: 3, bonus: 'green', points: 3, cost: { white: 0, blue: 0, green: 0, red: 0, black: 0 }, discard: { blue: 2 }, orient: true, freeTier: 2 },
    { id: 111, level: 3, bonus: 'black', points: 3, cost: { white: 0, blue: 0, green: 0, red: 0, black: 0 }, discard: { red: 2 }, orient: true, freeTier: 2 },
    { id: 112, level: 3, bonus: 'red', points: 3, cost: { white: 0, blue: 0, green: 0, red: 0, black: 0 }, discard: { green: 2 }, orient: true, freeTier: 2 },
    { id: 113, level: 3, bonus: 'white', points: 3, cost: { white: 0, blue: 0, green: 0, red: 0, black: 0 }, discard: { black: 2 }, orient: true, freeTier: 2 },
    { id: 114, level: 3, bonus: 'blue', points: 3, cost: { white: 0, blue: 0, green: 0, red: 0, black: 0 }, discard: { white: 2 }, orient: true, freeTier: 2 },
    { id: 115, level: 3, bonus: 'white', points: 0, cost: { white: 0, blue: 6, green: 0, red: 3, black: 1 }, orient: true, freeTier: 2 },
    { id: 116, level: 3, bonus: 'blue', points: 0, cost: { white: 1, blue: 0, green: 6, red: 3, black: 0 }, orient: true, freeTier: 2 },
    { id: 117, level: 3, bonus: 'green', points: 0, cost: { white: 0, blue: 1, green: 0, red: 6, black: 3 }, orient: true, freeTier: 2 },
    { id: 118, level: 3, bonus: 'red', points: 0, cost: { white: 3, blue: 0, green: 0, red: 1, black: 6 }, orient: true, freeTier: 2 },
    { id: 119, level: 3, bonus: 'black', points: 0, cost: { white: 6, blue: 3, green: 0, red: 0, black: 1 }, orient: true, freeTier: 2 },
  ];
  const out = { cards, byId: Object.fromEntries(cards.map((c) => [c.id, c])) };
  if (typeof module !== 'undefined') module.exports = out;
  else g.SPLENDOR_ORIENT = out;
})(this);
