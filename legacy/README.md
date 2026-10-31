# Implementação anterior

`node/` preserva o protótipo em JavaScript, Node.js e SQLite como referência de migração. Ele não faz parte do build nem do Docker Compose. A aplicação ativa está em `backend/` e `frontend/`.

Exporte os jogadores e resultados da versão anterior em JSON antes de mudar de servidor. O novo responsável pode importar esse arquivo na tela inicial enquanto a pelada estiver vazia. As contas antigas não são migradas automaticamente: crie o responsável e novos convites. Não apague o banco SQLite anterior sem guardar uma cópia.
