import { HEROES } from '../../characters/index';
import type { HeroDef } from '../../core/types';
import { audio } from '../../core/audio';
import { topBar } from '../menu/components';
import { heroPresentation, reservedPortrait } from './presentation';
import { glyph } from '../shared/icons';
import { roleDescriptions, roleLabels } from '../../characters/roles';

type Tab = 'details' | 'abilities' | 'lore' | 'skins';
export class HeroGallery {
  private root = document.getElementById('screen-hero')!;
  private selected = HEROES[0];
  private filter = 'all';
  private tab: Tab = 'details';
  private abilityIndex = 0;
  constructor(actions: { back: () => void; confirm: (heroId: string) => void; editDecks: (heroId: string) => void }) {
    this.root.classList.add('lino-menu', 'hero-gallery');
    this.root.style.setProperty('--lino-red', '#ff3547');
    this.root.innerHTML = `${topBar('gallery-player-name', 'heroes')}
      <div class="gallery-layout">
        <section class="gallery-roster" aria-labelledby="gallery-title"><header><p class="gallery-eyebrow">ARQUIVO DE COMBATE / 06 DISPONÍVEIS</p><h1 id="gallery-title">GALERIA DE HERÓIS</h1><p>CONHEÇA SEU HERÓI. ENCONTRE SEU ESTILO.</p></header>
          <div class="gallery-filters" aria-label="Filtrar por função">${[['all', 'TODOS'], ...Object.entries(roleLabels)].map(([id, label]) => `<button data-filter="${id}" aria-pressed="${id === 'all'}">${label}</button>`).join('')}</div>
          <div id="hero-grid" class="gallery-grid" aria-label="Heróis disponíveis"></div>
          <p id="gallery-count" class="gallery-count" role="status"></p><div class="gallery-roster-note"><span>ELENCO DO PROTÓTIPO</span><p>Seis formas de entrar em combate.<br>Artes de referência e modelos 3D provisórios.</p></div>
        </section>
        <section class="gallery-viewer" aria-label="Visualizador do herói"><div class="gallery-viewer-label"><span id="gallery-viewer-status">MODELO PROVISÓRIO</span><div><button data-turn="-0.35" aria-label="Girar herói à esquerda">‹</button><span id="gallery-viewer-name"></span><button data-turn="0.35" aria-label="Girar herói à direita">›</button></div></div></section>
        <section class="gallery-detail" aria-label="Informações do herói"><div class="gallery-identity"><span class="gallery-sigil" aria-hidden="true"></span><p class="gallery-eyebrow">HERÓI DISPONÍVEL</p><h2 id="gallery-name"></h2><p id="gallery-subtitle"></p><div class="gallery-role"><span id="gallery-role-icon"></span><div><b id="gallery-role"></b><small id="gallery-role-desc"></small></div></div><p id="gallery-description"></p></div>
          <div class="gallery-tabs" role="tablist" aria-label="Informações">${[['details', 'DETALHES'], ['abilities', 'HABILIDADES'], ['lore', 'LORE'], ['skins', 'VISUAIS']].map(([id, label]) => `<button id="gallery-tab-${id}" role="tab" aria-controls="hero-detail" aria-selected="${id === 'details'}" tabindex="${id === 'details' ? 0 : -1}" data-tab="${id}">${label}</button>`).join('')}</div>
          <div id="hero-detail" class="gallery-tab-content" role="tabpanel" aria-labelledby="gallery-tab-details" tabindex="0"></div>
          <button id="gallery-loadouts" class="gallery-loadouts">BARALHOS <span>9 ESPAÇOS · 20 CARTAS</span></button><div id="gallery-skillbar" class="gallery-skillbar" aria-label="Explorar habilidades"></div>
          <div class="gallery-test-card"><div>${glyph('weapon')}</div><span><small>CONHEÇA NA PRÁTICA</small><b>DOJO DE TREINAMENTO</b><span>Teste este herói, suas armas e habilidades.</span></span><button id="gallery-training" aria-label="Testar herói no campo de treinamento">▷</button></div>
        </section>
      </div>
      <footer class="gallery-footer"><button id="btn-hero-back"><kbd>ESC</kbd> VOLTAR</button><span>← → NAVEGAR PELOS HERÓIS</span><button id="btn-hero-next">SELECIONAR HERÓI <b>→</b></button></footer>`;
    this.root.querySelector('#gallery-loadouts')!.addEventListener('click', () => actions.editDecks(this.selected.id));
    this.root.querySelector('#btn-hero-back')!.addEventListener('click', actions.back);
    this.root.querySelector('#btn-hero-next')!.addEventListener('click', () => { audio.ui(); actions.confirm(this.selected.id); });
    this.root.querySelectorAll<HTMLElement>('[data-filter]').forEach(b => b.onclick = () => {
      this.filter = b.dataset.filter!;
      const heroes = this.filtered();
      if (!heroes.includes(this.selected)) this.select(heroes[0]);
      this.renderRoster();
    });
    this.root.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => {
      b.onclick = () => this.setTab(b.dataset.tab as Tab);
      b.onkeydown = e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.code)) return;
        e.preventDefault(); e.stopPropagation();
        const tabs: Tab[] = ['details', 'abilities', 'lore', 'skins'];
        const next = e.code === 'Home' ? 0 : e.code === 'End' ? 3 : (tabs.indexOf(this.tab) + (e.code === 'ArrowRight' ? 1 : 3)) % 4;
        this.setTab(tabs[next]); this.root.querySelector<HTMLElement>(`[data-tab="${tabs[next]}"]`)!.focus();
      };
    });
    this.root.querySelectorAll<HTMLElement>('[data-turn]').forEach(b => b.onclick = () => window.dispatchEvent(new CustomEvent('lino:gallery-turn', { detail: Number(b.dataset.turn) })));
    this.root.querySelector('#gallery-training')!.addEventListener('click', () => window.dispatchEvent(new CustomEvent('lino:train-hero', { detail: this.selected.id })));
    this.root.querySelectorAll<HTMLElement>('[data-route]').forEach(b => b.onclick = () => {
      if (b.dataset.route !== 'heroes') window.dispatchEvent(new CustomEvent('lino:navigate', { detail: b.dataset.route }));
    });
    this.root.addEventListener('keydown', e => {
      if (e.code === 'Escape') { e.preventDefault(); actions.back(); }
      if (['ArrowLeft', 'ArrowRight'].includes(e.code) && (e.target as HTMLElement).closest('.gallery-grid')) {
        e.preventDefault(); const heroes = this.filtered();
        this.select(heroes[(heroes.indexOf(this.selected) + (e.code === 'ArrowRight' ? 1 : heroes.length - 1)) % heroes.length]);
        this.root.querySelector<HTMLElement>(`[data-hero="${this.selected.id}"]`)!.focus();
      }
    });
  }
  open(prematch = false) {
    this.root.querySelector<HTMLButtonElement>('#gallery-loadouts')!.hidden = prematch;
    this.filter = 'all'; this.tab = 'details';
    this.select(this.selected);
    this.root.querySelector('#gallery-player-name')!.textContent = document.getElementById('menu-player-name')?.textContent ?? 'JOGADOR';
    this.root.querySelector<HTMLElement>(`[data-hero="${this.selected.id}"]`)!.focus({ preventScroll: true });
  }
  private filtered() { return HEROES.filter(h => this.filter === 'all' || h.role === this.filter); }
  private renderRoster() {
    const heroes = this.filtered();
    const grid = this.root.querySelector('#hero-grid')!;
    grid.innerHTML = heroes.map(h => `<button class="hero-card gallery-portrait ${h === this.selected ? 'selected' : ''}" data-hero="${h.id}" aria-pressed="${h === this.selected}" aria-label="${h.name}, ${roleLabels[h.role]}" style="--portrait-color:#${h.color.toString(16).padStart(6, '0')}"><img src="${heroPresentation[h.id].portrait}" alt="Retrato de ${h.name}" style="object-position:${heroPresentation[h.id].portraitPosition}"/><span class="portrait-index">${String(HEROES.indexOf(h) + 1).padStart(2, '0')}</span><span class="portrait-name">${h.name}<i>${glyph(h.role === 'Tank' ? 'shield' : h.role === 'Support' ? 'summon' : 'weapon')}</i></span></button>`).join('') + (this.filter === 'all' ? `<div class="gallery-reserved gallery-reserved-art" aria-label="Retrato reservado para personagem em desenvolvimento"><img src="${reservedPortrait}" alt="Personagem de cabelo rosa com espírito violeta"><small>EM DESENVOLVIMENTO</small></div><div class="gallery-reserved" aria-label="Espaço reservado"><span>?</span><small>EM DESENVOLVIMENTO</small></div>` : '');
    grid.querySelectorAll<HTMLElement>('[data-hero]').forEach(b => b.onclick = () => { this.select(HEROES.find(h => h.id === b.dataset.hero)!); this.root.querySelector<HTMLElement>(`[data-hero="${this.selected.id}"]`)!.focus({ preventScroll: true }); });
    grid.querySelectorAll('img').forEach(img => img.onerror = () => { img.style.visibility = 'hidden'; });
    this.root.querySelectorAll<HTMLElement>('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === this.filter)));
    this.root.querySelector('#gallery-count')!.textContent = `${String(heroes.length).padStart(2, '0')} HERÓIS / ${this.filter === 'all' ? 'TODAS AS FUNÇÕES' : roleLabels[this.filter as HeroDef['role']]}`;
  }
  private select(hero: HeroDef) {
    this.selected = hero; this.abilityIndex = 0;
    this.root.dataset.hero = hero.id;
    this.root.style.setProperty('--hero-color', `#${hero.color.toString(16).padStart(6, '0')}`);
    const heading = this.root.querySelector('#gallery-name')!;
    heading.replaceChildren();
    const logoFile = heroPresentation[hero.id].logo;
    if (logoFile) {
      const logo = document.createElement('img');
      logo.src = logoFile;
      logo.alt = hero.name;
      logo.className = 'gallery-name-logo';
      logo.onerror = () => { heading.textContent = hero.name; };
      heading.append(logo);
    } else {
      heading.textContent = hero.name;
    }
    this.root.querySelector('#gallery-viewer-name')!.textContent = hero.name;
    this.root.querySelector('.gallery-sigil')!.textContent = hero.name.slice(0, 2);
    this.root.querySelector('#gallery-subtitle')!.textContent = hero.title.toUpperCase();
    this.root.querySelector('#gallery-role')!.textContent = roleLabels[hero.role];
    this.root.querySelector('#gallery-role-desc')!.textContent = roleDescriptions[hero.role];
    this.root.querySelector('#gallery-role-icon')!.innerHTML = glyph(hero.role === 'Tank' ? 'shield' : hero.role === 'Support' ? 'summon' : 'weapon');
    this.root.querySelector('#gallery-description')!.textContent = hero.description;
    this.renderRoster(); this.setTab(this.tab); audio.ui();
  }
  private skills() {
    const h = this.selected;
    return [
      { key: 'PASSIVA', name: h.passive.name, description: h.passive.description, kind: 'passive', extra: 'Efeito passivo do personagem.' },
      { key: 'ARMA', name: h.weapon.name, description: h.id === 'lino' ? 'Ceifar: combo de 45 / 45 / 60 de dano. O terceiro golpe tem arco maior, empurra o alvo e exige recuperação mais longa.' : `${h.weapon.damage} de dano-base · ${h.weapon.fireRate} ataques/s · ${h.weapon.ammo < 0 ? 'Sem munição' : h.weapon.ammo + ' munições'}.`, kind: 'weapon', extra: `Corpo a corpo (V): ${h.melee.damage} de dano, alcance ${h.melee.range}.${h.weapon.alt ? ' Botão do meio: ' + h.weapon.alt.name + ', ' + h.weapon.alt.damage + ' de dano.' : ''}` },
      ...h.abilities.map(a => ({ key: a.key, name: a.name, description: a.description, kind: a.kind, extra: `Recarga-base: ${a.cooldown} s.${a.config.damage ? ' Dano-base: ' + a.config.damage + '.' : ''}${a.config.shield ? ' Escudo-base: ' + a.config.shield + '.' : ''}` })),
      { key: 'SUPREMA · E', name: h.ultimate.name, description: h.ultimate.description, kind: 'ultimate', extra: `Requer 100% de ${h.resource.name}.${h.ultimate.config.damage ? ' Dano-base: ' + h.ultimate.config.damage + '.' : ''}` },
    ];
  }
  private renderSkills() {
    const bar = this.root.querySelector('#gallery-skillbar')!;
    (bar as HTMLElement).style.setProperty('--skill-count', String(this.skills().length));
    bar.innerHTML = this.skills().map((s, i) => `<button data-skill="${i}" class="${i === this.skills().length - 1 ? 'is-ultimate' : ''}" aria-label="${s.key}: ${s.name}" aria-pressed="${this.tab === 'abilities' && this.abilityIndex === i}"><span>${glyph(s.kind)}</span><small>${s.key}</small><b>${s.name}</b></button>`).join('');
    bar.querySelectorAll<HTMLElement>('[data-skill]').forEach(b => b.onclick = () => { this.abilityIndex = Number(b.dataset.skill); this.setTab('abilities'); });
  }
  private setTab(tab: Tab) {
    this.tab = tab;
    this.root.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => { b.setAttribute('aria-selected', String(b.dataset.tab === tab)); b.tabIndex = b.dataset.tab === tab ? 0 : -1; });
    const panel = this.root.querySelector('#hero-detail')!;
    panel.setAttribute('aria-labelledby', `gallery-tab-${tab}`);
    const h = this.selected;
    if (tab === 'details') panel.innerHTML = `<div class="gallery-stats"><div><small>VIDA</small><b>${h.hp}</b><i style="--stat:${h.hp / 520 * 100}%"></i></div><div><small>VELOCIDADE</small><b>${h.moveSpeed}<em> u/s</em></b><i style="--stat:${h.moveSpeed / 7 * 100}%"></i></div><div><small>RECURSO</small><b class="stat-resource">${h.resource.name}</b><i style="--stat:100%"></i></div></div><p class="gallery-smallprint">Atributos-base, antes de cartas e itens. Selecione uma habilidade abaixo para explorar seus efeitos.</p>`;
    if (tab === 'abilities') {
      const skill = this.skills()[this.abilityIndex];
      panel.innerHTML = `<div class="gallery-ability-heading">${glyph(skill.kind)}<span><small>${skill.key}</small><h3>${skill.name}</h3></span></div><p>${skill.description}</p><p class="gallery-smallprint">${skill.extra}</p>`;
    }
    if (tab === 'lore') panel.innerHTML = `<p class="gallery-lore">${h.lore}</p><p class="gallery-smallprint">História do elenco atual do protótipo.</p>`;
    if (tab === 'skins') panel.innerHTML = `<div class="gallery-skin"><img src="${heroPresentation[h.id].portrait}" alt="Retrato de ${h.name}"><span><small>VISUAL ATUAL</small><h3>PROTÓTIPO</h3><p>Arte de referência com modelo 3D provisório. Cosméticos e visuais adicionais ainda não estão disponíveis.</p></span></div>`;
    this.renderSkills();
  }
}
