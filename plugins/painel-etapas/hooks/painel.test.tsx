import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'painel-etapas',
  component: 'Pane',
  requestId: 'painel-etapas',
  props: { title: 'Painel de etapas', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

test('o painel monta em todas as superficies', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(ui).toBeDefined()
    await ui.unmount()
  }
})

test('a aba Agora abre e mostra as secoes, sem subagentes', async ($, on) => {
  on('agent.list', () => ({ value: [] }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 't-agora' })
    expect((await ui.find({ type: 'Text', text: /Subagentes desta sess/ }))?.text).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /Nenhum subagente ativo/ }))?.text).toBeDefined()
    await ui.unmount()
  }
})
