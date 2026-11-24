# Plugins e skills para Claude Code

Catálogo pessoal de plugins e skills para o Claude Code. Cada item fica em `plugins/<nome>/` e é listado em `.claude-plugin/marketplace.json`.

## Plugins

| Plugin | O que faz |
| :--- | :--- |
| `painel-etapas` | Painel com etapas, fila do diretor e aba "Agora" (subagentes e relatórios `.status`) |

## Instalar

```
/plugin marketplace add gugaibarros-cpu/claude-plugins
/plugin install painel-etapas@gugaibarros-plugins
```

Ou, para testar sem instalar, aponte uma sessão para a pasta do plugin:

```
claude --plugin-dir "<caminho>/plugins/painel-etapas"
```

## Adicionar outro plugin

1. Crie `plugins/<nome>/` com `.claude-plugin/plugin.json` (e `hooks/`, `skills/` conforme precisar).
2. Acrescente uma entrada em `plugins` no `.claude-plugin/marketplace.json`.
3. Rode `claude plugin validate plugins/<nome>`.
