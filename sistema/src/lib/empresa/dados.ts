export interface DadosEmpresa {
  nome: string;
  foto: string | null;
  atualizadoEm: string;
}

export const empresaPadrao = { nome: "CT Luiz Roca", foto: null } satisfies Pick<DadosEmpresa, "nome" | "foto">;
