import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PerfilPainel } from "@/app/perfil/_components/perfil-painel";
import { PerfilDados } from "@/app/perfil/_components/perfil-dados";
import { Senha } from "@/app/perfil/_components/senha";
import { trocarMinhaSenha } from "@/lib/actions/seguranca";
import { salvarMeuPerfil } from "@/lib/actions/perfil";
import { salvarEmpresa } from "@/lib/actions/empresa";
import { FormularioEmpresa } from "@/components/empresa/formulario-empresa";

const navegar = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navegar, replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/actions/sessoes", () => ({ sairDoSistema: vi.fn() }));
vi.mock("@/lib/actions/seguranca", () => ({ trocarMinhaSenha: vi.fn() }));
vi.mock("@/lib/actions/perfil", () => ({ salvarMeuPerfil: vi.fn() }));
vi.mock("@/lib/actions/empresa", () => ({ salvarEmpresa: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test("meu cadastro mantém menu lateral e as opções da conta", () => {
  render(<PerfilPainel papel="admin" email="wellington@exemplo.com"><h1>Meu cadastro</h1></PerfilPainel>);
  expect(screen.getByRole("navigation", { name: "Menu principal" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Atende IA Pro" })).toHaveTextContent(/^Atende IA Pro$/);
  expect(screen.getByText("CT Luiz Roca").closest(".account")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Configurações" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Chatbot IA" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Meu cadastro" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Abrir opções da conta" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Minha assinatura" }));
  expect(navegar).toHaveBeenCalledWith("/?view=plans");
  fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
  expect(navegar).toHaveBeenCalledWith("/?view=dashboard");
});

test("menu da conta usa nome e foto da empresa, com edição em Configurações", () => {
  const foto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
  const empresa = { nome: "CT2H", foto, atualizadoEm: "2026-11-23T12:00:00.000Z" };
  const { container } = render(<PerfilPainel papel="super_admin" email="allan@exemplo.com" empresa={empresa}><h1>Meu cadastro</h1></PerfilPainel>);
  expect(screen.getByText("CT2H").closest(".account")).toBeInTheDocument();
  expect(container.querySelector(".account-avatar img")).toHaveAttribute("src", foto);
  expect(container.querySelector(".topbar")).not.toHaveTextContent("CT2H");
  fireEvent.click(screen.getByRole("button", { name: "Configurações" }));
  expect(navegar).toHaveBeenCalledWith("/?view=settings");
});

test("editar o nome da empresa atualiza a identidade da conta com o valor salvo", async () => {
  const inicial = { nome: "CT Luiz Roca", foto: null, atualizadoEm: "2026-11-23T12:00:00.000Z" };
  const salva = { ...inicial, nome: "Academia Teste", atualizadoEm: "2026-11-23T12:01:00.000Z" };
  const atualizarConta = vi.fn();
  vi.mocked(salvarEmpresa).mockResolvedValue({ ok: true, dados: salva });
  render(<FormularioEmpresa inicial={inicial} aoSalvar={atualizarConta} />);
  fireEvent.change(screen.getByLabelText("Nome da empresa"), { target: { value: salva.nome } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar identidade" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Identidade da empresa salva.");
  expect(salvarEmpresa).toHaveBeenCalledWith({ ...inicial, nome: salva.nome });
  expect(atualizarConta).toHaveBeenCalledWith(salva);
});

test("redefinição de senha recusa confirmação diferente antes de chamar o servidor", () => {
  render(<Senha />);
  fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "senha longa para primeiro teste" } });
  fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "senha longa diferente de teste" } });
  fireEvent.click(screen.getByRole("button", { name: "Redefinir senha" }));
  expect(screen.getByRole("alert")).toHaveTextContent("não corresponde");
  expect(trocarMinhaSenha).not.toHaveBeenCalled();
});

test("meus dados salvam nome e celular e mostram confirmação", async () => {
  vi.mocked(salvarMeuPerfil).mockResolvedValue({ ok: true, dados: { nome: "Novo nome", email: "pessoa@exemplo.test", celular: "(11) 98765-4321", foto: null, version: 2 } });
  render(<PerfilDados inicial={{ nome: "Nome anterior", email: "pessoa@exemplo.test", celular: "", foto: null, version: 1 }} />);
  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Novo nome" } });
  fireEvent.change(screen.getByLabelText("Celular"), { target: { value: "(11) 98765-4321" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Cadastro atualizado");
  expect(salvarMeuPerfil).toHaveBeenCalledWith({ nome: "Novo nome", celular: "(11) 98765-4321", foto: null, version: 1 });
  expect(screen.getByText("pessoa@exemplo.test")).toBeInTheDocument();
});
