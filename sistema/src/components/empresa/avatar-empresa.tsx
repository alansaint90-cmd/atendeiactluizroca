import Image from "next/image";
import type { DadosEmpresa } from "@/lib/empresa/dados";

export function AvatarEmpresa({ nome, foto, tamanho = 36 }: Pick<DadosEmpresa, "nome" | "foto"> & { tamanho?: number }) {
  const iniciais = nome.trim().split(/\s+/u).slice(0, 2).map(palavra => Array.from(palavra)[0]?.toLocaleUpperCase("pt-BR")).join("");
  return <span className="empresa-avatar" aria-hidden="true" style={{ width: tamanho, height: tamanho }}>
    {foto ? <Image unoptimized src={foto} alt="" width={tamanho} height={tamanho} /> : iniciais}
  </span>;
}
