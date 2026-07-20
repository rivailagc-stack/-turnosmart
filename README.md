# TurnoSmart V4

Aplicativo PWA que interpreta o relatório diário e gera duas mensagens separadas:

1. **Manutenção:** somente falhas técnicas, ajustes, quebras, vazamentos, alarmes e instabilidades da máquina.
2. **Produção:** passagem de papel, faixa e fundo, troca de bobina, limpeza, mão de obra, treinamento, autocontrole, qualidade e retrabalho.

## Líderes da produção configurados

- A1: Maria
- A2: Reginaldo
- B1: Wilma
- B2: Marisa

Os líderes da manutenção podem ser cadastrados na tela **Escala**.

## Regra de responsabilidade

- O relatório fica vinculado à equipe que terminou o turno.
- As ações são direcionadas à equipe que está entrando.
- Relatório diurno: equipe 1 entrega para a equipe 2 do mesmo dia.
- Relatório noturno: equipe 2 entrega para a equipe 1 do dia seguinte.

## SGMan

Somente ações classificadas como manutenção entram na prévia de OS. As duas mensagens orientam o uso do aplicativo do SGMan para registrar as intervenções.

## Publicação

Envie todos os arquivos desta pasta para a raiz do repositório no GitHub, substituindo os arquivos da versão anterior. A Vercel publica automaticamente após o commit.
