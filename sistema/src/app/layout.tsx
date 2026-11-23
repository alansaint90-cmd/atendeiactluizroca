import type { Metadata } from "next";
import localFont from "next/font/local";
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
import "@/styles/conversas.css";
import "@/styles/campanhas.css";
import "@/styles/atende-pro.css";
import "@/styles/empresa.css";

const inter = localFont({ src: "./_fonts/inter-latin.woff2", weight: "100 900", variable: "--fonte-atende-pro", display: "swap" });

export const metadata: Metadata = { title: "Atende IA Pro | CT Luiz Roca", description: "Atendimento de novos alunos e agendamento de aulas experimentais do Centro de Treinamento Luiz Roca." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" className={inter.variable}><body>{children}</body></html>;
}
