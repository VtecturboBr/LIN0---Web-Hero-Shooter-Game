import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEROES } from '../../src/characters/index';
import { CARD_POOL, cardMods, cardDescription } from '../../src/progression/cards/catalog';
import { LoadoutStore, LOADOUT_STORAGE_KEY, starterDeck, validDeck } from '../../src/progression/loadouts/library';
import { Player } from '../../src/game/actors/Player';

test('each hero has exactly 20 distinct usable cards and a valid starter', () => {
  for (const hero of HEROES) {
    assert.equal(hero.cards.length, 20);
    assert.equal(new Set(hero.cards).size, 20);
    for (const id of hero.cards) {
      assert.ok(CARD_POOL[id]);
      assert.ok(!CARD_POOL[id].heroOnly || CARD_POOL[id].heroOnly === hero.id);
      assert.ok(Object.keys(cardMods({ id, level: 1 })).length);
    }
    assert.ok(validDeck(hero.id, starterDeck(hero.id)));
  }
});
test('rejects duplicates, foreign cards, incomplete decks, wrong points and invalid levels', () => {
  const valid = starterDeck('lino');
  for (const level of [0, 6, 2.5, NaN, Infinity]) {
    const deck = structuredClone(valid); deck.cards[0].level = level;
    assert.equal(validDeck('lino', deck), false);
  }
  const duplicate = structuredClone(valid); duplicate.cards[1] = duplicate.cards[0];
  assert.equal(validDeck('lino', duplicate), false);
  const foreign = structuredClone(valid); foreign.cards[0].id = 'c_yume_favor';
  assert.equal(validDeck('lino', foreign), false);
  assert.equal(validDeck('lino', { ...valid, cards: valid.cards.slice(0, 4) }), false);
  assert.equal(validDeck('lino', { ...valid, name: ' ' }), false);
  for (const level of [2, 4]) {
    const deck = structuredClone(valid); deck.cards[0].level = level;
    assert.equal(validDeck('lino', deck), false);
  }
  assert.equal(validDeck('lino', { name: 'Bad', cards: [null, null, null, null, null] }), false);
});
test('nine slots persist across store instances, isolate heroes and never share draft references', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const store = new LoadoutStore(storage);
  assert.equal(store.get('lino').length, 9);
  for (let i = 0; i < 9; i++) store.save('lino', i, { ...starterDeck('lino'), name: `Estratégia ${i}` });
  const reopened = new LoadoutStore(storage);
  assert.equal(reopened.get('lino').filter(Boolean).length, 9);
  assert.equal(reopened.get('lino')[8]!.name, 'Estratégia 8');
  assert.equal(reopened.get('yume').filter(Boolean).length, 1);
  const draft = reopened.get('lino')[0]!; draft.cards[0].level = 5;
  assert.equal(reopened.get('lino')[0]!.cards[0].level, 3);
  assert.throws(() => store.save('lino', 9, starterDeck('lino')));
  data.set(LOADOUT_STORAGE_KEY, '{broken');
  assert.ok(validDeck('lino', store.get('lino')[0]));
});
test('storage failure is reported and cannot appear to save a deck', () => {
  const store = new LoadoutStore({ getItem: () => null, setItem: () => { throw new Error('quota'); } });
  assert.throws(() => store.save('lino', 1, starterDeck('lino')), /Não foi possível salvar/);
  assert.equal(store.get('lino')[1], null);
});
test('legacy hero saves migrate to Lino without losing names, slots or card levels', () => {
  const old = starterDeck('lino');
  old.name = 'Meu baralho antigo';
  old.cards[4].id = 'c_akira_katana';
  let raw = JSON.stringify({ akira: [null, old] });
  const store = new LoadoutStore({ getItem: () => raw, setItem: (_, value) => { raw = value; } });
  const deck = store.get('lino')[1]!;
  assert.equal(deck.name, old.name);
  assert.equal(deck.cards[4].id, 'c_lino_foice');
  assert.equal(deck.cards[4].level, 3);
  assert.ok(validDeck('lino', deck));
  assert.equal(JSON.parse(raw).akira, undefined);
  assert.ok(JSON.parse(raw).lino);
});
test('higher levels strengthen every card; reductions decrease time/spread and invalid levels grant no bonus', () => {
  for (const card of Object.values(CARD_POOL)) {
    const low = cardMods({ id: card.id, level: 1 });
    const high = cardMods({ id: card.id, level: 5 });
    for (const key of Object.keys(low) as (keyof typeof low)[]) {
      if (key !== 'onKillSpeedDur') assert.ok(Math.abs(high[key]!) > Math.abs(low[key]!));
    }
    assert.notEqual(cardDescription({ id: card.id, level: 1 }), cardDescription({ id: card.id, level: 5 }));
    assert.deepEqual(cardMods({ id: card.id, level: 6 }), {});
  }
  assert.ok(Math.abs(cardMods({ id: 'c_cooldown', level: 3 }).cooldownMult! + .15) < 1e-10);
});
test('player stats apply saved card levels and stay stable through recompute', async () => {
  const { StatusEffectManager } = await import('../../src/game/combat/StatusEffectManager');
  const player = Object.create(Player.prototype) as Player;
  Object.assign(player, { hero: HEROES[0], cards: [
    { id: 'c_vigor', level: 5 }, { id: 'c_wind', level: 1 }, { id: 'c_cooldown', level: 3 },
    { id: 'c_reload', level: 3 }, { id: 'c_regen', level: 3 },
  ], items: [], buffs: [], hp: HEROES[0].hp, status: new StatusEffectManager(player) });
  player.recomputeMods();
  assert.equal(player.maxHp, HEROES[0].hp * 1.25);
  assert.equal(player.stat('moveSpeed'), 1.05);
  assert.equal(player.stat('cooldownMult'), .85);
  assert.equal(player.stat('reloadMult'), .85);
  assert.equal(player.stat('hpRegen'), 3);
  const before = { ...player.mods }; player.recomputeMods();
  assert.deepEqual(player.mods, before);
  assert.equal(player.stat('cloneCount'), 0);
});
