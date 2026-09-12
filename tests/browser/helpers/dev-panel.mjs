/** Exercise actual F3 controls without replacing the current training match. */
export async function checkDevPanel(evaluate, cdp, screenshot) {
  const check = async (expression, label) => { if (!await evaluate(expression)) throw new Error('DEV: ' + label); };
  const key = async code => {
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: code, code, windowsVirtualKeyCode: code === 'F3' ? 114 : 27 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: code, code, windowsVirtualKeyCode: code === 'F3' ? 114 : 27 });
  };
  await evaluate(`window.__devOriginalMatch = window.__match; window.__devOriginalWorld = window.__match.world; void 0;`);
  await key('F3');
  await check(`document.getElementById('dev-panel').open && window.__match.devOpen && window.__input.blocked`, 'F3 opens accessible dialog and blocks combat input');
  await evaluate(`(() => {const panel=document.getElementById('dev-panel');const hero=panel.querySelector('[data-field="hero"]');hero.value='yume';hero.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await check(`window.__match===window.__devOriginalMatch && window.__match.world===window.__devOriginalWorld && window.__match.local.hero.id==='yume'`, 'hero swaps in place');
  await evaluate(`window.__match.local.hp=50;document.querySelector('#dev-panel [data-action="heal"]').click()`);
  await check(`window.__match.local.hp===150`, 'heal uses selected amount');
  await evaluate(`document.querySelector('#dev-panel [data-action="ult"]').click();window.__match.local.abilityCd.fill(5);document.querySelector('#dev-panel [data-action="cooldowns"]').click()`);
  await check(`window.__match.local.resource===100 && window.__match.local.abilityCd.every(cd=>cd===0)`, 'ult and cooldown controls');
  await evaluate(`(() => {const scale=document.querySelector('#dev-panel [data-field="scale"]');scale.value='0';scale.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await check(`window.__match.timeScale===0`, 'time scale zero');
  await evaluate(`(() => {const x=document.querySelector('#dev-panel [data-field="x"]');x.value='99999';document.querySelector('#dev-panel [data-action="teleport"]').click();})()`);
  await check(`document.querySelector('#dev-panel [data-field="message"]').textContent.includes('inválida')`, 'teleport validates bounds');
  await evaluate(`document.querySelector('#dev-panel [data-action="cards"]').click()`);
  await check(`window.__match.local.cards.length===5`, 'valid temporary deck');
  await evaluate(`document.querySelector('#dev-panel [data-action="item"]').click()`);
  await check(`window.__match.local.items.length===1`, 'temporary item');
  await evaluate(`(() => {const selected=document.querySelector('#dev-panel [data-field="player"]');selected.value=String(window.__match.players[1].id);selected.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#dev-panel [data-action="kill"]').click();})()`);
  await check(`!window.__match.players[1].alive && window.__match.local.alive`, 'selected dummy killed, local preserved');
  await evaluate(`document.querySelector('#dev-panel [data-action="respawn"]').click();document.querySelector('#dev-panel details').open=true;`);
  await evaluate(`new Promise(resolve=>setTimeout(resolve,350))`);
  await check(`document.querySelector('#dev-panel [data-field="telemetry"]').textContent.includes('drawCalls') && document.querySelector('#dev-panel [data-field="stats"]').textContent.includes('sources')`, 'telemetry and formulas');
  await screenshot();
  await key('Escape');
  await check(`!document.getElementById('dev-panel').open && !window.__match.devOpen && window.__match.trainingPaused`, 'Escape preserves training pause');
  await evaluate(`window.__match.timeScale=1;const hero=document.getElementById('training-hero');hero.value='lino';hero.dispatchEvent(new Event('change'));`);
  await check(`window.__match===window.__devOriginalMatch && window.__match.local.hero.id==='lino'`, 'training selector swaps in place');
  await evaluate(`delete window.__devOriginalMatch;delete window.__devOriginalWorld;`);
  return 'F3, hero swap, heal, ult, cooldowns, teleport validation, deck/items, dummies, stats and pause';
}
