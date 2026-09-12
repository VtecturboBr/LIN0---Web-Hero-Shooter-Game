/** Only legacy-save compatibility references the former hero identifier. */
export function migrateLoadoutLibrary(value: Record<string, unknown>) {
  const renameCard = (id: string) => id.replace(/^c_akira_/, 'c_lino_').replace('c_lino_katana', 'c_lino_foice');
  const normalize = (slots: unknown) => Array.isArray(slots) ? slots.map(deck => {
    if (!deck || typeof deck !== 'object' || !Array.isArray(deck.cards)) return deck;
    return { ...deck, cards: deck.cards.map((card: { id?: unknown }) => card && typeof card.id === 'string' ? { ...card, id: renameCard(card.id) } : card) };
  }) : slots;
  const result = Object.fromEntries(Object.entries(value).map(([key, slots]) => [key, normalize(slots)]));
  if (Array.isArray(result.akira)) {
    const current = Array.isArray(result.lino) ? result.lino : [];
    result.lino = Array.from({ length: 9 }, (_, i) => current[i] ?? (result.akira as unknown[])[i] ?? null);
    delete result.akira;
  }
  const matterCards: Record<string, string> = { c_abilitdmg: 'c_lino_pulso', c_headshot: 'c_lino_alcance', c_reload: 'c_lino_regresso', c_ammo: 'c_jump', c_ultdmg: 'c_radius' };
  if (Array.isArray(result.lino)) result.lino = result.lino.map(deck => {
    if (!deck || typeof deck !== 'object' || !Array.isArray(deck.cards)) return deck;
    return { ...deck, cards: deck.cards.map((card: { id?: unknown }) => card && typeof card.id === 'string' ? { ...card, id: matterCards[card.id] ?? card.id } : card) };
  });
  return result;
}
