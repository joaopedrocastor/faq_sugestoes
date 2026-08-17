<?php

define('PLUGIN_KBHINT_VERSION', '1.0.0');
define('PLUGIN_KBHINT_MIN_GLPI', '10.0.0');
define('PLUGIN_KBHINT_MAX_GLPI', '10.0.99');

/**
 * Init the plugin: register the hooks that inject the CSS/JS on GLPI pages.
 */
function plugin_init_kbhint(): void
{
    global $PLUGIN_HOOKS;

    // Required so the plugin's ajax endpoint is reachable without a CSRF token error.
    $PLUGIN_HOOKS['csrf_compliant']['kbhint'] = true;

    // Injected on all authenticated pages (central + simplified helpdesk).
    // kbhint.js bails out silently on anything that is not a ticket-creation form.
    $PLUGIN_HOOKS['add_javascript']['kbhint'] = 'js/kbhint.js';
    $PLUGIN_HOOKS['add_css']['kbhint']        = 'css/kbhint.css';
}

/**
 * Plugin metadata shown in the plugins list.
 */
function plugin_version_kbhint(): array
{
    return [
        'name'         => 'Sugestões da Base de Conhecimento',
        'version'      => PLUGIN_KBHINT_VERSION,
        'author'       => 'Adaptado de Tomás Di Domenico (glpi-kb-hint-plugin)',
        'license'      => 'GPLv3+',
        'homepage'     => 'https://github.com/tdido/glpi-kb-hint-plugin',
        'requirements' => [
            'glpi' => [
                'min' => PLUGIN_KBHINT_MIN_GLPI,
                'max' => PLUGIN_KBHINT_MAX_GLPI,
            ],
        ],
    ];
}

/**
 * Nothing to check before install.
 */
function plugin_kbhint_check_prerequisites(): bool
{
    return true;
}

/**
 * Nothing to configure.
 */
function plugin_kbhint_check_config($verbose = false): bool
{
    return true;
}
