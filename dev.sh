#!/bin/sh
#
# Serves mneme for local development: the api and the console.
#
# Both run in watch mode — `nest start --watch` recompiles and restarts on a
# change, `next dev` refreshes the browser — and both are stopped together,
# because half a running workspace is the state that wastes the most time: the
# half that is missing looks like a bug in the half that is there.
#
#   ./dev.sh                      api on 3130, console on 3131
#   API_PORT=4130 ./dev.sh        move the api (the console follows it)
#   WEB_PORT=4131 ./dev.sh        move the console
#
# The console signs in through pistis, which is not started here. Without it
# there is no way past the sign-in.
set -eu

cd "$(dirname "$0")"

# `PORT` is still honoured for the api alone, which is what this script took
# before there was a second process to give a port to.
API_PORT="${API_PORT:-${PORT:-3130}}"
WEB_PORT="${WEB_PORT:-3131}"

# `nc` and `lsof` are both common but neither is guaranteed. With neither, skip
# the check rather than refuse to start: it is a courtesy, not a gate.
port_in_use() {
    if command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
    elif command -v nc >/dev/null 2>&1; then
        nc -z 127.0.0.1 "$1" >/dev/null 2>&1
    else
        return 1
    fi
}

for port in "$API_PORT" "$WEB_PORT"; do
    if port_in_use "$port"; then
        echo "mneme: port $port is already in use." >&2
        echo "  Stop whatever holds it, or set API_PORT / WEB_PORT." >&2
        exit 1
    fi
done

echo "mneme: api      http://localhost:${API_PORT}"
echo "mneme: console  http://localhost:${WEB_PORT}"
echo

# Job control, so each child leads its own process group. `pnpm` spawns the real
# server as a grandchild and does not pass a signal on to it, so `exec`ing pnpm
# here — or signalling only its pid — leaves Nest running and holding the port
# after this script is gone. Signalling the group is what actually stops it.
set -m

api_pid=''
web_pid=''

stop_children() {
    for pid in "$api_pid" "$web_pid"; do
        [ -n "$pid" ] || continue
        kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    done
}

trap 'stop_children' TERM INT

PORT="$API_PORT" pnpm start:server &
api_pid=$!

# The console reaches the api server-side, so it has to be told where the api
# ended up. Only set when it is not already: a `web/.env` naming a different
# host — a shared api, say — should win over this default.
: "${MNEME_API_URL:=http://localhost:${API_PORT}}"
export MNEME_API_URL

PORT="$WEB_PORT" pnpm start:web &
web_pid=$!

# Wait for whichever finishes first; the stop below takes the other down with
# it. Polled rather than `wait -n`, which is a bash 4.3 extension and macOS
# still ships bash 3.2 as /bin/sh. A second of latency costs nothing here.
status=0

while :; do
    if ! kill -0 "$api_pid" 2>/dev/null; then
        wait "$api_pid" 2>/dev/null || status=$?
        break
    fi

    if ! kill -0 "$web_pid" 2>/dev/null; then
        wait "$web_pid" 2>/dev/null || status=$?
        break
    fi

    sleep 1
done

# The loop also ends when the trap fires, before the children are actually
# gone; give the groups a moment rather than reporting a port still in use.
stop_children
sleep 1

exit "$status"
