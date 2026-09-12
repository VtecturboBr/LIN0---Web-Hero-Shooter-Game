# Organização do projeto

## Personagens

Cada um dos seis personagens tem uma pasta em `src/characters/`: `lino`, `yume`, `raijin`, `kitsune`, `shin` e `kenji`.

| Arquivo dentro do personagem | O que editar |
| --- | --- |
| `definition.ts` | Nome, função, vida, velocidade, arma, passiva, habilidades, suprema e lore. |
| `cards.ts` | As 20 cartas disponíveis e as definições das cartas exclusivas. |
| `presentation.ts` | Caminhos do portrait, logo e modelo 3D opcional; enquadramento do retrato. |

Lino também possui `LinoMatter.ts`, que implementa suas construções, fio, dash e campo maleável, e `FirstPersonScythe.ts`, que desenha e anima sua arma em primeira pessoa.

`src/characters/index.ts` registra o elenco e sua ordem. `roles.ts` contém os nomes e descrições das funções. `presentation.ts` na raiz de personagens define apenas o tipo compartilhado da configuração visual.

As imagens estão em `public/assets/characters/<personagem>/portrait.png` e, quando disponível, `logo.png`. Artes fornecidas e ainda não atribuídas ficam em `_reserved/`, inclusive o retrato exibido como personagem em desenvolvimento.

## Mapas

```text
src/maps/
├── index.ts               Registro dos mapas disponíveis
├── types.ts               Estrutura dos dados de mapa e colisão
├── world.ts               Montagem do mundo, raycasts e movimento com colisão
├── shoto/
│   ├── definition.ts      Geometria, bases, ponto e parâmetros do Distrito Shōtō
│   └── scene.ts           Fachadas, vegetação, placas e acabamento visual
├── training/
│   ├── definition.ts      Geometria e posições do dojo
│   └── scene.ts           Sinalização e decoração dos prédios de treino
└── castle/
    └── definition.ts      Castelo do Shogun
```

A geometria que bloqueia personagens e ataques deve ser definida nos colisores do mapa. Elementos apenas decorativos ficam em `scene.ts`. O Castelo usa o acabamento genérico de `world.ts`, por isso não precisa de um arquivo de cenário vazio.

O Distrito Shōtō mantém o ID interno `kyoto` para compatibilidade. Seu nome mostrado ao jogador vem de `definition.ts`. As regras de Conquista e Duelo ficam em `src/game/modes/`, separadas dos mapas.

## Simulação e sistemas compartilhados

| Pasta/arquivo | Responsabilidade |
| --- | --- |
| `src/core/types.ts` | Tipos de personagens, habilidades, cartas, itens e atributos. |
| `src/core/input.ts` | Teclado, mouse e captura do cursor. |
| `src/core/time.ts` | Relógio da simulação, que congela durante a pausa. |
| `src/core/audio.ts` | Efeitos sonoros sintetizados. |
| `src/game/actors/Player.ts` | Movimento, vida, dano, cura e aplicação de atributos. |
| `src/game/combat/` | Armas, habilidades compartilhadas, projéteis e detecção/feedback de acertos. |
| `src/game/ai/` | Comportamento dos bots, nomes e busca de caminhos. |
| `src/game/match/Match.ts` | Ciclo da partida, treinamento, equipes, pontuação e renascimento. |
| `src/game/modes/` | Regras dos modos e máquina de estados da captura. |
| `src/game/effects/` | Partículas, anéis e linhas de efeitos. |

As habilidades reutilizáveis são executadas pelo combate compartilhado. A configuração de cada personagem fica em sua própria definição; não é necessário duplicar o motor de disparos para cada herói.

## Cartas, baralhos e loja

- `src/progression/cards/shared.ts`: cartas oferecidas a mais de um personagem.
- `src/progression/cards/catalog.ts`: reúne cartas compartilhadas e exclusivas, registra os catálogos dos heróis e calcula efeitos por nível.
- `src/progression/loadouts/library.ts`: valida, carrega e salva os nove espaços por personagem.
- `src/progression/loadouts/migration.ts`: lê saves antigos e converte identificadores legados.
- `src/progression/shop/items.ts`: itens e regras da loja da partida.

As cartas exclusivas em `characters/<id>/cards.ts` usam os valores-base históricos de nível 3. O catálogo converte esses valores para o cálculo por nível. Para ajustar um bônus, edite sua definição de origem.

## Interface

```text
src/ui/
├── menu/           Menu principal, notícias, configurações e visualizador do início
├── gallery/        Galeria, filtros, detalhes e visualizador dos personagens
├── match/          Escolha de modo/personagem e menu de pausa
├── loadouts/       Editor e seleção de baralhos
├── hud/            Interface exibida durante o combate
├── shared/         Ícones reutilizados entre telas
├── styles/         Estilos globais e base visual
└── screens.ts      Coordenação da navegação entre telas
```

Os estilos específicos ficam junto da tela correspondente. `index.html` fornece os contêineres e o HTML estático de partida; `src/main.ts` conecta a interface à simulação e à renderização.

## Exemplos de edição

| Quero alterar… | Arquivo inicial |
| --- | --- |
| Vida ou habilidade de Yume | `src/characters/yume/definition.ts` |
| Funcionamento das paredes de Lino | `src/characters/lino/LinoMatter.ts` |
| Animação da foice | `src/characters/lino/FirstPersonScythe.ts` |
| Portrait ou logo de Lino | `src/characters/lino/presentation.ts` e `public/assets/characters/lino/` |
| Quais cartas Shin pode usar | `src/characters/shin/cards.ts` |
| Limite de pontos ou espaços de baralho | `src/progression/cards/catalog.ts` |
| Casas, bases ou ponto de Shōtō | `src/maps/shoto/definition.ts` |
| Vegetação e placas de Shōtō | `src/maps/shoto/scene.ts` |
| Tela Jogar | `src/ui/match/MatchSetup.ts` e `matchFlow.css` |
| Galeria de heróis | `src/ui/gallery/HeroGallery.ts` e `gallery.css` |
| Notícias do início | `src/ui/menu/config.ts` |

## Adicionar conteúdo

Um novo personagem precisa de definição, cartas e apresentação; registre-o em `characters/index.ts`, no catálogo de cartas e no agregador visual `ui/gallery/presentation.ts`. As quantidades fixas e os textos da interface também devem acompanhar a ampliação do elenco.

Um novo mapa precisa de `maps/<id>/definition.ts` e registro em `maps/index.ts`. Adicione sua opção à seleção em `ui/match/MatchSetup.ts`. Crie acabamento próprio somente se necessário e conecte-o à montagem de `world.ts`.

Não altere IDs existentes apenas para renomear arquivos: eles também identificam dados salvos. Preserve `migration.ts`, mesmo que os nomes legados já não apareçam na interface.

## Arquivos gerados e limpeza

`node_modules/` contém dependências; `dist/` é a distribuição; `artifacts/` contém resultados de testes. Não coloque arquivos-fonte nessas pastas. A `.gitignore` impede que os resultados gerados sejam versionados.

Os testes de navegador gravam capturas em `artifacts/browser/` por meio de um helper comum. As artes únicas do usuário ficam em `public/assets/`, incluindo as reservadas. O JPG usado como prévia do mapa é um recurso do jogo e permanece nessa pasta.
