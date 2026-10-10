<?php
/*
 * Photonic reminder worker. Run by cron every five minutes (minute field 0-59/5), e.g.
 *   0-59/5 * * * * /opt/cpanel/ea-php84/root/usr/bin/php ~/photonic-push/worker.php >/dev/null 2>&1
 *
 * Each due subscription is first "claimed" for its local date with a conditional UPDATE,
 * so overlapping or repeated runs can never send the same day's reminder twice. A lock
 * file also keeps a second run from starting while one is still going.
 * Logs carry counts only, never endpoints or keys.
 */
declare(strict_types=1);
require __DIR__ . '/lib.php';

set_time_limit(240);
$lock = fopen(dirname(config()['db']) . '/worker.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) exit(0); // another run is still working

$pdo = db();
$now = now();
$n = ['due' => 0, 'sent' => 0, 'skipped_done' => 0, 'gone' => 0, 'retry' => 0, 'failed' => 0];
$rows = $pdo->query('SELECT * FROM subs ORDER BY id LIMIT 2000')->fetchAll();
foreach ($rows as $s) {
    try { [$isDue, $today, $why] = due($s, $now); } catch (Throwable) { continue; } // bad zone: skip
    if ($why === 'done') {
        $pdo->prepare('UPDATE subs SET last_sent_date = ? WHERE id = ? AND (last_sent_date IS NULL OR last_sent_date <> ?)')->execute([$today, $s['id'], $today]);
        $n['skipped_done']++;
        continue;
    }
    if (!$isDue) continue;
    // Claim today for this subscription. Only one run can win this UPDATE.
    $claim = $pdo->prepare('UPDATE subs SET last_sent_date = ?, next_try = NULL WHERE id = ? AND (last_sent_date IS NULL OR last_sent_date <> ?)');
    $claim->execute([$today, $s['id'], $today]);
    if ($claim->rowCount() !== 1) continue;
    $n['due']++;
    $code = 0;
    try { $code = send_push($s, REMINDER); } catch (Throwable $e) { error_log('photonic-push worker: ' . $e->getMessage()); }
    if ($code >= 200 && $code < 300) {
        $pdo->prepare('UPDATE subs SET tries = 0 WHERE id = ?')->execute([$s['id']]);
        $n['sent']++;
    } elseif ($code === 404 || $code === 410) {
        // The push service says this subscription no longer exists.
        $pdo->prepare('DELETE FROM subs WHERE id = ?')->execute([$s['id']]);
        $n['gone']++;
    } elseif ($code === 0 || $code === 429 || $code >= 500) {
        // Temporary: release today's claim and try again in ten minutes, three times at most.
        $tries = (int) $s['tries'] + 1;
        if ($tries < 3) {
            $pdo->prepare('UPDATE subs SET last_sent_date = ?, tries = ?, next_try = ? WHERE id = ?')
                ->execute([$s['last_sent_date'], $tries, $now->getTimestamp() + 600, $s['id']]);
            $n['retry']++;
        } else {
            $pdo->prepare('UPDATE subs SET tries = 0 WHERE id = ?')->execute([$s['id']]);
            $n['failed']++;
        }
    } else {
        $n['failed']++; // 400/403/413: our request was refused; keep the row, try tomorrow
    }
}
if (array_sum($n)) error_log('photonic-push worker: ' . json_encode($n));
if (PHP_SAPI === 'cli' && getenv('PHOTONIC_VERBOSE')) echo json_encode($n), "\n";
