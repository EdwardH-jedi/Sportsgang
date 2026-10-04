# Single WebSocket API process: operator check

**Live check status: PENDING / NOT_RUN by this task.** No `fly` or `flyctl` command was
run, and no deployed service was contacted. The repository's `fly.toml` describes
what a deploy would request. It does not prove what is running. This page is the
read-only check an authorised operator runs before release, and how to read the
result.

## 1. What the repository says

`fly.toml` (repository root). The relevant keys, verbatim; the `[build]` and
`[[http_service.checks]]` (`GET /health`) blocks are left out:

```toml
app = 'protin-api'
primary_region = 'syd'

[processes]
  app = 'uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level info'
  worker = 'python worker.py'

[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = 'stop'
  auto_start_machines = true
  min_machines_running = 1
  processes = ['app']

[[vm]]
  size = 'shared-cpu-1x'
  memory = '512mb'
  processes = ['app']

[[vm]]
  size = 'shared-cpu-1x'
  memory = '512mb'
  processes = ['worker']
```

What the file does and does not fix:

| Key | Meaning for the topology | Proves "one API process"? |
|---|---|---|
| `app = 'protin-api'` | The Fly app every command below targets. The mobile build's API host in `apps/mobile/eas.json` is the same app's `fly.dev` host. | – |
| `[processes] app` / `worker` | Two process groups. Only `app` runs uvicorn. `worker` runs `worker.py` (push delivery). | No: it sets the command, not the Machine count. |
| `http_service.processes = ['app']` | The public HTTP/WebSocket service routes only to `app` Machines. The worker serves no sockets. | No. |
| `min_machines_running = 1` | A **minimum** of running Machines in the service's group. | No: it is not a maximum. |
| `auto_start_machines = true` | Fly's proxy starts *existing, stopped* Machines of the group on demand. | No: if the group has more than one Machine, more than one can be running. |
| `auto_stop_machines = 'stop'` | Idle Machines are stopped, not destroyed, so they remain candidates for auto-start. | No. |
| uvicorn command without `--workers` | One process per Machine, **unless** `WEB_CONCURRENCY` is set: uvicorn uses it as the default worker count (`uvicorn/config.py`, `if workers is None and "WEB_CONCURRENCY" in os.environ`). `fly.toml` has no `[env]` block, but a secret or Machine env could set it. | Only together with §3's secrets/env check. |
| no `[http_service.concurrency]` block | Fly's platform defaults apply. They are not recorded in the repository; `fly config show` shows the deployed values. | – |
| no `[deploy]` block | Fly's default deploy strategy applies. During a deploy, old and new Machines may briefly coexist, depending on the strategy. Verify against current Fly docs. | – |

The repository holds no evidence either way of how many `app` Machines exist. Fly
documents that a first deploy can create more than one Machine per process group
with services, for availability, unless that is turned off. Verify against current
Fly docs; this page does not rely on it.

## 2. Why more than one API process breaks realtime closure

CONTRACTS §8, "Topology limit": socket bookkeeping is in-process. A block closes
every socket of the pair only when the API runs as one process (`fly.toml` `app`
process, one uvicorn worker). If more than one API process serves WebSockets, for
example a second `app` Machine started by `auto_start_machines`, a block's closure
cannot reach sockets held by the other process. The room send deadline
(`WS_SEND_TIMEOUT_SECONDS`, MA-B) and close-attempt ownership are per process too.
Pushes stay safe across processes because their boundary is in PostgreSQL. That
topology "is not supported for realtime chat", and no distributed realtime layer
exists.

## 3. Read-only commands (authorised operator only; not run here)

`<app>` is `protin-api`, from `fly.toml`. Every command below only reads. Save each
output with the date, the operator and `fly version`. Do not paste secret values.
`fly secrets list` prints names and digests only.

```sh
fly version
fly status -a protin-api                    # Machines per process group, state, region, version
fly machines list -a protin-api             # every Machine, including stopped ones
fly machines list -a protin-api --json      # same, machine-readable (process group in config.metadata)
fly scale show -a protin-api                # count and VM size per process group
fly config show -a protin-api               # the deployed configuration (processes, http_service, concurrency)
fly secrets list -a protin-api              # names only: look for WEB_CONCURRENCY
```

Count the API Machines without editing anything. The field names are as flyctl
prints them today; verify them on the output.

```sh
fly machines list -a protin-api --json \
  | jq '[.[] | select(.config.metadata.fly_process_group == "app")] | length'
fly machines list -a protin-api --json \
  | jq -r '.[] | [.id, .config.metadata.fly_process_group, .state, .region, (.config.env.WEB_CONCURRENCY // "-")] | @tsv'
```

Do **not** run `fly scale count`, `fly machine start|stop|destroy|clone`, `fly deploy`
or anything else that changes the app as part of this check.

## 4. What proves exactly one API process serving WebSockets

All of the following, observed at the same time:

1. `fly machines list` shows **exactly one Machine** whose process group is `app`,
   **counting stopped and suspended Machines**, because `auto_start_machines` can
   wake any of them. `fly scale show` agrees (`app` count 1).
2. The deployed configuration (`fly config show`) has `http_service.processes` equal
   to `["app"]`, so only that group receives HTTP/WebSocket traffic. The `app` process
   command matches `fly.toml` and has no `--workers`.
3. Neither `fly secrets list` nor that Machine's env defines `WEB_CONCURRENCY`, so
   uvicorn runs one worker process.
4. The `worker` group, if present, is separate: its Machines run `python worker.py`
   and are not in `http_service.processes`. Any number of worker Machines is
   compatible with the contract, because push ownership is enforced in PostgreSQL
   (MA-C).
5. No other Fly app or host serves the mobile API host. The `EXPO_PUBLIC_API_URL` of
   the store profiles in `apps/mobile/eas.json` points at this app.

Record the result as PASS only if all five hold. Record what was seen, not what the
repository intends.

## 5. If there is more than one

- Do **not** scale, stop, destroy or redeploy anything as part of this check.
- Record the outputs (Machine IDs, process groups, states, regions,
  `WEB_CONCURRENCY` presence) and report them to the deployment owner.
- The gate stays **OPEN**: realtime block closure, the room send deadline and close
  ownership are not guaranteed across processes. Choosing a remedy belongs to the
  owner: reduce the `app` group to one Machine, accept and document the limitation,
  or build a distributed realtime layer, which is out of scope today.

## 6. Status

| Item | Status |
|---|---|
| Repository configuration | Read (above). Consistent with one `app` process per Machine, but **does not bound the Machine count** |
| Live topology (`fly status` / `machines list` / `scale show` / `config show` / `secrets list`) | **PENDING / NOT_RUN** (no production access in this task) |
| Decision if more than one | Deployment owner |
