import type { Match } from '../../game/match/Match';
import type { Input } from '../../core/input';
import { audio } from '../../core/audio';
import { CARD_POOL } from '../../progression/cards/catalog';

export class PauseMenu {
  private dialog = document.createElement('dialog');
  constructor(private input: Input, private actions: { resume: () => void; exit: () => void }) {
    this.dialog.id = 'pause-dialog'; this.dialog.className = 'pause-dialog';
    this.dialog.setAttribute('aria-labelledby', 'pause-title'); document.body.append(this.dialog);
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.actions.resume(); });
    try { input.sensitivity = Math.max(.25, Math.min(3, Number(localStorage.getItem('lino.sensitivity') ?? 1) || 1)); } catch { /* default */ }
  }
  get isOpen() { return this.dialog.open; }
  open(match: Match) {
    if (this.isOpen) return;
    this.dialog.innerHTML = `<small>LIN0 / ${match.training ? 'CAMPO DE TREINAMENTO' : 'PARTIDA LOCAL'}</small><h1 id="pause-title">JOGO PAUSADO</h1><p>O combate e os temporizadores estão parados. Continue quando estiver pronto.</p>
      <div class="pause-settings"><label>Áudio do jogo<input id="pause-sound" type="checkbox" ${audio.muted ? '' : 'checked'}></label><label>Sensibilidade <output id="pause-sensitivity-value">${this.input.sensitivity.toFixed(2)}×</output><input id="pause-sensitivity" aria-label="Sensibilidade do mouse" type="range" min="0.25" max="3" step="0.05" value="${this.input.sensitivity}"></label></div>
      <details><summary>CONTROLES</summary><p>WASD: mover · Mouse: mirar · Clique esquerdo: disparar · R: recarregar · Espaço: saltar · Q / Botão direito / F: habilidades · E: suprema · Botão do meio: disparo alternativo · B: loja · Tab: placar · Esc: pausa${match.training ? ' · T: opções de treino' : ''}.</p></details>
      <details><summary>${match.loadoutLocked ? 'BARALHO CONFIRMADO — FIXO NESTA PARTIDA' : 'BARALHO'}</summary>${match.loadoutLocked ? `<ul class="pause-deck">${match.local.cards.map(c => `<li>${CARD_POOL[c.id].name} · nível ${c.level}</li>`).join('')}</ul>` : `<p>${match.training ? 'Treinamento sem cartas.' : 'Escolha seu baralho ao fechar a pausa.'}</p>`}</details>
      <div class="pause-actions"><button id="pause-exit">SAIR DA PARTIDA</button><button id="pause-resume" class="pause-resume">CONTINUAR →</button></div>`;
    this.dialog.querySelector<HTMLElement>('#pause-resume')!.onclick = this.actions.resume;
    this.dialog.querySelector<HTMLElement>('#pause-exit')!.onclick = this.actions.exit;
    this.dialog.querySelector<HTMLInputElement>('#pause-sound')!.onchange = event => {
      const enabled = (event.target as HTMLInputElement).checked; audio.muted = !enabled;
      const setting = document.getElementById('menu-sound') as HTMLInputElement; if (setting) setting.checked = enabled;
      try { localStorage.setItem('lino.sound', String(enabled)); } catch { /* session preference */ }
    };
    this.dialog.querySelector<HTMLInputElement>('#pause-sensitivity')!.oninput = event => {
      this.input.sensitivity = Number((event.target as HTMLInputElement).value);
      this.dialog.querySelector('#pause-sensitivity-value')!.textContent = this.input.sensitivity.toFixed(2) + '×';
      try { localStorage.setItem('lino.sensitivity', String(this.input.sensitivity)); } catch { /* session preference */ }
    };
    this.dialog.showModal(); this.dialog.querySelector<HTMLElement>('#pause-resume')!.focus();
  }
  close() { if (this.dialog.open) this.dialog.close(); }
}
