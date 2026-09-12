import { HEROES } from '../../characters/index';
import { MAPS } from '../../maps/index';
import { GAME_MODES } from '../../game/modes/definitions';
import { heroPresentation } from '../gallery/presentation';
import { glyph } from '../shared/icons';
import { roleLabels } from '../../characters/roles';
import './matchFlow.css';

type Mode = keyof typeof GAME_MODES;
export class MatchSetup {
  mode: Mode = 'conquista';
  mapId = 'kyoto';
  private hero = HEROES[0];
  private modes = this.create('screen-modes');
  private pick = this.create('screen-pick');
  constructor(private actions: { back: () => void; start: (mode: Mode, map: string, hero: string) => void }) {
    this.modes.addEventListener('keydown', e => { if (e.code === 'Escape') this.actions.back(); });
    this.pick.addEventListener('keydown', e => { if (e.code === 'Escape') this.openModes(); });
  }
  private create(id: string) {
    const root = document.createElement('section'); root.id = id; root.className = 'screen flow-screen hidden';
    document.body.append(root); return root;
  }
  private show(root: HTMLElement) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    root.classList.remove('hidden'); root.scrollTop = 0;
  }
  private steps(step: number) {
    return `<nav class="flow-steps" aria-label="Etapas da partida">${['MODO E MAPA', 'PERSONAGEM', 'BARALHO NA PARTIDA'].map((s, i) => `<span ${i === step ? 'aria-current="step"' : ''}><b>0${i + 1}</b>${s}</span>`).join('')}</nav>`;
  }
  openModes(heroId?: string) {
    if (heroId) this.hero = HEROES.find(h => h.id === heroId) ?? this.hero;
    this.show(this.modes); this.renderModes();
    this.modes.querySelector<HTMLElement>(`[data-mode="${this.mode}"]`)!.focus();
  }
  private renderModes() {
    this.modes.innerHTML = `<div class="flow-wrap">${this.steps(0)}<header class="flow-heading"><small>LIN0 / PARTIDA LOCAL · 5 CONTRA 5</small><h1>ESCOLHA SUA BATALHA</h1><p>Defina o objetivo. Encontre seu campo de batalha.</p></header>
      <div class="mode-layout"><section><h2 class="flow-section-title">01 / MODO DE JOGO</h2><div class="flow-mode-grid">${(Object.keys(GAME_MODES) as Mode[]).map(mode => `<button class="battle-mode ${mode}" data-mode="${mode}" aria-pressed="${this.mode === mode}"><div class="mode-symbol">${glyph(mode === 'conquista' ? 'summon' : 'weapon')}</div><span class="mode-format">5V5 <i>${this.mode === mode ? 'SELECIONADO' : 'DISPONÍVEL'}</i></span><h3>${GAME_MODES[mode].name}</h3><p>${GAME_MODES[mode].desc}</p><small>${mode === 'conquista' ? '200 PONTOS PARA VENCER' : '50 ELIMINAÇÕES PARA VENCER'} · ATÉ 10 MIN</small></button>`).join('')}</div>
      <button id="btn-play-training" class="play-training"><span>${glyph('summon')}</span><span><b>CAMPO DE TREINAMENTO</b><small>Teste personagens e habilidades no dojo, sem limite de tempo.</small></span><strong>ENTRAR →</strong></button><h2 class="flow-section-title">02 / CAMPO DE BATALHA</h2><div class="flow-map-grid">${['kyoto', 'castle'].filter(id => MAPS[id]).map(id => `<button class="battle-map" data-map="${id}" aria-pressed="${this.mapId === id}"><div class="map-art map-${id}" aria-hidden="true">${MAPS[id].theme === 'residential' ? '<span class="map-location">松濤 / SHIBUYA</span><span class="map-tactics">PRAÇA CENTRAL · PARQUES · TERRAÇOS</span>' : '<i></i><i></i><i></i><b>鳥居</b>'}</div><div><h3>${MAPS[id].name}</h3><p>${MAPS[id].environment}</p><small>${this.mapId === id ? '● MAPA SELECIONADO' : 'SELECIONAR MAPA'}</small></div></button>`).join('')}</div></section>
      <aside class="battle-summary"><small>SUA PRÓXIMA PARTIDA</small><div class="summary-emblem">${glyph(this.mode === 'conquista' ? 'summon' : 'weapon')}</div><h2>${GAME_MODES[this.mode].name}</h2><p>${MAPS[this.mapId].name}</p><dl><div><dt>Formato</dt><dd>5 contra 5</dd></div><div><dt>Participantes</dt><dd>Você + 9 bots</dd></div><div><dt>Tempo máximo</dt><dd>10 minutos</dd></div></dl><p class="flow-note">A seguir, escolha seu personagem. Seu baralho será confirmado dentro da partida.</p></aside></div>
      <footer class="flow-footer"><button id="btn-mode-back">← VOLTAR AO INÍCIO</button><span>01 / 03</span><button id="btn-mode-next" class="flow-primary">ESCOLHER PERSONAGEM →</button></footer></div>`;
    this.modes.querySelectorAll<HTMLElement>('[data-mode]').forEach(b => b.onclick = () => { this.mode = b.dataset.mode as Mode; this.renderModes(); this.modes.querySelector<HTMLElement>(`[data-mode="${this.mode}"]`)!.focus({ preventScroll: true }); });
    this.modes.querySelectorAll<HTMLElement>('[data-map]').forEach(b => b.onclick = () => { this.mapId = b.dataset.map!; this.renderModes(); this.modes.querySelector<HTMLElement>(`[data-map="${this.mapId}"]`)!.focus({ preventScroll: true }); });
    this.modes.querySelector<HTMLElement>('#btn-play-training')!.onclick = () => window.dispatchEvent(new CustomEvent('lino:train-hero', { detail: this.hero.id }));
    this.modes.querySelector<HTMLElement>('#btn-mode-back')!.onclick = this.actions.back;
    this.modes.querySelector<HTMLElement>('#btn-mode-next')!.onclick = () => this.openCharacters();
  }
  openCharacters() {
    this.show(this.pick); this.renderPick();
    this.pick.querySelector<HTMLElement>(`[data-pick="${this.hero.id}"]`)!.focus();
  }
  private renderPick() {
    const h = this.hero;
    this.pick.innerHTML = `<div class="flow-wrap">${this.steps(1)}<header class="flow-heading"><small>${GAME_MODES[this.mode].name} / ${MAPS[this.mapId].name}</small><h1>ESCOLHA SEU PERSONAGEM</h1><p>O combate começa com a sua escolha.</p></header>
      <div class="pick-layout"><div class="pick-art"><img src="${heroPresentation[h.id].portrait}" alt="${h.name}"><span>${h.name}</span></div><section class="pick-info"><small>${roleLabels[h.role]} / HERÓI DISPONÍVEL</small><h2>${h.name}</h2><h3>${h.title}</h3><p>${h.description}</p><div class="pick-stats"><span><b>${h.hp}</b>VIDA BASE</span><span><b>${h.moveSpeed}</b>VELOCIDADE</span><span><b>${h.weapon.ammo < 0 ? '∞' : h.weapon.ammo}</b>MUNIÇÃO</span></div><h4>SEU ARSENAL</h4><div class="pick-abilities">${h.abilities.map(a => `<div><kbd>${a.key}</kbd><span><b>${a.name}</b><small>${a.description}</small></span></div>`).join('')}</div><p class="flow-note">Confirme para carregar o mapa. Lá, escolha um dos seus baralhos salvos; a confirmação será definitiva até o fim da partida.</p></section></div>
      <nav class="pick-roster" aria-label="Personagens disponíveis">${HEROES.map(hero => `<button data-pick="${hero.id}" aria-pressed="${hero === h}"><img src="${heroPresentation[hero.id].portrait}" alt=""><span><b>${hero.name}</b><small>${roleLabels[hero.role]}</small></span></button>`).join('')}</nav>
      <footer class="flow-footer"><button id="btn-pick-back">← MODO E MAPA</button><span>02 / 03</span><button id="btn-pick-confirm" class="flow-primary">CONFIRMAR ${h.name} →</button></footer></div>`;
    this.pick.querySelectorAll<HTMLElement>('[data-pick]').forEach(b => b.onclick = () => { this.hero = HEROES.find(h => h.id === b.dataset.pick)!; this.renderPick(); this.pick.querySelector<HTMLElement>(`[data-pick="${this.hero.id}"]`)!.focus({ preventScroll: true }); });
    this.pick.querySelector<HTMLElement>('#btn-pick-back')!.onclick = () => this.openModes();
    this.pick.querySelector<HTMLElement>('#btn-pick-confirm')!.onclick = () => this.actions.start(this.mode, this.mapId, this.hero.id);
  }
}
