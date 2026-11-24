// Teste offline do gerador: node scripts/atualizar-etapas.selftest.mjs
import assert from "node:assert/strict";
import { calcular, estadoDoPr } from "./atualizar-etapas.mjs";

const pr = (n, state, extra = {}) => ({ number: n, state, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", headRefName: `b${n}`, repo: "a/b", ...extra });
const etapas = { meta: "m", lanes: [{ n: "L", c: [
  { id: "x", t: "X", o: "", p: "", d: "", x: "", prs: [1, 2] },
  { id: "y", t: "Y", o: "", p: "", d: "", x: "", prs: ["a/b#3"] },
  { id: "z", t: "Z", o: "", p: "", d: "", x: "", branches: ["b9"] },
  { id: "w", t: "W", o: "", p: "", d: "", x: "", estado: "curso" },
] }] };

const r = calcular(etapas, [pr(1, "MERGED"), pr(2, "OPEN", { mergeable: "CONFLICTING" }), pr(3, "MERGED", { repo: "outro/repo" }), pr(9, "OPEN")]);
const por = Object.fromEntries(r.lanes[0].c.map((c) => [c.id, c.estado]));
assert.equal(por.x, "falha");   // um PR com conflito vence o mesclado
assert.equal(por.y, "pend");    // "a/b#3" nao casa com o PR 3 de outro repositorio (sem PR achado: cai no estado padrao)
assert.equal(por.z, "curso");   // casou pela branch
assert.equal(por.w, "curso");   // sem PR vale o estado escrito
assert.equal(estadoDoPr(pr(5, "CLOSED")), "pend");
console.log("ok: gerador");
