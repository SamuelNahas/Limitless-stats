# Limitless Stats

Estatísticas dos torneios online encerrados de Pokémon TCG no [Limitless TCG](https://play.limitlesstcg.com/).

O relatório considera, por padrão:

- Pokémon TCG Standard;
- últimas quatro semanas;
- torneios online encerrados;
- mais de 20 jogadores;
- rankings separados para MD1 e MD3;
- estatísticas de decks, matchups e variantes de decklists.

## Laboratório de torneio hipotético

No relatório, a seção **Laboratório de torneio hipotético** permite escolher:

- o número de rodadas;
- o tipo do torneio (MD1 ou MD3);
- um corte de melhores jogadores (Top 4, Top 8, Top 16 ou Top 32);
- quantos dos torneios mais recentes formarão o ambiente esperado.

Com esses parâmetros, o site usa os decks dos melhores colocados para estimar o
campo, compara os matchups já coletados e recomenda um arquétipo e uma lista de
60 cartas observada. A projeção também mostra o score esperado e a chance
teórica de obter uma campanha positiva no número de rodadas escolhido.

## Site

Depois que a primeira execução do GitHub Actions terminar, o relatório estará disponível em:

https://samuelnahas.github.io/Limitless-stats/

## Atualizar o relatório

Abra **Actions → Atualizar e publicar relatorio → Run workflow**.

A publicação atual analisa todos os torneios online encerrados de Standard desde 16/07/2026, início da era Pitch Black no Pokémon TCG Live, sem corte mínimo de jogadores.

O processamento pode demorar por causa do limite público de requisições do Limitless. O workflow ignora o cache e refaz a coleta do zero em cada execução.

## Execução local

```bash
python3 analisar_limitless.py

# Mesma coleta usada pelo site (era Pitch Black, do zero)
python3 analisar_limitless.py --formato STANDARD --data-inicial 2026-07-16 --min-jogadores 1 --sem-cache
```

O script usa somente a biblioteca padrão do Python.
