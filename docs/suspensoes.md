# Suspensão de jogadores

Na tela **Jogadores**, use **Suspender jogador** e escolha uma modalidade:

- **Até uma data:** bloqueio imediato, incluindo a data final. No dia seguinte o jogador fica disponível automaticamente. Usa o calendário de São Paulo.
- **Quantidade de peladas:** bloqueio por 1 a 1000 novas peladas cadastradas depois do registro da suspensão. Cada cadastro desconta 1; cancelar ou apagar a pelada devolve a quantidade. Peladas antigas, já em andamento e registros históricos importados não contam.

O cartão mostra a data final ou a quantidade restante. É possível alterar a suspensão ou retirá-la manualmente. A alteração substitui a suspensão anterior e limpa o sorteio em preparação para impedir o reaproveitamento de times com o jogador bloqueado. Os times de peladas já cadastradas são preservados.

Jogadores suspensos continuam no cadastro, ranking e mensalidades. Eles aparecem identificados e com seleção desabilitada no sorteio. A API também rejeita sorteios com suspensos e verifica a data ao cadastrar a pelada. As suspensões são privadas para organizadores e fazem parte do backup dos jogadores.
