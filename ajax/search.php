<?php

/**
 * AJAX search endpoint used by the inline KB hint dropdown (GLPI 10).
 *
 * Reads $_GET['q'] (a MySQL boolean full-text expression built by the JS) and
 * runs KnowbaseItem::getListRequest() which does a MATCH ... AGAINST over
 * glpi_knowbaseitems(name, answer) with all the standard visibility filtering.
 * Anonymous / self-service sessions get FAQ-only results.
 *
 * Returns: {"data": [{"id": <int>, "name": "<string>"}, ...]}
 */

include('../../../inc/includes.php');

global $DB;

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

// A valid session is required to reach any ticket-creation form, so refuse
// unauthenticated calls rather than leaking KB content. Answer with JSON
// (not GLPI's HTML error page) so the frontend fetch handles it cleanly.
if (!Session::getLoginUserID()) {
    http_response_code(403);
    echo json_encode(['error' => 'not_authenticated']);
    return;
}

$q = isset($_GET['q']) ? trim((string) $_GET['q']) : '';

if (mb_strlen($q) < 3) {
    echo json_encode(['data' => []]);
    return;
}

// Show only FAQ items to users who are not allowed the full knowledge base.
$is_faq_only = !Session::haveRight('knowbase', READ);

$params = [
    'contains' => $q,
    'faq'      => $is_faq_only,
];

$criteria          = KnowbaseItem::getListRequest($params, 'search');
$criteria['LIMIT'] = 5;
$criteria['START'] = 0;

$results = [];
try {
    $iterator = $DB->request($criteria);
    foreach ($iterator as $row) {
        $name = $row['transname'] ?? $row['name'] ?? '';
        if (!isset($row['id']) || $name === '') {
            continue;
        }
        $results[] = [
            'id'   => (int) $row['id'],
            'name' => strip_tags($name),
        ];
    }
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'search_failed']);
    return;
}

echo json_encode(['data' => $results]);
