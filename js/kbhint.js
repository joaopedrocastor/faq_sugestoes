/* global tinymce, CFG_GLPI */
/**
 * KB Hint (GLPI 10) — inline Knowledge Base suggestions while opening a ticket.
 *
 * Adapted from tdido/glpi-kb-hint-plugin (GLPI 11). The GLPI 11 version targets
 * the new end-user Form renderer (/Form/Render/<id>, fields named answers_*).
 * GLPI 10 uses the classic ticket form instead, so this build:
 *   - triggers on ticket.form.php (central) and helpdesk.public.php (self-service);
 *   - reads the title from input[name="name"] and the description from
 *     textarea[name="content"] (a TinyMCE editor).
 * Everything below the field discovery is unchanged in spirit from the original.
 */
(function () {
    'use strict';

    const DEBUG_PREFIX = '[kbhint]';
    const MIN_QUERY_LEN = 3;
    const DEBOUNCE_MS = 300;
    const MAX_RESULTS = 5;
    const MAX_TOKENS = 8;
    // Header shown above the suggestion list.
    const PANEL_TITLE = 'Artigos relacionados na Base de Conhecimento';
    // 'recall'    = OR across title + description tokens (wider net, all ranked together).
    // 'precision' = title tokens required, description tokens only boost score.
    const MATCH_MODE = 'recall';
    // Common short words that, once turned into prefix-wildcard tokens (for*, the*, para*),
    // would match too broadly: MySQL FT does not apply its stopword filter to wildcard
    // prefixes. Mirrors InnoDB's built-in English stopword list plus common Portuguese and
    // Spanish articles, prepositions, conjunctions and pronouns. Entries must be lowercase.
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
    } else {
        bootstrap();
    }

    function bootstrap() {
        if (waitForForm(attachToForm)) {
            return;
        }
        // The ticket form is often rendered asynchronously; watch for it to appear.
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
            console.warn(DEBUG_PREFIX, 'No title or description field discovered on this form.');
            return;
        }

        const state = {
            titleInput,
            descriptionField,
            anchorEl: titleInput || (descriptionField && descriptionField.anchor),
            controller: null,
            debounceHandle: null,
            dropdown: null,
            items: [],
            selectedIndex: -1,
            lastExpression: '',
            dismissedExpression: null,
        };

        state.dropdown = createDropdown();
        document.body.appendChild(state.dropdown.root);

        state.dropdown.closeBtn.addEventListener('click', () => dismiss(state));

        bindInput(state);
        bindOutsideClick(state);
        bindReposition(state);
    }

    function dismiss(state) {
        state.dismissedExpression = state.lastExpression || '';
        if (state.controller) {
            state.controller.abort();
            state.controller = null;
        }
        state.dropdown.panel.hidden = true;
        state.dropdown.live.textContent = '';
    }

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
        state.debounceHandle = setTimeout(() => runQuery(state), DEBOUNCE_MS);
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
            if (tok.length < MIN_QUERY_LEN) {
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
        if (MATCH_MODE === 'recall') {
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

        const url = root + '/plugins/kbhint/ajax/search.php?' + params.toString();
        return fetch(url, {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' },
            signal: state.controller.signal,
        }).then((res) => {
            if (res.status === 403) {
                console.warn(DEBUG_PREFIX, 'KB search returned 403; ACL may have filtered results.');
                return [];
            }
            if (!res.ok) {
                console.warn(DEBUG_PREFIX, 'KB search failed:', res.status);
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
            console.warn(DEBUG_PREFIX, 'KB search error:', err);
            return [];
        });
    }

    function createDropdown() {
        const panel = document.createElement('div');
        panel.className = 'kbhint-panel';
        panel.hidden = true;

        const header = document.createElement('div');
        header.className = 'kbhint-header';

        const headerTitle = document.createElement('span');
        headerTitle.className = 'kbhint-header-title';
        headerTitle.textContent = PANEL_TITLE;
        header.appendChild(headerTitle);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'kbhint-close';
        closeBtn.setAttribute('aria-label', 'Fechar sugestões');
        closeBtn.title = 'Fechar';
        closeBtn.textContent = '×';
        header.appendChild(closeBtn);

        panel.appendChild(header);

        const ul = document.createElement('ul');
        ul.className = 'kbhint-list';
        ul.setAttribute('role', 'listbox');
        ul.setAttribute('aria-label', 'Sugestões da base de conhecimento');
        panel.appendChild(ul);

        const live = document.createElement('span');
        live.className = 'kbhint-live';
        live.setAttribute('aria-live', 'polite');

        const rootEl = document.createElement('div');
        rootEl.className = 'kbhint-root';
        rootEl.appendChild(panel);
        rootEl.appendChild(live);

        return { root: rootEl, panel, list: ul, live, closeBtn };
    }

    function render(state, results) {
        const list = state.dropdown.list;
        list.textContent = '';
        state.items = results.slice(0, MAX_RESULTS);
        state.selectedIndex = -1;

        if (state.items.length === 0) {
            state.dropdown.panel.hidden = true;
            state.dropdown.live.textContent = '';
            return;
        }

        for (const item of state.items) {
            const li = document.createElement('li');
            li.className = 'kbhint-item';
            li.setAttribute('role', 'option');

            const a = document.createElement('a');
            a.href = root + '/front/knowbaseitem.form.php?id=' + encodeURIComponent(item.id);
            a.target = '_blank';
            a.rel = 'noopener';
            a.textContent = stripTags(String(item.name));

            li.appendChild(a);
            list.appendChild(li);
        }

        state.dropdown.panel.hidden = false;
        positionDropdown(state);
        state.dropdown.live.textContent = state.items.length + (state.items.length === 1 ? ' sugestão' : ' sugestões');
    }

    function positionDropdown(state) {
        if (!state.anchorEl || state.dropdown.panel.hidden) {
            return;
        }
        const rect = state.anchorEl.getBoundingClientRect();
        const top = rect.bottom + window.scrollY;
        const left = rect.left + window.scrollX;
        state.dropdown.panel.style.top = top + 'px';
        state.dropdown.panel.style.left = left + 'px';
        state.dropdown.panel.style.minWidth = rect.width + 'px';
    }

    function onKeydown(state, event) {
        if (state.dropdown.panel.hidden || state.items.length === 0) {
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
            const a = state.dropdown.list.children[state.selectedIndex].querySelector('a');
            if (a) {
                window.open(a.href, a.target || '_blank', 'noopener');
            }
        } else if (event.key === 'Escape') {
            dismiss(state);
        }
    }

    function moveSelection(state, delta) {
        const next = (state.selectedIndex + delta + state.items.length) % state.items.length;
        for (const li of state.dropdown.list.children) {
            li.removeAttribute('aria-selected');
        }
        const target = state.dropdown.list.children[next];
        target.setAttribute('aria-selected', 'true');
        state.selectedIndex = next;
    }

    function bindOutsideClick(state) {
        document.addEventListener('pointerdown', (event) => {
            const target = event.target;
            if (target.closest && target.closest('.kbhint-panel')) {
                return;
            }
            if (state.titleInput && state.titleInput.contains && state.titleInput.contains(target)) {
                return;
            }
            if (state.descriptionField && state.descriptionField.anchor && state.descriptionField.anchor.contains && state.descriptionField.anchor.contains(target)) {
                return;
            }
            state.dropdown.panel.hidden = true;
        });

        if (state.descriptionField && typeof state.descriptionField.whenEditorReady === 'function') {
            state.descriptionField.whenEditorReady((editor) => {
                const dismissIfNotForUs = () => {
                    if (state.anchorEl !== state.descriptionField.anchor) {
                        state.dropdown.panel.hidden = true;
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

    function bindReposition(state) {
        const reposition = () => positionDropdown(state);
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
    }

    /**
     * True only on the "Criar um chamado" (ticket-creation) pages in GLPI 10:
     *   - central / technician interface: front/ticket.form.php
     *   - simplified self-service interface: front/helpdesk.public.php?create_ticket=1
     * The self-service home is also helpdesk.public.php, so we require the
     * create_ticket flag there to avoid running on the dashboard or ticket list.
     * The field-discovery step below still guards against false positives.
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
