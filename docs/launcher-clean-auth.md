# Launcher: Clean Authentication & Server Connect

## Overview

This document describes the changes needed in the Savage 2 Launcher once the game
client implements the `LoginAndConnect` command (see `game-client-login-connect.md`).

The current implementation has these problems:

1. **Plaintext password on disk** — The launcher writes the user's master server
   password to `game/game/autoexec.cfg` before launching.
2. **In-memory password storage** — `AuthStore.ts` keeps `msPassword` in a
   Zustand store for later use when connecting to servers.
3. **Sleep timing hack** — `autoexec.cfg` uses `Sleep 500` between `Login` and
   `Connect`, which is a race condition on slow networks.
4. **Pre-validation overhead** — The launcher calls `ms_authenticate` before
   every `Connect` to verify the cookie is still valid, adding latency.
5. **Menu flash** — Users see a brief flash of the login/main menu before
   `autoexec.cfg` runs and transitions to the loading screen.

---

## Current Implementation (files to change)

### Rust Backend

| File | What it does now |
|------|-----------------|
| `src-tauri/src/main.rs` | `ms_authenticate` command: POSTs to MS, parses PHP-serialised response, returns `MsAuthResponse { cookie, account_id }`. `launch` command: accepts `connect_address`, `ms_username`, `ms_password`, delegates to profile. |
| `src-tauri/src/app_profile/mod.rs` | `LaunchOptions` struct: `connect_address: Option<String>`, `ms_username: Option<String>`, `ms_password: Option<String>` |
| `src-tauri/src/app_profile/s2.rs` | `launch()`: writes `autoexec.cfg` with `SetUsername`, `SetPassword`, `Login`, `Sleep 500`, `Connect <addr>`. Also sets `upd_checkForUpdates false`. |

### TypeScript Frontend

| File | What it does now |
|------|-----------------|
| `src/stores/AuthStore.ts` | Stores `msCookie`, `msAccountId`, `msPassword` (non-persisted). On login: calls s2api → calls `ms_authenticate` → stores results. |
| `src/hooks/useS2Version.ts` | `connectToServer()`: pre-validates via `ms_authenticate`, shows warning toast on failure, passes `msUsername` + `msPassword` to `launch`. `play()`: also passes credentials. |
| `src/components/ServerBrowser/index.tsx` | Play button calls `onConnect(ip:port)`. Enabled only when logged in. |
| `src/types/auth.ts` | `MsAuthResponse { cookie: string; accountId: number }` |
| `src/locales/en/launch.json` | Translation keys: `servers_connect`, `servers_connect_login`, `servers_auth_warning` |

---

## Target Architecture

### Phase 1: Use `LoginAndConnect` (minimal change)

Once the game client has `LoginAndConnect`, the launcher simply changes the
autoexec.cfg to:

```
set upd_checkForUpdates false
SetUsername xxx
SetPassword yyy
LoginAndConnect 1.2.3.4:11235
```

**Changes required:**

#### `src-tauri/src/app_profile/s2.rs`

In `launch()`, replace the current autoexec.cfg generation block (currently
writes `Login` / `Sleep 500` / `Connect` separately) with a single
`LoginAndConnect` line:

```rust
// Current (remove):
writeln!(f, "Login")?;
writeln!(f, "Sleep 500")?;
if let Some(addr) = &launch_options.connect_address {
    writeln!(f, "Connect {}", addr)?;
}

// New:
if let Some(addr) = &launch_options.connect_address {
    writeln!(f, "LoginAndConnect {}", addr)?;
} else {
    writeln!(f, "Login")?;
}
```

**This alone solves problems #3 and #5** (no race condition, no menu flash
since `LoginAndConnect` chains atomically).

---

### Phase 2: Eliminate plaintext password (cookie passthrough)

If the game client implements `SetLoginState` (Option C in the game-client doc),
the launcher can pass the pre-authenticated cookie instead of the password.

#### `src-tauri/src/app_profile/mod.rs`

Replace password fields with cookie/session fields:

```rust
pub struct LaunchOptions {
    pub connect_address: Option<String>,
    pub ms_cookie: Option<String>,
    pub ms_account_id: Option<i32>,
    pub ms_nickname: Option<String>,
    pub ms_username: Option<String>,
    // Remove: ms_password
}
```

#### `src-tauri/src/app_profile/s2.rs`

Update autoexec.cfg generation:

```rust
if let (Some(cookie), Some(account_id), Some(nickname), Some(username)) = (
    &launch_options.ms_cookie,
    &launch_options.ms_account_id,
    &launch_options.ms_nickname,
    &launch_options.ms_username,
) {
    writeln!(f, "SetLoginState {} {} {} {}",
        cookie, account_id, nickname, username)?;

    if let Some(addr) = &launch_options.connect_address {
        writeln!(f, "Connect {}", addr)?;
    }
}
```

No more `SetUsername`, `SetPassword`, `Login`, or `Sleep`.

#### `src/stores/AuthStore.ts`

Remove `msPassword` entirely. The store already has `msCookie` and `msAccountId`.
Add `msNickname` if the MS auth response includes it (it does — the
`nickname` field in the PHP-serialised response):

```typescript
interface AuthState {
    // ... existing fields ...
    msCookie: string | null;
    msAccountId: number | null;
    msNickname: string | null;  // new
    // Remove: msPassword
}
```

Update the login action to store the nickname from the MS response.

#### `src-tauri/src/main.rs`

Update `MsAuthResponse` to include the nickname:

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MsAuthResponse {
    pub cookie: String,
    pub account_id: i32,
    pub nickname: String,  // new
}
```

Parse the `nickname` field from the PHP-serialised MS response (it's already
present in the response — field `nickname` in the `a:N:{...}` array).

Update the `launch` command to accept `ms_cookie` / `ms_account_id` /
`ms_nickname` instead of `ms_password`.

#### `src/hooks/useS2Version.ts`

Update `connectToServer()` and `play()` to pass cookie/accountId/nickname
instead of password:

```typescript
const connectToServer = async (address: string) => {
    const { msCookie, msAccountId, msNickname, username } = useAuthStore.getState();
    if (!msCookie || !msAccountId) {
        showToast("warning", t("servers_connect_login"));
        return;
    }

    await invoke("launch", {
        // ...
        connectAddress: address,
        msCookie,
        msAccountId,
        msNickname,
        msUsername: username,
    });
};
```

**This solves problem #1** (no password on disk) — autoexec.cfg only contains
a session cookie, not the user's password.

**This also solves problem #2** (no password in memory) — `msPassword` is removed
from `AuthStore`.

---

### Phase 3: Eliminate autoexec.cfg entirely (command-line args)

Instead of writing credentials to a file, pass them as command-line arguments.

#### `src-tauri/src/app_profile/s2.rs`

Instead of writing autoexec.cfg, build command-line args:

```rust
fn build_launch_args(&self, launch_options: &LaunchOptions) -> Vec<String> {
    let mut args = Vec::new();
    args.push("set upd_checkForUpdates false".to_string());

    if let (Some(cookie), Some(account_id), Some(nickname), Some(username)) = (
        &launch_options.ms_cookie,
        &launch_options.ms_account_id,
        &launch_options.ms_nickname,
        &launch_options.ms_username,
    ) {
        args.push(format!("SetLoginState {} {} {} {}",
            cookie, account_id, nickname, username));

        if let Some(addr) = &launch_options.connect_address {
            // Set host_autoexec so Connect runs AFTER UI init
            args.push(format!("Set host_autoexec Connect {}", addr));
        }
    }

    args
}
```

The game is then launched with:

```
savage2.exe "set upd_checkForUpdates false" "SetLoginState <cookie> <id> <nick> <user>" "Set host_autoexec Connect 1.2.3.4:11235"
```

The K2 engine processes command-line args as console commands (`CHost::Init()`
line 312: `K2Console.Execute(K2System.GetCommandLine())`).

`SetLoginState` executes during command-line processing (step 1 in boot order),
setting `m_bConnected = true` and all cvars. `Connect` is deferred to
`host_autoexec` (step 5) which runs after UI init.

**No file written to disk at all.**

#### Caveats

- Command-line args are visible in the process list. A cookie is less sensitive
  than a password, but still a session token.
- On Windows, `CreateProcess` command lines are visible via `wmic` or Task
  Manager details view.
- For maximum security, use a temporary secure channel (named pipe, env var,
  or temp file — see Security section below).

---

### Phase 4: Remove pre-validation (optional)

Currently, `connectToServer()` calls `ms_authenticate` before every launch to
verify the stored cookie is still valid. With `LoginAndConnect` (Phase 1), this
is unnecessary because the game client will authenticate directly with the MS.

With `SetLoginState` (Phase 2+), the cookie could have expired. Two options:

**A. Keep pre-validation but make it lightweight:**

The launcher already has the cookie and account_id stored. Add a lightweight
MS endpoint (or use an existing one) that validates a cookie without
re-authenticating. If invalid, re-authenticate using the refresh token from
s2api, then re-do MS auth.

**B. Let the game handle it:**

If the game's `SetLoginState` sets `m_bConnected = true` but the cookie is
actually expired, the game server will reject the connection. The game could
show an error and fall back to the login screen. This is acceptable UX
for an edge case (cookie expired in the ~2 seconds between launcher and
game connect).

**Recommendation:** For Phase 1 (`LoginAndConnect`), remove pre-validation
entirely — the game re-authenticates fresh each time. For Phase 2+
(`SetLoginState`), keep a simple pre-validation check but use the stored
cookie directly instead of re-authenticating.

---

## `ms_authenticate` Changes

### Current Implementation (`src-tauri/src/main.rs`)

```rust
#[tauri::command]
async fn ms_authenticate(username: String, password: String) -> Result<MsAuthResponse, String> {
    // POST to masterserver1.talesofnewerth.com/irc_updater/irc_requester.php
    // Body: f=auth&email=<username>&password=<password>
    // Parse PHP-serialised response
    // Return { cookie, account_id }
}
```

### Phase 2 Changes

1. Add `nickname` field to `MsAuthResponse`
2. Parse the `nickname` field from the PHP-serialised response
3. Return it to the frontend so it can be stored in `AuthStore`

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MsAuthResponse {
    pub cookie: String,
    pub account_id: i32,
    pub nickname: String,
}
```

In the response parser, extract the nickname:

```rust
// The PHP-serialised response contains something like:
// a:5:{s:8:"nickname";s:10:"PlayerName";s:10:"account_id";i:12345;...}
let nickname = /* extract "nickname" field */;
```

---

## `AuthStore.ts` Changes (all phases)

### Phase 1 (minimal)

No changes needed — still stores and passes `msPassword`.

### Phase 2 (remove password)

```typescript
interface AuthState {
    token: string | null;
    refreshToken: string | null;
    username: string | null;
    msCookie: string | null;
    msAccountId: number | null;
    msNickname: string | null;      // NEW
    // REMOVED: msPassword

    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
}
```

Update the `login` action:

```typescript
login: async (username, password) => {
    // 1. Authenticate with s2api (existing)
    const s2apiResponse = await fetch(...);
    const { token, refreshToken } = await s2apiResponse.json();

    // 2. Authenticate with master server (existing)
    const msResponse: MsAuthResponse = await invoke("ms_authenticate", {
        username, password
    });

    // 3. Store results (updated)
    set({
        token,
        refreshToken,
        username,
        msCookie: msResponse.cookie,
        msAccountId: msResponse.accountId,
        msNickname: msResponse.nickname,    // NEW
        // REMOVED: msPassword: password,
    });
},
```

The `persist` middleware config should include `msNickname` but still
exclude any sensitive data:

```typescript
partialize: (state) => ({
    token: state.token,
    refreshToken: state.refreshToken,
    username: state.username,
    msCookie: state.msCookie,
    msAccountId: state.msAccountId,
    msNickname: state.msNickname,
}),
```

---

## `useS2Version.ts` Changes

### Phase 1

Replace `ms_authenticate` pre-validation + `Sleep` approach:

```typescript
const connectToServer = async (address: string) => {
    const { username, msPassword } = useAuthStore.getState();
    if (!username || !msPassword) {
        showToast("warning", t("servers_connect_login"));
        return;
    }

    // No pre-validation needed — LoginAndConnect handles auth + connect atomically
    await invoke("launch", {
        /* ... */
        connectAddress: address,
        msUsername: username,
        msPassword: msPassword,
    });
};
```

### Phase 2

```typescript
const connectToServer = async (address: string) => {
    const { msCookie, msAccountId, msNickname, username } = useAuthStore.getState();
    if (!msCookie || !msAccountId) {
        showToast("warning", t("servers_connect_login"));
        return;
    }

    await invoke("launch", {
        /* ... */
        connectAddress: address,
        msCookie,
        msAccountId,
        msNickname,
        msUsername: username,
    });
};
```

---

## Security Improvements

### Current risks

| Risk | Severity | Current State |
|------|----------|---------------|
| Password in autoexec.cfg | **High** | Written to disk before launch, not cleaned up |
| Password in memory (Zustand) | Medium | In-memory only, not persisted, cleared on logout |
| Cookie in autoexec.cfg | Low | Session token, expires |
| Credentials in command-line | Medium | Visible to same-user processes |

### Phase 1 mitigations

**Clean up autoexec.cfg after launch:**

In `s2.rs`, after the game process is spawned, wait briefly and then overwrite
or delete autoexec.cfg:

```rust
// After spawning the game process:
if autoexec_has_credentials {
    // Wait for the game to read the file (it's read during init)
    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    // Overwrite with safe content
    std::fs::write(&autoexec_path, "set upd_checkForUpdates false\n")
        .ok(); // Best-effort cleanup
}
```

### Phase 2 mitigations

- No password written anywhere (cookie only)
- Cookie is a session token that expires
- autoexec.cfg only contains a cookie, not credentials

### Phase 3 mitigations (command-line args)

- No files written to disk
- Cookie visible in process list but is a session token
- For additional security, consider:

**Named pipe approach (Windows):**

```rust
use windows::Win32::Storage::FileSystem::CreateFileW;
use windows::Win32::System::Pipes::CreateNamedPipeW;

fn create_credential_pipe(cookie: &str, account_id: i32, nickname: &str) -> String {
    let pipe_name = format!(r"\\.\pipe\s2launcher_{}", std::process::id());
    // Create pipe, write credentials, close write end
    // Game reads from pipe on startup, pipe is destroyed
    pipe_name
}
```

The game would be launched with:
```
savage2.exe "ReadLoginFromPipe \\.\pipe\s2launcher_12345"
```

And the game would have a `CMD(ReadLoginFromPipe)` that reads credentials from
the pipe and calls `SetLoginState`.

---

## Cookie/Session Management

### Cookie lifecycle

- The MS cookie is obtained during login (s2api login → ms_authenticate)
- The cookie's exact expiry is unknown (MS doesn't return TTL)
- The cookie is stored in `AuthStore` (persisted via Zustand persist middleware)
- On app restart, the cookie may still be valid

### Refresh strategy

When the s2api JWT expires (2 hours) and the user refreshes it (via refresh
token, 90 days for launcher), the MS cookie should also be refreshed:

```typescript
refreshAuth: async () => {
    // 1. Refresh s2api token
    const { token, refreshToken } = await refreshS2ApiToken(get().refreshToken);

    // 2. Re-authenticate with MS (requires password — but we removed it!)
    // Option A: Don't refresh MS cookie; let the game re-auth if needed
    // Option B: Add a "refresh cookie" endpoint to the MS that takes an existing cookie
    // Option C: Store an encrypted version of the password for refresh purposes

    set({ token, refreshToken });
},
```

**Recommendation:** For Phase 2+, accept that the MS cookie may expire and
handle it in the game client gracefully (show login dialog if `SetLoginState`
cookie is rejected by the game server).

---

## Migration Path

| Phase | What Changes | What's Fixed | Breaking? |
|-------|-------------|-------------|-----------|
| 1 | autoexec.cfg uses `LoginAndConnect` | Race condition, menu flash | Requires game client change |
| 2 | Pass cookie instead of password | Plaintext password on disk + in memory | Requires game client `SetLoginState` |
| 3 | Command-line args instead of file | No disk I/O for credentials | No additional game changes |
| 4 | Remove pre-validation | Faster connect, simpler code | No |

Each phase can be shipped independently. Phase 1 is the highest-impact change
with the simplest implementation.

---

## Summary of Files to Change Per Phase

### Phase 1

| File | Change |
|------|--------|
| `src-tauri/src/app_profile/s2.rs` | Replace `Login` + `Sleep 500` + `Connect` with `LoginAndConnect` |

### Phase 2

| File | Change |
|------|--------|
| `src-tauri/src/main.rs` | Add `nickname` to `MsAuthResponse`, parse from MS response |
| `src-tauri/src/app_profile/mod.rs` | Replace `ms_password` with `ms_cookie`, `ms_account_id`, `ms_nickname` in `LaunchOptions` |
| `src-tauri/src/app_profile/s2.rs` | Generate `SetLoginState` + `Connect` instead of `SetUsername` + `SetPassword` + `LoginAndConnect` |
| `src/stores/AuthStore.ts` | Remove `msPassword`, add `msNickname` |
| `src/hooks/useS2Version.ts` | Pass cookie/accountId/nickname instead of password |

### Phase 3

| File | Change |
|------|--------|
| `src-tauri/src/app_profile/s2.rs` | `build_launch_args()` instead of writing autoexec.cfg |
| `src-tauri/src/app_profile/mod.rs` | No file path needed for autoexec.cfg |

### Phase 4

| File | Change |
|------|--------|
| `src/hooks/useS2Version.ts` | Remove `ms_authenticate` pre-validation call |
| `src-tauri/src/main.rs` | Optionally remove `ms_authenticate` command (keep if used elsewhere) |
