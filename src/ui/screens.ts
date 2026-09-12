import { HeroGallery } from './gallery/HeroGallery';
import { LoadoutScreen } from './loadouts/LoadoutScreen';
import type { DeckCard } from '../core/types';
import type { MatchResult } from '../game/match/Match';
import { audio } from '../core/audio';
import { MatchSetup } from './match/MatchSetup';

export type DeckChoice = { heroId: string; cards: DeckCard[] };

export class Screens {
  selectedMode: "conquista" | "duelo" = "conquista";
  selectedMap = "kyoto";
  private gallery = new HeroGallery({ back: () => this.showMenu(), confirm: id => this.setup.openModes(id), editDecks: id => this.loadoutScreen.open(id, 'edit') });
  private loadoutScreen = new LoadoutScreen({ back: mode => mode === 'edit' ? this.showHeroSelect() : this.onLeaveMatch?.(), play: (heroId, cards) => this.onDeckConfirm?.({ heroId, cards }) });
  private setup = new MatchSetup({ back: () => this.showMenu(), start: (mode, map, heroId) => { this.selectedMode = mode; this.selectedMap = map; this.onHeroConfirm?.(heroId); } });
  private onHeroConfirm: ((heroId: string) => void) | null = null;
  private onLeaveMatch: (() => void) | null = null;
  private onDeckConfirm: ((choice: DeckChoice) => void) | null = null;
  private onEndBack: (() => void) | null = null;

  init(onHero: (heroId: string) => void, onLeaveMatch: () => void) {
    this.onHeroConfirm = onHero; this.onLeaveMatch = onLeaveMatch;
    document.getElementById('btn-help-close')!.onclick = () => this.toggleHelp(false);
  }
  showModes() { this.setup.openModes(); }
  showMatchLoadouts(heroId: string) { this.loadoutScreen.open(heroId, 'select'); }

  show(screenId: string) {
    document.querySelectorAll<HTMLElement>(".screen").forEach(s => s.classList.add("hidden"));
    document.getElementById(screenId)!.classList.remove("hidden");
  }

  showMenu() {
    this.show("screen-menu");
  }

  showHeroSelect(prematch = false) {
    this.show("screen-hero");
    this.gallery.open(prematch);
  }

  onDeck(handler: (choice: DeckChoice) => void) {
    this.onDeckConfirm = handler;
  }

  showEnd(result: MatchResult, onBack: () => void) {
    this.onEndBack = onBack;
    this.show("screen-end");
    const res = document.getElementById("end-result")!;
    res.textContent = result.draw ? "EMPATE" : result.win ? "VITÓRIA" : "DERROTA";
    res.className = "end-result" + (result.win || result.draw ? "" : " lose");
    document.getElementById("end-score")!.textContent =
      `${result.modeName} — AZUL ${Math.floor(result.score[0])} × ${Math.floor(result.score[1])} VERMELHO`;
    const s = result.stats;
    document.getElementById("end-stats")!.innerHTML = `
      <div><b>Abates:</b> ${s.kills} · <b>Mortes:</b> ${s.deaths} · <b>Assistências:</b> ${s.assists}</div>
      <div><b>Dano causado:</b> ${Math.floor(s.damage)} · <b>Cura:</b> ${Math.floor(s.healing)} · <b>Koban:</b> ${Math.floor(s.kobanEarned)}</div>
    `;
    document.getElementById("end-xp")!.textContent = `+${result.xp} XP DE MAESTRIA`;
    document.getElementById("btn-end-menu")!.onclick = () => {
      audio.ui();
      this.onEndBack?.();
    };
  }

  toggleHelp(show?: boolean) {
    const s = document.getElementById("screen-help")!;
    const willShow = show ?? s.classList.contains("hidden");
    s.classList.toggle("hidden", !willShow);
    audio.ui();
  }
}
