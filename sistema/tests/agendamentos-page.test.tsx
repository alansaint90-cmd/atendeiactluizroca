import { afterEach,expect,test,vi } from "vitest";
import { cleanup,fireEvent,render,screen,act } from "@testing-library/react";
import { AgendamentosPage } from "@/components/agendamentos/page";
import { MenuFila } from "@/components/agendamentos/menu-fila";
import { carregarFilaMensagens,alterarFilaMensagens } from "@/lib/actions/fila-mensagens";
import type { MensagemFila } from "@/lib/agendamentos/fila-schema";
vi.mock("@/lib/actions/fila-mensagens",()=>({carregarFilaMensagens:vi.fn(),alterarFilaMensagens:vi.fn()}));
vi.mock("@/lib/actions/agendamentos",()=>({gravarAgendamento:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();vi.useRealTimers();});
const item=(origem:MensagemFila["origem"],id:string):MensagemFila=>({origem,id,versao:"1",data:"2026-11-19T10:00:00Z",telefone:"+5511999999999",instancia:"teste",mensagem:"Mensagem "+origem,status:"pendente",origemNome:origem==="campanha"?"Campanha novembro":origem==="followup"?"Follow-up · etapa 1":"Envio individual",lixeira:false,previsao:origem==="campanha"});
const carga=(itens:MensagemFila[],avisos:string[]=[])=>vi.mocked(carregarFilaMensagens).mockResolvedValue({ok:true,dados:{itens,avisos,instancias:['teste'],ativo:true}});
async function confirmar(){for(let i=0;i<3;i++)await act(()=>vi.advanceTimersByTimeAsync(1000));await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Confirmar"}));});vi.useRealTimers();}
test("menu foca opção habilitada e fecha com Escape mesmo com a primeira desabilitada",()=>{
 render(<MenuFila rotulo="Ações"><button disabled>Indisponível</button><button>Disponível</button></MenuFila>);
 const abrir=screen.getByRole('button',{name:'Ações'});fireEvent.click(abrir);
 expect(screen.getByRole('button',{name:'Disponível'})).toHaveFocus();
 fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('menu')).not.toBeInTheDocument();expect(abrir).toHaveFocus();
});
test("lista mostra origem e cancela selecionadas somente depois da confirmação",async()=>{
 carga([item("campanha","a"),item("followup","b"),item("individual","c")]);vi.mocked(alterarFilaMensagens).mockResolvedValue({ok:true,dados:{alterados:3,naoAlterados:0,avisos:[]}});
 render(<AgendamentosPage/>);await screen.findByText("Campanha novembro");expect(screen.getByText("Follow-up · etapa 1")).toBeInTheDocument();expect(screen.getByRole("columnheader",{name:"Origem"})).toBeInTheDocument();expect(screen.getByText("+ Novo agendamento")).toBeEnabled();
 fireEvent.click(screen.getByRole("checkbox",{name:"Selecionar todas deste filtro"}));fireEvent.click(screen.getByRole("button",{name:"Opções da lista",exact:true}));vi.useFakeTimers();fireEvent.click(screen.getByText("Cancelar selecionadas (3)"));expect(alterarFilaMensagens).not.toHaveBeenCalled();await confirmar();
 expect(alterarFilaMensagens).toHaveBeenCalledWith({acao:"cancelar",alvos:[{id:"a",origem:"campanha",versao:"1"},{id:"b",origem:"followup",versao:"1"},{id:"c",origem:"individual",versao:"1"}]});
});
test("lixeira permite restaurar sem reativar e lista parcial bloqueia todas",async()=>{
 carga([{...item("campanha","a"),lixeira:true,status:"cancelado"}], ["Lista parcial"]);vi.mocked(alterarFilaMensagens).mockResolvedValue({ok:true,dados:{alterados:1,naoAlterados:0,avisos:[]}});
 render(<AgendamentosPage/>);await screen.findByText("Lista parcial");fireEvent.click(screen.getByRole("button",{name:"Lixeira",exact:true}));expect(screen.getByText("Campanha novembro")).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Opções da lista",exact:true}));expect(screen.getByText("Restaurar todas deste filtro")).toBeDisabled();
 fireEvent.click(screen.getByRole("button",{name:"Opções de Campanha novembro para +5511999999999"}));vi.useFakeTimers();fireEvent.click(screen.getByRole("button",{name:"Restaurar registro",exact:true}));expect(screen.getByText(/Nenhum envio será reativado/)).toBeInTheDocument();await confirmar();expect(alterarFilaMensagens).toHaveBeenCalledWith(expect.objectContaining({acao:"restaurar"}));
});

test("confirmação inclui etapas pendentes da mesma aula fora do filtro",async()=>{
 const primeiro={...item('aula','a'),origemNome:'Follow-up da aula · etapa 1',cicloFollowup:'ciclo'};
 const segundo={...item('aula','b'),origemNome:'Follow-up da aula · etapa 2',cicloFollowup:'ciclo'};
 carga([primeiro,segundo]);render(<AgendamentosPage/>);await screen.findByText(primeiro.origemNome);
 fireEvent.click(screen.getByPlaceholderText('Telefone, chip, mensagem ou campanha'),{target:{value:''}});
 fireEvent.change(screen.getByPlaceholderText('Telefone, chip, mensagem ou campanha'),{target:{value:'etapa 1'}});
 fireEvent.click(screen.getByRole('button',{name:`Opções de ${primeiro.origemNome} para ${primeiro.telefone}`}));fireEvent.click(screen.getByRole('button',{name:'Cancelar envio',exact:true}));
 expect(screen.getByText(/2 registro\(s\) selecionado/)).toBeInTheDocument();expect(screen.getByText(/etapas pendentes da mesma aula/)).toBeInTheDocument();
});

test("preserva criação e edição individual na central",async()=>{carga([item("individual","c")]);render(<AgendamentosPage/>);await screen.findByText("Envio individual");fireEvent.click(screen.getByText("+ Novo agendamento"));expect(screen.getByRole("heading",{name:"Novo agendamento individual"})).toBeInTheDocument();fireEvent.click(screen.getByText("Fechar formulário"));fireEvent.click(screen.getByRole("button",{name:"Opções de Envio individual para +5511999999999"}));fireEvent.click(screen.getByText("Editar envio individual"));expect(screen.getByRole("heading",{name:"Editar envio individual"})).toBeInTheDocument();expect(screen.getByLabelText("Telefone com código do país")).toHaveValue("+5511999999999");});
