// Gera o etapas-status.json a partir de um etapas.json + os PRs do GitHub (gh, somente leitura).
// Uso: node atualizar-etapas.mjs --etapas <etapas.json> [--saida <etapas-status.json>] [--repos dono/repo,dono/repo2]
// Sem --repos usa o campo "repo" do etapas.json. Sem --saida grava ao lado do etapas.json.
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Estado de um PR: feito (mesclado), falha (aberto com conflito ou bloqueado), curso (aberto), pend (fechado sem mesclar). */
export function estadoDoPr(pr) {
  if (pr.state === "MERGED") return "feito";
  if (pr.state === "CLOSED") return "pend";
  if (pr.mergeable === "CONFLICTING" || ["DIRTY", "BLOCKED"].includes(pr.mergeStateStatus)) return "falha";
  return "curso";
}

// item.prs aceita 15 (qualquer repositorio) ou "dono/repo#15" (so aquele repositorio).
const citaPr = (item, p) => (item.prs ?? []).some((x) => x === p.number || x === `${p.repo}#${p.number}`);

/** Junta os estados dos PRs de um item: falha vence curso, curso vence feito; todos mesclados = feito. */
export function estadoDoItem(item, prs) {
  const achados = prs.filter((p) => citaPr(item, p) || (item.branches ?? []).includes(p.headRefName));
  if (!achados.length) return { estado: item.estado ?? "pend", prs: [] };
  const es = achados.map(estadoDoPr);
  const estado = es.includes("falha") ? "falha" : es.includes("curso") ? "curso" : es.every((e) => e === "feito") ? "feito" : "pend";
  return { estado, prs: achados.map((p) => ({ n: p.number, estado: estadoDoPr(p), situacao: p.state === "OPEN" ? `${p.mergeable} ${p.mergeStateStatus}` : p.state })) };
}

export function calcular(etapas, prs) {
  return {
    meta: etapas.meta,
    lanes: etapas.lanes.map((l) => ({ n: l.n, c: l.c.map((i) => ({ id: i.id, t: i.t, o: i.o, p: i.p, d: i.d, x: i.x, ...estadoDoItem(i, prs) })) })),
  };
}

function prsDoGithub(repo) {
  const saida = execFileSync("gh", ["pr", "list", "--repo", repo, "--state", "all", "--limit", "80", "--json", "number,title,state,mergeable,mergeStateStatus,headRefName"], { encoding: "utf8", timeout: 25000, windowsHide: true });
  return JSON.parse(saida).map((p) => ({ ...p, repo }));
}

const arg = (nome) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

function principal() {
  const entrada = arg("etapas");
  if (!entrada) { console.error("faltou --etapas <etapas.json>"); process.exit(2); }
  const saida = arg("saida") ?? join(dirname(entrada), "etapas-status.json");
  const etapas = JSON.parse(readFileSync(entrada, "utf8"));
  const repos = (arg("repos") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!repos.length && etapas.repo) repos.push(etapas.repo);
  let prs = [], erroGh = "";
  try { for (const r of repos) prs = prs.concat(prsDoGithub(r)); } catch (e) { erroGh = String(e.message ?? e).split("\n")[0].slice(0, 160); }
  let resultado = calcular(etapas, prs);
  if (erroGh && existsSync(saida)) {
    // sem rede ou sem gh: mantem os estados da ultima geracao boa e avisa
    try { resultado = { ...JSON.parse(readFileSync(saida, "utf8")) }; } catch { /* usa o calculado sem PRs */ }
  }
  resultado.geradoEm = new Date().toISOString();
  resultado.erroGh = erroGh;
  const tmp = saida + ".tmp";
  writeFileSync(tmp, JSON.stringify(resultado, null, 2));
  renameSync(tmp, saida);
  console.log(`etapas-status.json atualizado (${prs.length} PRs lidos${erroGh ? ", gh falhou: " + erroGh : ""})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) principal();
