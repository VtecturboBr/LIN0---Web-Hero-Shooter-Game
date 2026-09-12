import { migrateLoadoutLibrary } from './migration';
import { DECK_RULES, HERO_DECKS } from '../cards/catalog';
import type { DeckCard, SavedDeck } from '../../core/types';

export const LOADOUT_STORAGE_KEY = 'lino.loadouts.v1';
export function deckPoints(cards: DeckCard[]) { return cards.reduce((sum, card) => sum + card.level, 0); }
export function validDeck(heroId: string, value: unknown): value is SavedDeck {
  if (!value || typeof value !== 'object') return false;
  const deck = value as SavedDeck;
  return typeof deck.name === 'string' && deck.name.trim().length > 0 && deck.name.length <= 32
    && Array.isArray(deck.cards) && deck.cards.length === DECK_RULES.size
    && deck.cards.every(card => card && HERO_DECKS[heroId]?.includes(card.id)
      && Number.isInteger(card.level) && card.level >= DECK_RULES.minLevel && card.level <= DECK_RULES.maxLevel)
    && new Set(deck.cards.map(card => card.id)).size === DECK_RULES.size
    && deckPoints(deck.cards) === DECK_RULES.budget;
}
export function starterDeck(heroId: string): SavedDeck {
  return { name: 'Equilibrado', cards: HERO_DECKS[heroId].slice(0, DECK_RULES.size).map(id => ({ id, level: DECK_RULES.budget / DECK_RULES.size })) };
}
type Library = Record<string, (SavedDeck | null)[]>;
export class LoadoutStore {
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>) {}
  private read(): Library {
    try {
      const parsed = JSON.parse(this.storage.getItem(LOADOUT_STORAGE_KEY) || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const migrated = migrateLoadoutLibrary(parsed);
      if (JSON.stringify(migrated) !== JSON.stringify(parsed)) {
        try { this.storage.setItem(LOADOUT_STORAGE_KEY, JSON.stringify(migrated)); } catch { /* keep migrated data usable in this session */ }
      }
      return migrated as Library;
    } catch { return {}; }
  }
  get(heroId: string): (SavedDeck | null)[] {
    const saved = this.read()[heroId];
    const slots = Array.from({ length: DECK_RULES.slots }, (_, i) =>
      validDeck(heroId, saved?.[i]) ? structuredClone(saved[i]) : null);
    if (!slots.some(Boolean)) slots[0] = starterDeck(heroId);
    return slots;
  }
  save(heroId: string, slot: number, deck: SavedDeck) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= DECK_RULES.slots || !validDeck(heroId, deck))
      throw new Error('Use 5 cartas diferentes, níveis de 1 a 5 e exatamente 15 pontos.');
    const data = this.read();
    const slots = this.get(heroId);
    slots[slot] = structuredClone({ ...deck, name: deck.name.trim() });
    data[heroId] = slots;
    try { this.storage.setItem(LOADOUT_STORAGE_KEY, JSON.stringify(data)); }
    catch { throw new Error('Não foi possível salvar neste navegador. Seu rascunho continua aberto; tente novamente.'); }
  }
}
// Access localStorage lazily so a blocked browser store is handled by save().
export const loadouts = new LoadoutStore({
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
});
