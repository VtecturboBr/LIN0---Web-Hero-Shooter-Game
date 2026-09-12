import { audio } from '../../core/audio';
import { bottomBar, mainNav, mapCard, newsPanel, topBar } from './components';
import { menuTheme, previews } from './config';

function read(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function save(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* session still works */ } }

export class MainMenu {
  private root = document.getElementById('screen-menu')!;
  private dialog: HTMLDialogElement;
  private lastFocus: HTMLElement | null = null;
  reducedMotion = read('lino.motion', 'false') === 'true';

  constructor(private actions: { heroes: () => void; play: () => void }) {
    this.root.classList.add('lino-menu');
    this.root.style.setProperty('--lino-red', menuTheme.accent);
    this.root.style.setProperty('--lino-surface', menuTheme.surface);
    this.root.style.setProperty('--lino-text', menuTheme.text);
    this.root.innerHTML = `${topBar()}<div class="lino-home"><div class="lino-left">${mainNav()}${mapCard()}</div>${newsPanel()}<div class="lino-motto">共に、より遠くへ<small>JUNTOS, MAIS LONGE</small></div></div>${bottomBar()}
      <dialog id="menu-dialog" class="lino-dialog" aria-labelledby="menu-dialog-title"><button class="dialog-close" aria-label="Fechar">×</button><p id="menu-dialog-label" class="dialog-label"></p><h2 id="menu-dialog-title"></h2>
      <section id="menu-preview-panel"><p id="menu-preview-text"></p><div class="preview-state"><span>LIN<span>0</span></span><small>ESTE CAPÍTULO AINDA ESTÁ SENDO ESCRITO.</small></div></section>
      <section id="menu-settings-panel"><label class="menu-setting"><span>Áudio do jogo<small>Ativa os efeitos sonoros do menu e das partidas.</small></span><input id="menu-sound" type="checkbox"></label><label class="menu-setting"><span>Reduzir movimento<small>Desativa a animação e o movimento de câmera do menu.</small></span><input id="menu-motion" type="checkbox"></label><p class="dialog-note">Preferências salvas neste navegador.</p></section>
      <section id="menu-profile-panel"><form id="menu-profile-form"><label for="menu-profile-name">NOME DE EXIBIÇÃO</label><input id="menu-profile-name" maxlength="20" autocomplete="nickname" required><p>Perfil local. Progressão online e sincronização de conta ainda não estão disponíveis.</p><button class="btn-primary" type="submit">SALVAR PERFIL</button><p id="profile-feedback" role="status"></p></form></section></dialog>`;
    this.dialog = this.root.querySelector('dialog')!;
    this.root.querySelectorAll<HTMLElement>('[data-route]').forEach(button => button.addEventListener('click', () => this.navigate(button.dataset.route!)));
    this.root.querySelector('.dialog-close')!.addEventListener('click', () => this.close());
    this.dialog.addEventListener('click', e => { if (e.target === this.dialog) { const r = this.dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) this.close(); } });
    this.dialog.addEventListener('close', () => { this.setActive('home'); this.lastFocus?.focus(); });
    audio.muted = read('lino.sound', 'true') !== 'true';
    const sound = this.root.querySelector<HTMLInputElement>('#menu-sound')!;
    sound.checked = !audio.muted;
    sound.onchange = () => { audio.muted = !sound.checked; save('lino.sound', String(sound.checked)); if (sound.checked) { audio.ensure(); audio.ui(); } };
    const motion = this.root.querySelector<HTMLInputElement>('#menu-motion')!;
    motion.checked = this.reducedMotion;
    const applyMotion = () => document.body.classList.toggle('menu-reduced-motion', this.reducedMotion);
    applyMotion();
    motion.onchange = () => { this.reducedMotion = motion.checked; save('lino.motion', String(motion.checked)); applyMotion(); };
    this.root.querySelector('#menu-player-name')!.textContent = read('lino.name', 'JOGADOR');
    this.root.querySelector<HTMLFormElement>('#menu-profile-form')!.onsubmit = e => {
      e.preventDefault();
      const name = this.root.querySelector<HTMLInputElement>('#menu-profile-name')!.value.trim().slice(0, 20) || 'JOGADOR';
      save('lino.name', name); this.root.querySelector('#menu-player-name')!.textContent = name;
      this.root.querySelector('#profile-feedback')!.textContent = 'Perfil salvo neste navegador.';
    };
    window.addEventListener('keydown', e => {
      if (this.root.classList.contains('hidden')) return;
      if (e.code === 'F1') { e.preventDefault(); this.navigate('social'); }
      if (this.dialog.open || /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName)) return;
      if (e.code === 'Enter' && (e.target === document.body || e.target === document.documentElement)) { e.preventDefault(); this.navigate('play'); }
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        const buttons = [...this.root.querySelectorAll<HTMLButtonElement>('.lino-mainnav button')];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault(); buttons[(current + (e.code === 'ArrowDown' ? 1 : buttons.length - 1) + buttons.length) % buttons.length].focus();
      }
    });
    this.root.querySelectorAll('img').forEach(img => img.addEventListener('error', () => img.classList.add('hidden')));
  }

  private setActive(route: string) {
    this.root.querySelectorAll('.lino-topnav button').forEach(b => {
      if ((b as HTMLElement).dataset.route === route) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }
  navigate(route: string) {
    audio.ensure(); audio.ui();
    if (route === 'home') { this.close(); return; }
    if (route === 'play') { this.close(); this.actions.play(); return; }
    if (route === 'heroes') { this.close(); this.actions.heroes(); return; }
    this.lastFocus = document.activeElement as HTMLElement;
    this.setActive(route);
    const type = ['settings', 'profile'].includes(route) ? route : 'preview';
    for (const panel of ['preview', 'settings', 'profile']) this.root.querySelector(`#menu-${panel}-panel`)!.classList.toggle('hidden', panel !== type);
    const preview = previews[route];
    this.root.querySelector('#menu-dialog-title')!.textContent = preview?.title ?? ({ settings: 'CONFIGURAÇÕES', profile: 'SEU PERFIL' }[type] ?? 'LIN0');
    this.root.querySelector('#menu-dialog-label')!.textContent = preview?.label ?? 'LIN0 / PROTÓTIPO LOCAL';
    this.root.querySelector('#menu-preview-text')!.textContent = preview?.text ?? '';
    if (route === 'profile') {
      this.root.querySelector<HTMLInputElement>('#menu-profile-name')!.value = read('lino.name', 'JOGADOR');
      this.root.querySelector('#profile-feedback')!.textContent = '';
    }
    if (!this.dialog.open) this.dialog.showModal();
  }
  close() { if (this.dialog.open) this.dialog.close(); this.setActive('home'); }
}
