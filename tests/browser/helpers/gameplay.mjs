/** Browser regressions share the existing match-flow runner and its real DOM. */
export async function checkGameplayHud(evaluate) {
  return evaluate(`(async () => {
    const [{ Match }, { Hud, KILLFEED_DURATION, KILLFEED_LIMIT }, THREE, time, { HERO_MAP }, rules, { audio }] = await Promise.all([
      import('/src/game/match/Match.ts'), import('/src/ui/hud/Hud.ts'), import('/node_modules/.vite/deps/three.js'),
      import('/src/core/time.ts'), import('/src/characters/index.ts'), import('/src/characters/lino/rules.ts'), import('/src/core/audio.ts')
    ]);
    const checks = [];
    const check = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
    let hud;
    const m = new Match(new THREE.Scene(), { mode: 'conquista', mapId: 'castle', heroId: 'yume', cards: [] }, window.__input, {
      onKillFeed: (...args) => hud.killFeed(...args), onAnnounce: msg => hud.announce(msg),
      onShopState: open => hud.renderShop(open), onEnd() {}, onCapture() {}, onLocalDeath() {}, onLocalRespawn() {}, onScore() {}
    });
    const capture = audio.capture;
    try {
      hud = new Hud(m); m.state = 'running';
      m.players.forEach(p => { p.isBot = false; p.invulnUntil = 0; });
      const hint = document.getElementById('shop-hint');
      hud.update(0);
      check(m.canOpenShop() && !hint.classList.contains('hidden'), 'spawn shop hint matches gameplay');
      m.toggleShop(); check(m.shopOpen, 'spawn shop opens'); m.closeShop();
      m.local.pos.copy(m.world.objectivePos); hud.update(.1);
      check(!m.canOpenShop() && hint.classList.contains('hidden'), 'objective does not advertise shop');
      m.toggleShop(); check(!m.shopOpen, 'objective shop denied');
      m.local.pos.copy(m.world.spawns[0][0]);

      m.announce('TEMPORARY'); m.update(2); hud.update(0);
      check(document.getElementById('announcer').textContent === 'TEMPORARY', 'announcement keeps duration');
      m.paused = true; m.update(5); hud.update(0);
      check(document.getElementById('announcer').textContent === 'TEMPORARY', 'announcement freezes on pause');
      m.paused = false; m.update(1); hud.update(0);
      check(m.announcer === '' && document.getElementById('announcer').textContent === '', 'announcement clears DOM');

      const feed = document.getElementById('killfeed');
      m.handleDie(m.players[5], null);
      check(feed.textContent.includes(m.players[5].name + ' caiu') && !feed.textContent.includes('O ABISMO caiu'), 'environmental victim shown');
      time.advanceGameTime(KILLFEED_DURATION - 1); hud.update(0);
      check(feed.children.length === 1, 'feed survives before deadline');
      hud.killFeed('NEW', 'VICTIM', 0, 1);
      time.advanceGameTime(1); hud.update(0);
      check(feed.children.length === 1 && feed.textContent.includes('NEW'), 'feed expires oldest independently');
      for (let i = 0; i < 8; i++) hud.killFeed('K' + i, 'V' + i, 0, 1);
      check(feed.children.length === KILLFEED_LIMIT && !feed.textContent.includes('K0'), 'feed cap removes oldest');
      time.advanceGameTime(KILLFEED_DURATION); hud.update(0);
      check(feed.children.length === 0, 'feed fully expires');

      let captures = 0; audio.capture = () => captures++;
      m.players.forEach(p => p.pos.copy(m.world.spawns[p.team][0]));
      m.local.pos.copy(m.world.objectivePos);
      m.updateObjective(9);
      check(captures === 1, 'capture sound emitted once');

      m.local.hero = HERO_MAP.lino; hud = new Hud(m); m.local.lino.molding = true;
      for (const field of [false, true]) {
        m.local.lino.field = field ? m.local.pos.clone() : null; hud.update(.1);
        const costs = [...document.querySelectorAll('#lino-molding span small')].map(node => Number(node.textContent));
        check(costs.length === (field ? 6 : 3) && costs.every((cost, i) => cost === rules.matterCost(i, field)), 'HUD uses real Lino costs ' + field);
      }
      hud.killFeed('OLD', 'OLD', 0, 1); hud = new Hud(m);
      check(feed.children.length === 0, 'new HUD clears prior match feed');
      return checks;
    } finally { audio.capture = capture; m.cleanup(); document.getElementById('screen-shop').classList.add('hidden'); }
  })()`);
}
