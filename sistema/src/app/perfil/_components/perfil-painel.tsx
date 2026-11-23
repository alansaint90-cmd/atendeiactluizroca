"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Papel } from "@/lib/db/schema/_enums";
import { PainelShell } from "@/components/painel-shell";
import type { DadosEmpresa } from "@/lib/empresa/dados";

interface PerfilPainelProps {
  papel: Papel;
  email: string;
  empresa?: DadosEmpresa;
  children: ReactNode;
}

export function PerfilPainel({ papel, email, empresa, children }: PerfilPainelProps) {
  const router = useRouter();
  const navegar = (rota: string) => router.push(`/?view=${encodeURIComponent(rota)}`);
  return <PainelShell papel={papel} email={email} empresa={empresa} rota="perfil" titulo="Meu cadastro" aoNavegar={navegar}>
    <main className="content profile-content">{children}</main>
  </PainelShell>;
}
