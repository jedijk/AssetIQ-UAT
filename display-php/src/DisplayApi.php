<?php

declare(strict_types=1);

final class DisplayApi
{
    private string $baseUrl;
    private string $dbEnv;

    public function __construct(string $baseUrl, string $dbEnv = 'production')
    {
        $this->baseUrl = $baseUrl;
        $this->dbEnv = $dbEnv === 'uat' ? 'uat' : 'production';
    }

    public function requestPairing(array $payload): array
    {
        return $this->request('POST', '/api/display/request-pairing', $payload);
    }

    public function pollPairingStatus(string $pairCode, string $fingerprint): array
    {
        $query = http_build_query([
            'device_fingerprint' => $fingerprint,
            'db_env' => $this->dbEnv,
        ]);
        return $this->request('GET', '/api/display/pairing/' . rawurlencode($pairCode) . '/status?' . $query);
    }

    public function connect(string $deviceToken): array
    {
        return $this->request('POST', '/api/display/connect', [
            'device_token' => $deviceToken,
        ], $deviceToken);
    }

    public function getBoardLayout(string $deviceToken): array
    {
        return $this->request('GET', '/api/display/board/layout', null, $deviceToken);
    }

    public function getBoardData(string $deviceToken, int $periodDays = 30): array
    {
        $query = http_build_query([
            'period_days' => $periodDays,
            'db_env' => $this->dbEnv,
        ]);
        return $this->request('GET', '/api/display/board/data?' . $query, null, $deviceToken);
    }

    public function sendHeartbeat(string $deviceId, string $deviceToken): void
    {
        try {
            $this->request('POST', '/api/display/heartbeat', [
                'device_id' => $deviceId,
            ], $deviceToken);
        } catch (Throwable $e) {
            /* non-fatal */
        }
    }

    public function snapshotUrl(string $deviceToken, ?int $cacheBust = null): string
    {
        $params = [
            'device_token' => $deviceToken,
            'db_env' => $this->dbEnv,
        ];
        if ($cacheBust !== null) {
            $params['t'] = (string) $cacheBust;
        }
        return $this->baseUrl . '/api/display/board/snapshot?' . http_build_query($params);
    }

    public function probeSnapshot(string $deviceToken): bool
    {
        $url = $this->snapshotUrl($deviceToken, time());
        $ch = curl_init($url);
        if ($ch === false) {
            return false;
        }
        curl_setopt_array($ch, [
            CURLOPT_NOBODY => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_FOLLOWLOCATION => true,
        ]);
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return $code >= 200 && $code < 300;
    }

    private function request(string $method, string $path, ?array $body = null, ?string $deviceToken = null): array
    {
        $url = $this->baseUrl . $path;
        $separator = str_contains($path, '?') ? '&' : '?';
        if (!str_contains($path, 'db_env=')) {
            $url .= $separator . 'db_env=' . rawurlencode($this->dbEnv);
        }

        $ch = curl_init($url);
        if ($ch === false) {
            throw new RuntimeException('Could not initialize HTTP client');
        }

        $headers = ['Accept: application/json'];
        if ($body !== null) {
            $headers[] = 'Content-Type: application/json';
        }
        if ($deviceToken) {
            $headers[] = 'Authorization: DeviceToken ' . $deviceToken;
        }

        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => $headers,
        ]);

        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }

        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            throw new RuntimeException($error ?: 'HTTP request failed');
        }

        $decoded = json_decode($raw, true);
        if ($code >= 400) {
            $detail = is_array($decoded) ? ($decoded['detail'] ?? $raw) : $raw;
            if (is_array($detail)) {
                $detail = json_encode($detail);
            }
            throw new RuntimeException((string) $detail, $code);
        }

        return is_array($decoded) ? $decoded : [];
    }
}
