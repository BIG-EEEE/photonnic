<?php
/*
 * Photonic reminder service: shared code for the API (api.php) and the cron worker (worker.php).
 *
 * Stores, per subscription, only what delivery needs: the push endpoint and its keys,
 * the reminder time, the IANA time zone, an optional "latest photo date", and delivery
 * bookkeeping. No photos, captions, locations, names or journal content ever reach it.
 *
 * Web Push is implemented here directly (RFC 8030 delivery, RFC 8291 aes128gcm payload
 * encryption, RFC 8292 VAPID) on PHP's OpenSSL, so the service has no third-party code.
 */
declare(strict_types=1);

const PHOTONIC_PUSH_VERSION = 1;

function config(): array {
    static $c = null;
    if ($c === null) {
        $file = getenv('PHOTONIC_PUSH_CONFIG') ?: __DIR__ . '/config.php';
        if (!is_file($file)) throw new RuntimeException('Reminder service is not configured (run setup.php).');
        $c = require $file;
    }
    return $c;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $pdo = new PDO('sqlite:' . config()['db'], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $pdo->exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    $pdo->exec('CREATE TABLE IF NOT EXISTS subs (
        id TEXT PRIMARY KEY,            -- random, public to its own browser
        token_hash TEXT NOT NULL,       -- sha256 of the secret only that browser holds
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        time TEXT NOT NULL,             -- "HH:MM", local to tz
        tz TEXT NOT NULL,               -- IANA zone, e.g. Africa/Accra
        aware INTEGER NOT NULL DEFAULT 0,
        done_date TEXT,                 -- latest photo date the browser chose to report
        last_sent_date TEXT,            -- local date already handled (sent or skipped)
        tries INTEGER NOT NULL DEFAULT 0,
        next_try INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )');
    $pdo->exec('CREATE TABLE IF NOT EXISTS hits (k TEXT NOT NULL, w INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (k, w))');
    return $pdo;
}

/* The clock, overridable for tests. */
function now(): DateTimeImmutable {
    $fake = getenv('PHOTONIC_NOW');
    return $fake ? new DateTimeImmutable($fake) : new DateTimeImmutable('now', new DateTimeZone('UTC'));
}

// ---------- validation ----------

function b64url_decode(string $s): string|false {
    if (!preg_match('/^[A-Za-z0-9_-]+={0,2}$/', $s)) return false;
    return base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
}
function b64url(string $bin): string { return rtrim(strtr(base64_encode($bin), '+/', '-_'), '='); }

/* Only real push services: the worker must never be usable to POST to arbitrary hosts. */
function valid_endpoint(mixed $e): bool {
    if (!is_string($e) || strlen($e) > 1024) return false;
    $u = parse_url($e);
    if (!$u || ($u['scheme'] ?? '') !== 'https' || isset($u['user']) || isset($u['port'])) return false;
    $h = strtolower($u['host'] ?? '');
    foreach (['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com'] as $ok) if ($h === $ok) return true;
    return (bool) preg_match('/(^|\.)push\.apple\.com$|\.notify\.windows\.com$/', $h);
}
function valid_keys(mixed $k): bool {
    if (!is_array($k) || !is_string($k['p256dh'] ?? null) || !is_string($k['auth'] ?? null)) return false;
    $p = b64url_decode($k['p256dh']); $a = b64url_decode($k['auth']);
    return $p !== false && strlen($p) === 65 && $p[0] === "\x04" && $a !== false && strlen($a) === 16;
}
function valid_time(mixed $t): bool { return is_string($t) && (bool) preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $t); }
function valid_tz(mixed $z): bool {
    if (!is_string($z) || strlen($z) > 64) return false;
    return in_array($z, DateTimeZone::listIdentifiers(), true) || $z === 'UTC';
}
function valid_date(mixed $d): bool {
    if (!is_string($d) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $d, $m)) return false;
    return checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
}

// ---------- scheduling ----------

/* Is this subscription due at $now? Returns [due, localDate, reason]. A reminder fires once
 * per local day, at or after its time and within three hours (so a late cron still sends,
 * but a phone whose clock zone changed does not get yesterday's reminder at midnight).
 * In a daylight-saving gap the missing time rolls forward; in the repeated hour the
 * last_sent_date guard stops a second send. */
function due(array $s, DateTimeImmutable $now): array {
    $tz = new DateTimeZone($s['tz']);
    $local = $now->setTimezone($tz);
    $today = $local->format('Y-m-d');
    if ($s['last_sent_date'] === $today) return [false, $today, 'handled'];
    if ($s['next_try'] !== null && (int) $s['next_try'] > $now->getTimestamp()) return [false, $today, 'backoff'];
    [$h, $m] = array_map('intval', explode(':', $s['time']));
    $at = $local->setTime($h, $m);
    $diff = $now->getTimestamp() - $at->getTimestamp();
    if ($diff < 0 || $diff >= 3 * 3600) return [false, $today, 'not-now'];
    if ((int) $s['aware'] === 1 && $s['done_date'] === $today) return [false, $today, 'done'];
    return [true, $today, 'due'];
}

// ---------- Web Push ----------

const P256_SPKI_PREFIX = '3059301306072a8648ce3d020106082a8648ce3d030107034200';

function ec_raw_public($key): string {
    $d = openssl_pkey_get_details($key)['ec'];
    return "\x04" . str_pad($d['x'], 32, "\0", STR_PAD_LEFT) . str_pad($d['y'], 32, "\0", STR_PAD_LEFT);
}
function ec_public_from_raw(string $raw) {
    $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode(hex2bin(P256_SPKI_PREFIX) . $raw), 64, "\n") . "-----END PUBLIC KEY-----\n";
    $k = openssl_pkey_get_public($pem);
    if (!$k) throw new RuntimeException('bad subscription key');
    return $k;
}
// Windows PHP needs an explicit openssl.cnf; Linux finds its own.
function ssl_args(): array { $c = getenv('OPENSSL_CONF'); return $c ? ['config' => $c] : []; }
function ec_new() { return openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC] + ssl_args()); }

/* DER ECDSA signature -> the raw 64-byte R||S that JWS ES256 wants. */
function der_to_raw(string $der): string {
    $o = 2 + (ord($der[1]) & 0x80 ? (ord($der[1]) & 0x7f) : 0);
    $int = function () use ($der, &$o) {
        $len = ord($der[$o + 1]); $v = substr($der, $o + 2, $len); $o += 2 + $len;
        return str_pad(ltrim($v, "\0"), 32, "\0", STR_PAD_LEFT);
    };
    return $int() . $int();
}

function vapid_header(string $endpoint): string {
    $c = config();
    $u = parse_url($endpoint);
    $aud = $u['scheme'] . '://' . $u['host'];
    $jwt = b64url(json_encode(['typ' => 'JWT', 'alg' => 'ES256'])) . '.' . b64url(json_encode(['aud' => $aud, 'exp' => now()->getTimestamp() + 12 * 3600, 'sub' => $c['subject']]));
    $key = openssl_pkey_get_private($c['vapid_private_pem']);
    if (!openssl_sign($jwt, $sig, $key, OPENSSL_ALGO_SHA256)) throw new RuntimeException('VAPID signing failed');
    return 'vapid t=' . $jwt . '.' . b64url(der_to_raw($sig)) . ', k=' . $c['vapid_public'];
}

/* RFC 8291: encrypt one record with aes128gcm for this subscription. */
function encrypt_payload(string $plain, string $p256dhB64, string $authB64): string {
    $ua = b64url_decode($p256dhB64); $auth = b64url_decode($authB64);
    $as = ec_new();
    $asPub = ec_raw_public($as);
    $secret = openssl_pkey_derive(ec_public_from_raw($ua), $as, 32);
    if ($secret === false) throw new RuntimeException('key agreement failed');
    $ikm = hash_hkdf('sha256', $secret, 32, "WebPush: info\0" . $ua . $asPub, $auth);
    $salt = random_bytes(16);
    $cek = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\0", $salt);
    $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\0", $salt);
    $cipher = openssl_encrypt($plain . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
    if ($cipher === false) throw new RuntimeException('encryption failed');
    return $salt . pack('N', 4096) . chr(65) . $asPub . $cipher . $tag;
}

/* Deliver one notification. Returns the push service's HTTP status (0 = network error). */
function send_push(array $s, array $message): int {
    $c = config();
    $body = encrypt_payload(json_encode($message, JSON_UNESCAPED_UNICODE), $s['p256dh'], $s['auth']);
    if (($c['transport'] ?? 'http') === 'mock') return mock_transport($s, $body);
    $ch = curl_init($s['endpoint']);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/octet-stream',
            'Content-Encoding: aes128gcm',
            'TTL: 14400',            // a reminder older than four hours is not worth showing
            'Urgency: normal',
            'Topic: photonic-daily', // a newer reminder replaces an undelivered one
            'Authorization: ' . vapid_header($s['endpoint']),
        ],
    ]);
    curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return $code;
}

/* Test transport: records the encrypted body and answers by endpoint name. */
function mock_transport(array $s, string $body): int {
    $log = config()['mock_log'];
    file_put_contents($log, json_encode(['endpoint' => $s['endpoint'], 'body' => b64url($body), 'at' => now()->format(DATE_ATOM)]) . "\n", FILE_APPEND);
    if (str_contains($s['endpoint'], 'gone')) return 410;
    if (str_contains($s['endpoint'], 'flaky')) return 503;
    return 201;
}

const REMINDER = ['title' => 'A moment for today', 'body' => 'Capture one photo to keep today’s memory.', 'url' => '/'];
