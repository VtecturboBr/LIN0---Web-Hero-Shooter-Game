# Menu principal

| Arquivo | Responsabilidade |
| --- | --- |
| `MainMenu.ts` | Navegação, diálogos, perfil local e preferências. |
| `components.ts` | Barra superior, botões de navegação, notícias e cartão do mapa. |
| `config.ts` | Textos, recursos de imagem e configuração de modelos opcionais. |
| `MenuScene.ts` | Cenário e câmera de fundo do menu. |
| `HeroViewer.ts` | Modelo ou manequim apresentado no início. |
| `menu.css` | Estilos do menu. |

O botão Jogar abre `src/ui/match/MatchSetup.ts`. A seleção de modos não pertence mais a um diálogo do menu principal.

As notícias usam `public/assets/ui/`. A prévia do Distrito Shōtō está em `public/assets/maps/`. Caminhos usados pelo navegador começam em `/assets/`, sem `public`.

Modelos e fundos personalizados são opcionais: configure `menuAssets` quando esses recursos existirem. A galeria tem seu próprio visualizador em `src/ui/gallery/`.

Validação: `node tests/browser/menu-smoke.mjs` com Vite em execução.
