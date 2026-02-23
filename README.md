# Savage 2 Launcher

Forked from [YARC Launcher](https://github.com/YARC-Official/YARC-Launcher).

Built with [Tauri v1](https://v1.tauri.app/) (Rust + React/TypeScript).

---

## Releasing a New Launcher Version

### 1. Bump the Version

Update the version string in all three files:

| File | Field |
|---|---|
| `package.json` | `"version"` |
| `src-tauri/Cargo.toml` | `version` under `[package]` |
| `src-tauri/tauri.conf.json` | `"version"` under `package` |

### 2. Build Signed Bundles

Tauri uses a **minisign** keypair to sign updater bundles. The private key and password must be set as environment variables before building.

| Variable | Description |
|---|---|
| `TAURI_PRIVATE_KEY` | Contents of `src-tauri/.tauri_private_key` |
| `TAURI_KEY_PASSWORD` | Password for the private key |

The matching public key is already configured in `src-tauri/tauri.conf.json` under `tauri.updater.pubkey`.

#### Windows (Git Bash)

```bash
export TAURI_PRIVATE_KEY=$(cat src-tauri/.tauri_private_key)
export TAURI_KEY_PASSWORD="<your-key-password>"
npx tauri build
```

Build outputs (in `src-tauri/target/release/bundle/msi/`):

- `Savage 2 Launcher_<version>_x64_en-US.msi` — Installer
- `Savage 2 Launcher_<version>_x64_en-US.msi.zip` — Updater bundle
- `Savage 2 Launcher_<version>_x64_en-US.msi.zip.sig` — Signature

#### Linux (Docker)

```bash
docker run --rm \
  -v "$(pwd):/build" \
  -e TAURI_PRIVATE_KEY="$(cat src-tauri/.tauri_private_key)" \
  -e TAURI_KEY_PASSWORD="<your-key-password>" \
  savage2-linux-builder:latest
```

Build outputs (in `src-tauri/target/release/bundle/appimage/`):

- `savage-2-launcher_<version>_amd64.AppImage` — Standalone executable
- `savage-2-launcher_<version>_amd64.AppImage.tar.gz` — Updater bundle
- `savage-2-launcher_<version>_amd64.AppImage.tar.gz.sig` — Signature

### 3. Host the Updater Bundles

Upload the `.msi.zip` / `.AppImage.tar.gz` (and their `.sig` files) somewhere publicly accessible — typically a GitHub Release or GitLab Generic Package Registry.

### 4. Push the Update via the Launcher API

The launcher's built-in updater polls `https://savage2.net/api/launcherupdates/latest`. To publish a new version, `POST` to the API with a valid admin JWT.

#### Endpoint

```
POST https://savage2.net/api/launcherupdates
Authorization: Bearer <admin-jwt>
Content-Type: application/json
```

#### Payload Schema

```json
{
  "version":   "v1.0.2",
  "notes":     "Release v1.0.2",
  "pub_date":  "2026-02-23T00:00:00Z",
  "platforms": {
    "<platform-key>": {
      "url":       "<download-url-for-updater-bundle>",
      "signature": "<contents-of-.sig-file>"
    }
  }
}
```

**Platform keys:** `windows-x86_64`, `linux-x86_64`, `darwin-x86_64`, `darwin-aarch64`

#### Full Example (curl)

```bash
# Read the signatures from the .sig files produced during the build
WIN_SIG=$(cat "Savage 2 Launcher_1.0.2_x64_en-US.msi.zip.sig")
LINUX_SIG=$(cat "savage-2-launcher_1.0.2_amd64.AppImage.tar.gz.sig")

curl -X POST "https://savage2.net/api/launcherupdates" \
  -H "Authorization: Bearer $S2_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg version  "v1.0.2" \
    --arg notes    "Release v1.0.2" \
    --arg pub_date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg win_url  "https://example.com/releases/Savage%202%20Launcher_1.0.2_x64_en-US.msi.zip" \
    --arg win_sig  "$WIN_SIG" \
    --arg lin_url  "https://example.com/releases/savage-2-launcher_1.0.2_amd64.AppImage.tar.gz" \
    --arg lin_sig  "$LINUX_SIG" \
    '{
      version:  $version,
      notes:    $notes,
      pub_date: $pub_date,
      platforms: {
        "windows-x86_64": { url: $win_url, signature: $win_sig },
        "linux-x86_64":   { url: $lin_url, signature: $lin_sig }
      }
    }')"
```

A `2xx` response means the update is live. All running launchers will detect it on their next update check.

#### CI/CD

Both the [GitHub Actions](.github/workflows/release.yml) and [GitLab CI](.gitlab-ci.yml) pipelines automate this entire flow — build, sign, upload artifacts, and POST to the API — when a version tag (`v*`) is pushed.
