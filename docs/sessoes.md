# Sessões de login

O login usa cookie persistente HttpOnly e renova o prazo de 365 dias a cada requisição autenticada. Após 365 dias sem uso, é preciso entrar novamente. Fechar e abrir o navegador não encerra a sessão quando os cookies são preservados. Sair da conta ou revogar o organizador invalida suas sessões.

As chaves de proteção dos cookies ficam na tabela **DataProtectionKeys** do mesmo PostgreSQL das contas. Uma nova instância da API reutiliza essas chaves, mantendo os logins após reinícios e publicações. A migration cria somente essa tabela; não altera contas, senhas ou dados da pelada.

Na primeira execução desta versão, a API também importa as chaves XML da antiga pasta `DATA_PROTECTION_PATH`, quando ela ainda está disponível. Não exclua essa pasta ou volume antes do primeiro deploy. Quando as chaves antigas já foram perdidas, os cookies antigos não podem ser recuperados: será necessário entrar uma vez; os próximos logins usam as chaves persistidas no banco.

O volume `/app/keys` deixa de ser necessário para novas chaves. Sua configuração pode permanecer para importar as antigas. O backup completo do PostgreSQL também inclui as chaves; trate esse backup como dado privado.

O `railway.json` limita os gatilhos de build da API a `backend/**`, `railway.json` e `.dockerignore`. Alterações somente no frontend não devem reiniciar a API. O frontend também tenta recuperar a sessão quando uma publicação causa indisponibilidade temporária, sem confundir falha de conexão com expiração do login.

Para conferir, entre no site e reinicie a API. Ao atualizar a página, a mesma sessão deve continuar válida. O teste de integração reproduz isso com uma nova aplicação usando o cookie emitido pela primeira instância.

Referências: [Microsoft: chaves no Entity Framework Core](https://learn.microsoft.com/aspnet/core/security/data-protection/implementation/key-storage-providers#entity-framework-core), [Railway: watch paths](https://docs.railway.com/deployments/monorepo).
