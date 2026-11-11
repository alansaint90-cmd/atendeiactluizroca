"use server";
import { executar } from "../acao";
import { exigirSessao } from "../auth/sessao";
import { exigirPermissao } from "../auth/permissoes";
import { db } from "../db/client";
import { consultarAulas, criarAula, reservarAula, cancelarReservaAula } from "../aulas/repository";

export async function carregarAgendaAulas() {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin"); return consultarAulas(db()); });
}
export async function cadastrarAula(entrada: unknown) {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin"); return criarAula(db(), entrada, sessao.userId); });
}
export async function confirmarAula(entrada: unknown) {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin"); return reservarAula(db(), entrada, sessao.userId); });
}
export async function cancelarAula(entrada: unknown) {
  return executar(async () => { const sessao = await exigirSessao(); await exigirPermissao(sessao, "admin"); return cancelarReservaAula(db(), entrada, sessao.userId); });
}
