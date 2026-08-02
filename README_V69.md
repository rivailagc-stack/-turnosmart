# TurnoSmart V69

A versão adiciona o Mecânico IA e o painel de lacunas de conhecimento.

A API `/api/mechanic-ai` usa:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`

As respostas são sempre geradas no backend. A chave não é enviada ao navegador.

O sistema continua funcionando sem Supabase. Quando a IA estiver indisponível,
usa a biblioteca técnica local e o histórico do SGMan.
