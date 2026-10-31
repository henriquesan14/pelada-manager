# Mensalidades

A página `/mensalidades` permite consulta pública, somente leitura. Registrar e desfazer pagamentos exige login de organizador. Cada jogador cadastrado deve R$ 10,00 por mês, independentemente de quantas peladas jogar. Goleiros entram na mesma cobrança.

1. Escolha o mês de referência e clique em **Abrir mensalidades do mês**.
2. O sistema cria uma cobrança pendente para cada jogador cadastrado, sem marcar pagamentos automaticamente.
3. Use **Marcar como pago** após receber o pagamento. O registro guarda a data e o organizador que o informou.
4. Para corrigir um lançamento, use **Desfazer pagamento** e confirme. A cobrança volta a ficar pendente.

O resumo mostra o total recebido e a quantidade de pagamentos do mês inteiro. A pesquisa por nome e o filtro de status alteram somente a lista exibida.

Ao cadastrar um jogador, ele entra no mês atual e nos meses futuros já abertos. Meses anteriores não recebem cobranças retroativas automaticamente. Excluir um jogador preserva seu nome e os lançamentos dos meses já abertos; novos meses usam apenas os jogadores que continuam cadastrados.

O histórico fica salvo no PostgreSQL junto aos dados da pelada e participa da exportação e importação de backup JSON. Os lançamentos usam a mesma proteção contra alterações concorrentes dos outros dados.

A API pública inclui mensalidades (nome, valor e status), gastos (data, valor e descrição) e dados para calcular os saldos. Não expõe responsáveis pelos lançamentos nem metadados de importação. As alterações exigem autenticação, mesmo que alguém tente chamar a API diretamente.

## Histórico importado do Excel

A importação da aba MENSALIDADES exige confirmar o ano e o significado das marcações com o organizador. Neste formato, os valores de **R$ 10,00 em verde** são pagamentos; zeros, traços e células vazias são classificados como não pagos conforme a orientação recebida. Os 12 meses da planilha são preservados, inclusive meses futuros, sem classificá-los como atrasados.

Nomes que não correspondem ao cadastro permanecem apenas nos lançamentos financeiros, sem criar jogadores. Não se associam apelidos ou grafias parecidas automaticamente. Os arquivos da importação, relatórios financeiros e cópias de segurança ficam em `.qa/`, fora do versionamento; valores reais de arrecadação não devem entrar no código ou na documentação pública.

O Excel não informa a data de cada recebimento. A listagem não exibe datas de pagamento. O sistema armazena a origem da célula e a data da importação separadamente. Ao desfazer um pagamento importado, ele volta a ficar pendente; um novo registro manual recebe a data e o organizador responsáveis pelo lançamento.

A tela separada **Entradas e saídas** (`/financeiro`) mostra a arrecadação, os gastos e o saldo do ano selecionado no mês de referência. Os gastos históricos são importados com data, valor e descrição. Os totais anuais usam todos os meses do ano e não mudam com os filtros da lista de jogadores. Não há saldo inicial de anos anteriores presumido.

A página de mensalidades possui pesquisa por nome e filtro de status. O botão **Ver mensalidades** no cadastro do jogador abre um modal com os 12 meses do ano e seletor de ano, sem sair da lista. As cobranças continuam vinculadas pelo identificador do jogador, inclusive quando seu nome é alterado. Nomes antigos importados permanecem no histórico financeiro. O financeiro soma automaticamente os pagamentos confirmados, sem criar uma segunda cópia de cada entrada. Ambas as telas permitem consulta pública somente leitura; alterações exigem login.

Em **Entradas e saídas**, use **Adicionar gasto** e informe data, valor positivo em reais e descrição. O lançamento fica salvo no banco e atualiza as saídas e o saldo do ano da despesa. Somente organizadores autenticados podem registrar gastos.

O cartão **Saldo atual** soma os recebimentos de todos os anos e desconta todos os gastos registrados. O seletor de ano filtra o resumo e as listas anuais, sem alterar esse saldo acumulado. Pagamentos desfeitos e novos gastos atualizam o saldo automaticamente.

Use **Adicionar entrada** para recebimentos extras (como doações ou patrocínios), com data, valor positivo e descrição. Eles aparecem em **Outros recebimentos** e somam às mensalidades no total de entradas e no saldo. Não registre manualmente mensalidades já marcadas como pagas para evitar duplicidade. Visitantes consultam essas entradas, mas somente organizadores podem cadastrá-las.
