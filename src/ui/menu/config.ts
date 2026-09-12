/** All replaceable visual assets live here. URLs are relative to public/. */
export const menuAssets = {
  characterModel: null as string | null, // '/assets/characters/lino.glb'
  characterScale: 1,
  idleAnimation: 'Idle',
  background: null as string | null, // '/assets/backgrounds/city.jpg'
  backgroundVideo: null as string | null, // '/assets/videos/city.webm'
  seasonBanner: '/assets/ui/season.svg',
  eventBanner: '/assets/ui/event.svg',
  cosmeticBanner: '/assets/ui/mask.svg',
  mapBanner: '/assets/maps/shoto-preview.jpg',
};

export const menuTheme = { accent: '#ff3547', surface: '#0b0c12', text: '#f1f0ed' };
export const topNavigation = [
  ['home', 'INÍCIO'], ['heroes', 'HERÓIS'], ['play', 'JOGAR'],
  ['pass', 'PASSE DE BATALHA'], ['store', 'LOJA'], ['social', 'SOCIAL'],
] as const;
export const mainNavigation = [
  ['heroes', 'HERÓIS'], ['pass', 'PASSE DE BATALHA'], ['store', 'LOJA'],
  ['missions', 'MISSÕES'], ['profile', 'PERFIL'], ['social', 'SOCIAL'], ['settings', 'CONFIGURAÇÕES'],
] as const;
export const news = [
  { id: 'season', label: 'TEMPORADA 01 / CONCEITO', title: 'SOMBRAS EM ASCENSÃO', description: 'Um novo capítulo está tomando forma.', image: menuAssets.seasonBanner, size: 'large' },
  { id: 'event', label: 'EVENTO / CONCEITO', title: 'FESTIVAL DAS ALMAS', description: 'Entre luzes e sombras.', image: menuAssets.eventBanner, size: 'medium' },
  { id: 'cosmetics', label: 'PERSONALIZAÇÃO / PRÉVIA', title: 'OUTRAS FACES', description: 'Uma identidade. Muitas possibilidades.', image: menuAssets.cosmeticBanner, size: 'small' },
];
export const previews: Record<string, { title: string; label: string; text: string }> = {
  pass: { title: 'Passe de batalha', label: 'EM DESENVOLVIMENTO', text: 'Este espaço receberá a progressão de temporada e suas recompensas. O protótipo ainda não possui passe, níveis de temporada ou desbloqueios.' },
  store: { title: 'Loja', label: 'EM DESENVOLVIMENTO', text: 'O catálogo de cosméticos será apresentado aqui. Não há compras nem moedas premium ativas. A loja de itens das partidas continua disponível pela tecla B dentro dos modos de combate.' },
  missions: { title: 'Missões', label: 'EM DESENVOLVIMENTO', text: 'Os objetivos diários e semanais aparecerão aqui. Por enquanto, explore os seis heróis e pratique suas habilidades no campo de treinamento.' },
  social: { title: 'Seu esquadrão', label: 'MODO LOCAL', text: 'Você está jogando um protótipo local com bots. A lista de amigos, os convites de equipe e o bate-papo online serão conectados futuramente.' },
  messages: { title: 'Central de mensagens', label: 'NENHUMA MENSAGEM', text: 'Os comunicados e mensagens da sua conta aparecerão aqui quando os serviços online estiverem disponíveis.' },
  season: { title: 'Sombras em ascensão', label: 'CONCEITO DE TEMPORADA', text: 'Prévia da organização visual das notícias de LIN0. O título e a arte são provisórios; não representam uma temporada já disponível.' },
  event: { title: 'Festival das Almas', label: 'CONCEITO DE EVENTO', text: 'Espaço reservado para eventos do universo LIN0. Esta apresentação é provisória e ainda não corresponde a um evento jogável.' },
  cosmetics: { title: 'Outras faces', label: 'PRÉVIA DE PERSONALIZAÇÃO', text: 'Modelos, visuais e acessórios definitivos poderão ocupar este espaço. Nenhum cosmético está à venda ou pode ser desbloqueado nesta versão.' },
};
