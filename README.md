# TurnoSmart V65 — Treinamentos inteligentes

## Fluxo

1. Escolha a máquina.
2. O tipo da máquina é preenchido automaticamente.
3. Escolha o problema ou regulagem.
4. Adicione foto ou vídeo.
5. Acrescente observações.
6. Toque em **Criar lição ponto a ponto**.
7. Revise objetivo, passos, segurança e teste.
8. Salve na nuvem.

## Nuvem

Execute `setup_training.sql` no Supabase e configure na Vercel:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Inteligência artificial

Configure:

- `OPENAI_API_KEY`
- `OPENAI_MODEL=gpt-4.1-mini`

Sem a chave, o app continua funcionando com modelos técnicos locais por tipo de problema.
