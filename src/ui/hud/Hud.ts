import { gameNow } from '../../core/time';
import { SHAPES } from '../../characters/lino/LinoMatter';
import { matterCost, TETHER_COST, MATTER_RULES } from '../../characters/lino/rules';
import { CARD_POOL, cardDescription } from '../../progression/cards/catalog';
import type { Match } from '../../game/match/Match';
import { audio } from '../../core/audio';
import { SHOP_RULES } from '../../progression/shop/items';

export const KILLFEED_DURATION = 5;
export const KILLFEED_LIMIT = 4;

function el(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error("missing #" + id);
  return e;
}

export class Hud {
  private match: Match;
  private els: Record<string, HTMLElement>;
  private hitTimer = 0;
  private uiTimer = 0;
  private shopItemEls: HTMLElement[] = [];
  private lastAbilState = "";
  private killfeedTimes: number[] = [];

  constructor(match: Match) {
    this.match = match;
    this.els = {
      hud: el("hud"),
      hitmarker: el("hitmarker"),
      score0: el("score-team-0"),
      score1: el("score-team-1"),
      objLabel: el("obj-label"),
      objFill: el("obj-fill"),
      killfeed: el("killfeed"),
      koban: el("hud-koban"),
      shopHint: el("shop-hint"),
      hero: el("hud-hero"),
      role: el("hud-role"),
      hpFill: el("hp-fill"),
      hpText: el("hp-text"),
      resFill: el("res-fill"),
      resText: el("res-text"),
      deck: el("hud-deck"),
      weapon: el("hud-weapon"),
      ammo: el("hud-ammo"),
      abilities: el("hud-abilities"),
      timer: el("round-timer"),
      announcer: el("announcer"),
    };
    this.els.killfeed.replaceChildren();
    this.announce(match.announcer);
    document.getElementById('lino-control')?.remove();
    document.getElementById('lino-molding')?.remove();
    if (match.local.hero.id === 'lino') {
      document.getElementById('res-text')!.parentElement!.insertAdjacentHTML('afterend', `<div id="lino-control"><div class="matter-label"><b>CONTROLE</b><span id="matter-value"></span></div><div class="matter-meter"><i id="matter-free"></i><i id="matter-reserved"></i></div><small id="matter-status"></small></div>`);
      this.els.hud.insertAdjacentHTML('beforeend', '<div id="lino-molding"></div>');
    }
    this.buildAbilitySlots();
    this.els.hero.textContent = match.local.hero.name;
    this.els.role.textContent = match.local.hero.role.toUpperCase();
    this.els.role.className = `role-${match.local.hero.role}`;
    this.els.deck.innerHTML = match.local.cards.map(card => `<span class="deck-chip" title="${cardDescription(card)}">${CARD_POOL[card.id]?.name ?? card.id} · ${card.level}</span>`).join("");
    // set score labels based on player team
    const myTeam = match.local.team;
    const labels = document.querySelectorAll<HTMLElement>(".score-label");
    if (labels.length === 2) {
      labels[myTeam === 0 ? 0 : 1].textContent = "SEU TIME";
      labels[myTeam === 0 ? 1 : 0].textContent = "TIME RIVAL";
    }
  }

  private buildAbilitySlots() {
    const hero = this.match.local.hero;
    const html = [
      ...hero.abilities.map((a, i) => {
        const key = a.key;
        return `<div class="abil" id="abil-${i}" title="${a.name} — ${a.key === 'M2' ? 'Botão direito do mouse' : a.key}"><span class="abil-key">${key}</span><span class="abil-icon">${a.icon}</span><div class="abil-cd hidden" id="abil-cd-${i}"></div><span class="abil-ready hidden">✓</span></div>`;
      }),
      `<div class="abil ult-ready" id="abil-ult"><span class="abil-key">${hero.ultimate.key}</span><span class="abil-icon">${hero.ultimate.icon}</span><div class="abil-cd hidden" id="abil-ult-cd"></div><span class="abil-ready hidden">✓</span></div>`,
    ].join("");
    this.els.abilities.innerHTML = html;
  }

  showHit(headshot: boolean, killed = false) {
    const hm = this.els.hitmarker;
    const color = killed ? "#ff6b7d" : headshot ? "#ffcf3f" : "#ffffff";
    const size = killed ? "11px" : headshot ? "9px" : "7px";
    hm.innerHTML = `<span class="hm-l"></span><span class="hm-l"></span><span class="hm-l"></span><span class="hm-l"></span>`;
    hm.style.setProperty("--hm-color", color);
    hm.style.setProperty("--hm-size", size);
    hm.classList.remove("show");
    void hm.offsetWidth;
    hm.classList.add("show");
    if (headshot || killed) {
      const hmText = document.createElement("div");
      hmText.className = "hm-headshot-text";
      hmText.textContent = killed ? "ELIMINADO" : "NA CABEÇA";
      hm.appendChild(hmText);
      setTimeout(() => hmText.remove(), 500);
    }
    // screen flash
    const flash = document.getElementById("hit-flash")!;
    flash.style.background = headshot ? "radial-gradient(circle, rgba(255,207,63,0.35) 0%, transparent 70%)" : "radial-gradient(circle, rgba(255,107,125,0.25) 0%, transparent 70%)";
    flash.classList.remove("show");
    void flash.offsetWidth;
    flash.classList.add("show");
  }

  showDamageNumber(amount: number, headshot = false) {
    const container = document.getElementById("hud")!;
    const el = document.createElement("div");
    el.className = "dmg-number";
    el.textContent = `${Math.ceil(amount)}`;
    el.style.color = headshot ? "#ffcf3f" : "#ffffff";
    el.style.left = `${50 + (Math.random() - 0.5) * 8}%`;
    el.style.top = `${42 + (Math.random() - 0.5) * 6}%`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 700);
  }

  announce(msg: string) {
    this.els.announcer.textContent = msg;
  }

  killFeed(killer: string, victim: string, killerTeam: number, victimTeam: number) {
    const feed = this.els.killfeed;
    const row = document.createElement("div");
    row.className = "kf-row";
    const myTeam = this.match.local.team;
    if (killerTeam === -1) {
      row.innerHTML = `<span class="kf-victim">${victim}</span> caiu`;
    } else {
      const killerColor = killerTeam === myTeam ? "#3f9fff" : "#ff3b5c";
      const victimColor = victimTeam === myTeam ? "#3f9fff" : "#ff3b5c";
      const killerBadge = killerTeam === myTeam ? '<span class="kf-badge kf-ally">*</span>' : '<span class="kf-badge kf-enemy">x</span>';
      const victimBadge = victimTeam === myTeam ? '<span class="kf-badge kf-ally">*</span>' : '<span class="kf-badge kf-enemy">x</span>';
      row.innerHTML = killerBadge + '<span class="kf-killer" style="color:' + killerColor + '">' + killer + '</span> <span class="kf-vs">⚔</span> <span class="kf-victim" style="color:' + victimColor + '">' + victim + '</span>' + victimBadge;
    }
    feed.appendChild(row);
    this.killfeedTimes.push(gameNow());
    while (feed.children.length > KILLFEED_LIMIT) feed.removeChild(feed.firstChild!);
    while (this.killfeedTimes.length > KILLFEED_LIMIT) this.killfeedTimes.shift();
  }

  renderShop(open: boolean) {
    el("screen-shop").classList.toggle("hidden", !open);
    if (open) this.buildShop();
  }

  private buildShop() {
    const data = this.match.shopData();
    el("shop-koban").textContent = String(data.koban);
    const grid = el("shop-grid");
    grid.innerHTML = "";
    this.shopItemEls = [];
    for (const it of data.items) {
      const div = document.createElement("div");
      div.className = "shop-item" + (it.level > 0 ? " owned" : "") + (it.maxed ? " maxed" : "");
      div.innerHTML = `
        <div class="si-cat">${it.def.category.toUpperCase()}</div>
        <div class="si-name">${it.def.icon} ${it.def.name}</div>
        <div class="si-desc">${it.def.description}</div>
        <div class="si-level">${it.level > 0 ? `NÍVEL ${it.level}/${it.def.levels}` : "NÃO COMPRADO"}</div>
        <div class="si-cost ${it.nextCost !== null && data.koban >= it.nextCost ? "afford" : ""}">${it.nextCost !== null ? `⛩ ${it.nextCost}` : "MÁX"}</div>
        ${it.level > 0 ? `<div class="si-sell">vender por ${Math.floor(it.def.costs.slice(0, it.level).reduce((a, b) => a + b, 0) * SHOP_RULES.sellReturn)}</div>` : ""}
      `;
      div.addEventListener("click", (e) => {
        const err = this.match.shopAction(it.def.id);
        if (err) { audio.deny(); this.showShopError(err); }
        else { this.buildShop(); }
        e.stopPropagation();
      });
      div.addEventListener("contextmenu", (e) => {
        const cur = this.match.local.items.find(i => i.def.id === it.def.id);
        if (cur) {
          this.match.shopSell(it.def.id);
          this.buildShop();
          e.preventDefault();
        }
      });
      grid.appendChild(div);
      this.shopItemEls.push(div);
    }
    el("shop-owned").textContent = `Itens: ${data.ownedCount}/${data.maxItems} · Clique compra/melhora · Clique direito vende`;
  }

  private showShopError(msg: string) {
    const note = document.querySelector<HTMLElement>(".shop-note")!;
    const old = note.textContent;
    note.textContent = "⚠ " + msg;
    note.style.color = "#ff6b7d";
    setTimeout(() => { note.textContent = old; note.style.color = ""; }, 1800);
  }

  renderScoreboard(show: boolean) {
    el("screen-scoreboard").classList.toggle("hidden", !show);
    if (!show) return;
    const m = this.match;
    const body = el("scoreboard-body");
    let html = "";
    const myTeam = m.local.team;
    for (let t = 0; t < 2; t++) {
      const isMyTeam = t === myTeam;
      const teamName = t === 0 ? "TIME AZUL" : "TIME VERMELHO";
      const tag = isMyTeam ? '<span class="sb-tag sb-ally">SEU TIME</span>' : '<span class="sb-tag sb-enemy">TIME RIVAL</span>';
      html += `<div class="sb-team-head t${t}">${teamName} ${tag} — ${Math.floor(m.scores[t as 0 | 1])}</div>`;
      html += `<table class="sb-table"><tr><th>HERÓI</th><th>JOGADOR</th><th>K</th><th>D</th><th>A</th><th>DANO</th><th>CURA</th></tr>`;
      for (const p of m.players) {
        if (p.team !== t) continue;
        html += `<tr class="${p.isLocal ? "me" : ""}"><td>${p.hero.name}</td><td>${p.name}</td><td>${p.stats.kills}</td><td>${p.stats.deaths}</td><td>${p.stats.assists}</td><td>${Math.floor(p.stats.damage)}</td><td>${Math.floor(p.stats.healing)}</td></tr>`;
      }
      html += `</table>`;
    }
    body.innerHTML = html;
  }

  update(dt: number) {
    this.cleanupKillfeed();
    const m = this.match;
    const p = m.local;
    this.hitTimer -= dt;

    // objective
    if (m.mode === "conquista") {
      this.els.objLabel.textContent =
        m.captureContested ? 'PONTO CONTESTADO • PONTUAÇÃO PAUSADA' :
        m.captureController === 0 ? "CONTROLADO PELO TIME AZUL" :
        m.captureController === 1 ? "CONTROLADO PELO TIME VERMELHO" : `CAPTURE ${m.world.map.objective.name}`;
      this.els.objFill.style.width = `${m.captureProgress}%`;
      this.els.objFill.style.background = m.captureContested ? '#ffd58a' : m.captureClaimant === 0 ? '#3f9fff' : m.captureClaimant === 1 ? '#ff3b5c' : '#ffd58a';
    } else {
      this.els.objLabel.textContent = "ELIMINE O TIME RIVAL";
      this.els.objFill.style.width = `${(m.scores[0] + m.scores[1] > 0 ? Math.min(100, (Math.max(m.scores[0], m.scores[1]) / 50) * 100) : 0)}%`;
    }

    this.uiTimer -= dt;
    if (this.uiTimer <= 0) {
      this.uiTimer = 0.08;
      this.els.score0.textContent = String(Math.floor(m.scores[0]));
      this.els.score1.textContent = String(Math.floor(m.scores[1]));
      const mm = Math.floor(m.timeLeft / 60);
      const ss = Math.floor(m.timeLeft % 60);
      this.els.timer.textContent = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
      this.els.koban.textContent = String(Math.floor(p.koban));
      const canShop = m.canOpenShop(p);
      this.els.shopHint.classList.toggle("hidden", !(m.shopOpen || canShop));
      if (canShop && !m.shopOpen) this.els.shopHint.textContent = "Pressione B para abrir a loja";
      else if (m.shopOpen) this.els.shopHint.textContent = "Loja aberta";
      // hp
      this.els.hpFill.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
      this.els.hpText.textContent = `${Math.max(0, Math.ceil(p.hp))}/${Math.ceil(p.maxHp)}${p.shield > 0 ? ` +${Math.ceil(p.shield)}` : ""}`;
      // resource
      this.els.resFill.style.width = `${Math.min(100, p.resource)}%`;
      this.els.resText.textContent = `${p.hero.resource.icon} ${p.hero.resource.name}: ${Math.floor(p.resource)}%`;
      if (p.hero.id === 'lino') {
        const s = p.lino, now = gameNow();
        el('matter-value').textContent = `${Math.floor(s.control)} livres · ${s.reserved} reservados`;
        el('matter-free').style.width = `${s.control}%`;
        el('matter-reserved').style.width = `${s.reserved}%`;
        el('matter-status').textContent = s.anchor ? `${s.anchorTarget ? 'Fio preso ao inimigo' : 'Fio conectado'} · ${TETHER_COST} reservados · solte Shift` : s.field ? `Campo: ${Math.max(0, s.fieldUntil - now).toFixed(1)}s${s.outsideAt >= 0 ? ' · RETORNE À ÁREA!' : ' · formas 1–6'}` : 'Q: moldar · R: retrair · regeneração gradual';
        const panel = el('lino-molding');
        const message = s.noticeUntil > now ? s.notice : '';
        panel.classList.toggle('hidden', !p.alive || (!s.molding && !message));
        panel.innerHTML = s.molding ? `<b>MOLDAR A MATÉRIA</b><div>${SHAPES.slice(0, s.field ? SHAPES.length : MATTER_RULES.basicShapes).map((name, i) => `<span class="${s.shape === i ? 'selected' : ''}"><kbd>${i + 1}</kbd> ${name} <small>${matterCost(i, !!s.field)}</small></span>`).join('')}</div><p>Clique: criar · Q: sair · Botão direito: dash · R: retrair</p>${message ? `<small>${message}</small>` : ''}` : `<p>${message}</p>`;
      }
      // weapon
      const w = p.weapon;
      this.els.weapon.textContent = w.name;
      const ammo = w.ammo < 0 ? "∞" : `${p.weaponAmmo}/${Math.ceil(w.ammo * p.stat("ammoMult"))}`;
      this.els.ammo.textContent = ammo + (p.reloading ? " RECARREGANDO..." : "");
      // abilities
      this.updateAbilitySlots();
    }
  }

  private updateAbilitySlots() {
    const p = this.match.local;
    let state = "";
    for (let i = 0; i < p.hero.abilities.length; i++) {
      const cd = p.abilityCd[i];
      state += cd.toFixed(1);
      const cdEl = el(`abil-cd-${i}`);
      const readyEl = el(`abil-${i}`).querySelector(".abil-ready") as HTMLElement;
      if (cd > 0) {
        cdEl.classList.remove("hidden");
        cdEl.textContent = cd.toFixed(1);
        readyEl.classList.add("hidden");
      } else {
        cdEl.classList.add("hidden");
        readyEl.classList.remove("hidden");
      }
    }
    const ult = el("abil-ult");
    const ultCd = el("abil-ult-cd");
    const ready = ult.querySelector(".abil-ready") as HTMLElement;
    if (p.ultReady) {
      ult.classList.add("ult-ready");
      ultCd.classList.add("hidden");
      ready.classList.remove("hidden");
    } else {
      ult.classList.remove("ult-ready");
      ultCd.classList.remove("hidden");
      ultCd.textContent = `${Math.floor(p.resource)}%`;
      ready.classList.add("hidden");
    }
    if (state !== this.lastAbilState) {
      this.lastAbilState = state;
    }
  }

  cleanupKillfeed() {
    while (this.killfeedTimes.length && gameNow() - this.killfeedTimes[0] >= KILLFEED_DURATION) {
      this.killfeedTimes.shift();
      this.els.killfeed.firstElementChild?.remove();
    }
  }
}
