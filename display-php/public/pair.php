<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/bootstrap.php';

if (isset($_GET['unpair'])) {
    display_clear_cookies();
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
    }
    session_destroy();
    header('Location: ' . display_asset_url('pair.php'));
    exit;
}

$token = display_cookie(DISPLAY_COOKIE_TOKEN);
if ($token !== '') {
    header('Location: ' . display_asset_url('board.php'));
    exit;
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function pair_format_countdown(int $seconds): string
{
    $seconds = max(0, $seconds);
    $m = intdiv($seconds, 60);
    $s = $seconds % 60;
    return sprintf('%02d:%02d', $m, $s);
}

function pair_request_code(): array
{
    $api = display_api();
    $payload = [
        'device_fingerprint' => display_fingerprint(),
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'PHP Display',
        'screen_width' => null,
        'screen_height' => null,
        'device_label' => 'PHP TV Display',
    ];

    return $api->requestPairing($payload);
}

function pair_store_code(array $data): void
{
    $code = (string) ($data['pair_code'] ?? '');
    $expiresIn = (int) ($data['expires_in'] ?? 600);
    $_SESSION['pair_code'] = $code;
    $_SESSION['pair_expires_at'] = time() + max(1, $expiresIn);
}

function pair_remaining_seconds(): int
{
    $expiresAt = (int) ($_SESSION['pair_expires_at'] ?? 0);
    return max(0, $expiresAt - time());
}

function pair_poll_and_maybe_redirect(): ?string
{
    $pairCode = (string) ($_SESSION['pair_code'] ?? '');
    if ($pairCode === '') {
        return null;
    }

    try {
        $status = display_api()->pollPairingStatus($pairCode, display_fingerprint());
    } catch (Throwable $e) {
        return $e->getMessage();
    }

    $state = (string) ($status['status'] ?? 'pending');

    if ($state === 'pending' && isset($status['expires_in']) && is_numeric($status['expires_in'])) {
        $_SESSION['pair_expires_at'] = time() + (int) $status['expires_in'];
    }

    if ($state === 'paired') {
        $deviceToken = (string) ($status['device_token'] ?? '');
        $deviceId = (string) ($status['device_id'] ?? '');
        if ($deviceToken === '') {
            return 'Pairing completed but no device token was returned.';
        }

        $cookieDays = (int) display_config('cookie_days', 365);
        display_set_cookie(DISPLAY_COOKIE_TOKEN, $deviceToken, $cookieDays);
        if ($deviceId !== '') {
            display_set_cookie(DISPLAY_COOKIE_DEVICE_ID, $deviceId, $cookieDays);
        }

        $_SESSION = [];
        header('Location: ' . display_asset_url('board.php'));
        exit;
    }

    if ($state === 'expired' || pair_remaining_seconds() <= 0) {
        unset($_SESSION['pair_code'], $_SESSION['pair_expires_at']);
    }

    return null;
}

$error = '';
$forceNew = isset($_GET['new']);

if ($forceNew) {
    unset($_SESSION['pair_code'], $_SESSION['pair_expires_at']);
}

$pollError = pair_poll_and_maybe_redirect();
if ($pollError !== null && $pollError !== '') {
    $error = $pollError;
}

$pairCode = (string) ($_SESSION['pair_code'] ?? '');

if ($pairCode === '' || pair_remaining_seconds() <= 0) {
    try {
        pair_store_code(pair_request_code());
        $pairCode = (string) ($_SESSION['pair_code'] ?? '');
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
}

$remaining = pair_remaining_seconds();
$screenLabel = '';
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
if ($userAgent !== '') {
    $parts = preg_split('/\s+/', trim($userAgent)) ?: [];
    $screenLabel = implode(' ', array_slice($parts, -2));
}

$cssUrl = display_asset_url('assets/tv-kiosk.css');
$refreshUrl = display_asset_url('pair.php');
$newCodeUrl = display_asset_url('pair.php?new=1');
?>
<!DOCTYPE html>
<html lang="en" class="display-kiosk vmb-legacy-tv vmb-theme-dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="3;url=<?= Html::e($refreshUrl) ?>">
  <title>Pair this display · AssetIQ</title>
  <link rel="stylesheet" href="<?= Html::e($cssUrl) ?>">
</head>
<body>
  <div class="display-pair-page">
    <div class="display-pair-inner">
      <div class="display-pair-heading">
        <p class="display-pair-kicker">AssetIQ Display</p>
        <h1 class="display-pair-title">Pair this device</h1>
      </div>

      <div class="display-pair-instructions">
        <div class="display-pair-instructions-head">
          <span class="display-pair-icon" aria-hidden="true">TV</span>
          <div>
            <h2>How to pair this display</h2>
            <p>No passwords on the TV — an administrator completes pairing from AssetIQ.</p>
          </div>
        </div>
        <ol class="display-pair-steps">
          <li>
            <span class="display-pair-step-num">1</span>
            <div>
              <p class="display-pair-step-title">Open the TV kiosk URL</p>
              <p class="display-pair-step-body">Use this display URL — not the main AssetIQ homepage. Hide the browser toolbar if your TV browser allows it, and set zoom to 100%.</p>
            </div>
          </li>
          <li>
            <span class="display-pair-step-num">2</span>
            <div>
              <p class="display-pair-step-title">Keep this screen open</p>
              <p class="display-pair-step-body">Leave this browser on the TV or kiosk. Do not close or refresh after pairing.</p>
            </div>
          </li>
          <li>
            <span class="display-pair-step-num">3</span>
            <div>
              <p class="display-pair-step-title">Sign in to AssetIQ on another device</p>
              <p class="display-pair-step-body">Use a laptop, phone, or tablet where you are already logged into AssetIQ.</p>
            </div>
          </li>
          <li>
            <span class="display-pair-step-num">4</span>
            <div>
              <p class="display-pair-step-title">Go to Settings → Visual Management → Pair Displays</p>
              <p class="display-pair-step-body">Open the gear menu (Settings), choose Visual Management, then Pair Displays.</p>
            </div>
          </li>
          <li>
            <span class="display-pair-step-num">5</span>
            <div>
              <p class="display-pair-step-title">Enter the code below</p>
              <p class="display-pair-step-body">Type the 6-character code shown on this screen and click Look up.</p>
            </div>
          </li>
          <li>
            <span class="display-pair-step-num">6</span>
            <div>
              <p class="display-pair-step-title">Pair the device</p>
              <p class="display-pair-step-body">Select a board, name the screen, and click Pair Device. This display will connect automatically.</p>
            </div>
          </li>
        </ol>
      </div>

      <div class="display-pair-code-section">
        <?php if ($pairCode === '' && $error === ''): ?>
          <p class="display-pair-loading">Requesting pairing code…</p>
        <?php else: ?>
          <div class="display-pair-code-box">
            <p class="display-pair-code-label">Code</p>
            <p class="display-pair-code" data-testid="display-pair-code"><?= Html::e($pairCode !== '' ? $pairCode : '------') ?></p>
            <p class="display-pair-expires">
              Expires in <span class="display-pair-countdown"><?= Html::e(pair_format_countdown($remaining)) ?></span>
            </p>
          </div>
          <p class="display-pair-actions">
            <a class="display-pair-new-code" href="<?= Html::e($newCodeUrl) ?>">New code</a>
          </p>
        <?php endif; ?>

        <?php if ($error !== ''): ?>
          <p class="display-pair-error"><?= Html::e($error) ?></p>
        <?php endif; ?>

        <p class="display-pair-meta">PHP TV Display · <?= Html::e($screenLabel !== '' ? $screenLabel : 'Embedded browser') ?></p>
      </div>
    </div>
  </div>
</body>
</html>
