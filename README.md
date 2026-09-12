# LIN0 — Hero shooter

Protótipo em primeira pessoa feito com **TypeScript, Three.js e Vite**. Inclui partidas locais 5v5 com bots, Conquista, Duelo Shogun, galeria de seis personagens, baralhos personalizados e campo de treinamento.

## Executar

```bash
npm install
npm run dev
```

Abra o endereço informado pelo Vite. Para gerar a versão de distribuição, execute `npm run build`; o resultado fica em `dist/`. `npm run preview` serve essa versão.

## Onde encontrar cada coisa

```text
src/
├── characters/       Uma pasta por personagem: definição, cartas e apresentação
├── maps/             Um diretório por mapa, construção do mundo e colisões
├── game/             Partidas, modos, bots, jogador, combate e efeitos
├── progression/      Catálogo de cartas, baralhos salvos e loja de itens
├── ui/               Menu, galeria, seleção de partida, baralhos, HUD e estilos
├── core/             Tipos compartilhados, entrada, áudio e relógio
└── main.ts           Inicialização, renderização e ligação entre telas e partida

public/assets/        Imagens servidas pelo jogo, agrupadas por personagem e finalidade
tests/unit/           Testes de regras e simulação
tests/browser/        Verificação do jogo no Chrome
scripts/              Ferramentas de desenvolvimento e execução dos testes
docs/                 Guias de organização e documentação dos mapas
```

**Comece pelo [guia de organização](docs/structure.md)**: ele mostra os arquivos exatos para alterar vida, habilidades, cartas, portraits, mapas e menus.

**F3 abre as ferramentas de desenvolvimento** durante partidas e treinamento: stats, comandos, dummies, baralhos temporários, IA e desempenho. Veja [runtime de combate e Dev Mode](docs/runtime-and-dev-mode.md) para os controles, eventos, status e decisões de integração.

## Jogar

**Jogar → modo e mapa → personagem → baralho salvo → combate.**

Edite os baralhos em **Heróis → personagem → Baralhos**. Cada personagem tem 20 opções de cartas e nove espaços de baralho. Cada baralho contém cinco cartas diferentes, com níveis de 1 a 5 e soma de 15 pontos. A escolha confirmada dentro da partida fica bloqueada até o fim dela.

Os mapas de partida são Distrito Shōtō e Castelo do Shogun. O **campo de treinamento** pode ser aberto pelo início, pela página Jogar ou pela galeria. Ele possui alvos inimigos, aliados para testar cura e prédios para testar mobilidade.

| Ação | Controle |
| --- | --- |
| Movimento / salto | WASD / Espaço |
| Ataque principal | Clique esquerdo |
| Lino: Moldar / Fio do Abismo / dash | Q / segurar Shift / botão direito |
| Lino: selecionar forma / criar / retrair | Números com Moldar aberto / clique esquerdo / R |
| Outros personagens: habilidades | Q / botão direito / F |
| Suprema | E |
| Outros personagens: recarregar / ataque alternativo / corpo a corpo | R / botão do meio / V |
| Pausa / placar / loja da partida | Esc / segurar Tab / B nas áreas permitidas |
| Treinamento: painel / recuperar / reiniciar | T / G / N |

Baralhos e preferências são salvos no navegador. A reorganização dos arquivos preserva os IDs dos personagens, cartas e mapas e a chave `lino.loadouts.v1`.

## Verificar alterações

```bash
npm test                 # Todas as suítes de regras e simulação
npm run test:lino        # Kit de Lino
npm run test:map         # Colisão, navegação e captura
npm run test:combat      # Disparos, projéteis e registro de acertos
npm run test:loadouts    # Cartas, níveis, salvamento e migração
npm run build            # TypeScript e distribuição
npm run test:browser     # Fluxo de partida no Chrome; requer Vite rodando
```

Veja [os testes no navegador](tests/README.md) para validar galeria, portraits, treinamento e outros fluxos. As capturas são gravadas em `artifacts/browser/`, ignorado pelo controle de versão. `dist/` também é gerado; ambos podem ser recriados.

O projeto ainda usa geometria procedural e modelos provisórios. O modo online, cosméticos, passe de batalha e serviços sociais não estão implementados.
