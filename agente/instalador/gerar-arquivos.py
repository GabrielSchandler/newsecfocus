"""
Gera Arquivos.wxs a partir da pasta publicada do agente.

Por que existe: o agente auto-contido tem centenas de arquivos (o runtime do
.NET vai junto), e listá-los à mão no instalador seria insustentável. O elemento
<Files> do WiX resolveria, mas não aceita excluir o executável do serviço — que
precisa de componente próprio para declarar o serviço Windows.

Um componente por arquivo é a prática recomendada em MSI: permite ao Windows
Installer reparar ou substituir arquivo a arquivo numa atualização.

Os GUIDs são derivados do caminho relativo (uuid5), então são ESTÁVEIS entre
execuções. Isso importa: GUID que muda a cada build faz o Windows Installer
tratar o mesmo arquivo como componente novo e deixar lixo na desinstalação.

Uso:
    python gerar-arquivos.py            # lê ../publicado-msi
    python gerar-arquivos.py <pasta>
"""

import os
import sys
import uuid

# Espaço de nomes fixo do projeto — não trocar, senão todos os GUIDs mudam.
ESPACO_NOMES = uuid.UUID("3f2a91d6-8c47-4e15-b0a3-6f9c2e58d417")

EXE_SERVICO = "Telemetria.Servico.exe"


def guid(chave: str) -> str:
    return str(uuid.uuid5(ESPACO_NOMES, chave)).upper()


def identificador(prefixo: str, chave: str) -> str:
    """Id de MSI: só letras, números e sublinhado, começando por letra."""
    limpo = "".join(c if c.isalnum() else "_" for c in chave)
    digest = uuid.uuid5(ESPACO_NOMES, chave).hex[:8]
    return f"{prefixo}_{limpo[-48:]}_{digest}"


def main() -> int:
    raiz = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "../publicado-msi")

    if not os.path.isdir(raiz):
        print(f"Pasta nao encontrada: {raiz}")
        print("Publique o agente antes: publicar-msi.bat")
        return 1

    por_pasta: dict[str, list[str]] = {}
    for atual, _, arquivos in os.walk(raiz):
        rel = os.path.relpath(atual, raiz)
        rel = "" if rel == "." else rel
        for nome in arquivos:
            if rel == "" and nome == EXE_SERVICO:
                continue  # componente próprio, por causa do ServiceInstall
            por_pasta.setdefault(rel, []).append(nome)

    linhas = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<!--",
        "  GERADO por instalador/gerar-arquivos.py. Nao editar a mao.",
        "  Rodar de novo sempre que o agente for republicado.",
        "-->",
        '<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">',
        "  <Fragment>",
        '    <DirectoryRef Id="INSTALLFOLDER">',
    ]

    for pasta in sorted(p for p in por_pasta if p):
        ident = "DIR_" + pasta.replace(os.sep, "_").replace("-", "_")
        linhas.append(f'      <Directory Id="{ident}" Name="{pasta}" />')

    linhas += ["    </DirectoryRef>", "", '    <ComponentGroup Id="ArquivosDoAgente">']

    total = 0
    for pasta in sorted(por_pasta):
        destino = (
            "INSTALLFOLDER"
            if not pasta
            else "DIR_" + pasta.replace(os.sep, "_").replace("-", "_")
        )
        for nome in sorted(por_pasta[pasta]):
            rel = os.path.join(pasta, nome) if pasta else nome
            origem = "!(bindpath.Publicado)\\" + rel
            linhas.append(
                f'      <Component Id="{identificador("cmp", rel)}" '
                f'Directory="{destino}" Guid="{{{guid(rel)}}}">'
            )
            linhas.append(
                f'        <File Id="{identificador("fil", rel)}" '
                f'Source="{origem}" KeyPath="yes" />'
            )
            linhas.append("      </Component>")
            total += 1

    linhas += ["    </ComponentGroup>", "  </Fragment>", "</Wix>"]

    destino_wxs = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Arquivos.wxs")
    with open(destino_wxs, "w", encoding="utf-8") as saida:
        saida.write("\n".join(linhas) + "\n")

    print(f"Arquivos.wxs gerado: {total} componentes em {len(por_pasta)} pastas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
