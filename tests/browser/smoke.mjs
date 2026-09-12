import { writeArtifact } from './helpers/artifacts.mjs';
// Headless smoke test: drives the menu -> hero -> deck -> match flow via CDP
// and reports runtime errors + match state. Usage: node tests/browser/smoke.mjs [port]
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

const port = process.argv[2] || "9223";
const url = process.env.SMOKE_URL || "http://localhost:5173/";

const chromePath = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].find((p) => existsSync(p)) || "google-chrome";

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  `--remote-debugging-port=${port}`,
  "--user-data-dir=" + tmpdir() + "/kage-smoke-profile",
  "about:blank",
], { stdio: "ignore", windowsHide: true });

const errors = [];
let ws;
let id = 0;
const pending = new Map();

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

async function main() {
  // wait for debugger port
  let targets;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/json`);
      targets = await res.json();
      if (targets.length) break;
    } catch { /* retry */ }
    await sleep(250);
  }
  if (!targets?.length) throw new Error("chrome debug port not available");
  const page = targets.find((t) => t.type === "page");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") {
      errors.push(msg.params.exceptionDetails.text + ": " + (msg.params.exceptionDetails.exception?.description || "").slice(0, 300));
    } else if (msg.method === "Log.entryAdded") {
      if (msg.params.entry.level === "error" && !msg.params.entry.text.includes("Failed to load resource")) {
        errors.push(msg.params.entry.text);
      }
    }
  };

  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Log.enable");
  await cdp("Page.navigate", { url });
  await sleep(1500);

  const script = `
    (async () => {
      const $ = (sel) => document.querySelector(sel);
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      await sleep(400);
      // menu -> play
      $('#screen-menu [data-route="play"]').click();
      await sleep(300);
      // hero select -> pick 3rd hero (Raijin, a melee tank — good stress test)
      $('#btn-mode-next').click();
      const cards = document.querySelectorAll('#screen-pick [data-pick]');
      if (!cards.length) return { fail: 'no hero cards' };
      cards[2].click();
      await sleep(200);
      $('#btn-pick-confirm').click();
      await sleep(300);
      // Pre-match selection only offers saved loadouts.
      const slots = document.querySelectorAll('#screen-deck [data-slot]');
      if (slots.length !== 9) return { fail: 'missing saved loadout slots' };
      if (document.querySelector('#screen-deck [data-add], #screen-deck [data-level]')) return { fail: 'pre-match editor exposed' };
      document.querySelector('#screen-deck [data-slot="0"]').click();
      const deckBtn = $('#btn-deck-next');
      if (deckBtn.disabled) return { fail: 'deck confirm still disabled' };
      deckBtn.click();
      await sleep(12000);
      const m = window.__match;
      return {
        matchState: m ? m.state : null,
        playerCount: m ? m.players.length : 0,
        bots: m ? m.players.filter(p => p.isBot).length : 0,
        localHero: m ? m.local.hero.name : null,
        localAlive: m ? m.local.alive : null,
        localHp: m ? Math.floor(m.local.hp) : null,
        timeLeft: m ? Math.floor(m.timeLeft) : null,
        scores: m ? [Math.floor(m.scores[0]), Math.floor(m.scores[1])] : null,
        projectiles: m ? m.entities.projectiles.length : 0,
        totalDeaths: m ? m.players.reduce((a, p) => a + p.stats.deaths, 0) : 0,
        totalKills: m ? m.players.reduce((a, p) => a + p.stats.kills, 0) : 0,
        matchKoban: m ? Math.floor(m.local.koban) : 0,
      };
    })()
  `;
  const res = await cdp("Runtime.evaluate", { expression: script, awaitPromise: true, returnByValue: true });
  const value = res.result.value;
  console.log(JSON.stringify({ ...value, jsErrors: errors }, null, 2));

  if (value.fail || value.matchState !== "running") {
    console.log("SMOKE TEST FAILED (match did not start)");
    process.exit(1);
  }

  // ---- drive the local player: walk forward, swing, use ultimate ----
  const key = async (code, keyName, vk, down) => {
    await cdp("Input.dispatchKeyEvent", { type: down ? "keyDown" : "keyUp", code, key: keyName, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  };
  const click = async (down) => {
    await cdp("Input.dispatchMouseEvent", {
      type: down ? "mousePressed" : "mouseReleased", button: "left", buttons: down ? 1 : 0,
      x: 400, y: 300, clickCount: 1,
    });
  };

  // ---- shop test (player starts at spawn, a safe zone) ----
  await key("KeyB", "b", 66, true);
  await key("KeyB", "b", 66, false);
  await sleep(300);
  const shopRes = await cdp("Runtime.evaluate", {
    expression: `(async () => {
      const m = window.__match;
      if (!m) return { fail: 'no match' };
      try {
        const opened = m.shopOpen;
        const itemsRendered = document.querySelectorAll('.shop-item').length;
        // grant koban so we can exercise buy/upgrade/sell
        m.local.koban = 5000;
        let first = document.querySelector('.shop-item');
        first.click(); await new Promise(r => setTimeout(r, 200));
        const bought = m.local.items.length;
        const kobanAfterBuy = Math.floor(m.local.koban);
        first.click(); await new Promise(r => setTimeout(r, 200));
        const levelAfterUpgrade = m.local.items[0] ? m.local.items[0].level : 0;
        first.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
        await new Promise(r => setTimeout(r, 200));
        const afterSell = m.local.items.length;
        const kobanAfterSell = Math.floor(m.local.koban);
        await new Promise(r => setTimeout(r, 200));
        return { opened, itemsRendered, bought, kobanAfterBuy, levelAfterUpgrade, afterSell, kobanAfterSell };
      } catch (e) { return { error: String(e) }; }
    })()`, awaitPromise: true, returnByValue: true,
  });
  const shop = shopRes.result.value || {};
  console.log(JSON.stringify({ shop }, null, 2));

  // close shop deterministically, grant the ultimate, and stick to the nearest enemy for guaranteed melee contact
  await cdp("Runtime.evaluate", {
    expression: `(() => { const m = window.__match; m.closeShop(); m.local.resource = 100; return true; })()`,
    returnByValue: true,
  });
  await sleep(300);

  const stick = async () => {
    await cdp("Runtime.evaluate", {
      expression: `(() => {
        const m = window.__match;
        const p = m.local;
        const enemies = m.players.filter(x => x.alive && x.team !== p.team);
        if (!enemies.length) return { stuck: false };
        const e = enemies.reduce((a, b) => a.pos.distanceTo(p.pos) < b.pos.distanceTo(p.pos) ? a : b);
        const dir = e.pos.clone().sub(p.pos); dir.y = 0;
        const d = dir.length();
        dir.normalize().multiplyScalar(Math.max(0, d - 1.6));
        p.pos.add(dir);
        return { stuck: true, dist: Math.round(d * 10) / 10, enemy: e.name };
      })()`, returnByValue: true,
    });
  };

  await click(true);                     // hold fire (Raijin hammer)
  await stick();
  await sleep(1800);
  await key("KeyE", "e", 69, true);     // cast ultimate (storm)
  await key("KeyE", "e", 69, false);
  await sleep(1200);
  await stick();
  await sleep(1200);
  await key("KeyQ", "q", 81, true);     // slam
  await key("KeyQ", "q", 81, false);
  await sleep(1500);
  await stick();
  await sleep(1200);
  await click(false);
  await sleep(1000);

  const combat = await cdp("Runtime.evaluate", {
    expression: `(async () => {
      const m = window.__match;
      if (!m) return { fail: 'match lost' };
      return {
        localAlive: m.local.alive,
        localHp: Math.floor(m.local.hp),
        myDamage: Math.floor(m.local.stats.damage),
        myKills: m.local.stats.kills,
        myDeaths: m.local.stats.deaths,
        myKoban: Math.floor(m.local.koban),
        myResource: Math.floor(m.local.resource),
        myItems: m.local.items.length,
        totalDeaths: m.players.reduce((a, p) => a + p.stats.deaths, 0),
        totalKills: m.players.reduce((a, p) => a + p.stats.kills, 0),
        scores: [Math.floor(m.scores[0]), Math.floor(m.scores[1])],
        captureProgress: Math.floor(m.captureProgress),
      };
    })()`, awaitPromise: true, returnByValue: true,
  });
  const c = combat.result.value;
  console.log(JSON.stringify({ combat: c, jsErrors: errors }, null, 2));

  // ---- end-game: force the timer to expire with a team-0 lead ----
  await cdp("Runtime.evaluate", {
    expression: `(() => { const m = window.__match; m.scores[0] = 198; m.scores[1] = 195; m.timeLeft = 0.3; return true; })()`,
    returnByValue: true,
  });
  await sleep(2500);
  const end = await cdp("Runtime.evaluate", {
    expression: `(() => {
      const m = window.__match;
      const result = document.getElementById('end-result');
      return {
        state: m ? m.state : null,
        endScreenVisible: !document.getElementById('screen-end').classList.contains('hidden'),
        resultText: result ? result.textContent : null,
        xpText: document.getElementById('end-xp').textContent,
      };
    })()`, returnByValue: true,
  });
  console.log(JSON.stringify({ end: end.result.value }, null, 2));
  await cdp("Runtime.evaluate", { expression: `document.getElementById('btn-end-menu').click()`, returnByValue: true });
  await sleep(600);
  const back = await cdp("Runtime.evaluate", {
    expression: `(() => ({
      menuVisible: !document.getElementById('screen-menu').classList.contains('hidden'),
      matchCleared: window.__match === null,
      hudHidden: document.getElementById('hud').classList.contains('hidden'),
    }))()`, returnByValue: true,
  });
  console.log(JSON.stringify({ back: back.result.value }, null, 2));

  const ok = value.matchState === "running" && value.playerCount === 10 && value.localHero === "RAIJIN";
  const fought = c.myDamage > 0 || c.myKills > 0 || c.totalKills > 0;
  // sell refunds 50% of the investment: koban drops below the after-buy value but the item is gone
  const shopOk =
    shop.opened && shop.itemsRendered === 20 && shop.bought === 1 &&
    shop.levelAfterUpgrade === 2 && shop.afterSell === 0 &&
    shop.kobanAfterSell < shop.kobanAfterBuy && shop.kobanAfterSell > shop.kobanAfterBuy * 0.4;
  const endOk =
    end.result.value.state === "ended" &&
    end.result.value.endScreenVisible === true &&
    end.result.value.resultText === "VITÓRIA" &&
    back.result.value.menuVisible && back.result.value.matchCleared && back.result.value.hudHidden;
  console.log(ok && fought && shopOk && endOk && errors.length === 0 ? "SMOKE TEST PASSED" : "SMOKE TEST FAILED");
  process.exit(ok && fought && shopOk && endOk && errors.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SMOKE TEST ERROR:", e.message);
  process.exit(1);
}).finally(() => {
  setTimeout(() => { try { chrome.kill(); } catch {} }, 500);
});