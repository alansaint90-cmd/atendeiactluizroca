import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AgendaAulasPainel, type PortaAgenda } from "@/components/aulas/agenda";
import { alvoAulaSchema, type Aula, type ReservaAula } from "@/lib/aulas/schema";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const muayThai: Aula = {
  id: "muay-thai", modalidade: "Muay Thai", turma: "Geral", professor: "Professor Teste",
  inicio: "2030-01-07T18:45:00.000Z", diaSemana: 1, duracao: 60, capacidade: null,
  idadeMinima: 14, idadeMaxima: 120, atualizadoEm: "2030-01-01T12:00:00.000Z",
};
const aluno: ReservaAula = {
  id: "b159d753-3525-438e-b91b-e5a217a87977", aulaId: muayThai.id, solicitacaoId: "solicitacao-1", status: "confirmada",
  nome: "Aluno Teste Um", telefone: "+12025550100", idade: 20, responsavel: "",
  atualizadoEm: muayThai.atualizadoEm,
};

test("lista as aulas e permite consultar alunos sem abrir o formulário de reserva", () => {
  const taekwondo: Aula = { ...muayThai, id: "taekwondo", modalidade: "Taekwondo" };
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

test("envia somente a identificação e a versão da reserva depois de confirmar o cancelamento", async () => {
  vi.useFakeTimers();
  const cancelar = vi.fn<PortaAgenda["cancelar"]>(async alvo => { alvoAulaSchema.parse(alvo); });
  render(<AgendaAulasPainel
    dados={{ aulas: [muayThai], reservas: [aluno] }}
    porta={{ criar: vi.fn(), cancelar }}
  />);

  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  const dialogo = within(screen.getByRole("alertdialog", { name: "Cancelar reserva" }));
  const confirmar = dialogo.getByRole("button", { name: "Confirmar" });
  expect(confirmar).toBeDisabled();
  expect(cancelar).not.toHaveBeenCalled();
  for (let segundo = 0; segundo < 3; segundo++) act(() => vi.advanceTimersByTime(1000));
  await act(async () => { fireEvent.click(confirmar); });

  expect(cancelar.mock.calls).toEqual([[{ id: aluno.id, atualizadoEm: aluno.atualizadoEm }]]);
  expect(screen.getByRole("status")).toHaveTextContent("Alteração salva na agenda do CT.");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
