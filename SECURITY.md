# Política de segurança

## Versões cobertas

O projeto está em desenvolvimento ativo. Correções de segurança são aplicadas
à branch `main`; snapshots, forks ou deploys antigos não recebem manutenção
separada.

## Como reportar uma vulnerabilidade

Não publique detalhes exploráveis em issues, discussões ou pull requests.
Prefira o formulário **Report a vulnerability** na aba *Security* do
[repositório](https://github.com/SamuelNahas/Limitless-stats/security/advisories/new).
Se a divulgação privada não estiver habilitada, contate o mantenedor de forma
privada pelo perfil do GitHub. Se não houver canal privado publicado, abra uma
issue apenas para solicitar contato, sem incluir detalhes da vulnerabilidade.

Inclua, quando possível:

- componente e versão/commit afetado;
- impacto e pré-condições;
- passos mínimos de reprodução ou prova de conceito segura;
- sugestão de correção, se houver;
- se alguma credencial ou dado pessoal pode ter sido exposto.

O recebimento será confirmado assim que possível. Prazo, severidade e estratégia
de divulgação serão combinados conforme o impacto; o projeto não mantém um
programa de recompensa financeira.

## Escopo prioritário

Relatos especialmente relevantes incluem:

- bypass de RLS ou acesso cruzado a Journal, listas e perfis;
- vazamento de segredo de link, token OAuth ou credencial de CI;
- redirect OAuth inseguro, sequestro de sessão ou CSRF;
- XSS por nomes, notas, listas importadas ou dados públicos coletados;
- exposição de informações que a RPC de compartilhamento deve omitir;
- dependência comprometida com caminho de exploração no projeto.

Inconsistências de metagame, classificação de arquétipo e indisponibilidade da
fonte pública são bugs de dados, não vulnerabilidades, salvo quando permitirem
execução de código, quebra de autorização ou exposição de dados privados.

## Para operadores

- Nunca use uma chave `service_role` em `NEXT_PUBLIC_*` ou no frontend.
- Trate a URL completa de `/shared`, inclusive o fragmento, como uma credencial
  bearer e revogue links enviados ao destinatário errado.
- Mantenha a chave opcional do Limitless e segredos OAuth em secrets do ambiente.
- Após suspeita de vazamento, revogue e rotacione a credencial antes de
  republicar.
- Teste policies com usuários A/B e papel `anon` após toda migration.
- Exclua exports do Journal de logs, fixtures, artifacts e relatórios públicos.
- Aplique atualizações de dependências somente após lint, typecheck, testes e
  build concluírem com sucesso.
