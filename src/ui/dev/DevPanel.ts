import * as THREE from 'three';
import type { Match } from '../../game/match/Match';
import type { Player } from '../../game/actors/Player';
import type { Input } from '../../core/input';
import type { StatKey } from '../../core/types';
import { HEROES } from '../../characters';
import { CARD_POOL, DECK_RULES } from '../../progression/cards/catalog';
import { validDeck } from '../../progression/loadouts/library';
import { SHOP_ITEMS, SHOP_RULES } from '../../progression/shop/items';
import { AI_PROFILES, profileFor, type AIProfileName } from '../../game/ai/profiles';
import { ResourceTracker } from '../../core/ResourceTracker';
import { gameNow } from '../../core/time';
import type { StatusKind } from '../../game/combat/StatusEffectManager';
import './dev.css';

const option = (value: string | number, label: string) => `<option value="${value}">${label}</option>`;
const statKeys = [...new Set(['maxHp', 'moveSpeed', 'damageMult', 'healMult', 'shieldMult', 'cooldownMult', 'reloadMult',
  ...Object.values(CARD_POOL).flatMap(card => Object.keys(card.mods ?? {})), ...SHOP_ITEMS.flatMap(item => item.mods.flatMap(Object.keys))])] as StatKey[];

/** Native controls, 5 Hz telemetry and a reusable line buffer; hidden panels skip DOM updates. */
export class DevPanel {
  readonly panel = document.createElement('dialog');
  private match: Match | null = null;
  private selectedId = 0;
  private previous = performance.now();
  private elapsed = 0;
  private frames = 0;
  private fps = 0;
  private visuals = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x61ffb4, depthTest: false }));
  private positions = new Float32Array(60000);
  private restoreFocus: HTMLElement | null = null;
  private blockedBefore = true;
  private changedBlocked = false;

  constructor(private getMatch: () => Match | null, private input: Input, private refreshHud: () => void) {
    this.panel.id = 'dev-panel'; this.panel.hidden = true; this.panel.tabIndex = -1;
    this.panel.setAttribute('aria-label', 'Ferramentas de desenvolvimento e treinamento');
    this.panel.innerHTML = `<header><strong>DEV MODE · F3</strong><button data-action="close" aria-label="Fechar ferramentas">Fechar</button></header>
      <p>F3 abre/fecha. A simulação continua. Alterações valem apenas nesta partida.</p>
      <label>Jogador <select data-field="player"></select></label>
      <output data-field="message" role="status"></output>
      <pre data-field="telemetry"></pre>
      <fieldset><legend>Jogador selecionado</legend>
        <label>Quantidade <input data-field="amount" type="number" value="100" min="0" max="100000"></label>
        <div class="dev-actions">${['heal', 'damage', 'kill', 'respawn', 'ult', 'cooldowns', 'interrupt'].map((action, i) => `<button data-action="${action}">${['Curar', 'Causar dano', 'Eliminar', 'Renascer', 'Ult cheia', 'Zerar recargas', 'Interromper habilidade'][i]}</button>`).join('')}</div>
        <label>Herói <select data-field="hero">${HEROES.map(h => option(h.id, h.name)).join('')}</select></label>
        <label>Time <select data-field="team">${option(0, 'Azul')}${option(1, 'Vermelho')}</select></label>
        <label><input type="checkbox" data-field="invincible"> Invencível</label>
        <label><input type="checkbox" data-field="headshot"> Receber apenas headshots</label>
        <label>HP máximo do alvo <input type="number" data-field="maxhp" min="1" max="100000"></label><button data-action="maxhp">Aplicar HP</button>
        <label>Escudo <input type="number" data-field="shield" value="100" min="0" max="300"></label><button data-action="shield">Conceder escudo (10 s)</button>
        <label>Teleportar X <input type="number" data-field="x" value="0" step=".5"></label>
        <label>Y <input type="number" data-field="y" value="1" step=".5"></label>
        <label>Z <input type="number" data-field="z" value="0" step=".5"></label><button data-action="teleport">Teleportar</button>
      </fieldset>
      <fieldset><legend>Simulação e IA</legend>
        <label><input type="checkbox" data-field="freeze"> Congelar IA</label>
        <label>Velocidade do tempo <input type="number" data-field="scale" value="1" min="0" max="4" step=".25"></label>
        <label>Perfil IA <select data-field="profile">${Object.keys(AI_PROFILES).map(p => option(p, p)).join('')}</select></label>
        <label><input type="checkbox" data-field="hitboxes"> Hitboxes</label>
        <label><input type="checkbox" data-field="trajectories"> Trajetórias de projéteis (previsão de 1 s)</label>
        <label><input type="checkbox" data-field="routes"> Rotas IA</label>
      </fieldset>
      <fieldset><legend>Treinamento</legend>
        <label><input type="checkbox" data-field="moving"> Alvos móveis</label>
        <label><input type="checkbox" data-field="attack"> Alvo ataca</label>
        <label><input type="checkbox" data-field="free"> Recargas e recursos livres</label>
        <button data-action="reset-training">Reiniciar treinamento e DPS</button>
      </fieldset>
      <fieldset><legend>Buffs e debuffs</legend>
        <label>Efeito <select data-field="status">${['slow', 'poison', 'burn', 'hot', 'speed', 'vulnerability', 'invulnerability', 'lifesteal'].map(kind => option(kind, kind)).join('')}</select></label>
        <label>Valor (fração ou HP/s) <input data-field="status-value" type="number" value=".2" min="0" max="1000" step=".1"></label>
        <label>Duração (s) <input data-field="status-duration" type="number" value="5" min=".1" max="120" step=".1"></label>
        <button data-action="status">Aplicar efeito</button><button data-action="clear-status">Limpar efeitos</button>
      </fieldset>
      <fieldset><legend>Baralho temporário · 5 cartas / 15 pontos</legend><div data-field="cards"></div><button data-action="cards">Aplicar baralho</button></fieldset>
      <fieldset><legend>Itens temporários</legend>
        <label>Item <select data-field="item">${SHOP_ITEMS.map(item => option(item.id, item.name)).join('')}</select></label>
        <label>Nível (0 remove) <input data-field="level" type="number" min="0" max="4" value="1"></label><button data-action="item">Aplicar item</button>
      </fieldset>
      <details><summary>Cálculo dos stats · base + fontes = final</summary><pre data-field="stats"></pre></details>`;
    document.body.appendChild(this.panel);
    this.visuals.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.visuals.frustumCulled = false; this.visuals.renderOrder = 999;
    this.panel.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if (button) this.action(button.dataset.action!);
    });
    this.panel.addEventListener('change', event => this.change((event.target as HTMLElement).dataset.field ?? ''));
    window.addEventListener('keydown', event => {
      if (event.code === 'F3' && !event.repeat) { event.preventDefault(); event.stopImmediatePropagation(); this.toggle(); }
      else if (event.code === 'Escape' && !this.panel.hidden) { event.preventDefault(); event.stopImmediatePropagation(); this.toggle(false); }
    }, true);
  }
  private field<T extends HTMLElement = HTMLInputElement>(name: string): T { return this.panel.querySelector<T>(`[data-field="${name}"]`)!; }
  private number(name: string) { return this.field<HTMLInputElement>(name).valueAsNumber; }
  private value(name: string) { return this.field<HTMLInputElement | HTMLSelectElement>(name).value; }
  private checked(name: string) { return this.field<HTMLInputElement>(name).checked; }
  private message(message: string) { this.field<HTMLOutputElement>('message').textContent = message; }
  private get player() { return this.match?.players.find(p => p.id === this.selectedId) ?? this.match?.local; }
  private brain(player: Player) { return this.match?.brains[this.match.players.filter(p => p.isBot).indexOf(player)]; }

  toggle(show = this.panel.hidden) {
    const match = this.getMatch();
    if (!match) return;
    if (this.match !== match) this.bind(match);
    this.panel.hidden = !show; match.devOpen = show;
    this.input.reset();
    if (show) {
      this.restoreFocus = document.activeElement as HTMLElement;
      this.blockedBefore = this.input.blocked; this.changedBlocked = true;
      this.input.blocked = true;
      if (document.pointerLockElement) document.exitPointerLock();
      if (!this.panel.open) this.panel.showModal();
      this.sync(); this.panel.focus();
    } else {
      this.panel.close();
      if (this.changedBlocked) this.input.blocked = this.blockedBefore || match.paused || match.trainingPaused || match.state === 'loadout' || match.state === 'ended';
      this.changedBlocked = false;
      this.restoreFocus?.focus();
      if (!this.input.blocked) this.input.requestLock();
    }
  }
  private bind(match: Match) {
    this.visuals.removeFromParent(); this.visuals.geometry.setDrawRange(0, 0);
    this.match = match; this.selectedId = match.local.id;
    match.world.group.add(this.visuals);
    this.field<HTMLSelectElement>('player').replaceChildren(...match.players.map(player => new Option(`${player.name} · ${player.hero.name}`, String(player.id))));
    this.sync();
  }
  private sync() {
    const p = this.player, m = this.match;
    if (!p || !m) return;
    for (const [key, value] of Object.entries({ player: p.id, hero: p.hero.id, team: p.team, maxhp: p.maxHp, scale: m.timeScale, profile: this.brain(p)?.profile ?? profileFor(p.hero) })) this.field<HTMLInputElement | HTMLSelectElement>(key).value = String(value);
    for (const [key, value] of Object.entries({ invincible: p.debugInvincible, headshot: p.headshotsOnly, freeze: m.freezeAI, moving: m.trainingMoving, attack: m.trainingAttack, free: m.trainingFree })) this.field<HTMLInputElement>(key).checked = value;
    this.field<HTMLInputElement>('profile').disabled = !p.isBot;
    for (const key of ['moving', 'attack', 'free']) this.field<HTMLInputElement>(key).disabled = !m.training;
    this.field('cards').innerHTML = Array.from({ length: DECK_RULES.size }, (_, index) => {
      const card = p.cards[index];
      return `<label>Carta ${index + 1}<select data-card="${index}">${p.hero.cards.map(id => option(id, CARD_POOL[id]?.name ?? id)).join('')}</select><input aria-label="Nível da carta ${index + 1}" data-card-level="${index}" type="number" value="${card?.level ?? 3}" min="1" max="5"></label>`;
    }).join('');
    this.panel.querySelectorAll<HTMLSelectElement>('[data-card]').forEach((select, index) => { select.value = p.cards[index]?.id ?? p.hero.cards[index]; });
  }
  private change(field: string) {
    const p = this.player, m = this.match;
    if (!p || !m) return;
    if (field === 'player') { this.selectedId = Number(this.value(field)); this.sync(); }
    if (field === 'hero') { if (m.changeHero(p, this.value(field))) { this.refreshHud(); this.sync(); } }
    if (field === 'team') { m.changeTeam(p, Number(this.value(field))); this.refreshHud(); this.sync(); }
    if (field === 'invincible') p.debugInvincible = this.checked(field);
    if (field === 'headshot') p.headshotsOnly = this.checked(field);
    if (field === 'freeze') m.freezeAI = this.checked(field);
    if (field === 'scale') {
      const value = this.number(field);
      if (Number.isFinite(value) && value >= 0 && value <= 4) m.timeScale = value;
      else { this.message('Velocidade deve estar entre 0 e 4.'); this.field<HTMLInputElement>(field).value = String(m.timeScale); }
    }
    if (field === 'profile' && this.value(field) in AI_PROFILES) { const brain = this.brain(p); if (brain) brain.profile = this.value(field) as AIProfileName; }
    if (m.training) {
      if (field === 'moving') m.trainingMoving = this.checked(field);
      if (field === 'attack') m.trainingAttack = this.checked(field);
      if (field === 'free') m.trainingFree = this.checked(field);
    }
  }
  private action(action: string) {
    if (action === 'close') { this.toggle(false); return; }
    const p = this.player, m = this.match;
    if (!p || !m) return;
    const amount = this.number('amount');
    if ((action === 'heal' || action === 'damage') && (!Number.isFinite(amount) || amount < 0 || amount > 100000)) { this.message('Quantidade inválida.'); return; }
    this.message('');
    switch (action) {
      case 'heal': p.applyHeal(p, amount); break;
      case 'damage': {
        const enemy = m.players.find(other => other !== p && other.team !== p.team);
        if (enemy) p.applyDamage(enemy, amount); break;
      }
      case 'kill': p.die(null); break;
      case 'respawn': p.respawn(m.world.spawns[p.team][0]); break;
      case 'ult': p.resource = 100; break;
      case 'cooldowns': p.resetCooldowns(); break;
      case 'interrupt': for (const runtime of [...p.runtimes, p.ultimateRuntime]) runtime.interrupt(); break;
      case 'maxhp': {
        const hp = this.number('maxhp');
        if (Number.isFinite(hp) && hp >= 1 && hp <= 100000) { p.debugMaxHp = hp; if (p.alive) p.hp = hp; }
        else this.message('HP deve estar entre 1 e 100000.'); break;
      }
      case 'shield': p.grantShield(this.number('shield'), 10); break;
      case 'teleport': if (!m.teleport(p, this.number('x'), this.number('y'), this.number('z'))) this.message('Posição inválida ou fora do mapa.'); break;
      case 'reset-training': m.resetTraining(); break;
      case 'status': {
        const kind = this.value('status') as StatusKind, value = this.number('status-value'), duration = this.number('status-duration');
        if (!Number.isFinite(value) || value < 0 || value > 1000 || !Number.isFinite(duration) || duration <= 0 || duration > 120) { this.message('Valor ou duração inválidos.'); break; }
        const source = kind === 'poison' || kind === 'burn' ? m.players.find(other => other !== p && other.team !== p.team) : m.local;
        if (source) p.status.add({ id: `dev:${kind}`, kind, source, value, duration, stacking: 'refresh' });
        break;
      }
      case 'clear-status': p.status.clear(); p.buffs = []; p.slowUntil = p.speedBoostUntil = p.invulnUntil = 0; break;
      case 'cards': {
        const cards = [...this.panel.querySelectorAll<HTMLSelectElement>('[data-card]')].map((select, index) => ({ id: select.value, level: this.panel.querySelector<HTMLInputElement>(`[data-card-level="${index}"]`)!.valueAsNumber }));
        if (!validDeck(p.hero.id, { name: 'Dev', cards })) { this.message('Use 5 cartas diferentes, níveis de 1–5 e soma de 15.'); break; }
        p.cards = cards; p.recomputeMods(); this.refreshHud(); this.message('Baralho aplicado apenas nesta partida.'); break;
      }
      case 'item': {
        const def = SHOP_ITEMS.find(item => item.id === this.value('item')), level = this.number('level');
        if (!def || !Number.isInteger(level) || level < 0 || level > def.levels) { this.message('Nível de item inválido.'); break; }
        const owned = p.items.find(item => item.def.id === def.id);
        if (!owned && level > 0 && p.items.length >= SHOP_RULES.maxItems) { this.message(`Limite de ${SHOP_RULES.maxItems} itens.`); break; }
        if (level === 0) p.items = p.items.filter(item => item.def.id !== def.id);
        else if (owned) owned.level = level;
        else p.items.push({ def, level });
        p.recomputeMods(); this.refreshHud(); break;
      }
    }
  }

  frame(info: THREE.WebGLInfo) {
    const now = performance.now(), dt = (now - this.previous) / 1000; this.previous = now;
    this.elapsed += dt; this.frames++;
    const m = this.getMatch();
    if (!m) { this.panel.close(); this.panel.hidden = true; this.visuals.removeFromParent(); this.match = null; return; }
    if (this.match !== m) { this.panel.hidden = true; this.bind(m); }
    if (this.elapsed < .2) return;
    this.fps = this.frames / this.elapsed; this.frames = 0; this.elapsed = 0;
    this.draw();
    if (this.panel.hidden) return;
    const p = this.player!;
    const brain = this.brain(p);
    this.field('telemetry').textContent = JSON.stringify({
      FPS: Math.round(this.fps), drawCalls: info.render.calls, triangles: info.render.triangles,
      geometries: info.memory.geometries, textures: info.memory.textures, projectiles: m.entities.projectiles.length, effects: m.effects.count,
      HP: `${p.hp.toFixed(1)} / ${p.maxHp}`, shield: p.shield, shieldSeconds: Math.max(0, p.shieldUntil - gameNow()),
      speed: p.speed, reload: p.reloading ? Math.max(0, p.reloadEnd - gameNow()) : 0, ammo: p.weaponAmmo,
      cooldowns: p.abilityCd.map((cd, i) => ({ name: p.hero.abilities[i].name, seconds: +cd.toFixed(2), state: p.runtimes[i]?.state,
        activeSeconds: Number.isFinite(p.runtimes[i]?.remaining) ? p.runtimes[i]?.remaining : 'persistent' })),
      ult: { resource: p.resource, state: p.ultimateRuntime.state }, Koban: p.koban,
      cards: p.cards, items: p.items.map(item => ({ id: item.def.id, level: item.level })), stats: p.stats,
      buffs: p.buffs, statuses: p.status.active.map(e => ({ id: e.id, source: e.source.name, kind: e.kind, value: e.value, seconds: +e.remaining.toFixed(2) })),
      legacyStatus: { slow: Math.max(0, p.slowUntil - gameNow()), invulnerability: Math.max(0, p.invulnUntil - gameNow()), speed: Math.max(0, p.speedBoostUntil - gameNow()) },
      AI: brain ? { profile: brain.profile ?? profileFor(p.hero), state: m.freezeAI ? 'frozen' : brain.state, target: brain.targetId, routePoints: brain.path.length } : 'manual',
      DPS_last_5_seconds: +m.dps.toFixed(2), lastHit: m.lastHit,
    }, null, 2);
    if (this.panel.querySelector('details')!.open) this.field('stats').textContent = JSON.stringify({ hpBase: p.hero.hp, hpFinal: p.maxHp, moveBase: p.hero.moveSpeed, moveFinal: p.speed,
      headshotBase: p.weapon.headshotMult ?? 1.5, headshotFinal: p.critMult(), stats: statKeys.map(key => p.explainStat(key)) }, null, 2);
  }
  private draw() {
    const m = this.match;
    if (!m) return;
    let used = 0;
    const line = (a: THREE.Vector3, b: THREE.Vector3) => { if (used + 6 <= this.positions.length) { a.toArray(this.positions, used); b.toArray(this.positions, used + 3); used += 6; } };
    if (this.checked('hitboxes')) for (const p of m.players) if (p.alive) {
      const corners = Array.from({ length: 8 }, (_, i) => p.pos.clone().add(new THREE.Vector3(i & 1 ? .42 : -.42, i & 2 ? 1.6 : .3, i & 4 ? .42 : -.42)));
      for (let i = 0; i < 8; i++) for (const axis of [1, 2, 4]) if (!(i & axis)) line(corners[i], corners[i | axis]);
      for (let axis = 0; axis < 3; axis++) for (let i = 0; i < 16; i++) {
        const point = (j: number) => { const values = [Math.cos(j * Math.PI / 8) * .26, Math.sin(j * Math.PI / 8) * .26]; values.splice(axis, 0, 0); return p.pos.clone().add(new THREE.Vector3(values[0], values[1] + 1.72, values[2])); };
        line(point(i), point(i + 1));
      }
    }
    if (this.checked('trajectories')) for (const p of m.entities.projectiles) {
      let a = p.pos.clone();
      for (let i = 1; i <= 20; i++) { const t = i / 20, b = p.pos.clone().addScaledVector(p.vel, t); b.y -= p.gravity * t * t / 2; line(a, b); a = b; }
    }
    if (this.checked('routes')) for (const brain of m.brains) for (let i = 1; i < brain.path.length; i++) line(brain.path[i - 1].clone().add(new THREE.Vector3(0, .2, 0)), brain.path[i].clone().add(new THREE.Vector3(0, .2, 0)));
    this.visuals.geometry.setDrawRange(0, used / 3); this.visuals.geometry.getAttribute('position').needsUpdate = true;
  }
  detach() { this.visuals.removeFromParent(); this.panel.close(); this.panel.hidden = true; if (this.match) this.match.devOpen = false; this.match = null; }
  dispose() { this.detach(); ResourceTracker.dispose(this.visuals); this.panel.remove(); }
}
