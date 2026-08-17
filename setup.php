<?php

define('PLUGIN_FAQ_SUGESTOES_VERSION', '1.1.0');
define('PLUGIN_FAQ_SUGESTOES_MIN_GLPI', '10.0.0');
define('PLUGIN_FAQ_SUGESTOES_MAX_GLPI', '10.0.99');

/**
 * Init the plugin: register the hooks that inject the CSS/JS on GLPI pages.
 */
function plugin_init_faq_sugestoes(): void
{
    global $PLUGIN_HOOKS;

    // Required so the plugin's ajax endpoints are reachable without a CSRF error.
    $PLUGIN_HOOKS['csrf_compliant']['faq_sugestoes'] = true;

    // Injected on all authenticated pages (central + simplified helpdesk).
    // The JS bails out silently on anything that is not a ticket-creation form.
    $PLUGIN_HOOKS['add_javascript']['faq_sugestoes'] = 'js/faqsugestoes.js';
    $PLUGIN_HOOKS['add_css']['faq_sugestoes']        = 'css/faqsugestoes.css';

    // Adds the "gear" config link on the plugins list (Setup > Plugins).
    if (Session::haveRight('config', UPDATE)) {
        $PLUGIN_HOOKS['config_page']['faq_sugestoes'] = 'front/config.form.php';
    }

    // Adds a proper menu entry under "Administração" (like other plugins do).
    // The class itself hides the entry from users without the config right.
    $PLUGIN_HOOKS['menu_toadd']['faq_sugestoes'] = [
        'admin' => 'PluginFaqSugestoesMenu',
    ];
}

/**
 * Plugin metadata shown in the plugins list.
 */
function plugin_version_faq_sugestoes(): array
{
    return [
        'name'         => 'Sugestões da Base de Conhecimento',
        'version'      => PLUGIN_FAQ_SUGESTOES_VERSION,
        'author'       => 'João Pedro Castor Quirino',
        'license'      => 'GPLv3+',
        'homepage'     => 'https://github.com/joaopedrocastor/faq_sugestoes',
        'requirements' => [
            'glpi' => [
                'min' => PLUGIN_FAQ_SUGESTOES_MIN_GLPI,
                'max' => PLUGIN_FAQ_SUGESTOES_MAX_GLPI,
            ],
        ],
    ];
}

/**
 * Nothing to check before install.
 */
function plugin_faq_sugestoes_check_prerequisites(): bool
{
    return true;
}

/**
 * Nothing to configure at prerequisite time.
 */
function plugin_faq_sugestoes_check_config($verbose = false): bool
{
    return true;
}
