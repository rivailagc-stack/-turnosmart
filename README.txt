TurnoSmart Clean V2 + SGMan

FOCO:
Painel -> Foto -> Análise OEE -> Top 10 -> escolher 3 -> SGMan -> Relatório.

SGMan NÃO tem aba própria e NÃO abre OS.
Ele consulta silenciosamente os últimos 90 dias e enriquece as prioridades com:
- quantidade de OS por máquina
- abertas/atrasadas
- referências recentes
- contexto no relatório das 3 escolhidas

Variáveis Vercel já usadas pelo projeto:
- GEMINI_API_KEY
- GEMINI_MODEL (opcional)
- SGMAN_TOKEN
- SGMAN_API_URL (opcional para criação; a consulta usa endpoint oficial já existente no código legado)

Após subir, faça novo deploy para as variáveis de ambiente serem aplicadas.
