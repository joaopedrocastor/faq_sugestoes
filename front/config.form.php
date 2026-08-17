<?php

/**
 * Configuration screen for the "Sugestões da Base de Conhecimento" plugin (GLPI 10).
 * Reachable via Setup > Plugins > (gear icon on the plugin row).
 */

include('../../../inc/includes.php');

// Reuse the defaults + config-context helpers defined in hook.php.
if (!function_exists('plugin_faq_sugestoes_getDefaultConfig')) {
    include_once(__DIR__ . '/../hook.php');
}

// Only users allowed to change global configuration may touch these settings.
Session::checkRight('config', UPDATE);

$defaults = plugin_faq_sugestoes_getDefaultConfig();

// Save.
if (isset($_POST['update'])) {
    Session::checkCSRF($_POST);

    $display = ($_POST['display_mode'] ?? '');
    if (!in_array($display, ['inline', 'floating', 'both'], true)) {
        $display = $defaults['display_mode'];
    }

    $values = [
        'enabled'       => isset($_POST['enabled']) && (int) $_POST['enabled'] === 1 ? 1 : 0,
        'max_results'   => max(1, min(10, (int) ($_POST['max_results'] ?? $defaults['max_results']))),
        'min_query_len' => max(2, min(5, (int) ($_POST['min_query_len'] ?? $defaults['min_query_len']))),
        'debounce_ms'   => max(100, min(2000, (int) ($_POST['debounce_ms'] ?? $defaults['debounce_ms']))),
        'match_mode'    => (($_POST['match_mode'] ?? '') === 'precision') ? 'precision' : 'recall',
        'display_mode'  => $display,
        'panel_title'   => trim((string) ($_POST['panel_title'] ?? $defaults['panel_title'])),
    ];
    if ($values['panel_title'] === '') {
        $values['panel_title'] = $defaults['panel_title'];
    }

    Config::setConfigurationValues(PLUGIN_FAQ_SUGESTOES_CONFIG_CONTEXT, $values);
    Session::addMessageAfterRedirect(__('Configuração salva com sucesso.'), false, INFO);
    Html::back();
}

// Effective config = stored values merged over defaults.
$conf = array_merge($defaults, Config::getConfigurationValues(PLUGIN_FAQ_SUGESTOES_CONFIG_CONTEXT));

Html::header(
    'Sugestões da Base de Conhecimento',
    $_SERVER['PHP_SELF'],
    'config',
    'plugin'
);

echo "<form method='post' action='" . htmlspecialchars($_SERVER['PHP_SELF']) . "'>";
echo "<div class='center' style='max-width:760px;margin:0 auto;'>";
echo "<table class='tab_cadre_fixe'>";

echo "<tr><th colspan='2'>Sugestões da Base de Conhecimento — Configuração</th></tr>";

echo "<tr class='tab_bg_1'>";
echo "<td width='45%'>Ativo</td><td>";
Dropdown::showYesNo('enabled', (int) $conf['enabled']);
echo "</td></tr>";

echo "<tr class='tab_bg_1'>";
echo "<td>Modo de exibição</td><td>";
Dropdown::showFromArray('display_mode', [
    'inline'   => 'Lista fixa abaixo do campo',
    'floating' => 'Caixa flutuante',
    'both'     => 'Ambas',
], ['value' => $conf['display_mode']]);
echo "</td></tr>";

echo "<tr class='tab_bg_1'>";
echo "<td>Número máximo de sugestões exibidas</td><td>";
echo Html::input('max_results', [
    'type'  => 'number',
    'value' => (int) $conf['max_results'],
    'min'   => 1,
    'max'   => 10,
    'step'  => 1,
]);
echo "</td></tr>";

echo "<tr class='tab_bg_1'>";
echo "<td>Mínimo de caracteres por termo</td><td>";
echo Html::input('min_query_len', [
    'type'  => 'number',
    'value' => (int) $conf['min_query_len'],
    'min'   => 2,
    'max'   => 5,
    'step'  => 1,
]);
echo "</td></tr>";

echo "<tr class='tab_bg_1'>";
echo "<td>Atraso após digitar (ms)</td><td>";
echo Html::input('debounce_ms', [
    'type'  => 'number',
    'value' => (int) $conf['debounce_ms'],
    'min'   => 100,
    'max'   => 2000,
    'step'  => 50,
]);
echo "</td></tr>";

echo "<tr class='tab_bg_1'>";
echo "<td>Modo de correspondência</td><td>";
Dropdown::showFromArray('match_mode', [
    'recall'    => 'Abrangente (mais resultados)',
    'precision' => 'Preciso (título obrigatório)',
], ['value' => $conf['match_mode']]);
echo "</td></tr>";

echo "<tr class='tab_bg_1'>";
echo "<td>Texto do cabeçalho da lista de sugestões</td><td>";
echo Html::input('panel_title', [
    'value' => $conf['panel_title'],
    'size'  => 50,
]);
echo "</td></tr>";

echo "<tr class='tab_bg_2'>";
echo "<td colspan='2' class='center'>";
echo Html::submit(_x('button', 'Salvar'), ['name' => 'update', 'class' => 'btn btn-primary']);
echo "</td></tr>";

echo "</table>";
echo "</div>";
Html::closeForm();

Html::footer();
