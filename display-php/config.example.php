<?php
/**
 * Copy to config.php and adjust for your environment.
 */
return [
    // AssetIQ API base URL (no trailing slash), e.g. https://asset-iq-uat.vercel.app
    'api_base_url' => 'https://asset-iq-uat.vercel.app',

    // production | uat — must match where the display was paired
    'db_env' => 'uat',

    // Auto-refresh board data (seconds)
    'refresh_seconds' => 30,

    // Cookie lifetime for paired device token (days)
    'cookie_days' => 365,
];
