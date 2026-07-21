# TurnoSmart V30 — Abrir OS por foto e áudio

## Tela Abrir OS

O usuário pode:

1. tirar uma foto da ocorrência;
2. falar o código da máquina e o problema;
3. conferir o texto reconhecido;
4. escolher a máquina;
5. criar a ordem diretamente no SGMan.

## Responsável automático

A equipe que está trabalhando é definida pela data e pelo horário:

- 06:00 às 18:00: equipe 1 do dia;
- 18:00 às 06:00: equipe 2 iniciada naquela data;
- antes das 06:00: turno noturno iniciado no dia anterior.

O líder da equipe é selecionado por padrão. O usuário pode trocar para um dos mecânicos cadastrados na mesma equipe.

## Foto

A imagem é comprimida no celular e enviada no campo:

```json
{
  "fotos": [
    {
      "base64": "data:image/jpeg;base64,..."
    }
  ]
}
```

## Áudio

O navegador converte a fala em texto em português do Brasil. O SGMan recebe a descrição escrita, não um arquivo de áudio. Quando o navegador não oferecer reconhecimento de voz, o problema pode ser digitado normalmente.

## Segurança

O mesmo `SGMAN_TOKEN` da Vercel continua sendo usado. O token não aparece no navegador nem no GitHub.
