<?php

/**
 * Config context used to store this plugin's settings in glpi_configs.
 * Guarded so front-end pages can include this file without redefining it.
 */
if (!defined('PLUGIN_KBHINT_CONFIG_CONTEXT')) {
    define('PLUGIN_KBHINT_CONFIG_CONTEXT', 'plugin:kbhint');
}

/**
 * Default settings, also used as fallback by the JS when a value is missing.
 */
function plugin_kbhint_getDefaultConfig(): array
{
    return [
        'enabled'       => 1,
        'max_results'   => 5,
        'min_query_len' => 3,
        'debounce_ms'   => 300,
        'match_mode'    => 'recall',
        'panel_title'   => 'Artigos relacionados na Base de Conhecimento',
    ];
}

/**
 * On install, seed any missing config value with its default (keeps existing
 * values on re-install / upgrade).
 */
function plugin_kbhint_install(): bool
{
    $defaults = plugin_kbhint_getDefaultConfig();
    $current  = Config::getConfigurationValues(PLUGIN_KBHINT_CONFIG_CONTEXT);
    $missing  = array_diff_key($defaults, $current);
    if (!empty($missing)) {
        Config::setConfigurationValues(PLUGIN_KBHINT_CONFIG_CONTEXT, $missing);
    }
    return true;
}

/**
 * On uninstall, drop this plugin's config context entirely.
 */
function plugin_kbhint_uninstall(): bool
{
    Config::deleteConfigurationValues(
        PLUGIN_KBHINT_CONFIG_CONTEXT,
        array_keys(plugin_kbhint_getDefaultConfig())
    );
    return true;
}
