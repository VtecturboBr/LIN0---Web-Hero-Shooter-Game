# Distrito Shōtō — mapa de Conquista

Arena original de 92 × 68 metros, inspirada no bairro residencial Shōtō, em Shibuya. Substitui a geometria e a apresentação de Kyoto Neon. O identificador interno `kyoto` permanece compatível com as seleções existentes. Castelo do Shogun e o dojo continuam separados.

A referência de lugar é o [Parque Nabeshima Shoto, no guia oficial de Tóquio](https://www.gotokyo.org/en/spot/1181/). A ambientação interpreta o arquivo LIN0.txt fornecido: coexistência de vida cotidiana, arquitetura japonesa tradicional, infraestrutura moderna e tecnologia discreta. O oratório com talismãs, as residências e o pavilhão comunitário representam essa convivência. Este traçado e seu nome são uma proposta para o jogo; não reproduzem ruas reais nem estabelecem novos eventos ou facções canônicas.

## Rotas e posições

| Elemento | Função |
| --- | --- |
| Praça central, raio 6,25 m | Ponto A no nível da rua, com anel no chão e marcador elevado; sem obstrução sólida no centro. |
| Rua principal | Aproximação mais direta. Veículos, quiosques e jardineiras interrompem os disparos ao longo da rua. |
| Dois parques | Rotas laterais conectadas às duas bases, com árvores, bancos e caminhos que contornam os terraços. |
| Dois terraços de 3,6 m | Visão sobre o ponto, cobertura parcial na frente e acesso pelos dois lados. |
| Quatro rampas, 10 m de extensão | Inclinação contínua de aproximadamente 20°; todos os personagens podem subir andando. |
| Residências | Prédios de três pavimentos com telhados planos e casas menores com telhados inclinados. Paredes e telhados são sólidos e aceitam o Fio do Abismo. |
| Bases opostas | Cinco posições por equipe atrás de uma fachada sólida, com saída por ambas as extremidades. |

A colisão é simétrica em uma rotação de 180° para igualar os acessos dos times. Materiais e detalhes podem variar entre os lados. Os bots usam busca de caminho no solo com folga para o corpo e alternam as aproximações iniciais entre rua e parques; as posições dos telhados permanecem opções para habilidades de mobilidade. A navegação considera construções temporárias de Lino.

As coberturas principais possuem colisão para movimento, disparos e habilidades. Folhas, janelas, placas, pintura de piso e detalhes finos são decoração. Os prédios distantes ficam além do limite jogável.

## Captura

- Capturar um ponto neutro: 12% por segundo.
- Retirar a captura rival: 24% por segundo; depois disso, inicia-se a captura do novo time.
- Duas equipes dentro do ponto: progresso e pontuação ficam suspensos.
- Um invasor sozinho também interrompe a pontuação durante a neutralização.
- Um ponto completamente capturado conserva seu dono quando vazio; reivindicações incompletas e neutras decaem 8% por segundo.
- A pontuação permanece em 2,2 pontos por segundo, com vitória em 200 pontos.

## Verificação

`npm run test:map` verifica posições de nascimento, simetria, caminhos pelas três rotas, subida/descida das quatro rampas, bloqueio de tiros, superfícies para o fio, desvio de paredes temporárias, deslocamento físico dos bots e captura/retomada/contestação.

Com Vite rodando, `node tests/browser/shoto-smoke.mjs 9251` verifica o fluxo Jogar → personagem → baralho → Conquista no Chrome e grava vistas do mapa. Defina `SMOKE_URL` se o endereço local for diferente de `http://localhost:5173/`. O teste também atualiza a prévia real em `public/assets/maps/shoto-preview.jpg`.

É uma primeira versão jogável de level design. Os testes verificam funcionamento e acesso; alcance de visão, tempo de retorno e força de cada posição ainda devem ser avaliados em partidas completas para ajustar o equilíbrio.
