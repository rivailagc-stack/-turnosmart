# TurnoSmart V2

Aplicativo PWA para analisar relatórios de produção, identificar automaticamente a equipe 12x36 e gerar ações de manutenção.

## Regra automática de turno

- Mensagem recebida entre 00:00 e 07:59: pertence ao turno 2 (18:00–06:00) iniciado no dia anterior.
- Mensagem recebida a partir das 17:00: pertence ao turno 1 (06:00–18:00) do próprio dia.
- Entre 08:00 e 16:59: o aplicativo solicita conferência manual.
- Referência inicial: 20/07/2026 = equipes A1 e A2. No dia seguinte entram B1 e B2, alternando diariamente.

## Novidades da V2

- Identificação automática da data operacional.
- Identificação automática das equipes A1, A2, B1 e B2.
- Cadastro recorrente do líder por equipe, sem preencher cada data.
- Conferência entre a escala escrita no relatório e a escala calculada.
- Inclusão da equipe e do horário nas mensagens e na prévia do SGMan.

## Atualizar no GitHub

Extraia o ZIP e envie os arquivos para a raiz do mesmo repositório, aceitando substituir os arquivos existentes. A Vercel publicará a atualização automaticamente.
