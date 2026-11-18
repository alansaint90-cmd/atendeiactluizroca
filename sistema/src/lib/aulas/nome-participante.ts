/** Descrições de gênero na transcrição não integram o nome civil. */
export function limparNomeParticipante(nome: string) {
 return nome.trim().replace(/^(?:homem|mulher|masculino|feminino)\b[\s,:;-]+/iu,'').trim();
}
