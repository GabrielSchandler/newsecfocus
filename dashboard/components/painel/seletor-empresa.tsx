"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import type { EmpresaCliente } from "@/lib/tipos";

interface Props {
  empresas: EmpresaCliente[];
  empresaAtual: string;
}

/**
 * Troca a empresa em foco. Só aparece para a operação da NewSec — a empresa
 * cliente não tem o que escolher, e o banco recusa o parâmetro para ela de
 * qualquer forma (org_em_foco devolve NULL e a consulta volta vazia).
 *
 * A escolha vai para a URL junto com o resto do recorte, então o link continua
 * compartilhável e o "voltar" do navegador funciona.
 */
export function SeletorEmpresa({ empresas, empresaAtual }: Props) {
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();

  if (empresas.length === 0) return null;

  function trocar(id: string) {
    const novos = new URLSearchParams(params.toString());
    novos.set("empresa", id);
    // Escopo da empresa anterior não vale na nova: equipe e pessoa são outras.
    novos.delete("equipe");
    novos.delete("colaborador");
    novos.delete("dispositivo");
    novos.delete("pagina");
    router.push(`${caminho}?${novos.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Building2 className="hidden h-4 w-4 shrink-0 text-violet-400 sm:block" />
      <Select
        aria-label="Empresa em foco"
        className="w-[11rem] sm:w-56"
        valor={empresaAtual}
        aoMudar={trocar}
        opcoes={empresas.map((e) => ({
          valor: e.id,
          rotulo: e.status === "ATIVA" ? e.nome : `${e.nome} · ${e.status.toLowerCase()}`,
        }))}
      />
    </div>
  );
}
