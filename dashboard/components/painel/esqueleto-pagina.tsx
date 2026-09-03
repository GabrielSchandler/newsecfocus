import { Card } from "@/components/ui/card";

/**
 * Estado de carregamento genérico do painel. Sem isso, uma troca de filtro
 * (ou qualquer navegação) deixava a tela anterior parada na cara do usuário
 * até a resposta do servidor chegar inteira — parecia travado, mesmo quando
 * a resposta vinha rápido. O App Router mostra isto automaticamente a partir
 * do loading.tsx de cada rota, então o clique já dá retorno visual na hora.
 */
export function EsqueletoPagina() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="h-5 w-40 rounded bg-slate-800/70" />
          <div className="h-3 w-64 rounded bg-slate-800/50" />
        </div>
        <div className="h-8 w-28 rounded-lg bg-slate-800/70" />
      </div>

      <Card className="h-24 p-4">
        <div className="h-full rounded-lg bg-slate-800/40" />
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-24 p-4">
            <div className="h-full rounded-lg bg-slate-800/40" />
          </Card>
        ))}
      </div>

      <Card className="h-72 p-4">
        <div className="h-full rounded-lg bg-slate-800/30" />
      </Card>
    </div>
  );
}
