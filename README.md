# TurnoSmart V48 — Módulos independentes

O problema da V47 era que a nova Inteligência ainda iniciava junto com o aplicativo. Caso alguma consulta, histórico ou elemento da nova página falhasse, o JavaScript podia parar antes de concluir a inicialização das outras funções.

## Correção

- navegação independente;
- aplicação inicia sempre em Novo;
- Inteligência inicia somente ao abrir sua aba;
- erros da Inteligência ficam restritos à própria aba;
- banner informa erros sem bloquear o aplicativo;
- listeners de navegação não dependem do restante do init.
