# Game Client: Implement `LoginAndConnect` Command

## Overview

The Savage 2 launcher currently uses an `autoexec.cfg` hack to authenticate with the
master server and connect to a game server:

```
SetUsername xxx
SetPassword yyy
Login
Sleep 500
Connect 1.2.3.4:11235
```

This has several problems:

1. **Race condition** — `Login` is async (HTTP POST); `Sleep 500` is a guess.
   On slow networks or an overloaded MS, the cookie may not be set when `Connect`
   fires, causing auth failure on the game server.
2. **Credentials in plaintext** — The username and password are written to
   `game/game/autoexec.cfg` on disk before the game launches.
3. **Menu flash** — The game's UI initialises to the login screen before
   `autoexec.cfg` runs, so the user sees a brief flash of the login/menu
   screen before the `Connect` transitions them to the loading screen.
4. **No error feedback** — If `Login` fails (wrong password, MS down), the game
   silently stays on the login screen with no indication of what went wrong.

The goal is to add a `LoginAndConnect` console command to the game client that
atomically authenticates and then connects, with proper error handling.

---

## Relevant Source Files

| File | Purpose |
|------|---------|
| `src/k2/c_clientlogin.h` | `CClientLogin` class declaration |
| `src/k2/c_clientlogin.cpp` | Login/auth implementation, CMD registrations |
| `src/k2/c_hostclient.cpp` | `CHostClient::Connect()`, `Disconnect()`, cvar declarations |
| `src/k2/c_host.cpp` | `CHost::Connect()`, `CHost::Init()` boot sequence |
| `src/k2/host_commands.cpp` | `CMD(Connect)` console command |
| `src/k2/c_dbmanager.cpp` | Async HTTP request manager |
| `src/k2/c_consoleelement.h` | Cvar flag definitions (`CVAR_READONLY`, etc.) |
| `src/k2/c_script.cpp` | Script execution, `Sleep` implementation |

---

## Current Login Flow (Reference)

### 1. `CClientLogin::Connect()` — `c_clientlogin.cpp:103`

Sends an async HTTP POST to the master server:

```
POST https://masterserver1.talesofnewerth.com/irc_updater/irc_requester.php
Content-Type: application/x-www-form-urlencoded

f=auth&email=<username>&password=<password>
```

- Reads credentials from `m_sUser` / `m_sPass` (set by `SetUsername` / `SetPassword`)
- Creates a `CDBManager` if needed and calls `SendRequest("auth", true)`
- The request is async — `Connect()` returns immediately
- Rate-limited: blocks if called within `LOGIN_DELAY` (5000ms) of last attempt

### 2. `CClientLogin::Frame()` — `c_clientlogin.cpp:91`

Called every engine frame from `CHost::Frame()`:

```cpp
void CClientLogin::Frame()
{
    if (m_pDBManager != NULL) {
        CDBResponse *pResponse = m_pDBManager->Frame();
        if (pResponse != NULL)
            ProcessResponse(pResponse);
    }
}
```

Polls `CDBManager::Frame()` for completed HTTP responses.

### 3. `CClientLogin::ProcessResponse()` — `c_clientlogin.cpp:185`

On successful auth response, does **all of these** (in order):

1. Parses PHP-serialised response
2. Extracts `account_id` → sets `net_accountid` cvar via `ICvar::SetInteger()`
3. Extracts `cookie` → sets `net_cookie` cvar via `ICvar::SetString()`
4. Extracts `nickname`, prepends clan tag → sets `net_name` cvar
5. Sets up IRC (nick, channel, buddy list)
6. **Sets `m_bConnected = true`** ← critical for post-disconnect routing
7. Fires `LoginStatus` UI trigger with `["1", ""]` (success)
8. Calls `ChatManager.Connect()` for IRC

On failure:
- Fires `LoginStatus` UI trigger with `["0", "<error message>"]`
- Calls `Disconnect()` which sets `m_bConnected = false`

### 4. `CHostClient::Disconnect()` — `c_hostclient.cpp:1774`

After disconnecting from a game server:

```cpp
if (ClientLogin.Connected())
    Host.SetCurrentInterface(HOST_INTERFACE_BROWSER);   // → server browser
else
    Host.SetCurrentInterface(HOST_INTERFACE_MAIN);      // → login screen
```

This is why `m_bConnected = true` matters — without it, the user is dumped
back to the login screen after every disconnect.

---

## Cvar Constraints

Both auth cvars are `CVAR_READONLY`:

```cpp
// c_hostclient.cpp:60-61
CVAR_INTF(    net_accountid,  -1,  CVAR_READONLY);
CVAR_STRINGF( net_cookie,     "",  CVAR_NETSETTING | CVAR_READONLY);
```

The `set` console command (and by extension autoexec.cfg) checks `CVAR_READONLY`
and **silently refuses** to set the value via `DefaultCvar_Cmd` in `c_cvar.cpp:64`:

```cpp
if (pCvar->HasFlags(CVAR_READONLY))
{
    K2Console << pCvar->GetName() << _T(" is a read - only value") << newl;
    return false;
}
```

Only the C++ API bypasses this: `ICvar::SetString()` and `ICvar::SetInteger()`
call `Set()` / `SetValue()` directly, which do **not** check `CVAR_READONLY`.

This means **you cannot set `net_cookie` or `net_accountid` from autoexec.cfg**.
The only way is through `CClientLogin::ProcessResponse()`.

---

## Implementation Plan

### Option A: `LoginAndConnect` command (recommended)

Add a new command that stores the target address, triggers `Login`, and chains
`Connect` on success via the existing `LoginStatus` trigger mechanism.

#### Step 1: Add state to `CClientLogin`

In `c_clientlogin.h`, add:

```cpp
private:
    tstring     m_sPendingConnect;      // Address to connect to after login
    bool        m_bPendingConnect;      // Whether a LoginAndConnect is in progress

public:
    void        LoginAndConnect(const tstring &sAddress);
    void        ClearPendingConnect()   { m_bPendingConnect = false; m_sPendingConnect.clear(); }
```

Initialise in constructor:
```cpp
m_bPendingConnect(false), m_sPendingConnect(_T(""))
```

#### Step 2: Implement `LoginAndConnect`

In `c_clientlogin.cpp`:

```cpp
void CClientLogin::LoginAndConnect(const tstring &sAddress)
{
    m_sPendingConnect = sAddress;
    m_bPendingConnect = true;
    Connect();  // Fires async login
}
```

#### Step 3: Chain Connect on auth success

In `CClientLogin::ProcessResponse()`, after the `m_bConnected = true` line
and the `LoginStatus.Trigger()` call (~line 296), add:

```cpp
// If a LoginAndConnect is pending, connect to the game server now that
// auth is complete and net_cookie / net_accountid are set.
if (m_bPendingConnect && !m_sPendingConnect.empty())
{
    tstring sAddr = m_sPendingConnect;
    ClearPendingConnect();
    Host.Connect(sAddr);
}
```

#### Step 4: Handle auth failure

In `CClientLogin::Disconnect()` (~line 89), before or after the `LoginStatus`
trigger, add:

```cpp
if (m_bPendingConnect)
{
    K2Console.Client << _T("LoginAndConnect failed: ") << sReason << newl;
    ClearPendingConnect();
    // Optionally show a dialog or emit a specific trigger
}
```

#### Step 5: Register the command

In `c_clientlogin.cpp`, alongside the existing CMD registrations:

```cpp
CMD(LoginAndConnect)
{
    if (vArgList.empty())
    {
        K2Console << _T("syntax: LoginAndConnect <address>") << newl;
        return false;
    }
    ClientLogin.LoginAndConnect(vArgList[0]);
    return true;
}
```

#### Step 6: Update autoexec.cfg usage

The launcher would then write:

```
set upd_checkForUpdates false
SetUsername xxx
SetPassword yyy
LoginAndConnect 1.2.3.4:11235
```

No more `Sleep`. No race condition. `Connect` only fires after the cookie is set.

---

### Option B: Command-line argument approach

Instead of autoexec.cfg, pass credentials and server address as command-line args.
The K2 engine processes command-line args as console commands:

```cpp
// c_host.cpp:312-313
K2Console.Execute(K2System.GetCommandLine());
```

The launcher would launch:

```
savage2.exe "SetUsername xxx" "SetPassword yyy" "Set host_autoexec LoginAndConnect 1.2.3.4:11235"
```

- `SetUsername` / `SetPassword` execute immediately from command line
- `host_autoexec` is executed last in `CHost::Init()` (line 411-412), after
  all UI is initialised
- This avoids writing credentials to disk entirely

**NOTE:** Even with command-line args, the credentials are still visible in the
process list (e.g. Task Manager → Details → Command Line). See the Security
section below for a better approach.

---

### Option C: Direct state injection (no HTTP roundtrip)

If you want to bypass the MS HTTP request entirely (because the launcher already
authenticated and has the cookie/account_id), you could add a command that sets
`CClientLogin`'s internal state directly:

```cpp
CMD(SetLoginState)
{
    if (vArgList.size() < 4) return false;
    // args: cookie, accountId, nickname, username
    ClientLogin.SetStateFromLauncher(vArgList[0], AtoI(vArgList[1]), vArgList[2], vArgList[3]);
    return true;
}
```

```cpp
void CClientLogin::SetStateFromLauncher(const tstring &sCookie, int iAccountId,
    const tstring &sNickname, const tstring &sUsername)
{
    m_sCookie = sCookie;
    m_iAccountID = iAccountId;
    m_sNick = sNickname;
    m_sUser = sUsername;
    m_bConnected = true;

    ICvar::SetString(_T("net_cookie"), m_sCookie);
    ICvar::SetInteger(_T("net_accountid"), m_iAccountID);
    ICvar::SetString(_T("net_name"), m_sNick);

    svector vsLoginStatus;
    vsLoginStatus.push_back(LOGIN_SUCCESS);
    vsLoginStatus.push_back(_T(""));
    LoginStatus.Trigger(vsLoginStatus);

    ChatManager.Connect();
}
```

**Pros:** No HTTP request at game launch, instant.  
**Cons:** The cookie may have expired by the time the game needs it. Skips IRC
setup (buddy list, clan roster). The launcher must also provide the nickname
(with clan tag) which it currently doesn't fetch.

---

## Handling the Menu Flash

The menu/login screen flash happens because the game's UI is initialised before
`autoexec.cfg` runs. The init sequence in `CHost::Init()`:

1. Command-line args executed (line 312)
2. `startup.cfg` executed (line 330)
3. **UI initialised** → login screen displayed
4. `autoexec.cfg` executed (line 409)
5. `host_autoexec` executed (line 411)

Options to eliminate the flash:

### A. Use `host_autoexec` (best with current engine)

Set `host_autoexec` via command-line:

```
savage2.exe "Set host_autoexec LoginAndConnect 1.2.3.4:11235"
```

`host_autoexec` runs at step 5 — still after UI init, but `LoginAndConnect`
would immediately start connecting, transitioning to the loading screen within
one frame. The login screen would be visible for a single frame at most.

### B. Add a `connecting` splash screen

In `CHost::Init()`, check for a `host_autoexec` containing `LoginAndConnect`
**before** UI init, and set the initial interface to a "connecting" UI:

```cpp
if (!host_autoexec.empty() && host_autoexec->find(_T("LoginAndConnect")) != tstring::npos)
    Host.SetCurrentInterface(HOST_INTERFACE_CONNECTING);
```

This requires a new or existing "connecting" interface that shows a loading
screen while the async login + connect is in progress.

### C. Delay window visible

Use the `host_startupCfg` or a new cvar to delay `ShowWindow` until after
`host_autoexec` runs. This is engine-level and may affect normal startup.

---

## Security Considerations

### Credential Exposure

| Method | Risk |
|--------|------|
| autoexec.cfg | Password visible in plaintext file on disk |
| Command-line args | Password visible in process list (`/proc/<pid>/cmdline`, Task Manager) |
| SetLoginState (cookie) | Cookie is a session token; less sensitive than password but still sensitive |

### Recommended Secure Approach

1. **Use a named pipe or local socket** — The launcher creates a named pipe,
   passes the pipe name as a command-line arg, and the game reads credentials
   from the pipe at startup. The pipe is destroyed after reading.

2. **Use environment variables** — The launcher sets env vars
   (`S2_LOGIN_USER`, `S2_LOGIN_PASS`) before spawning the game, the game reads
   them in `CHost::Init()` and clears them immediately. Env vars are
   per-process and not visible to other users (though they are visible to the
   same user via `/proc` on Linux).

3. **Use a temp file with restricted permissions** — Write credentials to a
   temp file with owner-only read permissions, pass the path as a command-line
   arg, the game reads and deletes the file at startup.

4. **Use the launcher's pre-authenticated cookie** — Instead of passing the
   raw password, the launcher pre-authenticates with the MS (it already does
   this), and passes only the resulting cookie + account_id + nickname.
   Combined with Option C above, this avoids ever sending the password to the
   game process.

---

## Testing Checklist

- [ ] `LoginAndConnect 1.2.3.4:11235` — connects after successful auth
- [ ] `LoginAndConnect` with wrong password — shows error, does not connect
- [ ] `LoginAndConnect` with MS down — shows timeout error, does not connect
- [ ] Disconnect from server after `LoginAndConnect` → goes to server browser (not login)
- [ ] Ctrl+Tab CC menu works after `LoginAndConnect`
- [ ] `Login` command still works independently (no regression)
- [ ] `Connect` command still works independently
- [ ] Rapid `LoginAndConnect` respects `LOGIN_DELAY` (5s rate limit)
- [ ] `LoginAndConnect` while already connected to server → appropriate error
- [ ] IRC/chat connects properly after `LoginAndConnect`
