<?php
/*
 * Reminder service tests: the API through PHP's built-in web server, the worker on a fake
 * clock with a mock push transport, and the payload encryption decrypted the way a
 * browser would. Nothing here contacts a real push service.
 *   php server/tests/run.php
 */
declare(strict_types=1);

$root = dirname(__DIR__);
if (PHP_OS_FAMILY === 'Windows' && !getenv('OPENSSL_CONF') && is_file($c = dirname(PHP_BINARY) . '/extras/ssl/openssl.cnf')) putenv("OPENSSL_CONF=$c");
$tmp = sys_get_temp_dir() . '/photonic-push-test-' . bin2hex(random_bytes(4));
mkdir($tmp, 0700, true);
$cfgFile = "$tmp/config.php";
putenv("PHOTONIC_PUSH_CONFIG=$cfgFile");
require "$root/lib.php";

$key = ec_new(); openssl_pkey_export($key, $pem, null, ssl_args());
$cfg = ['vapid_public' => b64url(ec_raw_public($key)), 'vapid_private_pem' => $pem, 'subject' => 'https://photonnic.destinyfamily.org',
        'db' => "$tmp/push.sqlite", 'ip_salt' => 'test', 'transport' => 'mock', 'mock_log' => "$tmp/sent.log"];
file_put_contents($cfgFile, '<?php return ' . var_export($cfg, true) . ';');

$passed = 0; $failed = 0;
function ok(bool $c, string $label): void { global $passed, $failed; if ($c) $passed++; else { $failed++; echo "FAIL $label\n"; } }

// ---------- encryption: decrypt like a browser (RFC 8291 receiver side) ----------
$ua = ec_new(); $uaPub = ec_raw_public($ua); $auth = random_bytes(16);
$msg = json_encode(REMINDER, JSON_UNESCAPED_UNICODE);
$rec = encrypt_payload($msg, b64url($uaPub), b64url($auth));
$salt = substr($rec, 0, 16); $rs = unpack('N', substr($rec, 16, 4))[1]; $idlen = ord($rec[20]); $asPub = substr($rec, 21, $idlen);
$body = substr($rec, 21 + $idlen);
$secret = openssl_pkey_derive(ec_public_from_raw($asPub), $ua, 32);
$ikm = hash_hkdf('sha256', $secret, 32, "WebPush: info\0" . $uaPub . $asPub, $auth);
$cek = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\0", $salt);
$nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\0", $salt);
$plain = openssl_decrypt(substr($body, 0, -16), 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, substr($body, -16));
ok($rs === 4096 && $idlen === 65 && $plain === $msg . "\x02", 'payload decrypts to the reminder text with the record delimiter');
ok(!str_contains($rec, 'moment'), 'payload is not readable in transit');

// RFC 8291 Appendix A: with the RFC's fixed keys and salt we must produce its exact bytes.
$asD = b64url_decode('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw');
$asPubRfc = b64url_decode('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
// The RFC's server key as SEC1 DER: version, private scalar, curve P-256, public point.
$sec1 = hex2bin('30770201010420') . $asD . hex2bin('a00a06082a8648ce3d030107a144034200') . $asPubRfc;
$asKey = openssl_pkey_get_private("-----BEGIN EC PRIVATE KEY-----\n" . chunk_split(base64_encode($sec1), 64, "\n") . "-----END EC PRIVATE KEY-----\n");
$rfc = encrypt_payload('When I grow up, I want to be a watermelon', 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg', $asKey, b64url_decode('DGv6ra1nlYgDCS1FRnbzlw'));
ok(b64url($rfc) === 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN', 'encryption matches the RFC 8291 test vector byte for byte');

// VAPID: a valid ES256 JWT for the endpoint's origin.
$h = vapid_header('https://fcm.googleapis.com/fcm/send/abc');
preg_match('/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/', $h, $m);
$claims = json_decode(base64_decode(strtr($m[2], '-_', '+/')), true);
$raw = b64url_decode($m[3]);
$der = "\x30" . chr(68 + (ord($raw[0]) > 127) + (ord($raw[32]) > 127)) . "\x02" . chr(32 + (ord($raw[0]) > 127)) . (ord($raw[0]) > 127 ? "\0" : '') . substr($raw, 0, 32) . "\x02" . chr(32 + (ord($raw[32]) > 127)) . (ord($raw[32]) > 127 ? "\0" : '') . substr($raw, 32);
$pub = ec_public_from_raw(b64url_decode($m[4]));
ok($claims['aud'] === 'https://fcm.googleapis.com' && $claims['exp'] > time() && $claims['sub'] === $cfg['subject'], 'VAPID claims: audience, expiry, subject');
ok(strlen($raw) === 64 && openssl_verify("$m[1].$m[2]", $der, $pub, OPENSSL_ALGO_SHA256) === 1, 'VAPID signature verifies with the public key');

// ---------- API over HTTP ----------
$port = 8765 + random_int(0, 200);
$router = "$tmp/router.php";
file_put_contents($router, '<?php if (str_starts_with($_SERVER["REQUEST_URI"], "/api/")) { $_GET["r"] = strtok(substr($_SERVER["REQUEST_URI"], 5), "?"); require ' . var_export("$root/api.php", true) . '; } else { http_response_code(404); }');
// A fixed clock: rate-limit windows are clock hours, and a run crossing one would reset the count.
$env = array_merge(getenv(), ['PHOTONIC_PUSH_CONFIG' => $cfgFile, 'PHOTONIC_ALLOW_HTTP' => '1', 'PHOTONIC_NOW' => '2026-10-10T12:30:00Z']);
$srv = proc_open([PHP_BINARY, '-S', "127.0.0.1:$port", $router], [1 => ['file', "$tmp/srv.log", 'a'], 2 => ['file', "$tmp/srv.log", 'a']], $pipes, $tmp, $env);
usleep(600000);
function req(string $method, string $path, $body = null, string $type = 'application/json'): array {
    global $port;
    $ch = curl_init("http://127.0.0.1:$port/api/$path");
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => ["Content-Type: $type"]]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, is_string($body) ? $body : json_encode($body));
    $r = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_close($ch);
    return [$code, json_decode((string) $r, true)];
}
$keys = fn() => ['p256dh' => b64url(ec_raw_public(ec_new())), 'auth' => b64url(random_bytes(16))];
$sub = fn(string $name) => ['endpoint' => "https://fcm.googleapis.com/fcm/send/$name-" . bin2hex(random_bytes(4)), 'keys' => $keys()];

[$c, $r] = req('GET', 'health'); ok($c === 200 && $r === ['ok' => true, 'service' => 1], 'health answers ok and nothing else');
[$c, $r] = req('GET', 'key'); ok($c === 200 && $r['key'] === $cfg['vapid_public'], 'public key is served');
[$c, $r] = req('POST', 'subscribe', ['subscription' => $sub('a'), 'time' => '20:00', 'tz' => 'Africa/Accra', 'aware' => false]);
ok($c === 201 && preg_match('/^[a-f0-9]{32}$/', $r['id']) && strlen($r['token']) === 64, 'subscribe returns an id and a secret token');
$A = $r;
$row = db()->query("SELECT * FROM subs WHERE id = '{$A['id']}'")->fetch();
ok($row && $row['token_hash'] === hash('sha256', $A['token']) && !str_contains(json_encode($row), $A['token']), 'only a hash of the token is stored');
ok(array_diff(array_keys($row), ['id','token_hash','endpoint','p256dh','auth','time','tz','aware','done_date','last_sent_date','tries','next_try','created_at','updated_at']) === [], 'stored columns are delivery data only (no photos, captions, locations, names)');
foreach ([
    'bad time 24:00' => ['subscription' => $sub('x'), 'time' => '24:00', 'tz' => 'Africa/Accra'],
    'bad time 9:5' => ['subscription' => $sub('x'), 'time' => '9:5', 'tz' => 'Africa/Accra'],
    'bad zone' => ['subscription' => $sub('x'), 'time' => '20:00', 'tz' => 'Mars/Olympus'],
    'non-push host' => ['subscription' => ['endpoint' => 'https://evil.example.com/x', 'keys' => $keys()], 'time' => '20:00', 'tz' => 'UTC'],
    'http endpoint' => ['subscription' => ['endpoint' => 'http://fcm.googleapis.com/fcm/send/x', 'keys' => $keys()], 'time' => '20:00', 'tz' => 'UTC'],
    'short key' => ['subscription' => ['endpoint' => 'https://fcm.googleapis.com/fcm/send/x', 'keys' => ['p256dh' => 'AAAA', 'auth' => 'AAAA']], 'time' => '20:00', 'tz' => 'UTC'],
] as $label => $bad) { [$c] = req('POST', 'subscribe', $bad); ok($c === 400, "subscribe refuses: $label"); }
[$c] = req('POST', 'subscribe', 'not json'); ok($c === 400, 'refuses a body that is not JSON');
[$c] = req('POST', 'subscribe', ['x' => 1], 'text/plain'); ok($c === 415, 'refuses a non-JSON content type');
[$c] = req('POST', 'subscribe', str_repeat('a', 5000)); ok($c === 413, 'refuses an oversized body');
[$c] = req('GET', 'subscribe'); ok($c === 405, 'GET on a write route is refused');

[$c] = req('POST', 'preferences', ['id' => $A['id'], 'token' => str_repeat('0', 64), 'time' => '07:00', 'tz' => 'UTC']);
ok($c === 404, 'a wrong token cannot change a subscription');
[$c] = req('POST', 'unsubscribe', ['id' => str_repeat('a', 32), 'token' => $A['token']]);
ok($c === 404, "a token cannot delete someone else's subscription");
[$c] = req('POST', 'preferences', ['id' => $A['id'], 'token' => $A['token'], 'time' => '07:30', 'tz' => 'Europe/London', 'aware' => true]);
$row = db()->query("SELECT * FROM subs WHERE id = '{$A['id']}'")->fetch();
ok($c === 200 && $row['time'] === '07:30' && $row['tz'] === 'Europe/London' && (int) $row['aware'] === 1, 'preferences update time, zone and skip-when-done');
[$c] = req('POST', 'done', ['id' => $A['id'], 'token' => $A['token'], 'date' => '2026-02-30']); ok($c === 400, 'done refuses an impossible date');
[$c] = req('POST', 'done', ['id' => $A['id'], 'token' => $A['token'], 'date' => '2026-10-10']);
ok($c === 200 && db()->query("SELECT done_date FROM subs WHERE id = '{$A['id']}'")->fetchColumn() === '2026-10-10', 'done stores only the date');
// Re-subscribing the same browser replaces the old row and invalidates the old token.
$same = db()->query("SELECT endpoint, p256dh, auth FROM subs WHERE id = '{$A['id']}'")->fetch();
[$c, $B] = req('POST', 'subscribe', ['subscription' => ['endpoint' => $same['endpoint'], 'keys' => ['p256dh' => $same['p256dh'], 'auth' => $same['auth']]], 'time' => '08:00', 'tz' => 'UTC']);
[$c2] = req('POST', 'preferences', ['id' => $A['id'], 'token' => $A['token'], 'time' => '09:00', 'tz' => 'UTC']);
ok($c === 201 && $c2 === 404 && (int) db()->query("SELECT COUNT(*) FROM subs WHERE endpoint = " . db()->quote($same['endpoint']))->fetchColumn() === 1, 'subscribing again replaces the old row and its token');
[$c] = req('POST', 'unsubscribe', ['id' => $B['id'], 'token' => $B['token']]);
ok($c === 200 && !db()->query("SELECT 1 FROM subs WHERE id = '{$B['id']}'")->fetch(), 'unsubscribe deletes the row');
// Rate limit: the subscribe bucket allows 10 an hour per address (some used above).
$codes = []; for ($i = 0; $i < 12; $i++) { [$codes[]] = req('POST', 'subscribe', ['subscription' => $sub('rl'), 'time' => '20:00', 'tz' => 'UTC']); }
ok(in_array(429, $codes, true), 'subscribe is rate limited per address');
proc_terminate($srv);
db()->exec('DELETE FROM subs; DELETE FROM hits;');

// ---------- worker on a fake clock ----------
function add(string $name, string $time, string $tz, int $aware = 0, ?string $done = null): string {
    global $keys;
    $id = bin2hex(random_bytes(16)); $k = $keys(); $t = time();
    db()->prepare('INSERT INTO subs (id, token_hash, endpoint, p256dh, auth, time, tz, aware, done_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([$id, 'x', "https://fcm.googleapis.com/fcm/send/$name", $k['p256dh'], $k['auth'], $time, $tz, $aware, $done, $t, $t]);
    return $id;
}
function work(string $nowIso): array {
    global $root, $cfgFile, $cfg;
    @unlink($cfg['mock_log']);
    $env = array_merge(getenv(), ['PHOTONIC_PUSH_CONFIG' => $cfgFile, 'PHOTONIC_NOW' => $nowIso]);
    $p = proc_open([PHP_BINARY, "$root/worker.php"], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, $env);
    stream_get_contents($pipes[1]); stream_get_contents($pipes[2]); proc_close($p);
    $sent = is_file($cfg['mock_log']) ? array_map(fn($l) => basename(json_decode($l, true)['endpoint']), file($cfg['mock_log'], FILE_IGNORE_NEW_LINES)) : [];
    sort($sent);
    return $sent;
}
add('accra', '20:00', 'Africa/Accra');
add('london', '20:00', 'Europe/London');
add('ny', '20:00', 'America/New_York');
add('aware-done', '20:00', 'Africa/Accra', 1, '2026-10-10');
add('aware-stale', '20:00', 'Africa/Accra', 1, '2026-10-09');
add('unaware-done', '20:00', 'Africa/Accra', 0, '2026-10-10');
ok(work('2026-10-10T18:55:00Z') === [], '18:55 UTC: nobody is due yet (18:55 Accra, 19:55 London, 14:55 New York)');
ok(work('2026-10-10T19:00:00Z') === ['london'], '20:00 in London (19:00 UTC in summer time)');
// 20:00 UTC = 20:00 Accra, 21:00 London (BST), 16:00 New York.
ok(work('2026-10-10T20:00:00Z') === ['accra', 'aware-stale', 'unaware-done'], '20:00 in Accra: Accra subscribers get it; London and New York do not');
ok(work('2026-10-10T20:05:00Z') === [], 'a repeated run sends nothing twice');
ok(work('2026-10-11T00:00:00Z') === ['ny'], '20:00 in New York (00:00 UTC next day)');
ok(db()->query("SELECT last_sent_date FROM subs WHERE endpoint LIKE '%aware-done'")->fetchColumn() === '2026-10-10', 'skip-when-done: today handled without a send');
ok(work('2026-10-11T23:30:00Z') === [], 'outside the three-hour window nothing is sent (no midnight catch-up)');
ok(work('2026-10-11T20:10:00Z') === ['accra', 'aware-done', 'aware-stale', 'london', 'unaware-done'], 'the next day Accra and London are due again (yesterday\'s done date no longer counts)');
// Daylight saving: London falls back on 25 Oct 2026. 01:30 local happens twice.
db()->exec('DELETE FROM subs');
add('dst-repeat', '01:30', 'Europe/London');
$first = work('2026-10-25T00:30:00Z');  // 01:30 BST
$second = work('2026-10-25T01:30:00Z'); // 01:30 GMT, the repeated hour
ok($first === ['dst-repeat'] && $second === [], 'DST fall-back: the repeated 01:30 sends once');
db()->exec('DELETE FROM subs');
add('dst-gap', '01:30', 'Europe/London'); // 29 Mar 2026: 01:00 -> 02:00, so 01:30 never exists
// PHP rolls a time inside the gap forward by the gap's length: 01:30 becomes 02:30 BST (01:30 UTC).
ok(work('2026-03-29T00:55:00Z') === [] && work('2026-03-29T01:05:00Z') === [] && work('2026-03-29T01:30:00Z') === ['dst-gap'] && work('2026-03-29T01:40:00Z') === [], 'DST spring-forward: a time in the gap fires once, an hour later (02:30 BST)');
// Expired and flaky subscriptions.
db()->exec('DELETE FROM subs');
add('gone', '20:00', 'UTC'); add('flaky', '20:00', 'UTC'); add('fine', '20:00', 'UTC');
ok(work('2026-10-10T20:00:00Z') === ['fine', 'flaky', 'gone'], 'all three are attempted');
ok(!db()->query("SELECT 1 FROM subs WHERE endpoint LIKE '%gone'")->fetch(), 'an expired subscription (410) is deleted');
$f = db()->query("SELECT * FROM subs WHERE endpoint LIKE '%flaky'")->fetch();
ok($f['last_sent_date'] === null && (int) $f['tries'] === 1 && (int) $f['next_try'] > 0, 'a temporary failure (503) is released for a retry with back-off');
ok(work('2026-10-10T20:05:00Z') === [], 'no retry before the back-off ends');
ok(work('2026-10-10T20:11:00Z') === ['flaky'], 'retried after the back-off');
work('2026-10-10T20:22:00Z');
$f = db()->query("SELECT * FROM subs WHERE endpoint LIKE '%flaky'")->fetch();
ok($f['last_sent_date'] === '2026-10-10' && work('2026-10-10T20:40:00Z') === [], 'after three failures it gives up for the day instead of retrying forever');
// Overlapping runs: two workers at once still send once.
db()->exec('DELETE FROM subs');
for ($i = 0; $i < 40; $i++) add("bulk$i", '20:00', 'UTC');
@unlink($cfg['mock_log']);
$env = array_merge(getenv(), ['PHOTONIC_PUSH_CONFIG' => $cfgFile, 'PHOTONIC_NOW' => '2026-10-10T20:00:00Z']);
$ps = []; for ($i = 0; $i < 3; $i++) $ps[] = proc_open([PHP_BINARY, "$root/worker.php"], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pp, null, $env);
foreach ($ps as $p) proc_close($p);
$lines = file($cfg['mock_log'], FILE_IGNORE_NEW_LINES);
ok(count($lines) === 40 && count(array_unique(array_map(fn($l) => json_decode($l, true)['endpoint'], $lines))) === 40, 'three overlapping runs: 40 subscribers, 40 sends, no duplicates');
ok(!preg_match('/p256dh|auth|fcm\.googleapis/', (string) @file_get_contents("$tmp/srv.log")), 'the server log holds no endpoints or keys');

foreach (glob("$tmp/*") as $f) @unlink($f); @rmdir($tmp);
echo "server: $passed passed, $failed failed\n";
exit($failed ? 1 : 0);
