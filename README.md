# Limitless Stats

Estatísticas dos torneios online encerrados de Pokémon TCG no [Limitless TCG](https://play.limitlesstcg.com/).

O relatório considera, por padrão:

- Pokémon TCG Standard;
- últimas quatro semanas;
- torneios online encerrados;
- mais de 20 jogadores;
- rankings separados para MD1 e MD3;
- estatísticas de decks, matchups e variantes de decklists.

## Site

Depois que a primeira execução do GitHub Actions terminar, o relatório estará disponível em:

https://samuelnahas.github.io/Limitless-stats/

## Atualizar o relatório

Abra **Actions → Atualizar e publicar relatorio → Run workflow**.

O primeiro processamento pode demorar por causa do limite público de requisições do Limitless. O workflow mantém o cache para reduzir o trabalho nas execuções seguintes.

## Execução local

```bash
python3 analisar_limitless.py
```

O script usa somente a biblioteca padrão do Python.
