---
name: painel-etapas
description: Mantém o painel vivo de etapas do projeto (etapas.json, relatorios/*.status, relatório curto) e relata "o que roda agora" (subagentes, PRs, tarefas agendadas) num formato padrão. Use quando o diretor pedir andamento, status, organograma, painel de etapas, "o que está rodando", ou quando você disparar subagentes, PRs ou tarefas agendadas que precisam aparecer no painel.
---

# Painel de etapas

O plugin `painel-etapas` desenha um painel ao lado do chat com três abas: **Etapas** (organograma com barras de progresso), **Fila do diretor** (opcional) e **Agora** (subagentes desta sessão, tarefas em segundo plano, crons e relatórios `.status`). Ele só lê arquivos e o GitHub. Quem mantém os arquivos é você, a sessão. Se o painel não abriu, o comando `/etapas` abre.

## 1. Onde ficam os arquivos

A configuração vem de `painel-etapas.config.json` na pasta da sessão (ou do `configFile` do plugin). Modelo em `painel-etapas.config.exemplo.json`, dentro da pasta do plugin:

```json
{ "etapas": "diretor/etapas.json", "repos": ["dono/repo"], "intervaloSegundos": 60, "relatorios": "relatorios", "fila": "" }
```

Caminhos relativos valem a partir da pasta do arquivo de configuração. Leia o arquivo antes de assumir onde as coisas estão.

## 2. Manter o etapas.json

É a fonte do organograma. Edite só este arquivo, nunca o `etapas-status.json` (o gerador o sobrescreve a cada minuto).

```json
{
  "meta": "frase que aparece no topo",
  "repo": "dono/repo",
  "lanes": [
    { "n": "Nome da faixa", "c": [
      { "id": "slug-unico", "t": "Título curto", "o": "O que é", "p": "Por que importa",
        "d": "Depende de", "x": "Próximo passo",
        "prs": [15, "dono/outro#7"], "branches": ["feat/x"], "estado": "pend" }
    ] }
  ]
}
```

- `estado` (`feito`, `curso`, `falha`, `pend`) vale só quando o item não tem PR nem branch achados no GitHub.
- Com PR ou branch achados, o estado vem do GitHub: todos mesclados = feito; algum aberto com conflito ou bloqueado = falha; algum aberto = curso.
- `id` é único e estável. Texto `o`, `p`, `d`, `x` em português, uma ou duas frases.
- Ao abrir um PR, coloque o número em `prs` do item certo na mesma hora. Ao terminar uma etapa sem PR, troque `estado` para `feito`.

Para forçar a atualização sem esperar: `node <pasta-do-plugin>/scripts/atualizar-etapas.mjs --etapas <etapas.json> --repos dono/repo`. Só lê o GitHub (`gh pr list`).

## 3. Relatórios e .status

Para cada tarefa grande que você assume (sua ou de um subagente), na pasta `relatorios` da configuração:

1. Ao começar, escreva `NN-nome.status` com uma linha: `andando`.
2. Ao terminar, escreva `NN-nome.md` (relatório curto) e troque o `.status` para `pronto`.
3. Se travar: `falha` ou `bloqueado: <motivo em uma linha>`. Pare e diga o que falta.

O relatório `.md` começa com `# NN. Título` (a aba Agora mostra essa linha) e traz, em português e em poucas linhas: o que foi feito, commits e PR, testes, o que NÃO está provado, perguntas ao diretor. Texto livre vai por Write/Edit, nunca em aspas duplas na linha de comando.

Nunca marque `pronto` sem ter rodado a verificação. Um `.status` que diz `andando` há horas sem atividade é um defeito do relatório: corrija ou troque para `bloqueado`.

## 4. Relatar "o que roda agora"

Quando o diretor perguntar o andamento, ou ao fechar qualquer resposta longa, use este formato, copiando os dados do painel (aba Agora), do `gh pr list` e do que você mesmo disparou. Nada de lembrar de memória: leia primeiro.

```
RODANDO AGORA
Agentes: <tipo> "<descrição>" há <tempo>, última ação <ferramenta> há <tempo>   (ou "nenhum")
PRs: #<n> <aberto|mesclado|conflito> <título curto>                            (ou "nenhum")
Agendadas: <cron ou "uma vez"> <o que faz>                                       (ou "nenhuma")
Relatórios: <NN-nome> <andando|pronto|falha|bloqueado>
DEPENDE DO DIRETOR: <o que só ele pode decidir, ou "nada">
```

Regras: um item por linha, tempo em minutos, sem adjetivo. Se um dado não pôde ser lido, escreva "não lido: <motivo>" em vez de omitir.

## 5. Limites do painel (diga isso se o diretor perguntar)

- A aba Agora enxerga **só esta sessão**: os subagentes dela (`$.agent.list`) e o que ela mesma agendou. Subagentes de outra sessão aparecem pelos `.status` em disco, se escreverem lá.
- Tarefas em segundo plano e crons só são atualizados **ao fim de cada turno**, porque a API só os entrega no evento `Stop`.
- "Há quanto tempo" de um subagente conta desde que o painel o viu pela primeira vez, e "última atividade" vem das chamadas de ferramenta dele que o painel observou.
