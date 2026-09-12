import { mainNavigation, menuAssets, news, topNavigation } from './config';

export function icon(name: string) {
  const paths: Record<string, string> = {
    friends: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4M17 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5v2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3 6 9 7 9-7"/>',
    settings: '<path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
    arrow: '<path d="m9 5 7 7-7 7"/>',
    rotate: '<path d="M4 10a8 8 0 1 1 2 8M4 4v6h6"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6">${paths[name] ?? paths.arrow}</svg>`;
}
export function topBar(profileId = 'menu-player-name', active = 'home') {
  return `<header class="lino-topbar">
    <button class="lino-logo" data-route="home" aria-label="LIN0 — início">LIN<span>0</span><small>HEROES NEVER DIE</small></button>
    <nav class="lino-topnav" aria-label="Navegação principal">${topNavigation.map(([id, label]) => `<button data-route="${id}" ${id === active ? 'aria-current="page"' : ''}>${label}${id === 'social' ? '<i class="status-dot"></i>' : ''}</button>`).join('')}</nav>
    <div class="lino-account"><button class="lino-profile" data-route="profile"><span class="profile-avatar">L<span>0</span></span><span><b id="${profileId}">JOGADOR</b><small>PERFIL LOCAL</small><i class="profile-progress"></i></span></button>
      <div class="lino-wallet" aria-label="Moedas indisponíveis no protótipo"><span title="Créditos — indisponível"><i>◈</i> —</span><span title="Moeda premium — indisponível"><i>◎</i> —</span></div>
      <div class="lino-utilities"><button data-route="social" aria-label="Amigos" title="Amigos">${icon('friends')}</button><button data-route="messages" aria-label="Mensagens" title="Mensagens">${icon('mail')}</button><button data-route="settings" aria-label="Configurações" title="Configurações">${icon('settings')}</button></div>
    </div></header>`;
}
export function mainNav() {
  return `<nav class="lino-mainnav" aria-label="Menu lateral">
    <button class="lino-play" data-route="play"><span><b>JOGAR</b><small>ENTRE NO CAMPO DE BATALHA</small></span>${icon('arrow')}</button>
    ${mainNavigation.map(([id, label]) => `<button class="lino-navlink" data-route="${id}">${label}${id === 'pass' ? '<small>EM BREVE</small>' : ''}</button>`).join('')}
    <button class="lino-training" id="btn-training"><span>＋</span> CAMPO DE TREINAMENTO <small>PRATIQUE COM OS 6 HERÓIS</small></button>
  </nav>`;
}
export function newsPanel() {
  return `<aside class="lino-news" aria-label="Notícias e eventos"><div class="news-heading"><span>TRANSMISSÕES</span><span>01 — 03</span></div>${news.map(n => `<button data-route="${n.id}" class="lino-card card-${n.size}" style="--card-image:url('${n.image}')"><span class="card-art-label">ARTE PROVISÓRIA</span><span class="lino-card-copy"><small>${n.label}</small><b>${n.title}</b><span>${n.description}</span></span>${icon('arrow')}</button>`).join('')}</aside>`;
}
export function mapCard() {
  return `<button class="lino-card lino-map" data-route="play" style="--card-image:url('${menuAssets.mapBanner}')"><span class="card-art-label">NOVO MAPA</span><span class="lino-card-copy"><small>CAPTURA DE PONTO / 5V5</small><b>DISTRITO SHŌTŌ</b><span>DISPUTE A PRAÇA. DOMINE OS TERRAÇOS.</span></span>${icon('arrow')}</button>`;
}
export function bottomBar() {
  return `<footer class="lino-bottom"><div><span><kbd>ENTER</kbd> SELECIONAR</span><button data-route="social"><kbd>F1</kbd> BATE-PAPO</button></div><span class="local-status"><i></i> PROTÓTIPO LOCAL <span>•</span> v0.1</span></footer>`;
}
