import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { AgenteFim, AgenteLinha, Aba, Estado, Etapa, Fundo, Item, Relatorio, Rotulo, Status } from '../types'

const PANE = 'painel-etapas'
const P = { plugin: 'painel-etapas' } as const

const dados = atom({ ...P, key: 'dados' } as const, null as Status | null)
const erro = atom({ ...P, key: 'erro' } as const, '')
const sel = atom({ ...P, key: 'sel' } as const, null as string | null)
const aba = atom({ ...P, key: 'aba' } as const, 'etapas' as Aba)
const filtro = atom({ ...P, key: 'filtro' } as const, 'todos' as Estado | 'todos')
const fila = atom({ ...P, key: 'fila' } as const, [] as Item[])
const rotulos = atom({ ...P, key: 'rotulos' } as const, {} as Record<string, Rotulo>)
const auto = atom({ ...P, key: 'auto' } as const, '')
const agentes = atom({ ...P, key: 'agentes' } as const, [] as AgenteLinha[])
const recentes = atom({ ...P, key: 'recentes' } as const, [] as AgenteFim[])
const fundo = atom({ ...P, key: 'fundo' } as const, null as Fundo | null)
const relatorios = atom({ ...P, key: 'relatorios' } as const, [] as Relatorio[])
const pulso = atom({ ...P, key: 'pulso' } as const, 0)

type Cfg = { etapas: string; repos: string; intervalo: number; relatorios: string; fila: string }

const ROTULO: Record<Estado, string> = { feito: 'FEITO', curso: 'EM ANDAMENTO', falha: 'FALHA OU IMPEDITIVO', pend: 'AINDA NÃO COMEÇOU' }
const TEMA: Record<Estado, 'success' | 'warning' | 'error' | 'inactive'> = { feito: 'success', curso: 'warning', falha: 'error', pend: 'inactive' }
const ESTADOS: Estado[] = ['feito', 'curso', 'falha', 'pend']

const COR_FILA: Record<string, 'success' | 'warning' | 'error' | 'suggestion'> = { andando: 'warning', escalado: 'warning', fila: 'suggestion', bloqueado: 'error', parado: 'error', feito: 'success' }
const ORDEM_FILA = ['andando', 'escalado', 'fila', 'bloqueado', 'parado', 'feito']
const tituloFila = (i: Item, r?: Rotulo) => r?.titulo ?? i.pedido.replace(/^OBJETIVO:\s*/, '').replace(/\s+/g, ' ').split(/(?<=[.:])\s/)[0]?.slice(0, 60) ?? ''

const COR_REL: Record<Relatorio['estado'], 'success' | 'warning' | 'error' | 'inactive'> = { andando: 'warning', pronto: 'success', falha: 'error', bloqueado: 'error', outro: 'inactive' }
const COR_AGENTE = (s: string): 'success' | 'warning' | 'error' | 'inactive' => (s === 'running' ? 'warning' : s === 'completed' ? 'success' : s === 'failed' || s === 'killed' ? 'error' : 'inactive')

const hora = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleTimeString('pt-BR')
}
/** Duracao curta: 8 s, 3 min, 2 h 05. */
const duracao = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.floor(s / 60)} min`
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
}
const corta = (t: string, n: number) => {
  const x = t.replace(/\s+/g, ' ').trim()
  return x.length > n ? `${x.slice(0, n - 1)}…` : x
}

// Barra empilhada: um bloco por status, na proporcao de cada um, somando exatamente `larg` blocos.
const segmentos = (c: Record<Estado, number>, larg: number): [Estado, number][] => {
  const total = ESTADOS.reduce((s, k) => s + c[k], 0) || 1
  const bruto = ESTADOS.map(k => (c[k] / total) * larg)
  const n = bruto.map(Math.floor)
  let sobra = larg - n.reduce((s, v) => s + v, 0)
  const ordem = bruto.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of ordem) {
    if (sobra <= 0) break
    if (c[ESTADOS[i]!] > 0) { n[i] = (n[i] ?? 0) + 1; sobra -= 1 }
  }
  return ESTADOS.map((k, i) => [k, n[i] ?? 0] as [Estado, number]).filter(([, q]) => q > 0)
}
const contar = (xs: Etapa[]): Record<Estado, number> => ({
  feito: xs.filter(c => c.estado === 'feito').length,
  curso: xs.filter(c => c.estado === 'curso').length,
  falha: xs.filter(c => c.estado === 'falha').length,
  pend: xs.filter(c => c.estado === 'pend').length,
})

/** Linha do .status: "andando", "pronto", "falha" ou "bloqueado: motivo". */
const lerEstado = (txt: string): Pick<Relatorio, 'estado' | 'detalhe'> => {
  const l = (txt.split(/\r?\n/)[0] ?? '').trim()
  const m = /^(andando|pronto|falha|bloqueado)\b[:\s]*(.*)$/i.exec(l)
  if (!m) return { estado: 'outro', detalhe: l }
  return { estado: m[1]!.toLowerCase() as Relatorio['estado'], detalhe: m[2] ?? '' }
}

const ehAbsoluto = (p: string) => /^([A-Za-z]:[\\/]|\/|\\\\)/.test(p)
const junta = (base: string, p: string) => (!p || ehAbsoluto(p) ? p : `${base.replace(/[\\/]+$/, '')}/${p}`)
const pasta = (arq: string) => arq.replace(/[\\/][^\\/]*$/, '')

type Mem = { inicio: Map<string, number>; ultimo: Map<string, { ms: number; acao: string }>; fins: AgenteFim[]; cfg: () => Cfg }

// Configuracao: painel-etapas.config.json (userConfig `configFile`, ou na pasta da sessao) manda; sem ele valem os campos do userConfig.
async function carregarCfg($: EngineInterface, options: PluginOptions): Promise<Cfg> {
  const opt = (k: string) => (options[k] === undefined ? '' : String(options[k]))
  const cwd = await $.session.cwd()
  const doOpt: Cfg = { etapas: junta(cwd, opt('etapas')), repos: opt('repos'), intervalo: Number(options.intervaloSegundos ?? 60), relatorios: junta(cwd, opt('relatorios')), fila: junta(cwd, opt('fila')) }
  const configFile = opt('configFile')
  for (const arq of [configFile ? junta(cwd, configFile) : '', `${cwd.replace(/[\\/]+$/, '')}/painel-etapas.config.json`]) {
    if (!arq) continue
    try {
      const j = JSON.parse(await $.fs.read(arq)) as Record<string, unknown>
      const base = pasta(arq)
      const s = (v: unknown) => (typeof v === 'string' ? junta(base, v) : '')
      return {
        etapas: s(j.etapas),
        repos: Array.isArray(j.repos) ? j.repos.join(',') : typeof j.repos === 'string' ? j.repos : '',
        intervalo: typeof j.intervaloSegundos === 'number' ? j.intervaloSegundos : 60,
        relatorios: s(j.relatorios),
        fila: s(j.fila),
      }
    } catch { /* proximo candidato */ }
  }
  return doOpt
}

// Quem esta rodando agora: subagentes (API), relatorios .status (disco). O resto da aba vem de eventos.
async function lerAgora($: EngineInterface, mem: Mem) {
  const agoraMs = Date.now()
  const cfg = mem.cfg()
  const lista = await $.agent.list().catch(() => [])
  const linhas: AgenteLinha[] = lista.map(a => {
    if (!mem.inicio.has(a.id)) mem.inicio.set(a.id, agoraMs)
    const u = mem.ultimo.get(a.id)
    return { id: a.id, tipo: a.type, desc: a.description, nome: a.name ?? '', status: a.status, desdeMs: mem.inicio.get(a.id) ?? agoraMs, ultimoMs: u?.ms ?? 0, ultimaAcao: u?.acao ?? '' }
  })
  await update($, agentes, () => linhas)
  await update($, recentes, () => [...mem.fins])

  const rels: Relatorio[] = []
  if (cfg.relatorios) {
    try {
      const ents = await $.fs.list(cfg.relatorios)
      const nomes = new Set(ents.map(e => e.name))
      const sts = ents.filter(e => e.kind === 'file' && e.name.endsWith('.status')).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 30)
      for (const e of sts) {
        const nome = e.name.replace(/\.status$/, '')
        const st = lerEstado(await $.fs.read(`${cfg.relatorios}/${e.name}`).catch(() => ''))
        let titulo = nome
        if (nomes.has(`${nome}.md`)) {
          const md = await $.fs.read(`${cfg.relatorios}/${nome}.md`).catch(() => '')
          const h = md.split(/\r?\n/).find(l => l.startsWith('#'))
          if (h) titulo = h.replace(/^#+\s*/, '').trim()
        }
        rels.push({ nome, ...st, titulo, mtimeMs: e.mtimeMs })
      }
    } catch { /* pasta ausente: a aba diz que nao ha relatorios */ }
  }
  await update($, relatorios, () => rels)
  await update($, pulso, () => agoraMs)
}

export const register: Register = (on, options) => {
  let timer: { cancel(): void } | undefined
  let ticks = 0
  let ultimoStatus = ''
  let ultimaFila = ''
  let cfg: Cfg = { etapas: '', repos: '', intervalo: 60, relatorios: '', fila: '' }
  let saida = ''
  // Medidas do proprio painel: a API nao diz desde quando um subagente roda nem o que fez por ultimo.
  const inicio = new Map<string, number>()
  const ultimo = new Map<string, { ms: number; acao: string }>()
  const fins: AgenteFim[] = []

  const mem = { inicio, ultimo, fins, cfg: () => cfg }

  // Observadores: so anotam e passam adiante. Nada de `$` aqui, para nunca atrasar uma ferramenta.
  on('tool.call', (_$, e, next) => {
    if (e.agentId !== undefined) ultimo.set(e.agentId, { ms: Date.now(), acao: 'tool' in e ? String(e.tool) : 'ferramenta' })
    return next(e)
  })
  on('turn.start', (_$, e, next) => {
    if (e.agentId !== undefined) ultimo.set(e.agentId, { ms: Date.now(), acao: 'novo turno' })
    return next(e)
  })
  on('classic.SubagentStop', async ($, e, next) => {
    fins.unshift({ id: e.agent_id, tipo: e.agent_type, fimMs: Date.now(), resumo: corta(e.last_assistant_message ?? '', 160) })
    fins.length = Math.min(fins.length, 10)
    await update($, recentes, () => [...fins])
    return next(e)
  })
  // Unico ponto em que a API expoe tarefas em segundo plano e crons da sessao: o Stop, no fim de cada turno.
  on('classic.Stop', async ($, e, next) => {
    await update($, fundo, () => ({
      quandoMs: Date.now(),
      tarefas: (e.background_tasks ?? []).map(t => ({ id: t.id, tipo: t.type, status: t.status, descricao: corta(t.command ?? t.description, 120) })),
      crons: (e.session_crons ?? []).map(c => ({ id: c.id, agenda: c.schedule, recorrente: c.recurring, prompt: corta(c.prompt, 100) })),
    }))
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'etapas', description: 'Abre o painel vivo de etapas, fila e o que roda agora' })
    cfg = await carregarCfg($, options)
    saida = cfg.etapas ? `${pasta(cfg.etapas)}/etapas-status.json` : ''
    const gerador = `${$.plugin.root}/scripts/atualizar-etapas.mjs`
    const passoGerar = Math.max(1, Math.ceil(Math.max(15, cfg.intervalo) / 5))

    // So atualiza o estado quando o arquivo mudou de verdade: sem redesenho a cada 5 s e sem reler a fila grande com a aba fechada.
    const lerStatus = async () => {
      if (!saida) { await update($, erro, () => 'Sem etapas.json configurado: crie painel-etapas.config.json (veja o README do plugin).'); return }
      try {
        const txt = await $.fs.read(saida)
        if (txt !== ultimoStatus) {
          ultimoStatus = txt
          await update($, dados, () => JSON.parse(txt) as Status)
        }
        await update($, erro, v => (v === '' ? v : ''))
      } catch (x) {
        await update($, erro, () => `etapas-status.json: ${String(x).slice(0, 120)}`)
      }
    }
    const lerFila = async () => {
      if (!cfg.fila) return
      try {
        const txt = await $.fs.read(cfg.fila)
        if (txt !== ultimaFila) {
          ultimaFila = txt
          const f = JSON.parse(txt)
          await update($, fila, () => (Array.isArray(f) ? f : f.itens) as Item[])
          const r = await $.fs.read(`${pasta(cfg.fila)}/rotulos.json`).then(t => JSON.parse(t)).catch(() => ({}))
          await update($, rotulos, () => r)
        }
      } catch { /* a aba Fila mostra vazio */ }
    }
    // Regera o status (le o GitHub); se esta superficie nao deixa rodar comandos, avisa e segue lendo o arquivo.
    const gerar = async () => {
      if (!cfg.etapas) return
      try {
        const args = ['node', gerador, '--etapas', cfg.etapas, '--saida', saida]
        if (cfg.repos) args.push('--repos', cfg.repos)
        const r = await $.process.run(args, { timeoutMs: 40000 })
        await update($, auto, () => (r.exitCode === 0 ? '' : `gerador saiu com ${r.exitCode}: ${corta(r.stderr, 80)}`))
      } catch (x) {
        await update($, auto, () => `atualização automática indisponível aqui: ${String(x).slice(0, 80)}`)
      }
    }

    await lerStatus()
    void gerar().then(lerStatus)
    void lerAgora($, mem)
    timer?.cancel()
    timer = $.clock.every(5000, () => {
      ticks += 1
      void (async () => {
        if (ticks % passoGerar === 0) await gerar()
        await lerStatus()
        const tab = await read($, aba)
        if (tab === 'fila') await lerFila()
        if (tab === 'agora') await lerAgora($, mem)
      })()
    })
    void $.ui.open({ id: PANE, title: 'Painel de etapas' })
    return next(e)
  })

  on('command.run', { command: 'etapas' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Painel de etapas' })
    return { text: 'Painel de etapas aberto.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const d = await read($, dados)
    const msg = await read($, erro)
    const aviso = await read($, auto)
    const id = await read($, sel)
    const tab = await read($, aba)
    const f = await read($, filtro)

    const ir = (t: Aba) => async () => {
      await update($, aba, () => t)
      if (t === 'fila') ultimaFila = ''
      if (t === 'agora') await lerAgora($, mem)
    }
    const aba3 = (t: Aba, nome: string) => (
      <Button key={`t-${t}`} onPress={ir(t)}>
        <Text bold={tab === t} color={tab === t ? 'claude' : 'inactive'}>{tab === t ? '● ' : '○ '}{nome}</Text>
      </Button>
    )
    const abas = (
      <Box marginBottom={1}>
        {aba3('etapas', 'Etapas')}
        <Text dimColor>    </Text>
        {cfg.fila ? aba3('fila', 'Fila do diretor') : null}
        {cfg.fila ? <Text dimColor>    </Text> : null}
        {aba3('agora', 'Agora')}
      </Box>
    )

    if (tab === 'agora') {
      const ags = await read($, agentes)
      const fim = await read($, recentes)
      const bg = await read($, fundo)
      const rels = await read($, relatorios)
      const agoraMs = (await read($, pulso)) || Date.now()
      const ordemRel = ['andando', 'bloqueado', 'falha', 'outro', 'pronto']
      const relsOrd = [...rels].sort((a, b) => ordemRel.indexOf(a.estado) - ordemRel.indexOf(b.estado) || b.mtimeMs - a.mtimeMs)
      return (
        <Box flexDirection="column">
          {abas}
          <Text bold>Subagentes desta sessão ({ags.filter(a => a.status === 'running' || a.status === 'waiting').length} rodando)</Text>
          {ags.length === 0 ? <Text dimColor>Nenhum subagente ativo.</Text> : null}
          {ags.map(a => (
            <Box key={`a-${a.id}`} flexDirection="column" borderStyle="round" borderColor={COR_AGENTE(a.status)} paddingX={1}>
              <Box justifyContent="space-between"><Text bold>{a.tipo}{a.nome ? ` · ${a.nome}` : ''}</Text><Text color={COR_AGENTE(a.status)} bold>{a.status}</Text></Box>
              {a.desc ? <Text>{corta(a.desc, 90)}</Text> : null}
              <Text dimColor>visto há {duracao(agoraMs - a.desdeMs)}{a.ultimoMs ? `  ·  última atividade: ${a.ultimaAcao} há ${duracao(agoraMs - a.ultimoMs)}` : '  ·  sem atividade registrada'}</Text>
            </Box>
          ))}
          {fim.length ? <Text bold>{'\n'}Terminaram há pouco</Text> : null}
          {fim.map(x => (
            <Box key={`f-${x.id}-${x.fimMs}`} flexDirection="column" paddingX={1}>
              <Text><Text color="success" bold>✓ </Text><Text bold>{x.tipo}</Text><Text dimColor> há {duracao(agoraMs - x.fimMs)}</Text></Text>
              {x.resumo ? <Text dimColor>{x.resumo}</Text> : null}
            </Box>
          ))}

          <Text bold>{'\n'}Tarefas em segundo plano e agendadas</Text>
          {bg === null ? <Text dimColor>Aparece ao fim do primeiro turno (a API só entrega isso no evento Stop).</Text> : (
            <Box flexDirection="column">
              <Text dimColor>no fim do último turno, há {duracao(agoraMs - bg.quandoMs)}</Text>
              {bg.tarefas.length === 0 && bg.crons.length === 0 ? <Text dimColor>Nada em segundo plano nem agendado.</Text> : null}
              {bg.tarefas.map(t => (<Text key={`b-${t.id}`}><Text color="warning" bold>{t.tipo} </Text>{t.descricao} <Text dimColor>({t.status})</Text></Text>))}
              {bg.crons.map(c => (<Text key={`c-${c.id}`}><Text color="suggestion" bold>cron {c.agenda}{c.recorrente ? '' : ' (uma vez)'} </Text>{c.prompt}</Text>))}
            </Box>
          )}

          <Text bold>{'\n'}Relatórios (.status){cfg.relatorios ? '' : ' - pasta não configurada'}</Text>
          {cfg.relatorios && relsOrd.length === 0 ? <Text dimColor>Nenhum .status em {cfg.relatorios}.</Text> : null}
          {relsOrd.map(r => (
            <Box key={`r-${r.nome}`} flexDirection="column" borderStyle="round" borderColor={COR_REL[r.estado]} paddingX={1}>
              <Box justifyContent="space-between"><Text bold>{corta(r.titulo, 46)}</Text><Text color={COR_REL[r.estado]} bold>{r.estado.toUpperCase()}</Text></Box>
              <Text dimColor>{r.nome} · {duracao(agoraMs - r.mtimeMs)} atrás{r.detalhe ? ` · ${corta(r.detalhe, 60)}` : ''}</Text>
            </Box>
          ))}
        </Box>
      )
    }

    if (tab === 'fila') {
      const lista = await read($, fila)
      const rr = await read($, rotulos)
      const ativos = lista.filter(i => i.status !== 'feito').sort((a, b) => ORDEM_FILA.indexOf(a.status) - ORDEM_FILA.indexOf(b.status) || a.id - b.id)
      return (
        <Box flexDirection="column">
          {abas}
          <Box flexWrap="wrap">
            {ORDEM_FILA.map(s => (
              <Box key={`r-${s}`} marginRight={2}><Text color={COR_FILA[s]} bold>{s} </Text><Text bold>{lista.filter(i => i.status === s).length}</Text></Box>
            ))}
          </Box>
          {ativos.length === 0 && <Text dimColor>Nada pendente na fila.</Text>}
          {ativos.map(i => {
            const cor = COR_FILA[i.status] ?? 'suggestion'
            const dep = (i.dependeDe ?? []).filter(x => lista.find(y => y.id === x)?.status !== 'feito')
            return (
              <Box key={`q${i.id}`} flexDirection="column" borderStyle="round" borderColor={cor} paddingX={1} marginTop={1}>
                <Box justifyContent="space-between"><Text bold>{tituloFila(i, rr[String(i.id)])}</Text><Text dimColor> #{i.id}</Text></Box>
                <Box>
                  <Text backgroundColor={cor} color="inverseText" bold> {i.status.toUpperCase()} </Text>
                  <Text dimColor>  {i.forca?.modelo}/{i.forca?.esforco}</Text>
                </Box>
                {i.bloqueio ? <Text color="error">bloqueio: {i.bloqueio}</Text> : null}
                {dep.length ? <Text dimColor>espera #{dep.join(', #')}</Text> : null}
              </Box>
            )
          })}
        </Box>
      )
    }

    if (msg) return <Box flexDirection="column">{abas}<Text color="error">{msg}</Text></Box>
    if (!d) return <Box flexDirection="column">{abas}<Text dimColor>Carregando…</Text></Box>

    const todas: Etapa[] = d.lanes.flatMap(l => l.c)
    const etapa = id === null ? undefined : todas.find(c => c.id === id)

    if (etapa) {
      const t = TEMA[etapa.estado]
      return (
        <Box flexDirection="column">
          {abas}
          <Button key="voltar" onPress={() => update($, sel, () => null)}><Text color="claude" bold>{'‹ voltar'}</Text></Button>
          <Box flexDirection="column" borderStyle="round" borderColor={t} backgroundColor={etapa.estado === 'pend' ? undefined : t} paddingX={2} paddingY={1} marginTop={1}>
            <Text bold color={etapa.estado === 'pend' ? 'text' : 'inverseText'}>{etapa.t}</Text>
            <Text color={etapa.estado === 'pend' ? 'inactive' : 'inverseText'}>{ROTULO[etapa.estado]}</Text>
          </Box>
          {etapa.prs.length ? <Text color="inactive">{'\n'}{etapa.prs.map(p => `#${p.n} ${p.situacao}`).join('  ·  ')}</Text> : null}
          <Text>{'\n'}<Text bold color="claude">O que é</Text>{'\n'}{etapa.o}</Text>
          <Text>{'\n'}<Text bold color="claude">Por que importa</Text>{'\n'}{etapa.p}</Text>
          <Text>{'\n'}<Text bold color="claude">Depende de</Text>{'\n'}{etapa.d}</Text>
          <Text>{'\n'}<Text bold color="claude">Próximo passo</Text>{'\n'}{etapa.x}</Text>
        </Box>
      )
    }

    const geral = contar(todas)
    const pct = todas.length ? Math.round((geral.feito / todas.length) * 100) : 0

    return (
      <Box flexDirection="column">
        {abas}
        <Text bold>{d.meta}</Text>

        <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="inactive" paddingX={1}>
          <Box justifyContent="space-between">
            <Text bold>Progresso geral</Text>
            <Text bold color="success">{pct}% concluído</Text>
          </Box>
          <Box>
            {segmentos(geral, 44).map(([s, q]) => (<Text key={`g-${s}`} color={TEMA[s]}>{'█'.repeat(q)}</Text>))}
          </Box>
          <Text color="inactive">{geral.feito} feitas · {geral.curso} em andamento · {geral.falha} com falha · {geral.pend} por começar</Text>
        </Box>
        <Text color="inactive">atualizado às {hora(d.geradoEm)}{d.erroGh ? `  ·  GitHub indisponível, usando o último estado` : `  ·  sincroniza com o GitHub a cada ${cfg.intervalo} s`}</Text>
        {aviso ? <Text color="warning">{aviso}</Text> : null}

        <Box marginTop={1} flexWrap="wrap">
          <Button key="f-todos" onPress={() => update($, filtro, () => 'todos')}>
            <Text bold={f === 'todos'} color={f === 'todos' ? 'inverseText' : 'text'} backgroundColor={f === 'todos' ? 'text' : undefined}>{f === 'todos' ? ' ✓ ' : ' '}Todos {todas.length} </Text>
          </Button>
          {ESTADOS.map(s => {
            const ativo = f === s
            const nome = ROTULO[s].charAt(0) + ROTULO[s].slice(1).toLowerCase()
            return (
              <Box key={`fb-${s}`} marginLeft={1}>
                <Button key={`f-${s}`} onPress={() => update($, filtro, () => (ativo ? 'todos' : s))}>
                  <Text bold={ativo} color={ativo ? 'inverseText' : TEMA[s]} backgroundColor={ativo ? TEMA[s] : undefined}>{ativo ? ' ✓ ' : ' ● '}{nome} {geral[s]} </Text>
                </Button>
              </Box>
            )
          })}
        </Box>

        {d.lanes.map(l => {
          const vis = l.c.filter(c => f === 'todos' || c.estado === f)
          if (!vis.length) return null
          const lc = contar(l.c)
          return (
            <Box key={`l-${l.n}`} flexDirection="column" marginTop={1}>
              <Box justifyContent="space-between">
                <Text bold>{l.n.toUpperCase()}</Text>
                <Box>
                  {segmentos(lc, 12).map(([s, q]) => (<Text key={`lb-${l.n}-${s}`} color={TEMA[s]}>{'█'.repeat(q)}</Text>))}
                  <Text color="inactive"> {lc.feito}/{l.c.length}</Text>
                </Box>
              </Box>
              {vis.map(c => {
                const t = TEMA[c.estado]
                const cheio = c.estado !== 'pend'
                return (
                  <Box key={`c-${c.id}`} flexDirection="column" borderStyle="round" borderColor={t} backgroundColor={cheio ? t : undefined} paddingX={1} marginTop={1}>
                    <Box justifyContent="space-between">
                      <Button key={`b-${c.id}`} onPress={() => update($, sel, () => c.id)}>
                        <Text bold color={cheio ? 'inverseText' : 'text'}>{c.t}</Text>
                      </Button>
                      <Text color={cheio ? 'inverseText' : 'inactive'}>{c.prs.length ? (c.prs.length === 1 ? `#${c.prs[0]!.n}` : `${c.prs.length} PRs`) : ''}</Text>
                    </Box>
                    <Text color={cheio ? 'inverseText' : 'inactive'}>{ROTULO[c.estado].charAt(0) + ROTULO[c.estado].slice(1).toLowerCase()}</Text>
                  </Box>
                )
              })}
            </Box>
          )
        })}
      </Box>
    )
  })
}
