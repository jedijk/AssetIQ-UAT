<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/bootstrap.php';

$token = display_cookie(DISPLAY_COOKIE_TOKEN);
$deviceId = display_cookie(DISPLAY_COOKIE_DEVICE_ID);

if ($token === '') {
    header('Location: ' . display_asset_url('pair.php'));
    exit;
}

$mode = isset($_GET['mode']) ? (string) $_GET['mode'] : 'auto';
if (!in_array($mode, ['auto', 'canvas', 'snapshot'], true)) {
    $mode = 'auto';
}

$refreshSeconds = (int) display_config('refresh_seconds', 30);
$api = display_api();

try {
    $api->connect($token);
    if ($deviceId !== '') {
        $api->sendHeartbeat($deviceId, $token);
    }

    $layout = $api->getBoardLayout($token);
    $header = is_array($layout['header'] ?? null) ? $layout['header'] : [];
    $boardName = (string) ($layout['name'] ?? 'Visual Management Board');
    $displayTitle = trim((string) ($header['display_title'] ?? ''));
    if ($displayTitle === '') {
        $displayTitle = $boardName;
    }

    $useSnapshot = $mode === 'snapshot'
        || ($mode === 'auto' && $api->probeSnapshot($token));

    if ($useSnapshot) {
        echo BoardRenderer::renderSnapshotPage(
            $api->snapshotUrl($token, time()),
            $displayTitle,
            $refreshSeconds
        );
        exit;
    }

    $boardData = $api->getBoardData($token);
    echo BoardRenderer::renderPage($layout, $boardData, $refreshSeconds);
} catch (Throwable $e) {
    if ($e->getCode() === 401) {
        display_clear_cookies();
        header('Location: ' . display_asset_url('pair.php'));
        exit;
    }

    $message = $e->getMessage();
    if ($message === '') {
        $message = 'Could not load the display board.';
    }
    echo BoardRenderer::renderErrorPage($message);
}
