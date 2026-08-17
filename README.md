# Sugestões da Base de Conhecimento — GLPI 10

> Plugin GLPI 10 que sugere artigos da Base de Conhecimento em linha, ao abrir chamado.
> Chave técnica do plugin (pasta / rota AJAX): `kbhint`.

Sugere artigos da Base de Conhecimento **em linha, enquanto o usuário digita** no
formulário de abertura de chamado do GLPI 10.

É uma adaptação do plugin [tdido/glpi-kb-hint-plugin](https://github.com/tdido/glpi-kb-hint-plugin),
que só funciona no **GLPI 11** (formulário novo `/Form/Render/<id>`). Esta versão
foi reescrita para o **formulário clássico do GLPI 10**.

## Como funciona

- Injetado via hooks `add_javascript` / `add_css` em todas as páginas autenticadas.
- O JS só age nas páginas de abertura de chamado:
  - Interface padrão/técnico: `front/ticket.form.php`
  - Interface simplificada (autoatendimento): `front/helpdesk.public.php`
- Lê o **título** (`input[name="name"]`) e a **descrição** (`textarea[name="content"]`,
  incluindo o editor TinyMCE), com *debounce* de 300 ms.
- Monta uma expressão *full-text boolean* com os termos digitados e chama
  `ajax/search.php`, que usa `KnowbaseItem::getListRequest()` — respeitando as
  ACLs de visibilidade e mostrando só FAQ para quem não tem acesso à base completa.
- Mostra até 5 sugestões num *dropdown* logo abaixo do campo. Navegação por
  teclado (↑ ↓ Enter Esc); clique abre o artigo em nova aba.

## Instalação

1. Copie a pasta `kbhint` para o diretório de plugins do GLPI:

   ```
   <glpi>/plugins/kbhint
   ```

   Confira que ficou exatamente assim (a chave do plugin **precisa** ser `kbhint`,
   pois a URL do AJAX é `/plugins/kbhint/ajax/search.php`):

   ```
   plugins/kbhint/setup.php
   plugins/kbhint/hook.php
   plugins/kbhint/ajax/search.php
   plugins/kbhint/js/kbhint.js
   plugins/kbhint/css/kbhint.css
   plugins/kbhint/src/KbHint.php
   ```

2. No GLPI: **Configurar → Plugins → KB Hint → Instalar → Ativar**.

3. Abra `front/ticket.form.php` (ou o autoatendimento) e comece a digitar um
   título com pelo menos 3 letras.

## Requisitos da Base de Conhecimento

As sugestões dependem do índice **FULLTEXT** do MySQL/MariaDB sobre
`glpi_knowbaseitems`. Para aparecerem resultados:

- é preciso ter artigos publicados e visíveis para o perfil do usuário;
- artigos marcados como **FAQ** aparecem também para quem não tem permissão de
  leitura na base completa.

## Personalização rápida (em `js/kbhint.js`)

- `PANEL_TITLE` — texto do cabeçalho do dropdown.
- `MIN_QUERY_LEN` — mínimo de caracteres por termo (padrão 3).
- `DEBOUNCE_MS` — atraso após a digitação (padrão 300 ms).
- `MAX_RESULTS` — número de sugestões (padrão 5).
- `MATCH_MODE` — `'recall'` (mais abrangente) ou `'precision'` (título obrigatório).
- `STOPWORDS` — palavras curtas ignoradas (já inclui PT/EN/ES).

## Observações de deploy

- Se o servidor roda com `opcache.validate_timestamps=0`, é preciso **recarregar
  o PHP/opcache** após alterar `setup.php`/`hook.php`/`ajax/search.php`. O JS e o
  CSS são estáticos e só precisam de *hard refresh* no navegador (Ctrl+F5).
- `state=unstable` no `plugin.xml`; ajuste conforme for para produção.
