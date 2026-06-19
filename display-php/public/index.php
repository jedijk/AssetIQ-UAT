<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/bootstrap.php';

$token = display_cookie(DISPLAY_COOKIE_TOKEN);

if ($token !== '') {
    header('Location: ' . display_asset_url('board.php'));
    exit;
}

header('Location: ' . display_asset_url('pair.php'));
exit;
