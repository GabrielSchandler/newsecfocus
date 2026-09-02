using System.Drawing;
using System.Windows.Forms;

namespace Telemetria.Coletor.Interface;

/// <summary>
/// Ícone de bandeja que dá ciência do monitoramento ao usuário — requisito de
/// transparência da LGPD (art. 9º). Não permite desligar a coleta (isso é decisão
/// do TI/gestor), apenas informa com clareza o que é e o que NÃO é coletado.
/// </summary>
public sealed class IconeBandeja : IDisposable
{
    private readonly NotifyIcon _icone;
    private readonly string _versao;

    public IconeBandeja(string versao)
    {
        _versao = versao;

        _icone = new NotifyIcon
        {
            Icon = SystemIcons.Information,
            Visible = true,
            Text = "Telemetria de Produtividade (ativo)"
        };

        var menu = new ContextMenuStrip();
        menu.Items.Add("O que é coletado?", null, (_, _) => MostrarPolitica());
        menu.Items.Add("Sobre", null, (_, _) => MostrarSobre());
        _icone.ContextMenuStrip = menu;
        _icone.DoubleClick += (_, _) => MostrarPolitica();

        // Balão discreto no primeiro carregamento da sessão.
        _icone.BalloonTipTitle = "Monitoramento de produtividade ativo";
        _icone.BalloonTipText =
            "Esta estação registra apenas metadados de uso (aplicativo ativo e nível de " +
            "interação). Conteúdo digitado, telas e mensagens NÃO são coletados.";
        _icone.BalloonTipIcon = ToolTipIcon.Info;
        _icone.ShowBalloonTip(8000);
    }

    private void MostrarPolitica()
    {
        MessageBox.Show(
            "Esta estação de trabalho é monitorada pela empresa para fins de gestão de " +
            "produtividade, com base no legítimo interesse do empregador (LGPD, art. 7º, IX " +
            "e art. 9º).\n\n" +
            "SÃO coletados apenas metadados, uma vez por minuto:\n" +
            "  • nome do aplicativo em primeiro plano (ex.: chrome.exe);\n" +
            "  • título da janela, com números longos e e-mails removidos;\n" +
            "  • domínio do site aberto (ex.: portal.gov.br), sem o endereço completo;\n" +
            "  • se houve atividade ou ociosidade no minuto;\n" +
            "  • quantidade de cliques, rolagens e teclas pressionadas — apenas a contagem.\n\n" +
            "NÃO são coletados, em nenhuma hipótese:\n" +
            "  • o que você digita (nenhuma tecla é registrada, só o total);\n" +
            "  • capturas de tela ou fotos;\n" +
            "  • conteúdo de mensagens, e-mails ou conversas;\n" +
            "  • senhas — aplicativos de senha têm o título omitido.\n\n" +
            "Dúvidas sobre seus dados: procure o setor de Recursos Humanos ou o encarregado " +
            "de dados (DPO) da empresa.",
            "Monitoramento de produtividade — o que é coletado",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }

    private void MostrarSobre()
    {
        MessageBox.Show(
            $"Agente de Telemetria de Produtividade\nVersão {_versao}\n\n" +
            "Coleta transparente e em conformidade com a LGPD.",
            "Sobre",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }

    public void Dispose()
    {
        _icone.Visible = false;
        _icone.Dispose();
    }
}
