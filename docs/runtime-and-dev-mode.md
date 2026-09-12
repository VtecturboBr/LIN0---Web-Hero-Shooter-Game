# Runtime de combate e ferramentas F3

Pressione **F3 durante uma partida ou treinamento**. O painel libera o cursor, bloqueia os controles de combate e mantém o estado de pausa anterior. F3, Escape ou Fechar devolvem o controle. O painel também funciona sobre a pausa. Os ajustes de desenvolvimento não são gravados nos baralhos salvos nem nas preferências do jogador.

## Ferramentas

- Seleção de qualquer jogador ou dummy; vida, escudo, stats finais, recarga da arma, munição, cooldowns e estados das habilidades, carga da suprema, Koban, cartas, itens e efeitos ativos.
- Cálculo de stats com base, passiva, cartas, itens, buffs e resultado; vida e velocidade mostram também seus valores-base e finais.
- Curar, causar dano, eliminar, renascer, carregar a suprema, zerar cooldowns, interromper habilidades, teleportar e trocar herói/time.
- Configurar vida máxima de dummies, invencibilidade, recebimento exclusivo de headshots, movimentação e ataques no treinamento.
- Alterar cartas e itens temporariamente. O baralho mantém as regras de cinco cartas diferentes e 15 pontos; os itens mantêm níveis e limite da loja.
- Aplicar slow, poison, burn, HoT, speed, vulnerability, invulnerability e lifesteal, ou limpar efeitos.
- Congelar decisões e movimento da IA, selecionar seus perfis e ajustar a escala de tempo entre 0 e 4. Zero congela a simulação, mas o painel continua atualizando.
- Visualizar hitboxes, trajetórias balísticas previstas para o próximo segundo e rotas já calculadas da IA. As trajetórias são previsões sem teste futuro de colisão.
- FPS medido no navegador, draw calls das duas passagens de renderização, triângulos, geometrias, texturas, quantidade de projéteis e efeitos.

A telemetria e as linhas de depuração atualizam a 5 Hz. As linhas usam um buffer limitado e reutilizado. O HUD do treinamento mostra o dano do último hit e **DPS sobre os últimos cinco segundos**, incluindo períodos sem disparos. Reiniciar o treinamento limpa a medição. Trocar herói mantém a arena e o objeto do jogador, mas limpa seu baralho temporário, itens e habilidades anteriores.

## Eventos

`CombatEventSystem` pertence à partida. Todos os jogadores da partida compartilham essa instância; jogadores isolados usados nos testes possuem uma instância própria. Não existe um barramento global entre partidas.

| Evento | Dados principais | Uso |
| --- | --- | --- |
| `damage` | source, target, amount, absorbed, sourceKind, opts, killed | Estatísticas, Koban, recurso, lifesteal, som de acerto/dano, HUD e DPS |
| `heal` | source, target, amount, rewards | Estatísticas, Koban/recurso quando aplicável, efeitos de cura |
| `shield` | source, target, amount, duration | Inspeção e efeito visual |
| `kill` | source ou null, target | Recompensas, placar, killfeed, som e efeito de morte |
| `headshot` | source, target, amount | Assinaturas específicas de acertos críticos |
| `ability_cast` | source, ability, ultimate | Áudio e instrumentação de habilidades, incluindo Lino |
| `objective_capture` | team | Áudio e notificação de captura |
| `projectile_hit` | source, target ou null, point, sourceKind, headshot | Instrumentação de impactos em jogadores e mundo |

Os eventos são síncronos. As regras de recompensa são instaladas antes das assinaturas de apresentação. Dano informa o valor efetivo, limitado à vida e ao escudo restantes, e conserva sua origem (`weapon`, `ability`, `ultimate` e identificador de status). `on()` retorna uma função para remover a assinatura. O encerramento da partida limpa assinaturas e recursos. O callback antigo `onDie` continua disponível para consumidores existentes.

## StatusEffectManager

Cada jogador tem `player.status`. Um efeito contém `id`, `source`, `duration`, `kind`, `value` e, quando necessário, `stat`, `interval`, `onTick` e `onExpire`.

- `refresh`: renova um efeito com o mesmo ID e origem.
- `replace`: substitui seus parâmetros e reinicia o acumulador de ticks.
- `strongest`: preserva a maior intensidade e duração restante. Slows não somam por padrão.
- `stack`: cria uma instância independente. Origens diferentes são preservadas.

Slows com `stack` somam à maior intensidade dos slows comuns, independentemente da ordem de aplicação.

Poison, burn e HoT recebem valor em HP/s. Speed, slow, vulnerability e lifesteal recebem frações: `0.2` equivale a 20%. Invulnerability usa valor positivo para bloquear dano. Buffs de stats usam a mesma semântica aditiva dos modificadores de cartas e loja. Duração e intervalos inválidos são rejeitados.

Ticks usam tempo de simulação e incluem a fração final da duração. Morte e respawn limpam status; os callbacks de expiração executam uma vez por instância. Campos legados de slow, invulnerabilidade e velocidade permanecem compatíveis com os consumidores existentes.

## AbilityRuntime

Cada slot tem um runtime; a suprema possui outro. O fluxo é `READY → CASTING → ACTIVE → COOLDOWN → READY`. Habilidades instantâneas atravessam estados de duração zero no mesmo disparo.

`AbilityDef.runtime` aceita `castTime`, `duration`, `channel`, `tickInterval`, `interruptible` e `persistent`. O runtime oferece callbacks `activate`, `tick` e `end`. Canalização bloqueia outras ações enquanto ativa. Duração persistente termina por interrupção explícita. A integração com as habilidades existentes cancela entidades e status criados por aquela ativação quando ela é interrompida; concessões instantâneas de escudo continuam seguindo a validade do escudo.

As matrizes `abilityCd` existentes continuam sendo o relógio público dos cooldowns, que começam no cast, preservando o comportamento anterior. Durações usam `config.duration`, salvo override em `runtime`. Efeitos persistentes já implementados, como espíritos e tempestades, mantêm seus ticks no `EntityManager`. Moldar e fio usam estados persistentes; campo e dash usam os valores canônicos da definição de Lino.

Zerar cooldowns não encerra uma habilidade ativa. Para isso existe Interromper. No treinamento livre, renovar recursos não zera o intervalo da arma a cada quadro.

## Dados, IA e recursos gráficos

`HeroRegistry` indexa as definições existentes sem alterar a ordem da seleção. Rejeita IDs duplicados e consultas desconhecidas. `HEROES` e `HERO_MAP` continuam disponíveis; `HERO_DECKS` deriva de `HeroDef.cards`.

As definições contêm combo da foice, valores reais do dash, alcance do fio, duração/raio do campo, regeneração da aura de Yume, acúmulos de Kenji e perfil de IA. `characters/lino/rules.ts` concentra formas, geometria de colisão, HP das estruturas, custos, limites, recuperação de Controle e parâmetros do fio. Definições, runtime e HUD compartilham esses dados. IDs de cartas, migração e chave `lino.loadouts.v1` são preservados.

Os seis perfis de IA são `aggressive`, `flanker`, `support`, `sniper`, `tank` e `objective`. Eles definem distância desejada, retirada por vida, prioridade de inimigos feridos/no objetivo e condições de uso da suprema. A navegação e os testes de visibilidade continuam usando o mundo de colisão existente.

`ResourceTracker` deduplica geometria, material e textura dentro do conjunto de objetos encerrado, incluindo mapas de sombra. `MeshPool` reutiliza meshes e recursos de projéteis e partículas, com limites de 128 e 400 objetos ociosos. Objetos excedentes são descartados; os pools também são descartados no encerramento. Linhas, anéis e entidades especiais conservam seus ciclos de vida próprios.

## Arquivos

Novos sistemas: `game/combat/CombatEventSystem.ts`, `StatusEffectManager.ts`, `AbilityRuntime.ts`, `core/ResourceTracker.ts`, `game/ai/profiles.ts` e `ui/dev/DevPanel.ts`/`dev.css`.

Integração: `main.ts`, `core/types.ts`, `game/actors/Player.ts`, `game/match/Match.ts`, `game/combat/abilities.ts`, `projectiles.ts`, `weapons.ts`, `hitFeedback.ts`, `game/effects/Effects.ts`, `game/ai/BotBrain.ts` e `ui/hud/Hud.ts`.

Dados: `characters/index.ts`, as seis definições de herói, `characters/lino/rules.ts`, `characters/lino/LinoMatter.ts`, `progression/cards/catalog.ts` e `progression/loadouts/library.ts`.

Verificação: `tests/unit/runtime.test.ts`, ajustes nas suítes `combat`, `gameplay` e `loadouts`, `tests/browser/helpers/dev-panel.mjs`, `tests/browser/match-flow-smoke.mjs` e `scripts/run-unit-tests.mjs`.

Colisão: `maps/world.ts` e regressões em `tests/unit/shoto.test.ts`. Restaurados o retorno de `onGround`, a resolução vertical sobre blocos e tetos e o limite horizontal da arena. A regressão cobre pouso e impacto ascendente; os testes existentes cobrem rampas e deslocamento rápido do fio.

## Verificação

```bash
npm run typecheck
npm test
npm run build
npm run test:browser
```

O teste de navegador requer o servidor Vite em execução. `SMOKE_URL` permite escolher sua porta. A captura de F3 fica em `artifacts/browser/dev-panel.png`.

As regressões cobrem shields, modifiers, reload/cooldown, origem e headshots de projéteis, nova de Yume, tempestade de Raijin, Koban, loja/HUD, announcer, killfeed, empates, custos, navegação, pooling/dispose, eventos, status, interrupções, troca de herói e congelamento da simulação. Várias correções de combate já estavam presentes antes desta integração e foram preservadas. Também foram corrigidos o slow forte reaplicado após expirar, a divergência entre definição e execução do dash, a expiração do announcer no treinamento e o caminho que permitia uma cura reduzir HP acima do novo máximo.
