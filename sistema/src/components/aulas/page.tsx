"use client";
import { useCallback, useEffect, useState } from "react";
import { carregarAgendaAulas, cadastrarAula, confirmarAula, cancelarAula } from "@/lib/actions/aulas";
import type { AgendaAulas } from "@/lib/aulas/schema";
import { AgendaAulasPainel } from "./agenda";

export function AulasPage({ ativoNaTela }: { ativoNaTela: boolean }) {
  const [dados, setDados] = useState<AgendaAulas | null>(null), [erro, setErro] = useState("");
  const carregar = useCallback(async () => { try { const r = await carregarAgendaAulas(); if (!r.ok) throw new Error(r.erro); setDados(r.dados); setErro(""); } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao consultar a agenda."); } }, []);
  useEffect(() => { if (!ativoNaTela) return; const timer = setTimeout(() => void carregar(), 0); return () => clearTimeout(timer); }, [ativoNaTela, carregar]);
  async function salvar(operacao: Promise<{ ok: boolean; erro?: string }>) { const r = await operacao; if (!r.ok) throw new Error(r.erro); await carregar(); }
  return <>{erro && <p role="alert">{erro} <button onClick={() => void carregar()}>Tentar novamente</button></p>}{!dados ? <p role="status">{erro ? "Agenda indisponível." : "Carregando agenda de aulas…"}</p> : <AgendaAulasPainel dados={dados} porta={{ criar: a => salvar(cadastrarAula(a)), reservar: r => salvar(confirmarAula(r)), cancelar: r => salvar(cancelarAula(r)) }} />}</>;
}
