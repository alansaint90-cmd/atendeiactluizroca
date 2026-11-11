import type { Metadata } from "next";
import "@/styles/base.css";
import "@/styles/layout.css";
import "@/styles/features.css";
import "@/styles/improvements.css";
import "@/styles/ui.css";
import "@/styles/automation.css";
import "@/styles/marca.css";
import "@/styles/conta-menu.css";
import "@/styles/perfil.css";
import "@/styles/painel-operacional.css";
import "@/styles/design-juliana.css";
import "@/styles/ct-luiz-roca.css";

export const metadata: Metadata = { title: "Atende Aí | CT Luiz Roca", description: "Atendimento de novos alunos e agendamento de aulas experimentais do Centro de Treinamento Luiz Roca." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
