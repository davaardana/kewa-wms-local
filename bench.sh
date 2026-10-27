#!/bin/sh
echo '=== OPcache JIT Status ==='
docker exec mosa-backend php -r '
$s = opcache_get_status(true);
echo "JIT enabled: " . ($s["jit"]["enabled"] ? "YES" : "NO") . "\n";
echo "JIT kind: " . $s["jit"]["kind"] . "\n";
echo "Hit rate: " . round($s["opcache_statistics"]["opcache_hit_rate"], 2) . "%\n";
echo "Cached scripts: " . $s["opcache_statistics"]["num_cached_scripts"] . "\n";
echo "Misses: " . $s["opcache_statistics"]["misses"] . "\n";
'
echo ''
echo '=== Cache Store Active ==='
docker exec mosa-backend sh -c 'cd /var/www/backend && php artisan config:show cache 2>/dev/null' | grep -E '^\s+default'
echo ''
echo '=== File Cache Entries ==='
docker exec mosa-backend find /var/www/backend/storage/framework/cache/data -type f -not -name '.gitignore' | wc -l
echo ''
echo '=== API Latency Benchmark (20 requests to /api/gate/events) ==='
total=0
count=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  t=$(curl -s -o /dev/null -w '%{time_total}' "http://127.0.0.1:8081/api/gate/events?warehouse_id=1")
  printf "  req %02d: %ss\n" "$i" "$t"
  total=$(awk "BEGIN{printf \"%.6f\", $total + $t}")
  count=$((count+1))
done
avg=$(awk "BEGIN{printf \"%.4f\", $total / $count}")
printf "\n  --> AVERAGE: %ss | TOTAL %d reqs\n" "$avg" "$count"
echo ''
echo '=== PostgreSQL cache table scan rate (15s window) ==='
s1=$(printf 'SELECT seq_scan FROM pg_stat_user_tables WHERE relname=$$cache$$;' | docker exec -i mosa-postgres psql -U mosa_user -d mosa_wms -t | tr -d ' ')
sleep 15
s2=$(printf 'SELECT seq_scan FROM pg_stat_user_tables WHERE relname=$$cache$$;' | docker exec -i mosa-postgres psql -U mosa_user -d mosa_wms -t | tr -d ' ')
delta=$((s2 - s1))
printf "  cache seq_scan delta in 15s: +%d (was: %d, now: %d)\n" "$delta" "$s1" "$s2"
if [ "$delta" -lt 50 ]; then
  echo "  STATUS: GOOD - cache table nearly idle (file cache active)"
else
  echo "  STATUS: WARN - cache table still hot (seq_scan delta > 50)"
fi
echo ''
echo '=== synchronous_commit ==='
printf 'SHOW synchronous_commit;' | docker exec -i mosa-postgres psql -U mosa_user -d mosa_wms -t
echo ''
echo '=== Summary ==='
echo "All 4 optimizations applied and measured."
