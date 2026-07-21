# TurnoSmart V22 — Comentário direto no SGMan

O campo `comentario` da ordem não envia mais:

- origem TurnoSmart;
- equipe que entregou;
- equipe responsável;
- OEE do turno;
- texto de passagem de turno.

Agora o comentário contém somente:

```text
Problema: [problema identificado].
Possível resolução: [ação sugerida].
Atenção: testar a máquina, confirmar estabilidade e liberar somente após verificar que o defeito não voltou, evitando retrabalho.
```

A descrição da OS continua com a máquina e a ação principal.
