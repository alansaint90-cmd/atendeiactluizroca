import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AgendaAulasPainel } from "@/components/aulas/agenda";
import type { Aula, ReservaAula } from "@/lib/aulas/schema";

afterEach(cleanup);

test("lista as aulas e permite consultar alunos sem abrir o formulário de reserva", () => {
  const muayThai: Aula = {
    id: "muay-thai", modalidade: "Muay Thai", turma: "Geral", professor: "Professor Teste",
    inicio: "2030-01-07T18:45:00.000Z", diaSemana: 1, duracao: 60, capacidade: null,
    idadeMinima: 14, idadeMaxima: 120, atualizadoEm: "2030-01-01T12:00:00.000Z",
  };
  const taekwondo: Aula = { ...muayThai, id: "taekwondo", modalidade: "Taekwondo" };
  const aluno: ReservaAula = {
    id: "reserva-1", aulaId: muayThai.id, solicitacaoId: "solicitacao-1", status: "confirmada",
    nome: "Aluno Teste Um", telefone: "+12025550100", idade: 20, responsavel: "",
    atualizadoEm: muayThai.atualizadoEm,
  };
  render(<AgendaAulasPainel
    dados={{ aulas: [muayThai, taekwondo], reservas: [
      aluno,
      { ...aluno, id: "reserva-2", aulaId: taekwondo.id, solicitacaoId: "solicitacao-2", nome: "Aluno Teste Dois" },
    ] }}
    porta={{ criar: vi.fn(), cancelar: vi.fn() }}
  />);

  const lista = within(screen.getByRole("list", { name: "Aulas cadastradas" }));
  expect(lista.getAllByRole("listitem")).toHaveLength(2);
  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar modalidade" }), { target: { value: "Muay" } });
  expect(lista.getAllByRole("listitem")).toHaveLength(1);
  const verAlunos = lista.getByRole("button", { name: /Ver alunos de Muay Thai/ });
  fireEvent.click(verAlunos);
  expect(verAlunos).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("heading", { name: "Alunos agendados" })).toHaveFocus();
  expect(screen.getByText(aluno.nome)).toBeInTheDocument();
  expect(screen.queryByText("Aluno Teste Dois")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /Reservar experimental/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Conferir reserva" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Ver todas as aulas" }));
  expect(screen.getByText("Aluno Teste Dois")).toBeInTheDocument();
});
