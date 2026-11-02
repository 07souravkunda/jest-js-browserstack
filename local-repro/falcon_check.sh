#!/usr/bin/env bash
# Mirrors the Falcon console calls of BStackAutomation falcon_apis.feature (port 45454)
# against one BrowserStackLocal build, RUNS times. The key comes from $BSL_KEY and is never printed.
# Usage: falcon_check.sh <label> <binary> [runs]
set -u
LABEL="$1"; BIN="$2"; RUNS="${3:-3}"; PORT=45454
ORIGIN="http://localhost:$PORT"
OUT="local-repro/out-falcon-$LABEL"; mkdir -p "$OUT"

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@"; }
listening() { netstat -tln 2>/dev/null | awk -v p=":$PORT" '$4 ~ p"$" {print $4}' | sort -u | tr '\n' ' '; }
body() { printf '{"key":"%s","forceLocal":%s,"proxyHost":"%s","proxyPort":"%s","proxyUser":"","proxyPass":"","forceProxy":false,"verbose":false,"logFile":"","only":"","pacFile":"","proxyType":false}' "$BSL_KEY" "$1" "$2" "$3"; }

for run in $(seq 1 "$RUNS"); do
  LOG="$OUT/run$run.log"; rm -f "$LOG"
  [ -n "$(listening)" ] && { echo "[$LABEL#$run] port $PORT busy before start: $(listening)"; exit 1; }
  "$BIN" --key "$BSL_KEY" --local-identifier "falcon-check-$LABEL-$run" --log-file "$LOG" --verbose 3 >"$OUT/run$run.stdout" 2>&1 &
  PID=$!
  T0=$(date +%s); ok=0
  for i in $(seq 1 90); do
    grep -q "Press Ctrl-C to exit" "$LOG" "$OUT/run$run.stdout" 2>/dev/null && { ok=1; break; }
    kill -0 $PID 2>/dev/null || break
    sleep 1
  done
  echo "[$LABEL#$run] started=$ok in $(( $(date +%s) - T0 ))s"
  echo "  listen: $(listening)"

  for H in localhost 127.0.0.1 '[::1]'; do
    B="http://$H:$PORT"
    st=$(code "$B/status")
    JAR=$(mktemp)
    au=$(code -c "$JAR" -X POST "$B/authenticate-falcon" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d "{\"accessKey\":\"$BSL_KEY\"}")
    tok=$(awk '$6=="falcon_token"{print "yes"}' "$JAR")
    cfg=$(code -b "$JAR" "$B/configure?subset=" -H 'Content-Type: application/json' -H "Origin: $ORIGIN")
    echo "  $H: status=$st auth=$au token=${tok:-no} getConfig=$cfg"
    rm -f "$JAR"
  done

  # POST /configure the way configure_falcon_using_params does (via localhost)
  JAR=$(mktemp)
  curl -s -o /dev/null -c "$JAR" --max-time 10 -X POST "$ORIGIN/authenticate-falcon" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d "{\"accessKey\":\"$BSL_KEY\"}"
  p1=$(code -b "$JAR" -X POST "$ORIGIN/configure" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d "$(body true '' '')")
  sleep 5
  fl=$(curl -s -b "$JAR" --max-time 10 "$ORIGIN/configure?subset=" -H "Origin: $ORIGIN" | jq -c '[.response[]? | select(.name=="forceLocal") | .value]' 2>/dev/null || echo parse-err)
  p2=$(code -b "$JAR" -X POST "$ORIGIN/configure" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d "$(body false test 1234)")
  echo "  POST forceLocal=true -> $p1 (expect 200); forceLocal now=$fl; POST proxyHost=test:1234 -> $p2 (expect 400)"
  rm -f "$JAR"

  # graceful stop (SIGTERM), wait for exit
  kill -TERM $PID 2>/dev/null
  for i in $(seq 1 20); do kill -0 $PID 2>/dev/null || break; sleep 1; done
  kill -0 $PID 2>/dev/null && echo "  WARN: pid $PID still alive after SIGTERM" || echo "  stopped"
  sleep 2
done
