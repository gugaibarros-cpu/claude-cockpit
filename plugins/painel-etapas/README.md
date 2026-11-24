# Plugin painel-etapas

Painel vivo ao lado do chat, em três abas:

- **Etapas**: organograma com barras de progresso empilhadas, filtros e detalhe de cada etapa. O estado vem do `etapas.json` e dos PRs do GitHub (`gh pr list`, só leitura), regerado sozinho.
- **Fila do diretor**: opcional, lê um `fila.json`.
- **Agora**: subagentes desta sessão (tipo, há quanto tempo, última atividade, estado), os que terminaram há pouco, tarefas em segundo plano e crons da sessão, e os `relatorios/*.status` (andando, pronto, falha, bloqueado) lidos do disco.

Inclui a skill `painel-etapas`, que ensina qualquer sessão a manter o `etapas.json`, escrever os `.status` e relatar "o que roda agora" num formato fixo.

## Carregar em qualquer sessão

Sem instalar nada, aponte a pasta do plugin:

```
claude --plugin-dir "CAMINHO/DO/plugins/painel-etapas"
```

Onde não dá para passar flag (sessão aberta pelo app, SDK), use a variável de ambiente, com o caminho absoluto (vários separados por `;` no Windows):

```
CLAUDE_CODE_PLUGIN_DIRS=CAMINHO/DO/plugins/painel-etapas
```

Ela vale no ambiente do processo ou no bloco `env` do `~/.claude/settings.json` do usuário. Com isso o painel abre sozinho no início da sessão; `/etapas` abre de novo.

## Configurar (outro projeto)

Crie `painel-etapas.config.json` na pasta da sessão (modelo: `painel-etapas.config.exemplo.json`):

| Campo | Para quê |
| :--- | :--- |
| `etapas` | caminho do `etapas.json` (a fonte; o `etapas-status.json` é gerado ao lado) |
| `repos` | lista `dono/repo` para o `gh pr list`; vazio usa o campo `repo` do `etapas.json` |
| `intervaloSegundos` | de quanto em quanto tempo regera (mínimo 15, padrão 60) |
| `relatorios` | pasta com `NN-nome.status` e `NN-nome.md` (aba Agora) |
| `fila` | `fila.json` opcional; vazio esconde a aba Fila do diretor |

Caminhos relativos valem a partir da pasta do arquivo de configuração. Havendo arquivo de configuração, só os campos dele valem. Sem arquivo, valem os campos `userConfig` do plugin (menu `/config`, ou `pluginConfigs` no settings), que vêm vazios: preencha o que for usar.

Requisitos: `node` e `gh` (autenticado) no PATH. Sem `gh` o painel segue com o último estado e avisa.

## Limites

- A aba Agora enxerga só a sessão em que o plugin está carregado. Cada sessão que carregar o plugin vê os seus próprios subagentes.
- Tarefas em segundo plano e crons só atualizam ao fim de cada turno (a API só os entrega no evento `Stop`).
- Não há "iniciado em" nativo para subagentes: o tempo conta desde que o painel os viu.

## Testes

```
node scripts/atualizar-etapas.selftest.mjs
claude plugin validate .
claude plugin test .
```

Type-check: carregado de uma pasta que o Claude Code vigia (`--plugin-dir` numa sessão interativa), ele deposita os tipos em `.claude-plugin/types/` e `tsc -p .` funciona. Fora disso, use um `tsconfig.json` que aponte `typeRoots` para essa pasta de tipos de outro mod.
