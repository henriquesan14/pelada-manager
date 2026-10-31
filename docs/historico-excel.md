# Histórico e saldo inicial do Excel

A coluna **ALUGUÉIS** da aba **JOGADORES** é o saldo inicial de conquistas de cada jogador. O ranking soma esse saldo às conquistas de novas peladas finalizadas no sistema. Reabrir uma pelada nova retira somente a conquista daquela pelada.

Os registros da aba **HISTÓRICO** preservam data, local, texto dos participantes e referência à foto original. As fotos disponíveis são copiadas para o bucket privado do S3 e servidas pela API autenticada. Datas são preservadas como constam na planilha; nomes e apelidos nos participantes não são associados automaticamente aos jogadores cadastrados.

Os registros históricos não têm sorteios, times ou vencedores identificados e não acrescentam conquistas ou participações ao ranking. Isso evita duplicar os totais já incluídos no saldo inicial. A tela identifica esses registros como **Histórico importado** e não permite corrigir um vencedor que não foi informado.

A importação administrativa utiliza identificadores de origem por linha e não recria registros já importados. As contas, os jogadores e as peladas novas são preservados. O saldo inicial é atualizado pelo nome exato do jogador, sem associação aproximada. A atualização do banco é atômica e utiliza a revisão dos dados para recusar alterações concorrentes.

Os arquivos de preparação e a cópia dos dados anteriores ficam em `.qa/`, ignorada pelo Git. Não coloque credenciais nesses arquivos. A importação exige o modo S3 já configurado em `compose.secrets.yaml`.
