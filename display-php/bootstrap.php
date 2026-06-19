<?php

declare(strict_types=1);

const DISPLAY_COOKIE_TOKEN = 'assetiq_display_device_token';
const DISPLAY_COOKIE_DEVICE_ID = 'assetiq_display_device_id';
const DISPLAY_COOKIE_DB_ENV = 'assetiq_display_db_env';
const DISPLAY_COOKIE_FINGERPRINT = 'assetiq_display_fingerprint';

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Missing config.php — copy config.example.php to config.php\n";
    exit;
}

/** @var array<string, mixed> $CONFIG */
$CONFIG = require $configPath;

require_once __DIR__ . '/src/Html.php';
require_once __DIR__ . '/src/DisplayApi.php';
require_once __DIR__ . '/src/SvgChart.php';
require_once __DIR__ . '/src/WidgetRenderer.php';
require_once __DIR__ . '/src/BoardRenderer.php';

function display_config(string $key, $default = null)
{
    global $CONFIG;
    return array_key_exists($key, $CONFIG) ? $CONFIG[$key] : $default;
}

function display_cookie(string $name): string
{
    return isset($_COOKIE[$name]) ? (string) $_COOKIE[$name] : '';
}

function display_set_cookie(string $name, string $value, int $days = 365): void
{
    setcookie($name, $value, [
        'expires' => time() + ($days * 86400),
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function display_clear_cookies(): void
{
    foreach ([DISPLAY_COOKIE_TOKEN, DISPLAY_COOKIE_DEVICE_ID] as $name) {
        setcookie($name, '', ['expires' => time() - 3600, 'path' => '/']);
    }
}

function display_fingerprint(): string
{
    $existing = display_cookie(DISPLAY_COOKIE_FINGERPRINT);
    if ($existing !== '') {
        return $existing;
    }
    $fp = 'fp_' . bin2hex(random_bytes(8)) . '_' . dechex(time());
    display_set_cookie(DISPLAY_COOKIE_FINGERPRINT, $fp, 3650);
    return $fp;
}

function display_api(): DisplayApi
{
    static $api = null;
    if ($api === null) {
        $api = new DisplayApi(
            rtrim((string) display_config('api_base_url', ''), '/'),
            (string) display_config('db_env', 'production')
        );
    }
    return $api;
}

function display_asset_url(string $path): string
{
    $script = $_SERVER['SCRIPT_NAME'] ?? '/index.php';
    $base = rtrim(str_replace('\\', '/', dirname($script)), '/');
    if ($base === '.' || $base === '\\') {
        $base = '';
    }
    return $base . '/' . ltrim($path, '/');
}
