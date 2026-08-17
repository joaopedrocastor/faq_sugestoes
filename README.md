# Sugestões da Base de Conhecimento — GLPI 10

> Plugin GLPI 10 que sugere artigos da Base de Conhecimento **em linha, enquanto o
> usuário digita** no formulário de abertura de chamado.
> Chave técnica do plugin (pasta / rota AJAX): **`faq_sugestoes`**.

É uma adaptação do plugin [tdido/glpi-kb-hint-plugin](https://github.com/tdido/glpi-kb-hint-plugin),
que só funciona no **GLPI 11** (formulário novo `/Form/Render/<id>`). Esta versão
foi reescrita para o **formulário clássico do GLPI 10**.

## Como funciona

- Injetado via hooks `add_javascript` / `add_css` em todas as páginas autenticadas.
- O JS só age nas páginas de **abertura de chamado**:
  - Interface padrão/técnico: `front/ticket.form.php`
  - Interface simplificada (autoatendimento): `front/helpdesk.public.php?create_ticket=1`
- Lê o **título** (`input[name="name"]`) e a **descrição** (`textarea[name="content"]`,
  incluindo o editor TinyMCE), com *debounce* configurável.
- Monta uma expressão *full-text boolean* com os termos digitados e chama
  `ajax/search.php`, que usa `KnowbaseItem::getListRequest()` — respeitando as
  ACLs de visibilidade e mostrando só FAQ para quem não tem acesso à base completa.
- Mostra até N sugestões. **Modo de exibição configurável**:
  - `inline` (padrão): lista fixa logo abaixo do campo;
  - `floating`: caixa flutuante ancorada no campo;
  - `both`: as duas ao mesmo tempo.
- Navegação por teclado (↑ ↓ Enter Esc); clique abre o artigo em nova aba.

## Instalação

1. Dentro de `<glpi>/plugins`, clone o repositório **para a pasta `faq_sugestoes`**
   (o nome da pasta é a chave do plugin e precisa ser exatamente esse):

   ```bash
   git clone https://github.com/joaopedrocastor/faq_sugestoes.git faq_sugestoes
   ```

   Estrutura resultante:

   ```
   plugins/faq_sugestoes/setup.php
   plugins/faq_sugestoes/hook.php
   plugins/faq_sugestoes/ajax/search.php
   plugins/faq_sugestoes/ajax/config.php
   plugins/faq_sugestoes/front/config.form.php
   plugins/faq_sugestoes/js/faqsugestoes.js
   plugins/faq_sugestoes/css/faqsugestoes.css
   ```

2. No GLPI: **Configurar → Plugins → Sugestões da Base de Conhecimento → Instalar → Ativar**.

3. Abra "Criar um chamado" (ou `front/ticket.form.php`) e comece a digitar um
   título com pelo menos 3 letras.

## Tela de configuração

Em **Configurar → Plugins**, clique na engrenagem do plugin (requer permissão de
*Configuração → Atualizar*). As opções são salvas no banco (`glpi_configs`,
contexto `plugin:faq_sugestoes`) e aplicadas ao JS via `ajax/config.php`:

- **Ativo** — liga/desliga as sugestões sem desativar o plugin.
- **Modo de exibição** — Lista fixa / Caixa flutuante / Ambas.
- **Número máximo de sugestões** (1–10, padrão 5).
- **Mínimo de caracteres por termo** (2–5, padrão 3).
- **Atraso após digitar** em ms (100–2000, padrão 300).
- **Modo de correspondência** — Abrangente (recall) ou Preciso (título obrigatório).
- **Texto do cabeçalho** da lista de sugestões.

A lista de *stopwords* (palavras curtas ignoradas, já com PT/EN/ES) fica em
`js/faqsugestoes.js`, por ser mais técnica.

## Requisitos da Base de Conhecimento

As sugestões dependem do índice **FULLTEXT** do MySQL/MariaDB sobre
`glpi_knowbaseitems`. Para aparecerem resultados é preciso ter artigos publicados
e visíveis para o perfil do usuário; artigos marcados como **FAQ** aparecem também
para quem não tem permissão de leitura na base completa.

## Observações de deploy

- Com `opcache.validate_timestamps=0`, recarregue o PHP/opcache após alterar
  qualquer `.php`. O JS/CSS são estáticos e só precisam de *hard refresh* (Ctrl+F5).
- `state=unstable` no `plugin.xml`; ajuste para produção quando validado.
