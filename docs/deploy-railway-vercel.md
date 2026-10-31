# Publicar no Railway e na Vercel

O Railway executa a API .NET e o PostgreSQL. A Vercel serve o Angular e encaminha `/api` para a URL pública HTTPS do Railway. O navegador usa apenas a origem da Vercel, preservando cookies de login, consultas e uploads sem configurar CORS.

## 1. Criar a API e o banco no Railway

1. Crie um projeto e adicione um serviço PostgreSQL chamado **Postgres**. Utilize PostgreSQL 17 ou mais recente se for restaurar o banco local, que usa a versão 17.
2. Adicione um serviço a partir de `henriquesan14/pelada-manager`, branch `main`.
3. Mantenha **Root Directory** na raiz do repositório. O arquivo `railway.json` seleciona `backend/Dockerfile` e o healthcheck `/api/health`.
4. Adicione um volume na API montado em `/app/keys`, para persistir as chaves de sessão. O PostgreSQL tem seu próprio volume.
5. Configure as variáveis abaixo na **API**, nunca na Vercel:

| Variável | Valor |
| --- | --- |
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `APP_ORIGIN` | `https://seu-site.vercel.app` (origem final do site, sem barra no fim nem caminho) |
| `ConnectionStrings__Postgres` | `Host=${{Postgres.PGHOST}};Port=${{Postgres.PGPORT}};Database=${{Postgres.PGDATABASE}};Username=${{Postgres.PGUSER}};Password=${{Postgres.PGPASSWORD}}` |
| `SETUP_TOKEN` | Chave aleatória de pelo menos 24 caracteres, guardada nas variáveis do Railway |
| `PhotoStorage__Provider` | `S3` |
| `S3__Bucket` | `alugueis-pelada` |
| `S3__Region` | `sa-east-1` |
| `AWS__AccessKey` | Access key do usuário IAM autorizado ao bucket |
| `AWS__SecretKey` | Secret key correspondente |
| `DATA_PROTECTION_PATH` | `/app/keys` |
| `RAILWAY_RUN_UID` | `0` (o volume do Railway é montado como root) |

As referências `Postgres.*` devem usar o nome real do serviço do banco. Não copie a senha do banco local: use as credenciais do PostgreSQL do Railway. Não envie chaves pelo chat nem adicione os valores ao repositório.

A aplicação lê a variável `PORT` fornecida pelo Railway e escuta em todas as interfaces. Não é necessário Start Command personalizado. As migrations são aplicadas ao iniciar.

Em **Networking**, gere o domínio público HTTPS da API. Verifique `https://sua-api.up.railway.app/api/health`. Guarde essa origem para a variável da Vercel. Não use `compose.secrets.yaml`: esse arquivo é específico do desenvolvimento local no Windows.

## 2. Criar o frontend na Vercel

1. Importe o mesmo repositório e selecione **Root Directory: `frontend`**.
2. Use **Framework Preset: Other** e **Node.js 24.x**. O arquivo `frontend/vercel.json` define instalação e build.
3. Configure apenas a variável `RAILWAY_API_URL=https://sua-api.up.railway.app`, sem `/api` e sem barra final. Ela é uma URL pública; não coloque credenciais da AWS nem do banco na Vercel.
4. Use o comando de build do repositório: `npm run build:vercel`. Não substitua o Output Directory no painel: o build gera `.vercel/output` no formato Build Output API, com os arquivos estáticos e as regras de proxy e fallback das rotas Angular.
5. Publique. Copie a URL estável de produção da Vercel e confirme que `APP_ORIGIN` na API tem exatamente essa origem. Se mudar a variável, faça redeploy da API.

Para uma prévia de outro domínio gravar dados, ela precisaria de uma API com origem correspondente. A API de produção aceita gravações somente da origem configurada, sem liberar qualquer domínio de preview.

O HTTPS permite a instalação da PWA e o compartilhamento nativo das imagens dos sorteios em navegadores compatíveis. No navegador, as chamadas continuam em `/api`; a Vercel encaminha ao Railway sem Vercel Function intermediária.

## 3. Preservar os dados atuais

O GitHub não contém jogadores, pagamentos, fotos ou contas. Publicar o código com um banco novo inicia uma base vazia. Para levar os dados atuais, faça um dump completo do PostgreSQL local e restaure em um banco vazio do Railway, antes de abrir o app para uso. Isso preserva contas, mensalidades, suspensões, auditoria e metadados das fotos; a exportação JSON do app não substitui esse backup completo.

O script `scripts/Backup-Database.ps1` gera o dump em `.qa/`, que é ignorado pelo Git. Guarde o arquivo com acesso restrito. A restauração depende do endereço de conexão do banco de destino e deve ser feita antes de permitir alterações nele. Não execute uma restauração sobre uma base já em uso sem revisar o conteúdo e fazer backup do destino.

As fotos no S3 permanecem no bucket atual e são acessadas pela API do Railway com as credenciais configuradas. Não é necessário reenviá-las. Após a migração, use a produção para novos registros: as cópias local e remota do banco referenciam os mesmos objetos S3.

## 4. Verificar depois da publicação

- Abrir `/ranking`, `/alugueis`, `/mensalidades` e `/financeiro` sem login: consultas disponíveis, sem botões de alteração.
- Fazer login pela Vercel e atualizar uma informação para verificar origem e cookies. Se aparecer **Origem não autorizada**, revisar `APP_ORIGIN` e redeploy da API.
- Abrir diretamente uma rota e atualizar a página: o Angular deve continuar nessa rota.
- Conferir fotos antigas; testar upload de foto em um registro autorizado.
- Conferir totais financeiros e jogadores com o banco de origem.
- Fechar e reabrir o navegador e validar a sessão após redeploy, com o volume de chaves persistido.

## Referências

- [Railway: configuração por arquivo](https://docs.railway.com/config-as-code/reference)
- [Railway: volumes e permissões](https://docs.railway.com/volumes)
- [Railway: PostgreSQL](https://docs.railway.com/databases/postgresql)
- [Vercel: Build Output API](https://vercel.com/docs/build-output-api)
- [Vercel: configuração de rotas](https://vercel.com/docs/build-output-api/configuration)
