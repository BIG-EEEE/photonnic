<?php
/*
 * Photonic reminder API. Included by the tiny front file in the web root (api/index.php);
 * this file and everything it reads live outside the web root.
 *
 *   GET  /api/key           the VAPID public key (application server key)
 *   GET  /api/health        { ok } and nothing else
 *   POST /api/subscribe     { subscription, time, tz, aware }       -> { id, token }
 *   POST /api/preferences   { id, token, time, tz, aware, subscription? }
 *   POST /api/done          { id, token, date | null }
 *   POST /api/unsubscribe   { id, token }
 *
 * There are no accounts. A subscription is controlled by whoever holds its id and token,
 * which only the subscribing browser receives; the server keeps a hash of the token.
 */
declare(strict_types=1);
require __DIR__ . '/lib.php';

function out(int $status, array $body): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(int $status, string $error): never { out($status, ['ok' => false, 'error' => $error]); }

/* Fixed-window rate limit per client address (stored hashed). */
function limit(string $bucket, int $max, int $window): void {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0';
    $k = hash('sha256', config()['ip_salt'] . $bucket . $ip);
    $w = intdiv(now()->getTimestamp(), $window);
    $pdo = db();
    $pdo->prepare('INSERT INTO hits (k, w, n) VALUES (?, ?, 1) ON CONFLICT(k, w) DO UPDATE SET n = n + 1')->execute([$k, $w]);
    $n = (int) $pdo->query('SELECT n FROM hits WHERE k = ' . $pdo->quote($k) . ' AND w = ' . $w)->fetchColumn();
    if (random_int(1, 50) === 1) $pdo->prepare('DELETE FROM hits WHERE w < ?')->execute([$w - 2]);
    if ($n > $max) { header('Retry-After: ' . $window); fail(429, 'too many requests'); }
}

function body(): array {
    if (($_SERVER['CONTENT_TYPE'] ?? '') === '' || !str_starts_with(strtolower($_SERVER['CONTENT_TYPE']), 'application/json')) fail(415, 'json only');
    $raw = file_get_contents('php://input', false, null, 0, 4097);
    if ($raw === false || strlen($raw) > 4096) fail(413, 'too large');
    $j = json_decode($raw, true);
    if (!is_array($j)) fail(400, 'bad json');
    return $j;
}

/* The subscription this request may act on, or a refusal. */
function owned(array $j): array {
    if (!is_string($j['id'] ?? null) || !preg_match('/^[a-f0-9]{32}$/', $j['id']) || !is_string($j['token'] ?? null) || strlen($j['token']) !== 64) fail(400, 'bad credentials');
    $st = db()->prepare('SELECT * FROM subs WHERE id = ?');
    $st->execute([$j['id']]);
    $s = $st->fetch();
    // Same answer for "no such id" and "wrong token", so ids cannot be probed.
    if (!$s || !hash_equals($s['token_hash'], hash('sha256', $j['token']))) fail(404, 'not found');
    return $s;
}

function prefs(array $j): array {
    if (!valid_time($j['time'] ?? null)) fail(400, 'bad time');
    if (!valid_tz($j['tz'] ?? null)) fail(400, 'bad time zone');
    return [$j['time'], $j['tz'], !empty($j['aware']) ? 1 : 0];
}

try {
    if (!(($_SERVER['HTTPS'] ?? '') === 'on' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https' || getenv('PHOTONIC_ALLOW_HTTP'))) fail(403, 'https only');
    $route = trim((string) ($_GET['r'] ?? ''), '/');
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET' && $route === 'health') { db(); out(200, ['ok' => true, 'service' => PHOTONIC_PUSH_VERSION]); }
    if ($method === 'GET' && $route === 'key') out(200, ['ok' => true, 'key' => config()['vapid_public']]);
    if ($method !== 'POST') fail(405, 'method not allowed');
    limit('all', 60, 600);
    $j = body();
    $pdo = db();
    $t = now()->getTimestamp();

    switch ($route) {
        case 'subscribe': {
            limit('subscribe', 10, 3600);
            $sub = $j['subscription'] ?? null;
            if (!is_array($sub) || !valid_endpoint($sub['endpoint'] ?? null) || !valid_keys($sub['keys'] ?? null)) fail(400, 'bad subscription');
            [$time, $tz, $aware] = prefs($j);
            $id = bin2hex(random_bytes(16));
            $token = bin2hex(random_bytes(32));
            $pdo->beginTransaction();
            // The same browser subscribing again replaces its old row (and its old token).
            $pdo->prepare('DELETE FROM subs WHERE endpoint = ?')->execute([$sub['endpoint']]);
            $pdo->prepare('INSERT INTO subs (id, token_hash, endpoint, p256dh, auth, time, tz, aware, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
                ->execute([$id, hash('sha256', $token), $sub['endpoint'], $sub['keys']['p256dh'], $sub['keys']['auth'], $time, $tz, $aware, $t, $t]);
            $pdo->commit();
            out(201, ['ok' => true, 'id' => $id, 'token' => $token]);
        }
        case 'preferences': {
            $s = owned($j);
            [$time, $tz, $aware] = prefs($j);
            $sub = $j['subscription'] ?? null;
            if ($sub !== null) { // the browser renewed its push subscription
                if (!is_array($sub) || !valid_endpoint($sub['endpoint'] ?? null) || !valid_keys($sub['keys'] ?? null)) fail(400, 'bad subscription');
                $pdo->prepare('DELETE FROM subs WHERE endpoint = ? AND id <> ?')->execute([$sub['endpoint'], $s['id']]);
                $pdo->prepare('UPDATE subs SET endpoint = ?, p256dh = ?, auth = ? WHERE id = ?')->execute([$sub['endpoint'], $sub['keys']['p256dh'], $sub['keys']['auth'], $s['id']]);
            }
            // A changed time or zone may make today's reminder due again.
            $reset = $time !== $s['time'] || $tz !== $s['tz'];
            $pdo->prepare('UPDATE subs SET time = ?, tz = ?, aware = ?, updated_at = ?' . ($reset ? ', last_sent_date = NULL, tries = 0, next_try = NULL' : '') . ($aware ? '' : ', done_date = NULL') . ' WHERE id = ?')
                ->execute([$time, $tz, $aware, $t, $s['id']]);
            out(200, ['ok' => true]);
        }
        case 'done': {
            $s = owned($j);
            $date = $j['date'] ?? null;
            if ($date !== null && !valid_date($date)) fail(400, 'bad date');
            if ((int) $s['aware'] !== 1) fail(409, 'skip-when-done is off');
            $pdo->prepare('UPDATE subs SET done_date = ?, updated_at = ? WHERE id = ?')->execute([$date, $t, $s['id']]);
            out(200, ['ok' => true]);
        }
        case 'unsubscribe': {
            $s = owned($j);
            $pdo->prepare('DELETE FROM subs WHERE id = ?')->execute([$s['id']]);
            out(200, ['ok' => true]);
        }
    }
    fail(404, 'no such route');
} catch (Throwable $e) {
    error_log('photonic-push api: ' . get_class($e) . ': ' . $e->getMessage());
    fail(500, 'server error');
}
