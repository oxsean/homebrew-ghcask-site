# Product Requirements: ghcask

## 1. Overview

`ghcask` is a Homebrew external command distributed through a Homebrew tap. It lets users install macOS applications published as GitHub Release assets or direct package URLs without requiring those applications to be accepted into Homebrew Cask or any public cask index.

Users install the command once:

```sh
brew tap oxsean/ghcask
```

They can then install a GitHub-hosted macOS app:

```sh
brew ghcask install owner/repo
```

Or install from a direct package URL:

```sh
brew ghcask install cask-name --url https://example.com/download/Example-1.2.3.dmg
```

For GitHub sources, the command discovers the latest suitable GitHub Release asset. For direct URL sources, the user provides both the generated cask name and the package URL. In both cases, it downloads and inspects the package, generates a local Homebrew cask, and delegates the actual installation to Homebrew. Installation is the default behavior; users can explicitly skip installation when they only want to generate or refresh cask definitions.

## 2. Problem Statement

Homebrew Cask is convenient, but it requires an application to exist in a cask repository before users can install it with `brew install --cask`. Many useful macOS applications are distributed through GitHub Releases or standalone download URLs but are not present in Homebrew Cask. Users must manually inspect releases or download pages, pick the correct package, download it, mount or extract it, and install the app.

The missing workflow is a local bridge from external macOS package sources to Homebrew Cask semantics:

- discover release assets from GitHub;
- accept direct package URLs when no release API is available;
- infer the right macOS asset for the current machine;
- infer the `.app` artifact when possible;
- generate a cask locally;
- support updates without publishing generated casks to a public index.

## 3. Goals

- Provide a `brew ghcask` command through a Homebrew tap.
- Keep generated casks fully local to each user.
- Reuse Homebrew for install, uninstall, upgrade, quarantine handling, and Caskroom state.
- Prefer the GitHub CLI (`gh`) when installed and authenticated.
- Support unauthenticated access to public GitHub repositories with clear rate-limit warnings.
- Support direct package URL installation without requiring a GitHub repository.
- Automatically infer machine architecture and app artifacts for common `.dmg`, `.zip`, `.tar.gz`, and `.tgz` releases.
- Support update, outdated, and upgrade workflows where `update` refreshes definitions and `upgrade` asks Homebrew to upgrade installed managed apps.
- Provide clear error messages and suggested remediation steps.
- Avoid requiring users to paste secrets or tokens into interactive prompts.

## 4. Non-Goals

- Do not replace Homebrew Cask.
- Do not submit or publish generated casks to the official Homebrew Cask repository.
- Do not maintain a remote index of user-generated casks in the initial version.
- Do not execute arbitrary scripts from release assets.
- Do not guarantee automatic support for every GitHub Release layout.
- Do not scrape arbitrary website pages to discover download URLs in the MVP.
- Do not support `.pkg` package generation, uninstall, or zap rules in the MVP.
- Do not require `gh`; it is preferred when available, not mandatory.

## 5. Primary Users

- macOS users who already use Homebrew.
- Developers and power users installing niche GitHub-hosted apps.
- Users installing apps distributed through direct `.dmg`, `.zip`, `.tar.gz`, or `.tgz` URLs outside GitHub.
- Users who want Homebrew-managed upgrades for apps outside the official cask index.
- Users with access to private GitHub repositories that publish internal macOS apps.

## 6. User Journeys

### 6.1 Install the Command

The user taps the command repository:

```sh
brew tap oxsean/ghcask
brew ghcask --help
```

Expected result:

- Homebrew discovers the tap command from `cmd/brew-ghcask`.
- The user can run `brew ghcask` like a built-in Homebrew command.

### 6.2 Install a Public GitHub App

```sh
brew ghcask install owner/repo
```

Expected result:

- `ghcask` finds the latest stable GitHub Release.
- It selects a macOS asset matching the local architecture.
- It downloads the asset, calculates `sha256`, and infers the `.app` name.
- It writes a local cask under a local generated tap.
- It moves the downloaded asset into Homebrew's expected cask cache path before installation.
- It runs `brew install --cask ghcask/local/<cask-name>`.

### 6.3 Install with Manual Overrides

```sh
brew ghcask install owner/repo --asset "*arm64*.dmg" --app "Example.app"
```

Expected result:

- The provided asset pattern and app name override automatic inference.
- Overrides are saved in the local registry for future updates.

### 6.4 Install a GitHub Prerelease or Specific Version

```sh
brew ghcask install owner/repo --prerelease
brew ghcask install owner/repo --version v1.2.3
```

Expected result:

- `--prerelease` allows the release selector to choose the newest prerelease when it is newer or when no stable release is suitable.
- For GitHub sources, `--version` installs the release whose tag or normalized version exactly matches the requested value.
- A GitHub release tag URL such as `https://github.com/owner/repo/releases/tag/0.8.5` is treated like `owner/repo --version 0.8.5` and records `requested_version: 0.8.5`.
- A GitHub cask generated from a specific version is pinned to that release during normal updates.
- To follow the saved stable or prerelease release track again, the user can run `brew ghcask unpin cask-name`.
- To clear a single pinned cask and upgrade it on its saved release track in one command, the user can run `brew ghcask upgrade cask-name --force`.

### 6.5 Install from a Direct URL

```sh
brew ghcask install cask-name --url https://example.com/download/Example-1.2.3-arm64.dmg
```

Expected result:

- `ghcask` downloads the package directly from the provided URL without using GitHub release discovery.
- It calculates `sha256`, infers the `.app` bundle, reads app metadata when available, and writes a local cask.
- It infers `homepage` automatically. GitHub URLs keep the first two path segments as `https://github.com/owner/repo`; non-GitHub URLs use the URL origin such as `https://example.com`.
- It infers version in this order: explicit `--version`, app bundle `CFBundleShortVersionString`, app bundle `CFBundleVersion`, URL filename, then `latest`.
- It stores `source_type: url` and the required cask name `example` in the registry.
- It moves the downloaded asset into Homebrew's expected cask cache path before installation and runs `brew install --cask ghcask/local/<cask-name>` unless `--no-install` was passed. If `--trust` was passed, it runs `brew trust --cask ghcask/local/<cask-name>` immediately after writing the cask.

Direct URL mode accepts `--app`, `--name`, `--version`, `--dry-run`, `--no-install`, `--trust`, and `--arch`. In URL mode, `--arch` is recorded for metadata only because the URL already identifies the package to download.

In direct URL mode, `--dry-run` may download the package into a temporary location so `ghcask` can calculate `sha256` and infer app metadata. It must not write cask files, update the registry, move the package into Homebrew's cache, or run Homebrew install.

`--url` changes the meaning of the required positional argument from GitHub repository reference to generated cask name. URL mode must not accept `--cask`; the cask name is already explicit.

### 6.6 Update Local Cask Definitions

```sh
brew ghcask update
```

Expected result:

- `ghcask` checks registered repositories for newer releases.
- It refreshes local cask files when release assets change.
- It moves newly downloaded assets into Homebrew's expected cask cache path.
- `update` does not install or upgrade applications; it matches Homebrew's vocabulary by refreshing local metadata only.
- `upgrade` runs the same refresh first, then reads installed Homebrew cask versions in a batch. If the installed version already matches the generated cask version, it skips Homebrew upgrade for that cask; otherwise it delegates to Homebrew upgrade.
- Casks installed with a specific `--version` do not move to a newer release during normal `update`.
- Direct URL casks are not re-downloaded during normal `update`; `upgrade` uses the same installed-version check before delegating them to Homebrew upgrade.
- Users can run `pin` to keep a GitHub cask on the current generated release and `unpin` to follow the saved release track again.
- A single-cask GitHub upgrade with `--force` is allowed to clear the saved requested version, refresh on the saved release track, and delegate to Homebrew upgrade.
- Direct URL casks are upgraded to a different package URL through `brew ghcask reinstall cask-name --url NEW_URL`.

### 6.7 Upgrade Installed Apps

```sh
brew ghcask upgrade
```

Expected result:

- `ghcask` refreshes local generated cask definitions before upgrading.
- It batch-reads installed Homebrew cask versions and skips casks whose installed version already matches the generated cask version.
- It delegates remaining managed casks to `brew upgrade --cask ghcask/local/<cask-name>`.

### 6.8 Reinstall Managed Apps

```sh
brew ghcask reinstall cask-name
brew ghcask reinstall owner/repo
brew ghcask reinstall owner/repo --version v1.2.3
brew ghcask reinstall https://github.com/owner/repo/releases/tag/v1.2.3
brew ghcask reinstall owner/repo --prerelease
brew ghcask reinstall owner/repo --stable
brew ghcask reinstall cask-name --url https://example.com/download/Example-1.2.4.dmg
```

Expected result:

- Without `--version`, `--prerelease`, `--stable`, a GitHub tag URL, or `--url`, `ghcask` reinstalls the existing generated cask through Homebrew without refreshing source metadata.
- `reinstall` accepts a managed cask name, a GitHub repository reference for GitHub-source casks, or a direct URL cask name.
- For GitHub-source casks, `reinstall --version VERSION` refreshes the generated cask to the matching release, records `requested_version: VERSION`, preserves the saved release track in `release_policy`, caches the selected package, and reinstalls it.
- A GitHub release tag URL is treated like `owner/repo --version TAG`.
- For GitHub-source casks, `reinstall --prerelease` switches `release_policy` to `latest-prerelease`, refreshes the generated cask, caches the selected package, and reinstalls it.
- For GitHub-source casks, `reinstall --stable` switches `release_policy` to `latest-stable`, refreshes the generated cask, caches the selected package, and reinstalls it.
- With `--url`, `ghcask` updates a managed direct URL cask to a new package URL and reinstalls it.
- `reinstall --url` recalculates `sha256`, refreshes inferred app metadata and version, rewrites the generated cask, updates registry metadata, caches the downloaded package, and runs Homebrew reinstall.
- `reinstall --url` is rejected for GitHub-source casks because GitHub casks should be refreshed through `update`, pinned through `reinstall --version VERSION` or a GitHub release tag URL, or moved from a specific version through `upgrade cask-name --force`.

### 6.9 Diagnose GitHub Access

```sh
brew ghcask doctor
```

Expected result:

- The command reports whether `gh` is installed.
- The command reports whether `gh` authentication is active.
- The command reports whether required system tools are available.
- The command reports where generated casks and registry data live.

### 6.10 Dump and Restore Local State

```sh
brew ghcask dump
brew ghcask restore
```

Expected result:

- `dump` exports generated `Casks/*.rb` files and `ghcask.json` into one portable JSON file named `Brewghcask.json` by default.
- `dump` applies cleanup-equivalent filtering so deleted local cask files and apps already uninstalled through Homebrew are not exported.
- `dump --file PATH` writes to a custom path.
- `dump --global` writes to `~/.homebrew/Brewghcask.json`.
- `dump --force` is required before overwriting an existing dump file.
- `restore` imports a JSON dump into the generated local tap after validating the dump structure.
- `restore` merges registry entries and preserves local casks that are not present in the dump.
- `restore --force` allows overwriting same-name generated casks that are present in the dump.
- `restore --dry-run` validates and previews the restore without writing cask files or registry state.

## 7. Command Surface

### 7.1 Required MVP Commands

```sh
brew ghcask init
brew ghcask install owner/repo [options]
brew ghcask install cask-name --url URL [options]
brew ghcask update
brew ghcask outdated
brew ghcask outdated --all
brew ghcask upgrade [cask-name]
brew ghcask list
brew ghcask info cask-name|owner/repo
brew ghcask reinstall cask-name|owner/repo [options]
brew ghcask reinstall https://github.com/owner/repo/releases/tag/v1.2.3
brew ghcask reinstall cask-name --url URL [options]
brew ghcask pin cask-name|owner/repo
brew ghcask unpin cask-name|owner/repo
brew ghcask uninstall cask-name|owner/repo [--keep-installed] [--dry-run]
brew ghcask cleanup [--dry-run]
brew ghcask dump [--file PATH] [--global] [--force] [--dry-run]
brew ghcask restore [--file PATH] [--global] [--force] [--dry-run]
brew ghcask doctor
```

### 7.2 Future Commands

```sh
brew ghcask search query
brew ghcask edit cask-name
brew ghcask regenerate cask-name
```

### 7.3 Install Options

- `--url URL`: install directly from a package URL; the positional argument is the required generated cask name.
- `--asset PATTERN`: select release assets by glob-like pattern.
- `--app NAME`: set the `.app` artifact name explicitly.
- `--cask CASK`: set the generated cask name for GitHub source installs.
- `--name NAME`: set the display name.
- `--prerelease`: allow prerelease releases and prefer the newest eligible prerelease when appropriate.
- `--version VERSION`: for GitHub sources, install a specific release by tag name or normalized version; for direct URL sources, override the inferred package version.
- `--arch ARCH`: override inferred local architecture.
- `--dry-run`: show selected source, release or URL metadata, generated cask details, checksum plan, and write/trust/cache/install actions without writing files or installing.
- `--no-install`: generate or refresh the local cask without running `brew install --cask`.
- `--trust`: trust the generated local cask with Homebrew immediately after writing it. This uses `brew trust --cask` and does not bypass macOS Gatekeeper quarantine.

`--asset`, `--prerelease`, and `--cask` only apply to GitHub source installs. Direct URL installs require `install cask-name --url URL`, infer homepage automatically, and do not expose a `--homepage` option.

### 7.4 Update Options

- `--dry-run`: show which casks would be refreshed without writing files.

### 7.5 Outdated Options

- `--all`: also compare pinned GitHub casks against their saved release track.

### 7.6 Upgrade Options

- `--force`: only valid when upgrading a single GitHub cask name. If that cask is pinned, clear `requested_version` and update it on the saved release track before the installed-version check.
- `--dry-run`: show which casks would be refreshed or upgraded without writing files or upgrading apps.

### 7.7 Reinstall Options

- `--url URL`: replace the saved direct package URL for a managed direct URL cask, refresh metadata, and reinstall it.
- `--app NAME`: override the `.app` artifact name when refreshing metadata.
- `--name NAME`: override the display name when refreshing metadata.
- `--version VERSION`: for GitHub sources, refresh and pin to a specific release; with `--url`, override the inferred direct URL package version.
- `--prerelease`: for GitHub sources, switch to `latest-prerelease`, refresh, and reinstall.
- `--stable`: for GitHub sources, switch to `latest-stable`, refresh, and reinstall.
- `--arch ARCH`: record architecture metadata when refreshing metadata.
- `--force`: pass `--force` through to `brew reinstall --cask` so Homebrew can overwrite existing artifacts.
- `--dry-run`: without metadata refresh options, preview the Homebrew reinstall command without running it. With `--version`, `--prerelease`, `--stable`, a GitHub tag URL, or `--url`, preview refreshed metadata without writing local state, caching the package, or running Homebrew reinstall.

`--version`, `--prerelease`, and `--stable` are mutually exclusive. `reinstall --url` is only valid for `source_type: url` casks. GitHub-source casks refresh to a selected release only when the user passes `--version VERSION`, `--prerelease`, `--stable`, or a GitHub release tag URL. Otherwise, reinstall does not change registry metadata.

### 7.8 Pin and Unpin

- `pin cask-name|owner/repo`: for GitHub sources, set `requested_version` to the current generated `release_tag` without changing `release_policy`.
- `unpin cask-name|owner/repo`: for GitHub sources, clear `requested_version` without changing `release_policy`.

Direct URL casks do not support pinning because they do not participate in GitHub release selection. They are changed through `reinstall cask-name --url NEW_URL`.

Installing or reinstalling a GitHub source with `--version VERSION` pins that generated cask automatically by setting `requested_version`. `release_policy` remains the saved stable or prerelease track to use after unpinning.

### 7.9 Dump Options

- `--file PATH`: write `Brewghcask.json` to a custom path.
- `--global`: write to `~/.homebrew/Brewghcask.json`.
- `--force`: overwrite an existing dump file.
- `--dry-run`: preview dump output without writing a dump file.

`--file` and `--global` are mutually exclusive.

### 7.9 Restore Options

- `--file PATH`: read `Brewghcask.json` from a custom path.
- `--global`: read from `~/.homebrew/Brewghcask.json`.
- `--force`: allow overwriting same-name generated casks that are present in the dump.
- `--dry-run`: validate and preview restore effects without writing local state.

`restore` must merge registry entries rather than clearing local state.

### 7.10 Info Output

`brew ghcask info cask-name|owner/repo` must print:

- cask name;
- full Homebrew cask token;
- source type;
- GitHub repository URL for `source_type: github` or package URL for `source_type: url`;
- release policy, asset name, and asset URL when available;
- version, app artifact, and `sha256`;
- generated cask path;
- whether Homebrew currently lists the cask as installed.

### 7.11 Uninstall Options

- `--keep-installed`: remove generated cask metadata and files without running `brew uninstall --cask`.
- `--dry-run`: preview Homebrew uninstall, metadata removal, and generated cask file removal without changing local state.

If Homebrew reports that the cask is not installed, `uninstall` should print a warning and continue removing ghcask metadata and generated cask files.

### 7.12 Cleanup Options

- `--dry-run`: report stale registry entries and generated cask files without deleting them.

## 8. Homebrew Integration

### 8.1 Distribution Tap

The public repository is a Homebrew tap that exposes an external command:

```text
homebrew-ghcask/
  cmd/
    brew-ghcask
  README.md
  README.zh-CN.md
```

The command file must be executable. Homebrew discovers external commands in tapped repositories and invokes `cmd/brew-ghcask` as:

```sh
brew ghcask
```

### 8.2 Generated Local Tap

Generated casks must not be written into the distribution tap. The distribution tap is updated by Homebrew and should remain clean.

Product requirements, implementation tasks, and website design documents live in the separate website/planning repository. The tap repository should stay lightweight and contain only command code, README files, and release-related assets.

`ghcask` creates and maintains a separate local tap:

```text
$(brew --repository)/Library/Taps/ghcask/homebrew-local/
  Casks/
    example.rb
  ghcask.json
```

The generated tap name is:

```text
ghcask/local
```

Generated casks are installed as:

```sh
brew install --cask ghcask/local/example
```

If a generated cask already exists locally, a repeated `brew ghcask install ...` for the same cask name must use the existing local cask and skip source lookup and package download. Homebrew then decides whether the cask is already installed. Users refresh GitHub source metadata with `brew ghcask update`, and replace direct URL sources with `brew ghcask reinstall cask-name --url NEW_URL`.

The user-facing command remains:

```sh
brew ghcask install owner/repo
brew ghcask install cask-name --url https://example.com/download/Example-1.2.3.dmg
```

### 8.3 Local JSON Dump and Restore

`ghcask` should support exporting the generated local tap state as a single portable JSON dump file:

```sh
brew ghcask dump
```

The default output file is:

```text
./Brewghcask.json
```

The dump file contains:

```json
{
  "version": 1,
  "registry": {
    "version": 1,
    "casks": {}
  },
  "casks": {
    "example": "cask \"example\" do\n  ...\nend\n"
  }
}
```

`dump` must apply the same stale-entry filtering as `cleanup` before writing the JSON dump:

- registry entries whose `Casks/<name>.rb` file is missing are excluded;
- entries that were installed through Homebrew but are no longer present in `brew list --cask` are excluded;
- entries marked as generated-only must not be excluded merely because they are not installed by Homebrew.

Supported dump options:

- `--file PATH`: write the dump file to a specific path.
- `--global`: write to `~/.homebrew/Brewghcask.json`, matching Homebrew Bundle's `~/.homebrew` convention.
- `--force`: overwrite an existing dump file.
- `--dry-run`: preview the filtered export without writing a dump file.

`--file` and `--global` are mutually exclusive. Without `--force`, an existing dump file path must produce a clear error.

The corresponding restore command is:

```sh
brew ghcask restore
```

The default input file is `./Brewghcask.json`. Restore supports:

- `--file PATH`: read a specific JSON dump file.
- `--global`: read from `~/.homebrew/Brewghcask.json`.
- `--force`: allow overwriting local generated casks whose names are also present in the dump file.
- `--dry-run`: validate the dump file and preview restore changes without writing cask files or registry state.

`restore` must validate the JSON structure before modifying local state. The dump file must contain a supported dump version, a valid registry object, and matching cask content for every registry entry. Cask names must be safe local cask names and must not contain path separators or whitespace. Restore merges dump registry entries into the existing local registry. Entries and cask files not present in the dump file must be preserved.

After restore, standard Brewfile entries such as the following can work without contacting GitHub:

```ruby
tap "oxsean/ghcask"
cask "ghcask/local/example"
```

## 9. GitHub Access Strategy

### 9.1 Access Order

`ghcask` should use this access order:

1. `gh` CLI, if installed and authenticated.
2. `curl` with `GH_TOKEN` or `GITHUB_TOKEN`.
3. `curl` without authentication for public repositories.

### 9.2 GitHub CLI Detection

The command should detect `gh` with:

```sh
command -v gh
```

It should detect usable authentication with:

```sh
gh auth status --active --hostname github.com --json hosts
```

If `gh` is installed but unauthenticated, `ghcask` should not fail immediately. It should fall back to anonymous public API access and print a concise warning.

### 9.3 Anonymous Access

GitHub supports unauthenticated REST API requests for public data. The primary unauthenticated limit is 60 requests per hour per originating IP address. Authenticated users commonly receive 5,000 requests per hour.

Anonymous access is acceptable for:

- public repositories;
- public releases;
- light install/update usage.

Authentication is required for:

- private repositories;
- private release assets;
- higher API rate limits;
- clearer identity and enterprise host support.

### 9.4 Release Query

When using `gh`, the MVP can query:

```sh
gh release view -R owner/repo --json tagName,name,isDraft,isPrerelease,publishedAt,assets
```

For more complete update flows, pagination, or prerelease handling:

```sh
gh api repos/owner/repo/releases --paginate
```

When using `curl`, the command should call the equivalent GitHub REST API endpoints and parse JSON locally.

### 9.5 GitHub Release Selection

For `source_type: github`, the release selector must support two saved release-track policies:

- `latest-stable`: default policy. Select the newest non-draft, non-prerelease release.
- `latest-prerelease`: enabled by `--prerelease`. Select the newest eligible prerelease or stable release according to release publish time, excluding drafts.

When `requested_version` is present from `--version VERSION`, a GitHub tag URL, or pinning, release selection must choose the release whose tag name or normalized semantic version exactly matches that value. This is an independent selector input, not a stored release policy. Specific version matching should accept both exact tags and simple normalized forms. For example, `--version 1.2.3` may match tag `v1.2.3`, but it must not match `v1.2.30`.

For install, if both `--prerelease` and `--version` are provided, `--version` wins. This allows users to install a specific prerelease tag such as `--version v2.0.0-beta.1`.

For `reinstall`, `--version`, `--prerelease`, and `--stable` are mutually exclusive because reinstall can switch exactly one release policy at a time.

For `source_type: github`, the registry stores `release_policy: "latest-stable"` or `"latest-prerelease"` as the saved release track, and `requested_version` as the optional pinned release. For `source_type: url`, the registry must use `release_policy: "url"`. URL sources do not participate in GitHub release selection and are changed through `brew ghcask reinstall cask-name --url NEW_URL`.

## 10. Error Handling and User Prompts

### 10.1 Authentication Failure

Condition:

- `gh` exists but authentication is invalid;
- authenticated `curl` returns `401`.

Message:

```text
GitHub authentication failed.

Run:
  gh auth login

Or set GH_TOKEN/GITHUB_TOKEN and retry.
```

### 10.2 Anonymous Rate Limit

Condition:

- GitHub returns `403` with rate-limit headers and zero remaining requests.

Message:

```text
GitHub API rate limit reached.

Anonymous requests are limited to 60 requests per hour per IP address.
Run:
  gh auth login

Then retry:
  brew ghcask update
```

If `X-RateLimit-Reset` is present, show the local reset time.

### 10.3 Repository Not Found

Condition:

- GitHub returns `404` for repository or releases endpoint.

Message:

```text
Repository or releases not found: owner/repo

If this is a private repository, authenticate first:
  gh auth login
```

### 10.4 No Releases

Condition:

- Repository exists but releases list is empty.

Message:

```text
No GitHub Releases found for owner/repo.
ghcask installs release assets, not source archives.
```

### 10.5 No Stable Release

Condition:

- No non-draft, non-prerelease release is available.

Message:

```text
No stable release found for owner/repo.

To allow prereleases:
  brew ghcask install owner/repo --prerelease
```

### 10.5.1 Requested Version Not Found

Condition:

- The user passes `--version VERSION`, but no release tag or normalized version matches it.

Message:

```text
Requested release version was not found: VERSION

Available recent releases:
  v1.3.0
  v1.2.3
  v1.2.2

Try:
  brew ghcask install owner/repo --version v1.2.3
```

### 10.6 No Matching Asset

Condition:

- Releases exist but no asset matches macOS and architecture rules.

Message:

```text
No macOS asset matched this machine.

Detected arch: arm64
Looked for: .dmg, .zip, .tar.gz, or .tgz assets with arm64, aarch64, apple-silicon, or universal markers.

Try:
  brew ghcask install owner/repo --asset "*mac*.dmg"
```

### 10.7 Ambiguous Assets

Condition:

- Multiple assets score closely and no `--asset` override exists.

Message:

```text
Multiple matching assets found:
  1. Example-arm64.dmg
  2. Example-universal.dmg

Choose one interactively, or rerun with:
  brew ghcask install owner/repo --asset "Example-arm64.dmg"
```

### 10.8 App Inference Failure

Condition:

- The package downloads successfully but no `.app` can be found.

Message:

```text
Could not infer an .app artifact from the selected asset.

Try:
  brew ghcask install owner/repo --app "Example.app"
```

### 10.9 Unsupported Package Type

Condition:

- Asset or direct URL package is not `.dmg`, `.zip`, `.tar.gz`, or `.tgz`.

Message:

```text
Selected asset type is not supported yet.

Supported MVP asset types:
  .dmg
  .zip
```

### 10.10 Homebrew Install Failure

Condition:

- Generated cask exists, but `brew install --cask` fails.

Message:

```text
Homebrew failed to install the generated cask.

Generated cask:
  ghcask/local/example

Inspect it with:
  brew cat --cask ghcask/local/example
```

The command should preserve the generated cask and registry entry unless the user passes an explicit cleanup flag.

### 10.11 Direct URL Syntax Errors

Conditions:

- `--url` is provided without a positional cask name;
- URL mode receives a positional argument that looks like `owner/repo`;
- URL mode receives `--cask`.

Message:

```text
Direct URL installs require an explicit cask name.

Use:
  brew ghcask install cask-name --url https://example.com/Example.dmg

The --cask option is only available for GitHub source installs.
```

### 10.12 Direct URL Download Failure

Condition:

- The provided direct package URL is invalid, unsupported, times out, or returns a non-success response.

Message:

```text
Could not download package URL: https://example.com/Example.dmg

Check that the URL points directly to a .dmg, .zip, .tar.gz, or .tgz file and retry.
```

When an HTTP status code is available, include it in the message. Do not write cask files, registry entries, or Homebrew cache files after a failed URL download.

### 10.13 Unsupported Source Operation

Conditions:

- `brew ghcask upgrade cask-name --force` targets a direct URL cask;
- `brew ghcask reinstall cask-name --url NEW_URL` targets a GitHub cask.

Message:

```text
This operation is not supported for this source type.

To replace a direct URL package:
  brew ghcask reinstall cask-name --url NEW_URL

To pin a GitHub cask to its current release:
  brew ghcask pin cask-name|owner/repo

To reinstall a specific GitHub release:
  brew ghcask reinstall owner/repo --version VERSION
```

Messages should guide users to the supported operation for the cask source type.

### 10.14 Restore Validation Failure

Condition:

- A dump file is malformed, unsupported, contains unsafe cask names, has registry entries without matching cask content, or would overwrite same-name generated casks without `--force`.

Message:

```text
Cannot restore Brewghcask.json.

Reason: existing generated cask would be overwritten: example

Retry with:
  brew ghcask restore --force
```

Restore validation must complete before writing any cask file or registry state.

## 11. Asset Selection

### 11.1 Architecture Detection

Use:

```sh
uname -m
```

Map local architecture to asset keywords:

```text
arm64  -> arm64, aarch64, apple-silicon, universal
x86_64 -> x64, x86_64, amd64, intel, universal
```

### 11.2 Asset Scoring

Asset candidates should be scored with deterministic rules:

```text
+100 exact local architecture match
+70  universal match
+40  no architecture marker but only one plausible macOS asset
-100 explicit other architecture match
-100 source, src, symbols, debug, checksum-only, or source archive
```

Asset type priority:

```text
.dmg > .zip > .tar.gz/.tgz
```

`.pkg` support is excluded from the MVP because uninstall behavior may require generated uninstall or zap rules.

### 11.3 Persisted Asset Pattern

When a user chooses or overrides an asset, persist a pattern in the registry:

```json
"asset_pattern": "*arm64*.dmg"
```

Future update runs should prefer the stored pattern over fresh inference.

## 12. App Inference

### 12.1 DMG Flow

1. Attach the image with `hdiutil attach -nobrowse -readonly`.
2. Find `.app` bundles in the mounted volume.
3. Prefer a top-level `.app`.
4. Read `Contents/Info.plist` for display metadata.
5. Detach the volume with `hdiutil detach`.

### 12.2 ZIP Flow

1. Extract `.zip` with `ditto -x -k`, or `.tar.gz`/`.tgz` with `tar -xzf`.
2. Find `.app` bundles in the extraction directory.
3. Prefer a top-level or uniquely named `.app`.
4. Read `Contents/Info.plist` for display metadata.

### 12.3 Cask Name Inference

Homebrew documentation often calls this value a cask token. `ghcask` uses the user-facing name "cask name" to avoid confusion with GitHub authentication tokens.

Cask name inference priority:

1. explicit `--cask` for GitHub sources, or required cask-name positional argument for direct URL sources;
2. app bundle filename;
3. bundle display name;
4. repository name for GitHub sources.

Normalize by:

- lowercasing;
- replacing whitespace and underscores with hyphens;
- stripping `.app`;
- removing unsupported characters;
- collapsing repeated hyphens.

## 13. Registry Format

The registry file is:

```text
$(brew --repository)/Library/Taps/ghcask/homebrew-local/ghcask.json
```

Schema:

```json
{
  "version": 1,
  "casks": {
    "example": {
      "repo": "owner/repo",
      "source_type": "github",
      "cask": "example",
      "name": "Example",
      "app": "Example.app",
      "release_policy": "latest-stable",
      "requested_version": null,
      "asset_pattern": "*arm64*.dmg",
      "arch": "arm64",
      "version": "1.2.3",
      "release_tag": "v1.2.3",
      "asset_name": "Example-arm64.dmg",
      "asset_url": "https://github.com/owner/repo/releases/download/v1.2.3/Example-arm64.dmg",
      "sha256": "..."
    }
  }
}
```

`source_type` is required and currently supports:

- `github`: GitHub Release asset source.
- `url`: direct package URL source.

Direct URL entries reuse the same fields where possible:

```json
{
  "source_type": "url",
  "repo": null,
  "cask": "example",
  "name": "Example",
  "app": "Example.app",
  "release_policy": "url",
  "requested_version": null,
  "asset_pattern": null,
  "arch": "arm64",
  "version": "1.2.3",
  "release_tag": null,
  "asset_name": "Example-1.2.3-arm64.dmg",
  "asset_url": "https://example.com/download/Example-1.2.3-arm64.dmg",
  "homepage": "https://example.com",
  "sha256": "..."
}
```

Registry validation must reject cask entries with missing or unsupported `source_type`. Because no public version has shipped yet, the MVP does not need backward compatibility for registry entries that omit `source_type`.

The registry must be updated atomically to avoid corrupt state on interruption.

## 14. Generated Cask Format

GitHub source example:

```ruby
cask "example" do
  version "1.2.3"
  sha256 "..."

  url "https://github.com/owner/repo/releases/download/v1.2.3/Example-arm64.dmg"
  name "Example"
  desc "Generated from GitHub Releases"
  homepage "https://github.com/owner/repo"

  app "Example.app"
end
```

Generated casks do not include `livecheck` because they are not published casks and `ghcask update` remains responsible for release discovery, URL refresh, and checksum changes.

Direct URL source example:

```ruby
cask "example" do
  version "1.2.3"
  sha256 "..."

  url "https://example.com/download/Example-1.2.3.dmg"
  name "Example"
  desc "Generated from a direct package URL"
  homepage "https://example.com"

  app "Example.app"
end
```

For direct URL casks, `homepage` is inferred from the original URL. Generated casks do not write Homebrew `verified` metadata, because `ghcask` cannot certify that arbitrary upstream URLs are official. Direct URL casks also omit `livecheck` because URL source upgrades are explicit through `reinstall --url`.

## 15. Update Semantics

### 15.1 `brew ghcask update`

`update` refreshes local generated cask files and registry metadata without upgrading installed apps. This matches Homebrew's command vocabulary: update refreshes metadata, while upgrade changes installed software.

Flow:

1. Read `ghcask.json`.
2. Branch by `source_type`.
3. For `github`, query the registered GitHub repository.
4. Select the latest release according to the saved release policy.
5. Select the release asset using the saved asset pattern.
6. Skip definition refresh if release and asset have not changed.
7. Download new asset and calculate checksum when definition refresh is needed.
8. Reuse saved app metadata unless inference must be refreshed.
9. Rewrite the cask file.
10. Update the registry.
11. Move any downloaded asset into Homebrew's expected cask cache path.
12. For `url`, do not re-download the direct URL during normal update.
13. For `upgrade` only, batch-read installed cask versions with Homebrew.
14. If an installed version matches the generated cask version, skip that cask.
15. Otherwise, run `brew upgrade --cask ghcask/local/<cask-name>` for targeted managed casks.

For `update`, the flow stops after rewriting cask files and updating the registry.

For casks whose saved `requested_version` is set, `update` should re-check that same release and asset but must not advance to a newer tag. This lets users keep a specific installed version until they explicitly reinstall, unpin, or force-upgrade that cask.

When the user runs `brew ghcask pin cask-name`, `ghcask` should set `requested_version` to the current generated `release_tag` and preserve the saved `release_policy`. When the user runs `brew ghcask unpin cask-name`, `ghcask` should clear `requested_version` and keep the saved `release_policy`. `pin` and `unpin` are only valid for GitHub source casks.

When the user runs `brew ghcask upgrade cask-name --force` for one GitHub cask, `ghcask` should clear `requested_version`, preserve `release_policy`, refresh the cask on the saved release track, and then use the installed-version check before delegating to Homebrew upgrade. `--force` must not be accepted for bulk upgrades or direct URL casks.

### 15.1.1 Duplicate `brew ghcask install`

When a generated cask exists for the requested cask name, `install` must:

1. read the existing registry entry;
2. skip GitHub lookup or direct URL download;
3. print a concise message that it is using the existing local cask;
4. run `brew install --cask ghcask/local/<cask-name>` unless `--no-install` was passed.

Because duplicate installs reuse an existing cask file instead of writing a new one, `--trust` does not change trust state on this path. To trust an existing generated cask, refresh or reinstall it so `ghcask` writes the cask again, or run `brew trust --cask ghcask/local/<cask-name>` manually.

This matches Homebrew's default duplicate-install behavior while avoiding unnecessary network calls. Refresh operations stay explicit through `update` for GitHub casks and `reinstall --url` for direct URL casks.

### 15.2 `brew ghcask reinstall`

`reinstall` reinstalls a managed cask through Homebrew:

```sh
brew ghcask reinstall cask-name
brew ghcask reinstall owner/repo
brew ghcask reinstall owner/repo --version v1.2.3
brew ghcask reinstall https://github.com/owner/repo/releases/tag/v1.2.3
brew ghcask reinstall owner/repo --prerelease
brew ghcask reinstall owner/repo --stable
brew ghcask reinstall cask-name --url https://example.com/download/Example-1.2.4.dmg
```

Without `--version`, `--prerelease`, `--stable`, a GitHub tag URL, or `--url`, `reinstall` must use the existing generated cask and run:

```sh
brew reinstall --cask ghcask/local/<cask-name>
```

For GitHub-source casks, `reinstall --version VERSION` or a GitHub release tag URL must:

1. select the matching GitHub release by tag name or normalized version;
2. select the saved asset pattern using saved or overridden architecture;
3. download the selected asset;
4. recalculate `sha256`;
5. preserve saved cask name and app metadata unless new options are provided;
6. preserve the saved `release_policy` and set `requested_version` to the requested version;
7. update release, asset, version, `sha256`, and shared metadata in the registry;
8. rewrite the generated cask;
9. cache the downloaded package in Homebrew's expected cask cache path;
10. run `brew reinstall --cask ghcask/local/<cask-name>`.

For GitHub-source casks, `reinstall --prerelease` must use the same refresh and reinstall flow, but set `release_policy` to `latest-prerelease` and clear `requested_version`.

For GitHub-source casks, `reinstall --stable` must use the same refresh and reinstall flow, but set `release_policy` to `latest-stable` and clear `requested_version`.

With `--url NEW_URL`, `reinstall` is only valid for managed direct URL casks. It must:

1. download `NEW_URL`;
2. recalculate `sha256`;
3. refresh inferred app metadata and version using the same direct URL inference rules as install;
4. preserve user overrides such as saved cask name and explicit app name unless new options are provided;
5. update `asset_url`, `asset_name`, `version`, `sha256`, homepage, and related shared metadata in the registry;
6. rewrite the generated cask;
7. cache the downloaded package in Homebrew's expected cask cache path;
8. run `brew reinstall --cask ghcask/local/<cask-name>`.

`reinstall --url` changes the saved direct URL source. It must not be accepted for GitHub source casks. It should accept useful direct URL metadata overrides, including `--app`, `--name`, `--version`, and `--arch`.

### 15.3 `brew ghcask outdated`

`outdated` reports managed GitHub casks whose latest selected GitHub Release differs from the registry.

With `--all`, `outdated` also compares pinned GitHub casks against their saved release track, so users can see that pinned casks have newer upstream versions available on the track they would follow after unpinning. It also reports direct URL casks as not checkable.

It must not download assets unless checksum or asset verification is explicitly requested.

For `source_type: url`, `outdated` must not download the package URL or attempt webpage discovery. By default it skips URL casks. With `--all`, it prints URL casks as not checkable using consistent output so scripts can distinguish checkable GitHub casks from explicit URL casks.

### 15.4 `brew ghcask upgrade`

`upgrade` follows Homebrew's vocabulary: refresh local casks, compare installed versions with generated cask versions, then delegate only changed apps to Homebrew upgrade:

```sh
brew ghcask upgrade
```

This keeps the user-facing command vocabulary familiar: `update` refreshes definitions, and `upgrade` changes installed apps through Homebrew.

## 16. Security Requirements

- Always write `sha256` for generated casks.
- Prefer trusted asset digests if GitHub exposes them.
- Otherwise calculate checksum after downloading the selected asset.
- Do not execute scripts from release assets.
- Do not request tokens interactively.
- Do not print tokens.
- Do not use `gh auth status --show-token`.
- Avoid `sha256 :no_check` unless the user explicitly opts into it with a future advanced flag.

## 17. Observability and Diagnostics

`brew ghcask doctor` should report:

- Homebrew path and version;
- generated tap path;
- registry path;
- whether the generated tap is tapped;
- whether `gh` is installed;
- whether `gh` authentication is active;
- available system tools: `curl`, `hdiutil`, `ditto`, `tar`, `shasum`, `plutil`;
- number of managed casks;
- last update timestamp if available.

## 18. MVP Scope

The MVP includes:

- Homebrew external command in a tap.
- Local generated tap initialization.
- `install`, `update`, `outdated`, `upgrade`, `list`, `info`, `reinstall`, `pin`, `unpin`, `uninstall`, `cleanup`, `dump`, `restore`, and `doctor`.
- `install` installs by default and supports `--no-install`.
- `update` refreshes generated cask definitions without upgrading installed apps.
- `upgrade` refreshes generated cask definitions and asks Homebrew to upgrade installed managed casks.
- `install --prerelease` allows prerelease releases.
- For GitHub sources, `install --version VERSION` installs, records, and pins a specific release version.
- `pin` keeps a GitHub cask on its current generated release; `unpin` makes it follow the saved release track again.
- `upgrade cask-name --force` clears one pinned GitHub cask and upgrades it on the saved release track.
- Public GitHub repositories.
- Direct package URL installs with `install cask-name --url URL`.
- Direct URL cask upgrades through `reinstall cask-name --url NEW_URL`.
- Portable local-state export and restore through `dump` and `restore`.
- Required registry `source_type` values for `github` and `url`.
- Authenticated GitHub access through `gh` or GitHub token environment variables.
- Latest stable release policy.
- `.dmg`, `.zip`, `.tar.gz`, and `.tgz` assets.
- Single `.app` inference.
- `arm64` and `x86_64` asset selection.
- Clear error messages for common GitHub and asset-selection failures.
- Clear error messages for direct URL syntax, download, source-operation, and restore validation failures.

## 19. Post-MVP Enhancements

- GitHub search support.
- Additional source types such as GitLab releases or SourceForge downloads.
- Named release channels beyond the basic `--prerelease` flag.
- Better `.pkg` support with generated uninstall rules.
- Multiple app bundle selection.
- User-editable config file.
- Shell completions.
- Enterprise GitHub host support.
- Optional remote automation that updates a user-owned tap with GitHub Actions.
- Import existing manually downloaded apps into generated casks.

## 20. Success Metrics

- A user can install the command with one `brew tap`.
- A user can install a common GitHub-hosted `.dmg` app with one `brew ghcask install owner/repo`.
- A user can install a direct `.dmg`, `.zip`, `.tar.gz`, or `.tgz` URL with one `brew ghcask install cask-name --url URL`.
- A user can replace and reinstall a direct URL cask with one `brew ghcask reinstall cask-name --url NEW_URL`.
- A user can export generated local casks with `brew ghcask dump` and restore them with `brew ghcask restore`.
- A user can run `brew ghcask update` to refresh generated cask definitions without changing installed apps.
- A user can run `brew ghcask upgrade` and have Homebrew perform the actual cask upgrade.
- Common failures produce actionable messages.
- Generated casks remain local and do not create dirty changes in the distribution tap.

## 21. Open Questions

- Should the generated local tap live under Homebrew's tap directory or under a user data directory with a custom tap remote?
- Should the command be implemented as a pure Ruby executable or as a Homebrew Ruby command that uses Homebrew internals?
- Should the default cask name include repository owner for collision avoidance?
