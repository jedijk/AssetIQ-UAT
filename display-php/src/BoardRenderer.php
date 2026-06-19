<?php

declare(strict_types=1);

final class BoardRenderer
{
    /** @param array<string, mixed> $layout */
    /** @param array<string, mixed> $data */
    public static function renderPage(array $layout, array $data, int $refreshSeconds = 30): string
    {
        $theme = (string) ($layout['theme'] ?? 'dark');
        $boardType = (string) ($layout['board_type'] ?? 'reliability');
        $boardName = (string) ($layout['name'] ?? 'Visual Management Board');
        $header = is_array($layout['header'] ?? null) ? $layout['header'] : [];
        $gridLayout = is_array($layout['layout'] ?? null) ? $layout['layout'] : [];
        $columns = max(1, (int) ($gridLayout['columns'] ?? 24));
        $rows = max(1, (int) ($gridLayout['rows'] ?? 16));
        $widgets = is_array($layout['widgets'] ?? null) ? $layout['widgets'] : [];

        $displayTitle = trim((string) ($header['display_title'] ?? ''));
        if ($displayTitle === '') {
            $displayTitle = $boardName;
        }

        $themeClass = $theme === 'light' ? 'vmb-theme-light' : 'vmb-theme-dark';
        $refresh = max(15, $refreshSeconds);

        ob_start();
        ?>
<!DOCTYPE html>
<html lang="en" class="display-kiosk vmb-legacy-tv <?= Html::e($themeClass) ?>">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="<?= (int) $refresh ?>">
  <title><?= Html::e($displayTitle) ?></title>
  <link rel="stylesheet" href="<?= Html::e(display_asset_url('assets/tv-kiosk.css')) ?>">
</head>
<body>
  <div class="tv-board-shell">
    <div class="vmb-board-canvas tv-board-canvas">
      <header class="vmb-board-header tv-board-header">
        <div class="tv-wordmark tv-wordmark-asset">Asset<span>IQ</span></div>
        <h1 class="vmb-board-header-title tv-board-title"><?= Html::e($displayTitle) ?></h1>
        <?php if ($boardType === 'operations'): ?>
          <div class="tv-wordmark tv-wordmark-tyromer">Tyromer</div>
        <?php else: ?>
          <div class="tv-wordmark-spacer" aria-hidden="true"></div>
        <?php endif; ?>
      </header>
      <div class="vmb-board-body-wrap tv-board-body">
        <div
          class="tv-board-grid vmb-board-grid vmb-board-grid--css"
          style="grid-template-columns: repeat(<?= (int) $columns ?>, minmax(0, 1fr)); grid-template-rows: repeat(<?= (int) $rows ?>, minmax(0, 1fr));"
        >
          <?php foreach ($widgets as $widget): ?>
            <?php
              if (!is_array($widget)) {
                  continue;
              }
              $pos = is_array($widget['position'] ?? null) ? $widget['position'] : [];
              $x = (int) ($pos['x'] ?? 0);
              $y = (int) ($pos['y'] ?? 0);
              $w = max(1, (int) ($pos['w'] ?? 3));
              $h = max(1, (int) ($pos['h'] ?? 2));
            ?>
            <div
              class="tv-widget-cell vmb-widget-cell"
              style="grid-column: <?= $x + 1 ?> / span <?= $w ?>; grid-row: <?= $y + 1 ?> / span <?= $h ?>;"
            >
              <?= WidgetRenderer::render($widget, $data, $theme) ?>
            </div>
          <?php endforeach; ?>
        </div>
        <div class="vmb-sync-status"><span class="vmb-sync-live">LIVE</span>Updated <?= Html::e(gmdate('H:i:s')) ?> UTC</div>
      </div>
    </div>
  </div>
</body>
</html>
        <?php
        return (string) ob_get_clean();
    }

    public static function renderSnapshotPage(string $snapshotUrl, string $title, int $refreshSeconds = 30): string
    {
        $refresh = max(15, $refreshSeconds);
        ob_start();
        ?>
<!DOCTYPE html>
<html lang="en" class="display-kiosk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="<?= (int) $refresh ?>">
  <title><?= Html::e($title) ?></title>
  <link rel="stylesheet" href="<?= Html::e(display_asset_url('assets/tv-kiosk.css')) ?>">
</head>
<body>
  <div class="tv-snapshot-shell">
    <img src="<?= Html::e($snapshotUrl) ?>" alt="<?= Html::e($title) ?>" class="tv-snapshot-img">
  </div>
</body>
</html>
        <?php
        return (string) ob_get_clean();
    }

    public static function renderErrorPage(string $message, string $title = 'Display error'): string
    {
        ob_start();
        ?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= Html::e($title) ?></title>
  <link rel="stylesheet" href="<?= Html::e(display_asset_url('assets/tv-kiosk.css')) ?>">
</head>
<body>
  <div class="tv-error-page">
    <h1><?= Html::e($title) ?></h1>
    <p><?= Html::e($message) ?></p>
    <p><a href="<?= Html::e(display_asset_url('pair.php')) ?>">Re-pair this display</a></p>
  </div>
</body>
</html>
        <?php
        return (string) ob_get_clean();
    }
}
