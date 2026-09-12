import { CARD_POOL, DECK_RULES, cardDescription } from '../../progression/cards/catalog';
import { deckPoints, loadouts, validDeck } from '../../progression/loadouts/library';
import { HERO_MAP } from '../../characters/index';
import type { HeroDef, SavedDeck, DeckCard } from '../../core/types';
import { heroPresentation } from '../gallery/presentation';
import './loadouts.css';

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export class LoadoutScreen {
  private root!: HTMLElement;
  private hero!: HeroDef;
  private mode: 'edit' | 'select' = 'select';
  private slots: (SavedDeck | null)[] = [];
  private selected = 0;
  private draft: SavedDeck | null = null;
  constructor(private actions: { back: (mode: 'edit' | 'select') => void; play: (heroId: string, cards: DeckCard[]) => void }) {
    const editor = document.createElement('div');
    editor.id = 'screen-loadouts'; editor.className = 'screen hidden'; document.body.append(editor);
  }
  open(heroId: string, mode: 'edit' | 'select') {
    this.hero = HERO_MAP[heroId]; this.mode = mode; this.draft = null;
    this.slots = loadouts.get(heroId); this.selected = this.slots.findIndex(Boolean);
    this.root = document.getElementById(mode === 'edit' ? 'screen-loadouts' : 'screen-deck')!;
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    this.root.classList.remove('hidden'); this.root.classList.add('loadouts-screen');
    this.render();
    this.root.querySelector<HTMLElement>('[data-slot][aria-pressed="true"]')?.focus();
  }
  private render() {
    const editing = this.mode === 'edit';
    this.root.innerHTML = `<div class="loadouts-wrap">
      <header class="loadouts-header"><img src="${heroPresentation[this.hero.id].portrait}" alt="${this.hero.name}"><div><small>${this.hero.name} / ${editing ? 'GALERIA DE PERSONAGEM' : 'DENTRO DA PARTIDA · ESCOLHA SEU BARALHO'}</small><h1>${editing ? 'SEUS BARALHOS' : 'ESCOLHA UM BARALHO'}</h1><p>${editing ? '9 espaços personalizados · 20 cartas disponíveis' : 'O mapa está pronto. Confirme um baralho salvo para iniciar o combate. Depois de confirmar, você não poderá trocá-lo nesta partida.'}</p></div></header>
      <div class="loadouts-rules"><span><b>5</b> cartas diferentes</span><span>Níveis <b>1–5</b></span><span><b>15</b> pontos no total</span></div>
      <div class="loadouts-layout"><nav class="loadout-slots" aria-label="Seus nove baralhos">${this.slots.map((deck, i) => `<button data-slot="${i}" aria-pressed="${this.selected === i}" ${this.draft || (!editing && !deck) ? 'disabled' : ''}><span class="slot-number">${String(i + 1).padStart(2, '0')}</span><span><b>${escape(deck?.name ?? 'Espaço vazio')}</b><small>${deck ? '5 CARTAS · 15 PONTOS' : editing ? 'CRIAR BARALHO' : 'NÃO CRIADO'}</small></span></button>`).join('')}</nav>
      <section class="loadout-content" aria-label="Conteúdo do baralho">
        <p id="loadout-message" role="status"></p><div id="loadout-detail"></div>
      </section></div>
      <footer class="loadouts-footer"><button id="${editing ? 'btn-loadouts-back' : 'btn-deck-back'}" ${this.draft ? 'disabled' : ''}>← ${editing ? 'VOLTAR À GALERIA' : 'SAIR DA PARTIDA'}</button><span>Baralhos salvos neste navegador</span>${editing ? '' : '<button id="btn-deck-next" class="loadout-primary">CONFIRMAR BARALHO →</button>'}</footer>
    </div>`;
    this.root.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(button => button.onclick = () => {
      this.selected = Number(button.dataset.slot); this.render();
      this.root.querySelector<HTMLElement>(`[data-slot="${this.selected}"]`)?.focus();
    });
    this.root.querySelector<HTMLElement>(editing ? '#btn-loadouts-back' : '#btn-deck-back')!.onclick = () => this.actions.back(this.mode);
    const play = this.root.querySelector<HTMLButtonElement>('#btn-deck-next');
    if (play) {
      play.disabled = !validDeck(this.hero.id, this.slots[this.selected]);
      play.onclick = () => {
        const deck = this.slots[this.selected];
        if (validDeck(this.hero.id, deck)) { play.disabled = true; this.actions.play(this.hero.id, structuredClone(deck.cards)); }
      };
    }
    this.renderDetail();
  }
  private renderDetail() {
    const detail = this.root.querySelector('#loadout-detail')!;
    const deck = this.draft ?? this.slots[this.selected];
    if (!this.draft) {
      detail.innerHTML = `<div class="loadout-title"><h2>${escape(deck?.name ?? `Baralho ${this.selected + 1}`)}</h2>${this.mode === 'edit' ? `<button id="loadout-edit" class="loadout-primary">${deck ? 'EDITAR BARALHO' : 'CRIAR BARALHO'}</button>` : '<span class="loadout-badge">BARALHO SALVO</span>'}</div>
        ${deck ? `<div class="loadout-five">${deck.cards.map(card => this.cardMarkup(card)).join('')}</div>` : '<div class="loadout-empty">Escolha cinco cartas e distribua seus 15 pontos para criar um estilo de jogo.</div>'}`;
      const edit = detail.querySelector<HTMLElement>('#loadout-edit');
      if (edit) edit.onclick = () => {
        this.draft = deck ? structuredClone(deck) : { name: `Baralho ${this.selected + 1}`, cards: [] };
        this.render(); this.root.querySelector<HTMLInputElement>('#loadout-name')!.focus();
      };
      return;
    }
    detail.innerHTML = `<div class="loadout-title"><label>Nome do baralho<input id="loadout-name" maxlength="32" value="${escape(this.draft.name)}"></label><b id="loadout-points"></b></div>
      <div class="loadout-five">${this.draft.cards.map(card => this.cardMarkup(card, true)).join('')}${Array.from({ length: 5 - this.draft.cards.length }, () => '<div class="loadout-card empty">+<small>Escolha uma carta abaixo</small></div>').join('')}</div>
      <div class="loadout-editor-actions"><button id="loadout-cancel">CANCELAR EDIÇÃO</button><button id="loadout-save" class="loadout-primary">SALVAR BARALHO</button></div>
      <h3 class="loadout-pool-title">CARTAS DE ${this.hero.name} <span>20 DISPONÍVEIS</span></h3><p class="loadout-hint">Cada carta abaixo mostra o efeito no nível 1. Ajuste os níveis nas cinco cartas do seu baralho.</p>
      <div class="loadout-pool">${this.hero.cards.map(id => {
        const picked = this.draft!.cards.some(c => c.id === id);
        return `<button data-add="${id}" ${picked || this.draft!.cards.length === 5 ? 'disabled' : ''} class="${picked ? 'picked' : ''}"><small>${picked ? 'NO BARALHO' : 'NÍVEL 1'}</small><b>${CARD_POOL[id].name}</b><span>${cardDescription({ id, level: 1 })}</span></button>`;
      }).join('')}</div>`;
    this.root.querySelector<HTMLInputElement>('#loadout-name')!.oninput = event => {
      this.draft!.name = (event.target as HTMLInputElement).value; this.updateValidity();
    };
    this.root.querySelectorAll<HTMLButtonElement>('[data-add]').forEach(button => button.onclick = () => {
      if (this.draft!.cards.length < 5 && !this.draft!.cards.some(c => c.id === button.dataset.add)) {
        this.draft!.cards.push({ id: button.dataset.add!, level: 1 }); this.renderDetail();
        if (this.draft!.cards.length === 5) this.root.querySelector('#loadout-detail')!.scrollIntoView({ block: 'start' });
      }
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach(button => button.onclick = () => {
      this.draft!.cards = this.draft!.cards.filter(c => c.id !== button.dataset.remove); this.renderDetail();
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-level]').forEach(button => button.onclick = () => {
      const card = this.draft!.cards.find(c => c.id === button.dataset.card)!;
      const level = card.level + Number(button.dataset.level);
      if (level >= 1 && level <= 5 && deckPoints(this.draft!.cards) + Number(button.dataset.level) <= 15) {
        card.level = level; this.renderDetail();
        this.root.querySelector<HTMLElement>(`[data-card="${card.id}"][data-level="${button.dataset.level}"]`)?.focus();
      }
    });
    this.root.querySelector<HTMLElement>('#loadout-cancel')!.onclick = () => { this.draft = null; this.render(); };
    this.root.querySelector<HTMLElement>('#loadout-save')!.onclick = () => {
      if (!this.draft || !validDeck(this.hero.id, this.draft)) return;
      try {
        loadouts.save(this.hero.id, this.selected, this.draft);
        this.slots = loadouts.get(this.hero.id); this.draft = null; this.render();
        this.root.querySelector('#loadout-message')!.textContent = 'Baralho salvo. Ele já pode ser escolhido antes da partida.';
      } catch (error) { this.root.querySelector('#loadout-message')!.textContent = (error as Error).message; }
    };
    this.updateValidity();
  }
  private updateValidity() {
    if (!this.draft) return;
    const points = deckPoints(this.draft.cards);
    this.root.querySelector('#loadout-points')!.textContent = `${this.draft.cards.length}/5 CARTAS · ${points}/15 PONTOS`;
    this.root.querySelector<HTMLButtonElement>('#loadout-save')!.disabled = !validDeck(this.hero.id, this.draft);
    this.root.querySelector('#loadout-message')!.textContent = this.draft.cards.length < 5 ? `Escolha mais ${5 - this.draft.cards.length} carta(s).`
      : points < 15 ? `Distribua os ${15 - points} pontos restantes para salvar.` : !this.draft.name.trim() ? 'Dê um nome ao baralho.' : 'Pronto para salvar.';
  }
  private cardMarkup(card: DeckCard, editing = false) {
    return `<article class="loadout-card"><small>NÍVEL ${card.level}</small><h3>${CARD_POOL[card.id].name}</h3><p>${cardDescription(card)}</p><div class="card-level-pips" aria-label="Nível ${card.level} de 5">${Array.from({ length: 5 }, (_, i) => `<i class="${i < card.level ? 'on' : ''}"></i>`).join('')}</div>${editing ? `<div class="card-level-controls"><button data-card="${card.id}" data-level="-1" aria-label="Diminuir nível de ${CARD_POOL[card.id].name}" ${card.level <= 1 ? 'disabled' : ''}>−</button><b>${card.level}</b><button data-card="${card.id}" data-level="1" aria-label="Aumentar nível de ${CARD_POOL[card.id].name}" ${card.level >= 5 || deckPoints(this.draft!.cards) >= DECK_RULES.budget ? 'disabled' : ''}>+</button></div><button data-remove="${card.id}" class="card-remove">REMOVER</button>` : ''}</article>`;
  }
}
