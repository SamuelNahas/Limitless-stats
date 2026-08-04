# Escopo do produto

## P0 — experiência pública e local

- Metagame Standard Online da era Pitch Black.
- Catálogo e detalhe visual de decks.
- Matriz e explorador responsivo de matchups geral, MD1 e MD3.
- Cinco políticas configuráveis para empates.
- Battle Journal manual com importação de texto do Pokémon TCG Live.
- Estatísticas pessoais, exportação JSON e persistência local sem conta.

## P1 — conta gratuita opcional

- Login Google via Supabase.
- Sincronização manual e bidirecional de torneios, listas e rodadas.
- Exclusões locais propagadas na sincronização seguinte.
- Links bearer revogáveis para um resumo somente leitura.

O modo local continua sendo o padrão. Login não inicia upload; sincronização e
compartilhamento exigem ação explícita no Journal.

## Fora do escopo atual

- Pokémon Pocket, podcast, badges, prize checker e feed social;
- importação automática do histórico pessoal do TCG Live ou Limitless;
- recomendação determinística ou garantia de resultado;
- colaboração multiusuário em um mesmo Journal;
- armazenamento próprio das artes oficiais de Pokémon.

## Preparação para rotações

Os três domínios identificam formato e era/temporada de maneiras compatíveis,
mas não idênticas:

- o manifesto público usa `formatId` e `eraId`;
- o Journal local usa `formatId` e `eraId`;
- o Supabase usa `format_id`, `format_slug`, `season_id` e `era_slug`.

`configs/eras/standard-pitch-black.json` define coleta, conversão e manifesto;
as telas e novos eventos do Journal consomem o escopo publicado. Uma rotação
ainda precisa selecionar a nova configuração no workflow e adicionar uma nova
migration que encerre a temporada anterior e insira a próxima com
`seasons.slug` igual ao novo `eraId`. Migrations já aplicadas não devem ser
editadas. O banco não lê o arquivo JSON em runtime.
