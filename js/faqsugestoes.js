/* global tinymce, CFG_GLPI */
/**
 * Sugestões da Base de Conhecimento (GLPI 10) — sugere artigos da KB enquanto o
 * usuário digita no formulário clássico de abertura de chamado.
 *
 * Adaptado de tdido/glpi-kb-hint-plugin (GLPI 11). Aqui o alvo é o formulário
 * clássico do GLPI 10: título em input[name="name"] e descrição em
 * textarea[name="content"] (editor TinyMCE), na interface padrão
 * (ticket.form.php) e no autoatendimento (helpdesk.public.php?create_ticket=1).
 *
 * A exibição tem 3 modos, escolhidos na tela de config (display_mode):
 *   - 'inline'   : lista fixa logo abaixo do campo (padrão);
 *   - 'floating' : caixa flutuante ancorada no campo;
 *   - 'both'     : as duas ao mesmo tempo.
 */
(function () {
    'use strict';

    const DEBUG_PREFIX = '[faq_sugestoes]';
    const MAX_TOKENS = 8;

    // Runtime settings, carregadas de ajax/config.php (a tela de configuração).
    // Estes padrões valem até a requisição resolver e como fallback se ela falhar.
    // Mantenha em sincronia com plugin_faq_sugestoes_getDefaultConfig() no hook.php.
    const CFG = {
        enabled: true,
        minQueryLen: 3,
        debounceMs: 300,
        maxResults: 5,
        matchMode: 'recall',          // 'recall' (mais amplo) | 'precision' (título obrigatório)
        displayMode: 'inline',        // 'inline' | 'floating' | 'both'
        panelTitle: 'Artigos sugeridos',
    };

    // Palavras curtas ignoradas ao montar os termos de busca (PT/EN/ES).
    const STOPWORDS = new Set([
        // English (InnoDB default)
        'a', 'about', 'an', 'are', 'as', 'at', 'be', 'by', 'com', 'de', 'en', 'for', 'from',
        'how', 'i', 'in', 'is', 'it', 'la', 'of', 'on', 'or', 'that', 'the', 'this', 'to',
        'was', 'what', 'when', 'where', 'who', 'will', 'with', 'und', 'www',
        // Portuguese
        'o', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'do', 'dos', 'da', 'das', 'no', 'nos',
        'na', 'nas', 'ao', 'aos', 'com', 'por', 'para', 'que', 'se', 'ou', 'e', 'nao', 'sim',
        'meu', 'sua', 'seu', 'como', 'mas', 'quando', 'onde', 'qual', 'ja', 'muito', 'mais',
        'esta', 'este', 'isso', 'sao', 'foi', 'ser', 'ter', 'tem',
        // Spanish
        'el', 'los', 'un', 'una', 'unos', 'unas', 'del', 'al', 'con', 'lo', 'le', 'les',
        'me', 'te', 'mi', 'tu', 'su', 'sus', 'es', 'son', 'fue', 'pero', 'sino', 'donde',
        'quien', 'cual', 'si', 'ya', 'mas', 'y', 'u',
    ]);

    if (!isTicketCreatePage()) {
        return;
    }

    const root = readRootDoc();
    const PLUGIN_BASE = pluginBase();

    // Load settings first, then wire up the form (unless disabled in config).
    loadConfig().then(() => {
        if (!CFG.enabled) {
            return;
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
        } else {
            bootstrap();
        }
    });

    function loadConfig() {
        return fetch(PLUGIN_BASE + '/ajax/config.php', {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' },
        }).then((res) => (res.ok ? res.json() : null)).then((cfg) => {
            if (!cfg || typeof cfg !== 'object') {
                return;
            }
            if (typeof cfg.enabled === 'boolean') {
                CFG.enabled = cfg.enabled;
            }
            if (cfg.min_query_len) {
                CFG.minQueryLen = cfg.min_query_len;
            }
            if (cfg.debounce_ms) {
                CFG.debounceMs = cfg.debounce_ms;
            }
            if (cfg.max_results) {
                CFG.maxResults = cfg.max_results;
            }
            if (cfg.match_mode) {
                CFG.matchMode = cfg.match_mode;
            }
            if (cfg.display_mode) {
                CFG.displayMode = cfg.display_mode;
            }
            if (typeof cfg.panel_title === 'string' && cfg.panel_title) {
                CFG.panelTitle = cfg.panel_title;
            }
        }).catch(() => {
            // Erro de rede/endpoint: mantém os padrões acima.
        });
    }

    function bootstrap() {
        if (waitForForm(attachToForm)) {
            return;
        }
        // O formulário costuma ser renderizado de forma assíncrona; observe-o surgir.
        const observer = new MutationObserver(() => {
            if (waitForForm(attachToForm)) {
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 30000);
    }

    function waitForForm(cb) {
        const titleInput = document.querySelector('input[name="name"]');
        const textarea = document.querySelector('textarea[name="content"]');
        if (!titleInput && !textarea) {
            return false;
        }
        cb(titleInput, textarea);
        return true;
    }

    function attachToForm(titleInput, textarea) {
        const descriptionField = textarea ? wrapDescription(textarea) : null;

        if (!titleInput && !descriptionField) {
            console.warn(DEBUG_PREFIX, 'Nenhum campo de título ou descrição encontrado neste formulário.');
            return;
        }

        const state = {
            titleInput,
            descriptionField,
            anchorEl: titleInput || (descriptionField && descriptionField.anchor),
            controller: null,
            debounceHandle: null,
            views: [],
            items: [],
            selectedIndex: -1,
            lastExpression: '',
            dismissedExpression: null,
        };

        const wantFloating = CFG.displayMode === 'floating' || CFG.displayMode === 'both';
        const wantInline = CFG.displayMode === 'inline' || CFG.displayMode === 'both';

        if (wantFloating) {
            const fv = createFloatingView(state);
            document.body.appendChild(fv.root);
            state.views.push(fv);
        }
        if (wantInline) {
            const iv = createInlineView(state);
            if (iv) {
                state.views.push(iv);
            }
        }

        bindInput(state);
        bindOutsideClick(state);
        bindReposition(state);
    }

    // ---- Views -------------------------------------------------------------

    function articleUrl(item) {
        return root + '/front/knowbaseitem.form.php?id=' + encodeURIComponent(item.id);
    }

    function buildLink(item) {
        const a = document.createElement('a');
        a.href = articleUrl(item);
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = stripTags(String(item.name));
        return a;
    }

    // Floating overlay box anchored below the active field.
    function createFloatingView(state) {
        const panel = document.createElement('div');
        panel.className = 'faqsug-panel';
        panel.hidden = true;

        const header = document.createElement('div');
        header.className = 'faqsug-header';

        const headerTitle = document.createElement('span');
        headerTitle.className = 'faqsug-header-title';
        headerTitle.textContent = CFG.panelTitle;
        header.appendChild(headerTitle);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'faqsug-close';
        closeBtn.setAttribute('aria-label', 'Fechar sugestões');
        closeBtn.title = 'Fechar';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => dismiss(state));
        header.appendChild(closeBtn);

        panel.appendChild(header);

        const ul = document.createElement('ul');
        ul.className = 'faqsug-list';
        ul.setAttribute('role', 'listbox');
        ul.setAttribute('aria-label', 'Sugestões da base de conhecimento');
        panel.appendChild(ul);

        const live = document.createElement('span');
        live.className = 'faqsug-live';
        live.setAttribute('aria-live', 'polite');

        const rootEl = document.createElement('div');
        rootEl.className = 'faqsug-root';
        rootEl.appendChild(panel);
        rootEl.appendChild(live);

        return {
            type: 'floating',
            root: rootEl,
            list: ul,
            setResults(items) {
                ul.textContent = '';
                for (const item of items) {
                    const li = document.createElement('li');
                    li.className = 'faqsug-item';
                    li.setAttribute('role', 'option');
                    li.appendChild(buildLink(item));
                    ul.appendChild(li);
                }
            },
            show() {
                panel.hidden = false;
                positionFloating(state, panel);
                live.textContent = state.items.length + (state.items.length === 1 ? ' sugestão' : ' sugestões');
            },
            hide() {
                panel.hidden = true;
                live.textContent = '';
            },
            isHidden() {
                return panel.hidden;
            },
            reposition() {
                if (!panel.hidden) {
                    positionFloating(state, panel);
                }
            },
        };
    }

    // Fixed list inserted right below the title field (matches the reference print).
    function createInlineView(state) {
        const host = inlineHost(state);
        if (!host || !host.parentNode) {
            return null;
        }

        const box = document.createElement('div');
        box.className = 'faqsug-inline';
        box.hidden = true;

        const title = document.createElement('div');
        title.className = 'faqsug-inline-title';
        title.textContent = CFG.panelTitle;
        box.appendChild(title);

        const ul = document.createElement('ul');
        ul.className = 'faqsug-inline-list';
        box.appendChild(ul);

        host.parentNode.insertBefore(box, host.nextSibling);

        return {
            type: 'inline',
            root: box,
            list: ul,
            setResults(items) {
                ul.textContent = '';
                for (const item of items) {
                    const li = document.createElement('li');
                    li.className = 'faqsug-item';
                    li.appendChild(buildLink(item));
                    ul.appendChild(li);
                }
            },
            show() {
                box.hidden = false;
            },
            hide() {
                box.hidden = true;
            },
            isHidden() {
                return box.hidden;
            },
            reposition() {},
        };
    }

    // Best-effort container to hang the inline list after: the field's wrapper,
    // falling back to the input's parent.
    function inlineHost(state) {
        const el = state.titleInput || (state.descriptionField && state.descriptionField.anchor);
        if (!el) {
            return null;
        }
        return el.closest('.form-field, .form-group, [class*="col-"]') || el.parentElement || el;
    }

    // ---- Input wiring ------------------------------------------------------

    function wrapDescription(textarea) {
        const id = textarea.id;
        let pendingHandler = null;
        let editorAttached = false;
        const editorReadyCallbacks = [];

        const wrapper = {
            anchor: textarea,
            editor: null,
            getValue: () => textarea.value || '',
            onChange: (handler) => {
                pendingHandler = handler;
                textarea.addEventListener('input', handler);
                tryAttachTinyMCE();
            },
            whenEditorReady: (cb) => {
                if (wrapper.editor) {
                    cb(wrapper.editor);
                } else {
                    editorReadyCallbacks.push(cb);
                }
            },
        };

        function tryAttachTinyMCE() {
            if (editorAttached) {
                return true;
            }
            if (typeof tinymce === 'undefined' || !id) {
                return false;
            }
            const editor = tinymce.get(id);
            if (!editor) {
                return false;
            }
            editorAttached = true;
            wrapper.editor = editor;
            wrapper.anchor = editor.getContainer() || textarea;
            wrapper.getValue = () => editor.getContent({ format: 'text' }) || '';
            if (pendingHandler) {
                editor.on('input keyup change', () => pendingHandler());
            }
            for (const cb of editorReadyCallbacks) {
                cb(editor);
            }
            editorReadyCallbacks.length = 0;
            return true;
        }

        if (!tryAttachTinyMCE()) {
            if (typeof tinymce !== 'undefined' && typeof tinymce.on === 'function') {
                tinymce.on('AddEditor', (e) => {
                    if (e && e.editor && e.editor.id === id) {
                        tryAttachTinyMCE();
                    }
                });
            }
            let polls = 0;
            const poll = setInterval(() => {
                if (tryAttachTinyMCE() || ++polls > 50) {
                    clearInterval(poll);
                }
            }, 200);
        }

        return wrapper;
    }

    function bindInput(state) {
        if (state.titleInput) {
            state.titleInput.addEventListener('input', () => onTyping(state, state.titleInput));
            state.titleInput.addEventListener('focus', () => onTyping(state, state.titleInput));
            state.titleInput.addEventListener('keydown', (e) => onKeydown(state, e));
        }
        if (state.descriptionField) {
            state.descriptionField.onChange(() => onTyping(state, state.descriptionField.anchor));
            state.descriptionField.whenEditorReady((editor) => {
                if (typeof editor.on === 'function') {
                    editor.on('focus', () => onTyping(state, state.descriptionField.anchor));
                }
            });
        }
    }

    function onTyping(state, anchor) {
        state.anchorEl = anchor;
        clearTimeout(state.debounceHandle);
        state.debounceHandle = setTimeout(() => runQuery(state), CFG.debounceMs);
    }

    function runQuery(state) {
        const titleVal = state.titleInput ? state.titleInput.value : '';
        const descVal = state.descriptionField ? state.descriptionField.getValue() : '';

        const titleTokens = tokenize(titleVal);
        const descTokens = tokenize(descVal, titleTokens);
        const expression = buildBooleanExpression(titleTokens, descTokens);

        state.lastExpression = expression;

        if (!expression) {
            render(state, []);
            return;
        }

        if (expression === state.dismissedExpression) {
            return;
        }
        state.dismissedExpression = null;

        search(state, expression).then((results) => {
            if (results !== null) {
                render(state, results);
            }
        });
    }

    function tokenize(text, alreadySeen) {
        if (!text) {
            return [];
        }
        const seen = new Set(alreadySeen || []);
        const tokens = [];
        const matches = text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) || [];
        for (const tok of matches) {
            if (tok.length < CFG.minQueryLen) {
                continue;
            }
            if (STOPWORDS.has(tok)) {
                continue;
            }
            if (seen.has(tok)) {
                continue;
            }
            seen.add(tok);
            tokens.push(tok);
            if (tokens.length >= MAX_TOKENS) {
                break;
            }
        }
        return tokens;
    }

    function buildBooleanExpression(titleTokens, descTokens) {
        if (CFG.matchMode === 'recall') {
            const all = titleTokens.concat(descTokens);
            if (all.length === 0) {
                return '';
            }
            return all.map((t) => t + '*').join(' ');
        }
        const required = titleTokens.length > 0 ? titleTokens : descTokens;
        const boosters = titleTokens.length > 0 ? descTokens : [];
        if (required.length === 0) {
            return '';
        }
        const parts = [];
        for (const t of required) {
            parts.push('+' + t + '*');
        }
        for (const t of boosters) {
            parts.push(t + '*');
        }
        return parts.join(' ');
    }

    function search(state, value) {
        if (state.controller) {
            state.controller.abort();
        }
        state.controller = new AbortController();
        const params = new URLSearchParams();
        params.set('q', value);

        const url = PLUGIN_BASE + '/ajax/search.php?' + params.toString();
        return fetch(url, {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' },
            signal: state.controller.signal,
        }).then((res) => {
            if (res.status === 403) {
                console.warn(DEBUG_PREFIX, 'Busca retornou 403; ACL pode ter filtrado os resultados.');
                return [];
            }
            if (!res.ok) {
                console.warn(DEBUG_PREFIX, 'Busca falhou:', res.status);
                return [];
            }
            return res.json();
        }).then((payload) => {
            if (!payload || !Array.isArray(payload.data)) {
                return [];
            }
            return payload.data.filter((item) => item && item.id && item.name);
        }).catch((err) => {
            if (err && err.name === 'AbortError') {
                return null;
            }
            console.warn(DEBUG_PREFIX, 'Erro na busca:', err);
            return [];
        });
    }

    // ---- Rendering / selection --------------------------------------------

    function render(state, results) {
        state.items = results.slice(0, CFG.maxResults);
        state.selectedIndex = -1;

        for (const view of state.views) {
            if (state.items.length === 0) {
                view.hide();
            } else {
                view.setResults(state.items);
                view.show();
            }
        }
    }

    function anyViewVisible(state) {
        return state.views.some((v) => !v.isHidden());
    }

    function onKeydown(state, event) {
        if (!anyViewVisible(state) || state.items.length === 0) {
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            moveSelection(state, 1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            moveSelection(state, -1);
        } else if (event.key === 'Enter' && state.selectedIndex >= 0) {
            event.preventDefault();
            const item = state.items[state.selectedIndex];
            if (item) {
                window.open(articleUrl(item), '_blank', 'noopener');
            }
        } else if (event.key === 'Escape') {
            dismiss(state);
        }
    }

    function moveSelection(state, delta) {
        const next = (state.selectedIndex + delta + state.items.length) % state.items.length;
        for (const view of state.views) {
            const children = view.list.children;
            for (let i = 0; i < children.length; i++) {
                if (i === next) {
                    children[i].setAttribute('aria-selected', 'true');
                } else {
                    children[i].removeAttribute('aria-selected');
                }
            }
        }
        state.selectedIndex = next;
    }

    function dismiss(state) {
        state.dismissedExpression = state.lastExpression || '';
        if (state.controller) {
            state.controller.abort();
            state.controller = null;
        }
        for (const view of state.views) {
            view.hide();
        }
    }

    // Hide only floating views when the user clicks elsewhere (inline views are
    // part of the form flow and stay put).
    function hideFloating(state) {
        for (const view of state.views) {
            if (view.type === 'floating') {
                view.hide();
            }
        }
    }

    function bindOutsideClick(state) {
        const hasFloating = state.views.some((v) => v.type === 'floating');
        if (!hasFloating) {
            return;
        }

        document.addEventListener('pointerdown', (event) => {
            const target = event.target;
            if (target.closest && target.closest('.faqsug-panel')) {
                return;
            }
            if (state.titleInput && state.titleInput.contains && state.titleInput.contains(target)) {
                return;
            }
            if (state.descriptionField && state.descriptionField.anchor && state.descriptionField.anchor.contains && state.descriptionField.anchor.contains(target)) {
                return;
            }
            hideFloating(state);
        });

        if (state.descriptionField && typeof state.descriptionField.whenEditorReady === 'function') {
            state.descriptionField.whenEditorReady((editor) => {
                const dismissIfNotForUs = () => {
                    if (state.anchorEl !== state.descriptionField.anchor) {
                        hideFloating(state);
                    }
                };
                if (typeof editor.on === 'function') {
                    editor.on('click mousedown', dismissIfNotForUs);
                }
                const doc = typeof editor.getDoc === 'function' ? editor.getDoc() : null;
                if (doc) {
                    doc.addEventListener('mousedown', dismissIfNotForUs, true);
                    doc.addEventListener('pointerdown', dismissIfNotForUs, true);
                }
            });
        }
    }

    function positionFloating(state, panel) {
        if (!state.anchorEl || panel.hidden) {
            return;
        }
        const rect = state.anchorEl.getBoundingClientRect();
        panel.style.top = (rect.bottom + window.scrollY) + 'px';
        panel.style.left = (rect.left + window.scrollX) + 'px';
        panel.style.minWidth = rect.width + 'px';
    }

    function bindReposition(state) {
        const reposition = () => {
            for (const view of state.views) {
                view.reposition();
            }
        };
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
    }

    // ---- Page / environment helpers ---------------------------------------

    /**
     * True apenas nas páginas de "Criar um chamado" do GLPI 10:
     *   - interface padrão/técnico: front/ticket.form.php
     *   - autoatendimento: front/helpdesk.public.php?create_ticket=1
     * A home do autoatendimento também é helpdesk.public.php, por isso exigimos
     * o parâmetro create_ticket lá. A descoberta de campos ainda protege contra
     * falsos positivos.
     */
    function isTicketCreatePage() {
        const path = window.location.pathname;
        if (/\/front\/ticket\.form\.php$/.test(path)) {
            return true;
        }
        if (/\/front\/helpdesk\.public\.php$/.test(path)) {
            return /(^|[?&])create_ticket(=|&|$)/.test(window.location.search);
        }
        return false;
    }

    // Base web path do próprio plugin (…/plugins/<pasta>), derivada do <script>
    // que carregou este arquivo — assim funciona mesmo se a pasta for renomeada.
    function pluginBase() {
        try {
            const src = document.currentScript && document.currentScript.src;
            if (src) {
                return src.replace(/\/js\/[^/]*$/, '');
            }
        } catch (e) {
            // ignore
        }
        return root + '/plugins/faq_sugestoes';
    }

    function readRootDoc() {
        if (typeof CFG_GLPI !== 'undefined' && typeof CFG_GLPI.root_doc === 'string') {
            return CFG_GLPI.root_doc;
        }
        if (window.CFG_GLPI && typeof window.CFG_GLPI.root_doc === 'string') {
            return window.CFG_GLPI.root_doc;
        }
        return '';
    }

    function stripTags(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    }
})();
