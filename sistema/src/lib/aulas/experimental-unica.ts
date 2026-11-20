export const nomeIdentidade = (nome:string) => nome.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().replace(/\s+/g," ").trim();
export const avisoExperimentalUnica = "Cada pessoa pode fazer uma única aula experimental gratuita. Você já tem uma registrada; para remarcar, fale com a equipe pelo WhatsApp.";
export function temExperimentalConfirmada(aluno:{nome:string;telefone:string},reservas:{nome:string;telefone:string;status:string}[]) {
 return reservas.some(r=>r.status==="confirmada" && r.telefone===aluno.telefone && nomeIdentidade(r.nome)===nomeIdentidade(aluno.nome));
}
