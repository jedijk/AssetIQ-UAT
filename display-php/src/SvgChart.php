<?php

declare(strict_types=1);

final class SvgChart
{
    private const VIEW_W = 400;
    private const VIEW_H = 200;

    /**
     * @param array<int, array<string, mixed>> $points
     * @param array<int, array<string, mixed>> $bands
     */
    public static function render(
        array $points,
        string $xKey = 'date',
        string $yKey = 'value',
        string $stroke = '#8b5cf6',
        array $bands = [],
        string $theme = 'dark',
        string $emptyLabel = 'No chart data'
    ): string {
        $rows = [];
        foreach ($points as $index => $row) {
            if (!is_array($row)) {
                continue;
            }
            $y = self::toNumber($row[$yKey] ?? null);
            if ($y === null) {
                continue;
            }
            $rows[] = [
                'xLabel' => (string) ($row[$xKey] ?? $index),
                'y' => $y,
            ];
        }

        if ($rows === []) {
            return '<div class="tv-chart-empty">' . Html::e($emptyLabel) . '</div>';
        }

        $pad = ['top' => 10, 'right' => 12, 'bottom' => 22, 'left' => 36];
        $plotW = self::VIEW_W - $pad['left'] - $pad['right'];
        $plotH = self::VIEW_H - $pad['top'] - $pad['bottom'];

        $minY = $rows[0]['y'];
        $maxY = $rows[0]['y'];
        foreach ($bands as $band) {
            $b1 = self::toNumber($band['y1'] ?? null);
            $b2 = self::toNumber($band['y2'] ?? null);
            if ($b1 !== null) {
                $minY = min($minY, $b1);
            }
            if ($b2 !== null) {
                $maxY = max($maxY, $b2);
            }
        }
        foreach ($rows as $row) {
            $minY = min($minY, $row['y']);
            $maxY = max($maxY, $row['y']);
        }
        if ($minY === $maxY) {
            $minY -= 1;
            $maxY += 1;
        } else {
            $padY = ($maxY - $minY) * 0.08;
            $minY -= $padY;
            $maxY += $padY;
        }

        $scaleX = static function (int $index) use ($rows, $pad, $plotW): float {
            $count = count($rows);
            if ($count === 1) {
                return $pad['left'] + $plotW / 2;
            }
            return $pad['left'] + ($index / ($count - 1)) * $plotW;
        };
        $scaleY = static function (float $value) use ($minY, $maxY, $pad, $plotH): float {
            return $pad['top'] + $plotH - (($value - $minY) / ($maxY - $minY)) * $plotH;
        };

        $linePoints = [];
        foreach ($rows as $index => $row) {
            $linePoints[] = $scaleX($index) . ',' . $scaleY($row['y']);
        }

        $gridColor = $theme === 'light' ? '#e2e8f0' : '#334155';
        $axisColor = $theme === 'light' ? '#94a3b8' : '#64748b';

        $svg = [];
        $svg[] = '<svg class="tv-chart-svg" viewBox="0 0 ' . self::VIEW_W . ' ' . self::VIEW_H . '" preserveAspectRatio="none" role="img" aria-label="Chart">';

        foreach ($bands as $band) {
            $y1 = self::toNumber($band['y1'] ?? null);
            $y2 = self::toNumber($band['y2'] ?? null);
            if ($y1 === null || $y2 === null) {
                continue;
            }
            $top = $scaleY(max($y1, $y2));
            $bottom = $scaleY(min($y1, $y2));
            $height = max(1, $bottom - $top);
            $svg[] = sprintf(
                '<rect x="%s" y="%s" width="%s" height="%s" fill="%s" fill-opacity="%s"/>',
                $pad['left'],
                $top,
                $plotW,
                $height,
                Html::e($band['fill'] ?? '#64748b'),
                Html::e((string) ($band['opacity'] ?? 0.12))
            );
        }

        foreach ([0, 0.5, 1] as $t) {
            $y = $pad['top'] + $plotH * $t;
            $svg[] = sprintf(
                '<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="1"/>',
                $pad['left'],
                $y,
                $pad['left'] + $plotW,
                $y,
                $gridColor
            );
        }

        $baseY = $pad['top'] + $plotH;
        $svg[] = sprintf(
            '<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="1"/>',
            $pad['left'],
            $baseY,
            $pad['left'] + $plotW,
            $baseY,
            $axisColor
        );
        $svg[] = sprintf(
            '<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="1"/>',
            $pad['left'],
            $pad['top'],
            $pad['left'],
            $baseY,
            $axisColor
        );

        $svg[] = '<polyline points="' . implode(' ', $linePoints) . '" fill="none" stroke="' . Html::e($stroke) . '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';

        $first = $rows[0];
        $last = $rows[count($rows) - 1];
        $svg[] = sprintf(
            '<text x="%s" y="%s" text-anchor="start" fill="%s" font-size="11">%s</text>',
            $pad['left'],
            self::VIEW_H - 6,
            $axisColor,
            Html::e(substr($first['xLabel'], 0, 8))
        );
        $svg[] = sprintf(
            '<text x="%s" y="%s" text-anchor="end" fill="%s" font-size="11">%s</text>',
            $pad['left'] + $plotW,
            self::VIEW_H - 6,
            $axisColor,
            Html::e(substr($last['xLabel'], 0, 8))
        );
        $svg[] = sprintf(
            '<text x="4" y="%s" fill="%s" font-size="10">%s</text>',
            $scaleY($maxY) + 4,
            $axisColor,
            Html::e((string) round($maxY))
        );
        $svg[] = sprintf(
            '<text x="4" y="%s" fill="%s" font-size="10">%s</text>',
            $scaleY($minY) + 4,
            $axisColor,
            Html::e((string) round($minY))
        );

        $svg[] = '</svg>';
        return '<div class="tv-chart-wrap">' . implode('', $svg) . '</div>';
    }

    private static function toNumber($value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (!is_numeric($value)) {
            return null;
        }
        return (float) $value;
    }
}
