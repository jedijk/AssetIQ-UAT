<?php

declare(strict_types=1);

final class WidgetRenderer
{
    /** @param array<string, mixed> $widget */
    /** @param array<string, mixed> $boardData */
    public static function render(array $widget, array $boardData, string $theme = 'dark'): string
    {
        $type = (string) ($widget['type'] ?? 'kpi_card');
        $payload = [];
        if (isset($boardData['widgets']) && is_array($boardData['widgets'])) {
            $id = (string) ($widget['id'] ?? '');
            $payload = $boardData['widgets'][$id] ?? [];
            if (!is_array($payload)) {
                $payload = [];
            }
        }

        switch ($type) {
            case 'production_kpi':
                return self::productionKpi($widget, $payload, $theme);
            case 'mooney_chart':
                return self::mooneyChart($widget, $payload, $theme);
            case 'trend_chart':
                return self::trendChart($widget, $payload, $theme);
            case 'status_indicator':
                return self::statusIndicator($widget, $payload, $boardData, $theme);
            case 'observation_list':
            case 'risk_observation_list':
                return self::observationList($widget, $payload, $theme);
            case 'action_queue':
                return self::actionQueue($widget, $payload, $theme);
            case 'exposure_waterfall':
                return self::exposureWaterfall($widget, $payload, $theme);
            case 'form_submissions_list':
                return self::formSubmissionsList($widget, $payload, $theme);
            case 'information_panel':
                return self::informationPanel($widget, $payload, $theme);
            case 'text_block':
                return self::textBlock($widget, $payload, $theme);
            case 'kpi_card':
            default:
                return self::kpiCard($widget, $payload, $theme);
        }
    }

    /** @param array<string, mixed> $widget */
    /** @param array<string, mixed> $payload */
    private static function cardOpen(string $extraClass = ''): string
    {
        return '<div class="tv-widget-card' . ($extraClass ? ' ' . $extraClass : '') . '">';
    }

    private static function cardClose(): string
    {
        return '</div>';
    }

    /** @param array<string, mixed> $config */
    private static function partEnabled(array $config, string $part, bool $default = true): bool
    {
        if (isset($config['parts']) && is_array($config['parts']) && array_key_exists($part, $config['parts'])) {
            return (bool) $config['parts'][$part];
        }
        if ($part === 'title' && isset($config['show_title']) && $config['show_title'] === false) {
            return false;
        }
        return $default;
    }

    private static function productionKpi(array $widget, array $payload, string $theme): string
    {
        $config = is_array($widget['config'] ?? null) ? $widget['config'] : [];
        $label = (string) ($widget['title'] ?? $payload['metric'] ?? 'KPI');
        $value = (string) ($payload['formatted_value'] ?? '—');
        $unit = (string) ($payload['unit'] ?? '');

        $html = self::cardOpen('tv-widget-card--center');
        if (self::partEnabled($config, 'title')) {
            $html .= '<div class="tv-widget-label">' . Html::e($label) . '</div>';
        }
        $html .= '<div class="tv-widget-value-row"><span class="tv-widget-value">' . Html::e($value) . '</span>';
        if (self::partEnabled($config, 'unit') && $unit !== '') {
            $html .= '<span class="tv-widget-unit">' . Html::e($unit) . '</span>';
        }
        $html .= '</div>';
        if (self::partEnabled($config, 'subtitle') && !empty($payload['subtitle'])) {
            $html .= '<div class="tv-widget-subtitle">' . Html::e((string) $payload['subtitle']) . '</div>';
        }
        if (self::partEnabled($config, 'detail') && !empty($payload['detail'])) {
            $html .= '<div class="tv-widget-subtitle">' . Html::e((string) $payload['detail']) . '</div>';
        }
        return $html . self::cardClose();
    }

    private static function kpiCard(array $widget, array $payload, string $theme): string
    {
        $config = is_array($widget['config'] ?? null) ? $widget['config'] : [];
        $label = (string) ($widget['title'] ?? $payload['label'] ?? 'KPI');
        $value = (string) ($payload['formatted_value'] ?? $payload['value'] ?? '—');
        $change = $payload['change_percent'] ?? null;
        $evidence = $payload['evidence_count'] ?? null;
        $subtitle = $payload['subtitle'] ?? ($evidence !== null ? $evidence . ' observations' : null);

        $html = self::cardOpen('tv-widget-card--center');
        if (self::partEnabled($config, 'title')) {
            $html .= '<div class="tv-widget-label">' . Html::e($label) . '</div>';
        }
        $html .= '<div class="tv-widget-value-row"><span class="tv-widget-value">' . Html::e($value) . '</span>';
        if (self::partEnabled($config, 'change') && $change !== null && is_numeric($change)) {
            $sign = (float) $change >= 0 ? '+' : '';
            $html .= '<span class="tv-widget-change">' . Html::e($sign . number_format((float) $change, 1) . '%') . '</span>';
        }
        $html .= '</div>';
        if (self::partEnabled($config, 'subtitle') && $subtitle) {
            $html .= '<div class="tv-widget-subtitle">' . Html::e((string) $subtitle) . '</div>';
        }
        return $html . self::cardClose();
    }

    private static function mooneyChart(array $widget, array $payload, string $theme): string
    {
        $config = is_array($widget['config'] ?? null) ? $widget['config'] : [];
        $title = (string) ($widget['title'] ?? 'Mooney Viscosity');
        $points = is_array($payload['points'] ?? null) ? $payload['points'] : [];
        $chartPoints = [];
        foreach ($points as $p) {
            if (!is_array($p)) {
                continue;
            }
            $chartPoints[] = [
                'date' => (string) ($p['time'] ?? ''),
                'value' => $p['viscosity'] ?? $p['value'] ?? null,
            ];
        }

        $html = self::cardOpen();
        if (self::partEnabled($config, 'title')) {
            $html .= '<div class="tv-widget-label">' . Html::e($title) . '</div>';
        }
        $bands = [];
        if (self::partEnabled($config, 'target_bands')) {
            $bands = [
                ['y1' => $payload['band_min'] ?? 50, 'y2' => $payload['band_max'] ?? 70, 'fill' => '#f97316', 'opacity' => 0.12],
                ['y1' => $payload['target_min'] ?? 55, 'y2' => $payload['target_max'] ?? 65, 'fill' => '#22c55e', 'opacity' => 0.15],
            ];
        }
        $html .= SvgChart::render($chartPoints, 'date', 'value', '#8b5cf6', $bands, $theme, 'No viscosity samples for today');
        return $html . self::cardClose();
    }

    private static function trendChart(array $widget, array $payload, string $theme): string
    {
        $config = is_array($widget['config'] ?? null) ? $widget['config'] : [];
        $title = (string) ($widget['title'] ?? 'Trend');
        $points = is_array($payload['points'] ?? null) ? $payload['points'] : [];

        $html = self::cardOpen();
        if (self::partEnabled($config, 'title')) {
            $html .= '<div class="tv-widget-label">' . Html::e($title) . '</div>';
        }
        $html .= SvgChart::render($points, 'date', 'value', '#38bdf8', [], $theme, 'No trend data');
        return $html . self::cardClose();
    }

    private static function statusIndicator(array $widget, array $payload, array $boardData, string $theme): string
    {
        $config = is_array($widget['config'] ?? null) ? $widget['config'] : [];
        $status = strtoupper((string) ($payload['status'] ?? $boardData['status']['status'] ?? 'GREEN'));
        $reason = (string) ($payload['reason'] ?? $boardData['status']['reason'] ?? '');
        $class = 'tv-status-dot--green';
        if ($status === 'AMBER') {
            $class = 'tv-status-dot--amber';
        } elseif ($status === 'RED') {
            $class = 'tv-status-dot--red';
        }

        $html = self::cardOpen('tv-widget-card--center');
        $html .= '<div class="tv-status-dot ' . $class . '"></div>';
        if (self::partEnabled($config, 'status_label')) {
            $html .= '<div class="tv-widget-status">' . Html::e($status) . '</div>';
        }
        if (self::partEnabled($config, 'reason') && $reason !== '') {
            $html .= '<div class="tv-widget-subtitle">' . Html::e($reason) . '</div>';
        }
        return $html . self::cardClose();
    }

    private static function observationList(array $widget, array $payload, string $theme): string
    {
        $config = is_array($widget['config'] ?? null) ? $widget['config'] : [];
        $title = (string) ($widget['title'] ?? 'Observations');
        $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];

        $html = self::cardOpen('tv-widget-card--list');
        if (self::partEnabled($config, 'title')) {
            $html .= '<div class="tv-widget-label">' . Html::e($title) . '</div>';
        }
        if ($items === []) {
            $html .= '<div class="tv-widget-subtitle">No items</div>';
        } else {
            $html .= '<ul class="tv-widget-list">';
            foreach (array_slice($items, 0, 8) as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $line = (string) ($item['title'] ?? $item['equipment'] ?? $item['asset'] ?? 'Item');
                $html .= '<li>' . Html::e($line) . '</li>';
            }
            $html .= '</ul>';
        }
        return $html . self::cardClose();
    }

    private static function actionQueue(array $widget, array $payload, string $theme): string
    {
        $config = is_array($widget['config'] ?? null) ? $widget['config'] : [];
        $title = (string) ($widget['title'] ?? 'Action Queue');
        $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];

        $html = self::cardOpen('tv-widget-card--list');
        if (self::partEnabled($config, 'title')) {
            $html .= '<div class="tv-widget-label">' . Html::e($title) . '</div>';
        }
        if ($items === []) {
            $html .= '<div class="tv-widget-subtitle">No actions</div>';
        } else {
            $html .= '<ul class="tv-widget-list">';
            foreach (array_slice($items, 0, 8) as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $line = (string) ($item['action'] ?? $item['subtitle'] ?? 'Action');
                $html .= '<li>' . Html::e($line) . '</li>';
            }
            $html .= '</ul>';
        }
        return $html . self::cardClose();
    }

    private static function exposureWaterfall(array $widget, array $payload, string $theme): string
    {
        $config = is_array($widget['config'] ?? null) ? $widget['config'] : [];
        $title = (string) ($widget['title'] ?? 'Exposure');
        $segments = is_array($payload['segments'] ?? null) ? $payload['segments'] : [];

        $html = self::cardOpen('tv-widget-card--list');
        if (self::partEnabled($config, 'title')) {
            $html .= '<div class="tv-widget-label">' . Html::e($title) . '</div>';
        }
        if ($segments === []) {
            $html .= '<div class="tv-widget-subtitle">No exposure data</div>';
        } else {
            $html .= '<div class="tv-exposure-rows">';
            foreach ($segments as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $label = (string) ($row['label'] ?? '');
                $value = $row['value'] ?? '—';
                if (is_array($value)) {
                    $value = $value['formatted'] ?? $value['value'] ?? '—';
                }
                $html .= '<div class="tv-exposure-row"><span>' . Html::e($label) . '</span><span>' . Html::e((string) $value) . '</span></div>';
            }
            $html .= '</div>';
        }
        return $html . self::cardClose();
    }

    private static function formSubmissionsList(array $widget, array $payload, string $theme): string
    {
        $config = is_array($widget['config'] ?? null) ? $widget['config'] : [];
        $title = (string) ($widget['title'] ?? 'Recent Form Submissions');
        $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];

        $html = self::cardOpen('tv-widget-card--list');
        if (self::partEnabled($config, 'title')) {
            $html .= '<div class="tv-widget-label">' . Html::e($title) . '</div>';
        }
        if ($items === []) {
            $html .= '<div class="tv-widget-subtitle">No recent submissions</div>';
        } else {
            $html .= '<ul class="tv-widget-list">';
            foreach (array_slice($items, 0, 8) as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $name = (string) ($item['form_name'] ?? $item['title'] ?? 'Form');
                $html .= '<li>' . Html::e($name) . '</li>';
            }
            $html .= '</ul>';
        }
        return $html . self::cardClose();
    }

    private static function informationPanel(array $widget, array $payload, string $theme): string
    {
        $config = is_array($widget['config'] ?? null) ? $widget['config'] : [];
        $title = (string) ($widget['title'] ?? 'Information');
        $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];

        $html = self::cardOpen('tv-widget-card--list');
        if (self::partEnabled($config, 'title')) {
            $html .= '<div class="tv-widget-label">' . Html::e($title) . '</div>';
        }
        if ($items === []) {
            $html .= '<div class="tv-widget-subtitle">No information submitted</div>';
        } else {
            $html .= '<div class="tv-info-stack">';
            foreach (array_slice($items, 0, 10) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $pinned = !empty($row['pinned']);
                $class = 'tv-info-entry' . ($pinned ? ' tv-info-entry--pinned' : '');
                $html .= '<div class="' . $class . '"><div class="tv-widget-body">' . Html::e((string) ($row['text'] ?? '—')) . '</div></div>';
            }
            $html .= '</div>';
        }
        return $html . self::cardClose();
    }

    private static function textBlock(array $widget, array $payload, string $theme): string
    {
        $config = is_array($widget['config'] ?? null) ? $widget['config'] : [];
        $title = (string) ($widget['title'] ?? '');
        $text = (string) ($payload['text_content'] ?? $config['text_content'] ?? '');
        $align = (string) ($payload['text_align'] ?? $config['text_align'] ?? 'left');

        $html = self::cardOpen('tv-widget-card--list');
        if (self::partEnabled($config, 'title') && $title !== '') {
            $html .= '<div class="tv-widget-label">' . Html::e($title) . '</div>';
        }
        $html .= '<div class="tv-widget-body" style="text-align:' . Html::e($align) . '">' . nl2br(Html::e($text)) . '</div>';
        return $html . self::cardClose();
    }
}
