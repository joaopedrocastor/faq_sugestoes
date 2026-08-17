<?php

/**
 * Config context used to store this plugin's settings in glpi_configs.
 * Guarded so front-end pages can include this file without redefining it.
 */
if (!defined('PLUGIN_FAQ_SUGESTOES_CONFIG_CONTEXT')) {
    define('PLUGIN_FAQ_SUGESTOES_CONFIG_CONTEXT', 'plugin:faq_sugestoes');
}

/**
 * Default settings, also used as fallback by the JS when a value is missing.
 * display_mode: 'inline' (fixed list under the field), 'floating' (overlay box)
 *               or 'both'.
 */
function plugin_faq_sugestoes_getDefaultConfig(): array
{
    return [
        'enabled'       => 1,
        'max_results'   => 5,
        'min_query_len' => 3,
        'debounce_ms'   => 300,
        'match_mode'    => 'recall',
        'display_mode'  => 'inline',
        'panel_title'   => 'Artigos sugeridos',
    ];
}

/**
 * On install, seed any missing config value with its default (keeps existing
 * values on re-install / upgrade).
 */
function plugin_faq_sugestoes_install(): bool
{
    $defaults = plugin_faq_sugestoes_getDefaultConfig();
    $current  = Config::getConfigurationValues(PLUGIN_FAQ_SUGESTOES_CONFIG_CONTEXT);
    $missing  = array_diff_key($defaults, $current);
    if (!empty($missing)) {
        Config::setConfigurationValues(PLUGIN_FAQ_SUGESTOES_CONFIG_CONTEXT, $missing);
    }
    return true;
}

/**
 * On uninstall, drop this plugin's config context entirely.
 */
function plugin_faq_sugestoes_uninstall(): bool
{
    Config::deleteConfigurationValues(
        PLUGIN_FAQ_SUGESTOES_CONFIG_CONTEXT,
        array_keys(plugin_faq_sugestoes_getDefaultConfig())
    );
    return true;
}
