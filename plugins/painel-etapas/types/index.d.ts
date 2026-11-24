export type Estado = 'feito' | 'curso' | 'falha' | 'pend'

export type EtapaPr = { n: number; estado: Estado; situacao: string }

export type Etapa = { id: string; t: string; o: string; p: string; d: string; x: string; estado: Estado; prs: EtapaPr[] }

export type Lane = { n: string; c: Etapa[] }

export type Status = { meta: string; lanes: Lane[]; geradoEm: string; erroGh: string }

export type Item = {
  id: number
  status: string
  pedido: string
  forca?: { modelo: string; esforco: string }
  dependeDe?: number[]
  resultado?: string
  bloqueio?: string
}

export type Rotulo = { titulo?: string; resumo?: string; progresso?: number | null }

/** Um subagente da sessao, como $.agent.list() o entrega, mais o que o painel mediu (inicio e ultima ferramenta). */
export type AgenteLinha = { id: string; tipo: string; desc: string; nome: string; status: string; desdeMs: number; ultimoMs: number; ultimaAcao: string }

/** Um subagente que terminou (evento SubagentStop). */
export type AgenteFim = { id: string; tipo: string; fimMs: number; resumo: string }

export type TarefaFundo = { id: string; tipo: string; status: string; descricao: string }
export type CronSessao = { id: string; agenda: string; recorrente: boolean; prompt: string }

/** O que o evento Stop trouxe no fim do ultimo turno: unico lugar onde a API expoe tarefas em segundo plano e crons. */
export type Fundo = { quandoMs: number; tarefas: TarefaFundo[]; crons: CronSessao[] }

/** Um relatorios/NN-nome.status lido do disco. */
export type Relatorio = { nome: string; estado: 'andando' | 'pronto' | 'falha' | 'bloqueado' | 'outro'; detalhe: string; titulo: string; mtimeMs: number }

export type Aba = 'etapas' | 'fila' | 'agora'

declare module 'claude-code' {
  interface PluginState {
    'painel-etapas': {
      dados: Status | null
      erro: string
      sel: string | null
      aba: Aba
      filtro: Estado | 'todos'
      fila: Item[]
      rotulos: Record<string, Rotulo>
      auto: string
      agentes: AgenteLinha[]
      recentes: AgenteFim[]
      fundo: Fundo | null
      relatorios: Relatorio[]
      pulso: number
    }
  }
}
