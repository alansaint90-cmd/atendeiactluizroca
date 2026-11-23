"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Papel } from "@/lib/db/schema/_enums";
import { PainelShell } from "@/components/painel-shell";
import type { DadosEmpresa } from "@/lib/empresa/dados";

interface PerfilPainelProps {
  papel: Papel;
  nome: string;
  email: string;
  foto?: string | null;
  empresa?: DadosEmpresa;
  children: ReactNode;
}

export function PerfilPainel({ papel, nome, email, foto, empresa, children }: PerfilPainelProps) {
  const router = useRouter();
  const navegar = (rota: string) => router.push(`/?view=${encodeURIComponent(rota)}`);
  return <PainelShell papel={papel} nome={nome} email={email} foto={foto} empresa={empresa} rota="perfil" titulo="Meu cadastro"
    aoNavegar={navegar} aoEditarEmpresa={() => navegar("settings")}>
    <main className="content profile-content">{children}</main>
  </PainelShell>;
}
