<?php

/**
 * Returns the effective plugin configuration as JSON so the frontend can honour
 * the settings chosen on the config screen (falling back to defaults).
 *
 * Returns: {"enabled": bool, "max_results": int, "min_query_len": int,
 *           "debounce_ms": int, "match_mode": "recall"|"precision",
 *           "display_mode": "inline"|"floating"|"both", "panel_title": string}
 */

include('../../../inc/includes.php');

if (!function_exists('plugin_faq_sugestoes_getDefaultConfig')) {
    include_once(__DIR__ . '/../hook.php');
}

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

if (!Session::getLoginUserID()) {
    http_response_code(403);
    echo json_encode(['error' => 'not_authenticated']);
    return;
}

$defaults = plugin_faq_sugestoes_getDefaultConfig();
$conf     = array_merge($defaults, Config::getConfigurationValues(PLUGIN_FAQ_SUGESTOES_CONFIG_CONTEXT));

$display = in_array($conf['display_mode'], ['inline', 'floating', 'both'], true)
    ? $conf['display_mode']
    : 'inline';

echo json_encode([
    'enabled'       => (int) $conf['enabled'] === 1,
    'max_results'   => (int) $conf['max_results'],
    'min_query_len' => (int) $conf['min_query_len'],
    'debounce_ms'   => (int) $conf['debounce_ms'],
    'match_mode'    => $conf['match_mode'] === 'precision' ? 'precision' : 'recall',
    'display_mode'  => $display,
    'panel_title'   => (string) $conf['panel_title'],
]);
