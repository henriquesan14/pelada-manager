# Resenha — Pelada Manager

Gerenciador de pelada para web e celular, com vários organizadores compartilhando os jogadores, sorteios, resultados e ranking. Instalável como PWA, sem lojas de aplicativos.

O controle de [mensalidades](docs/mensalidades.md), com consulta pública e alterações restritas aos organizadores, registra R$ 10,00 por jogador a cada mês, com pagamentos, pendências e histórico.

Veja também [como as sessões sobrevivem aos deploys](docs/sessoes.md).

## Stack

Para usar o bucket privado `alugueis-pelada` em `sa-east-1`, veja [S3 e User Secrets da API](docs/s3.md). A configuração Docker para ler `secrets.json` está em `compose.secrets.yaml`.

| Parte | Tecnologia |
| --- | --- |
| Interface | Angular 21, TypeScript, componentes standalone, signals e formulários |
| API | .NET 10, ASP.NET Core Minimal APIs |
| Contas | ASP.NET Core Identity, senha com hash PBKDF2, cookie HttpOnly |
| Dados | PostgreSQL 17, Entity Framework Core 10 e Npgsql |
| Execução | Docker e Docker Compose, Nginx como servidor da interface e proxy da API |
| Testes | xUnit e integração com PostgreSQL real; Vitest no Angular |

## Publicar no Railway e na Vercel

Veja o [guia de deploy](docs/deploy-railway-vercel.md) para configurar a API e o PostgreSQL no Railway, o frontend na Vercel, S3 e a migração do banco atual.

## Subir com Docker Compose

É necessário Docker com suporte a containers Linux e Docker Compose v2. Não é preciso instalar .NET, Node.js ou PostgreSQL na máquina para esta opção.

No PowerShell, na raiz do projeto:

```powershell
./scripts/Initialize-Local.ps1
docker compose up --build -d --wait
```

O script cria `.env` com senha do banco e chave de configuração aleatórias. Se o arquivo já existir, ele é preservado. Alternativamente, copie `.env.example` para `.env` e preencha `POSTGRES_PASSWORD` e `SETUP_TOKEN` manualmente. Use uma senha aleatória sem ponto e vírgula para o banco e uma chave de pelo menos 24 caracteres para a configuração inicial. Não versione `.env`.

Abra [http://localhost:8080](http://localhost:8080). Crie o primeiro responsável com nome, **nick**, senha pessoal de pelo menos 6 caracteres (sem exigência de maiúsculas, números ou símbolos) e a chave `SETUP_TOKEN` do seu `.env`. Depois, em **Organizadores**, gere os convites para os demais. O acesso é por **nick e senha**; e-mail não é solicitado.

O nick deve ter de 3 a 24 caracteres: letras sem acento, números, ponto, hífen ou sublinhado. Ele é único, não diferencia maiúsculas e minúsculas e é armazenado em minúsculas. O nome de exibição pode ser diferente do nick.

Contas da versão anterior com login por e-mail recebem um nick automaticamente na migration `LoginByNickname`: a parte antes do `@`, em minúsculas, sem caracteres não permitidos e limitada a 24 caracteres. Se ficar com menos de 3 caracteres, a base será `organizador`. Duplicidades recebem sufixos `_2`, `_3` etc. As senhas e os IDs são preservados; e-mail deixa de ser aceito no login. O responsável pode consultar os nicks na lista de organizadores. Os campos opcionais de e-mail do Identity continuam no banco para preservar registros antigos, mas não são usados ou retornados pela API.

```sh
docker compose ps
docker compose logs --tail=50 api
docker compose down
```

`down` encerra os containers e preserva os volumes. Não adicione `-v` se quiser manter jogadores, contas e resultados.

Os serviços são `web`, `api` e `db`. Apenas a interface expõe a porta 8080; ela encaminha `/api/` internamente para o backend. O banco possui healthcheck, a API aguarda o banco, aplica as migrations versionadas e a interface aguarda a API. Os volumes `postgres_data` e `data_protection` preservam, respectivamente, os dados e as chaves usadas para proteger os cookies.

## Desenvolvimento

Para editar o Angular com atualização automática, mantenha a API e o banco em containers:

```sh
docker compose -f compose.yaml -f compose.dev.yaml up --build -d db api
npm --prefix frontend ci
npm run dev
```

Abra [http://localhost:4200](http://localhost:4200). O proxy de desenvolvimento encaminha `/api/` para a API em `localhost:5000`; o backend aceita a origem `http://localhost:4200` nesse modo. O PostgreSQL fica disponível apenas na máquina local, na porta 5433. Esse modo exige Node.js 24 compatível com Angular 21.

Para desenvolver a API fora do Docker, suba apenas `db` com os mesmos dois arquivos Compose e configure no processo:

- `ASPNETCORE_ENVIRONMENT=Development`
- `ConnectionStrings__Postgres=Host=localhost;Port=5433;Database=resenha;Username=resenha;Password=<senha-do-seu-.env>`
- `APP_ORIGIN=http://localhost:4200`
- `SETUP_TOKEN=<chave-do-seu-.env>`

```sh
dotnet watch --project backend/Pelada.Api --urls http://localhost:5000
```

A solução .NET está em `Pelada.slnx`. Para voltar ao conjunto padrão após usar o modo de desenvolvimento, execute `docker compose up --build -d --wait` e use a porta 8080.

## Testes e builds

```sh
npm --prefix frontend ci
npm run build
npm test
dotnet build Pelada.slnx
dotnet test backend/Pelada.Tests
```

Os testes locais da API executam as regras de negócio; os testes com PostgreSQL são explicitamente ignorados quando `TEST_POSTGRES` não está habilitado. Para executar toda a suíte da API, incluindo login por nick, unicidade sem diferenciar maiúsculas, migração de contas antigas, convites, autorização, concorrência e remoção de acesso, use o ambiente isolado:

```sh
docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests
docker compose -f compose.test.yaml down
```

O banco de teste usa `tmpfs`, sem volume persistente, não expõe portas e não acessa a pelada principal. Execute o `down` antes de repetir uma rodada: o teste de integração espera um banco vazio.

## Funcionalidades e regras

- Cadastro e exclusão de jogadores, com avaliação de 0,5 a 5 estrelas em passos de 0,5, exibindo meias estrelas, e posição obrigatória.
- Posições disponíveis: Goleiro, Zagueiro, Lateral, Volante, Meia, Ponta, Atacante, Fixo, Ala e Pivô. Avaliação e posição podem ser alteradas nos cartões dos jogadores. Jogadores antigos mantêm suas avaliações e mostram posição “Não informada” até o preenchimento; backups antigos continuam aceitos.
- Seleção de presentes e sorteio de 2 a 6 times, buscando equilibrar quantidade e avaliação, incluindo as meias estrelas. O equilíbrio é aproximado; a posição ainda não altera a distribuição dos times.
- Sorteie os times e prepare a pelada na tela **Aluguéis**. Ao final, basta **escolher o time vencedor, selecionar a foto e salvar**. Não há cadastro de partidas, placares ou classificação dos times.
- A foto é obrigatória para salvar um novo resultado. Formatos aceitos: JPEG, PNG e WebP, até 8 MB. A interface permite escolher a foto da galeria, exibe uma prévia e só salva o resultado após concluir o envio da imagem.
- Ranking geral por **quantidade de aluguéis conquistados**: cada jogador do time vencedor conquista **1 aluguel**. O vencedor é informado pelo organizador, sem depender de jogos cadastrados. A opção **Sem vencedor (empate)** não acrescenta conquistas. Os resultados anteriores entram automaticamente nessa contagem.
- A foto e os times ficam disponíveis no histórico. A imagem pode ser substituída posteriormente sem alterar os pontos. Para corrigir o vencedor, reabra o aluguel: os pontos anteriores são retirados até salvar o resultado correto. Não é possível reabrir outro aluguel enquanto houver um em andamento.
- Os totais individuais são calculados a partir dos resultados salvos; salvar novamente, atualizar a página ou consultar o ranking não duplica pontos. Cada aluguel mantém seus times e resultado independentes.
- Jogadores participantes não podem ser excluídos e os times não podem ser sorteados novamente enquanto a pelada aguarda seu resultado.
- Contas individuais e sessão de até 7 dias. O responsável cria convites de uso único, válidos por 24 horas, e remove acessos.
- Atualização dos dados a cada 5 segundos enquanto o app estiver visível. Ao editar um formulário, a atualização visual é adiada para preservar o preenchimento.
- Controle otimista de revisão: se outro organizador gravar antes, a alteração com revisão antiga é recusada. O app busca os novos dados e o organizador deve revisar e tentar novamente.
- Histórico das 30 atividades mais recentes.
- Exportação dos dados esportivos em JSON e importação inicial de um backup pelo responsável, somente quando a pelada estiver vazia.

## Estrutura e persistência

```text
backend/Pelada.Api/      API, Identity, regras de negócio e migrations
backend/Pelada.Tests/    testes de domínio e integração
frontend/               aplicação Angular e configuração do Nginx
scripts/                inicialização da configuração local
compose.yaml            aplicação completa
compose.dev.yaml        portas locais para desenvolvimento
compose.test.yaml       PostgreSQL descartável para testes
```

Contas, convites, atividades e metadados de fotos usam tabelas relacionais do PostgreSQL. No modo `S3`, os arquivos novos ficam no bucket privado; `RentalPhotos` guarda bucket, região, chave e metadados. O modo `Database` mantém os bytes no PostgreSQL, e as fotos antigas continuam legíveis em ambos os modos. A leitura e o envio exigem autenticação e passam pela API. O servidor confere tamanho e assinatura do arquivo sem confiar no nome enviado. O estado esportivo fica em JSONB com revisão para controle de concorrência. A referência da foto e a atividade são gravadas na mesma transação do banco. Esta versão mantém uma pelada compartilhada por instalação, com histórico de vários aluguéis.

Partidas de versões anteriores permanecem nos dados e na exportação, mas não são mais exibidas nem usadas para determinar o vencedor. Aluguéis já encerrados preservam seu resultado e podem receber uma foto. A importação JSON mantém os vencedores que pertençam aos respectivos times, mas remove referências às imagens que não estão no arquivo; a foto pode ser adicionada novamente. Para preservar as fotos, use o backup completo do PostgreSQL.

Novas alterações de esquema devem ser versionadas:

```sh
dotnet tool restore
dotnet ef migrations add NomeDaAlteracao --project backend/Pelada.Api
```

As migrations são aplicadas na inicialização da API. Faça backup antes de atualizar uma instalação com dados. Não execute várias réplicas dessa versão sem planejar a aplicação coordenada de migrations e o compartilhamento das chaves de proteção.

## Importação de backup

O responsável pode importar um backup esportivo em JSON na tela inicial enquanto a pelada estiver vazia. O sorteio deve ser refeito após a importação. Contas e senhas não fazem parte desse arquivo; use convites para cadastrar os organizadores. Para preservar também as contas e fotos armazenadas no banco, use o backup completo do PostgreSQL.

## Celular e hospedagem

Para acessar pelo celular na mesma rede, ajuste `APP_ORIGIN` para `http://<IP-do-computador>:8080`, recrie o serviço da API e use esse mesmo endereço em todos os dispositivos. Essa opção permite testar a interface; para instalar no celular, use HTTPS.

Para hospedar, configure um proxy com certificado HTTPS na frente do serviço `web`, altere `APP_ENV=Production` e `APP_ORIGIN=https://seu-endereco`, e recrie os serviços. O modo Production exige uma origem HTTPS e emite cookies Secure. O Compose padrão não provisiona domínio nem certificado. Não publique o PostgreSQL ou a API diretamente na internet.

O Angular inclui manifesto, ícones e service worker para PWA. Em navegadores compatíveis, use a opção de instalar. No iPhone, use Compartilhar → Adicionar à Tela de Início. Não há publicação em lojas. A instalação em Android/iOS físicos precisa ser validada no endereço HTTPS final.

O cache da PWA contém somente a interface; `/api/` e dados privados não são armazenados para uso offline. Consultas e alterações compartilhadas exigem acesso ao servidor. Não existe fila offline. Se a resposta de uma gravação for interrompida, confira o estado ao reconectar antes de repeti-la.

## Backup e limites atuais

Faça backup do PostgreSQL com `pg_dump` e proteja também o volume de chaves de Data Protection. Por exemplo, este comando cria um arquivo dentro do container e o copia sem redirecionamento binário do PowerShell:

```sh
docker compose exec -T db pg_dump -U resenha -d resenha -Fc -f /tmp/resenha.dump
docker compose cp db:/tmp/resenha.dump ./resenha.dump
```

Guarde o arquivo em local protegido. O dump do PostgreSQL inclui as fotos do modo Database e as referências às fotos S3; os arquivos no bucket precisam de sua própria proteção/backup. A exportação JSON contém somente dados esportivos, sem arquivos das imagens. Restaurar o dump exige um procedimento administrativo e não está disponível pela interface.

Todos os organizadores ativos podem alterar jogadores e resultados e ver a equipe. Apenas o responsável pode criar convites, importar o estado inicial e remover acessos. A remoção invalida os cookies daquela conta; sair também invalida as outras sessões do mesmo usuário. Não há recuperação de senha por e-mail, alteração de senha na interface, verificação de e-mail ou grupos independentes nesta versão. A limitação de tentativas considera o IP que se conecta à API; atrás do Nginx, esse IP é o do proxy.

Referências: [Angular e compatibilidade](https://angular.dev/reference/versions), [PWA no Angular](https://angular.dev/ecosystem/service-workers/getting-started), [ASP.NET Core Identity](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/identity?view=aspnetcore-10.0), [Npgsql para EF Core](https://www.npgsql.org/efcore/) e [ordem de inicialização no Compose](https://docs.docker.com/compose/how-tos/startup-order/).
