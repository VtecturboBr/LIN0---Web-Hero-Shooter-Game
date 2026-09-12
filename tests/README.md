# Testes

## Regras e simulação

Execute `npm test` para todas as suítes em `tests/unit/`. Os comandos `npm run test:lino`, `test:map`, `test:combat` e `test:loadouts` filtram uma suíte.

`scripts/run-unit-tests.mjs` compila os testes em uma pasta temporária, executa o test runner do Node e remove os arquivos temporários. Os quatro comandos usam o mesmo executor.

## Navegador

Requer Chrome instalado e `npm run dev` em execução. Se necessário, configure o endereço no PowerShell:

```powershell
$env:SMOKE_URL = 'http://127.0.0.1:5173/'
npm run test:browser
```

Cada script aceita como primeiro argumento uma porta livre para o protocolo de depuração do Chrome, por exemplo `node tests/browser/gallery-smoke.mjs 9340`.

| Script em `tests/browser/` | Cobertura |
| --- | --- |
| `menu-smoke.mjs` | Navegação, preferências, perfil e responsividade do menu. |
| `gallery-smoke.mjs` | Seis personagens, filtros, abas, portraits, logos e treinamento. |
| `match-flow-smoke.mjs` | Modo/mapa, personagem, baralho fixo, pausa, retorno e treinamento. |
| `loadouts-smoke.mjs` | Edição, cancelamento, persistência e escolha de baralho. |
| `lino-smoke.mjs` | Construções, fio em inimigos, dash, movimento aéreo e suprema. |
| `scythe-smoke.mjs` | Controles e animação da foice em primeira pessoa. |
| `training-smoke.mjs` | Alvos, cura, personagens e opções do dojo. |
| `training-buildings-smoke.mjs` | Mobilidade nos prédios do treinamento. |
| `shoto-smoke.mjs` | Cenário, rotas dos bots e captura/retomada em uma partida real. |
| `smoke.mjs` | Fluxo geral, combate e loja da partida. |

Os testes usam perfis separados do Chrome. Capturas são gravadas em `artifacts/browser/` pelo helper `helpers/artifacts.mjs`, sem criar PNGs na raiz. O teste de Shōtō também atualiza a prévia distribuída em `public/assets/maps/shoto-preview.jpg`.
