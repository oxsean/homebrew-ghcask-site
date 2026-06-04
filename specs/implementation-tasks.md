# ghcask Implementation Tasks

This file consolidates the implementation tasks for the `ghcask` Homebrew tap command. The tap repository should stay lightweight, so product and planning documents live in this website/planning repository.

## Task 01: Command Skeleton and Repository Layout

### Goal

Create the first executable `brew ghcask` command in the tap and establish a testable Ruby project layout.

### Scope

- Create `cmd/brew-ghcask`.
- Create `lib/ghcask/` for implementation modules.
- Create `test/` for Ruby tests.
- Add a local test runner script.
- Ensure `brew ghcask --help` can print command help after the tap is installed.

### Implementation Notes

- Prefer a standalone Ruby executable with `#!/usr/bin/env ruby`.
- Avoid Homebrew internal APIs in the MVP.
- Use only Ruby standard library and system tools unless a later task explicitly adds a dependency.

### Acceptance Criteria

- `cmd/brew-ghcask` is executable.
- `ruby cmd/brew-ghcask --help` prints command help.
- `ruby cmd/brew-ghcask doctor --dry-run` can run without network access.
- `test/` includes a minimal unit test for argument dispatch.

### Suggested Commit

```sh
git add cmd lib test
git commit -m "Add ghcask command skeleton"
```

## Task 02: Local Generated Tap and Registry

### Goal

Implement local generated tap initialization and registry persistence.

### Scope

- Resolve the Homebrew repository path with `brew --repository`.
- Create `$(brew --repository)/Library/Taps/ghcask/homebrew-local`.
- Create `Casks/` under the generated tap.
- Create and update `ghcask.json` atomically.
- Add `brew ghcask init`.
- Require every cask registry entry to include `source_type`.

### Registry Requirements

The registry file must use schema version `1`:

```json
{
  "version": 1,
  "casks": {}
}
```

Registry writes must be atomic:

1. write to a temp file in the same directory;
2. fsync or close cleanly;
3. rename into place.

### Acceptance Criteria

- `brew ghcask init` creates the generated tap directory.
- Re-running `brew ghcask init` is idempotent.
- `ghcask.json` remains valid JSON after repeated writes.
- Registry validation rejects cask entries with missing or unsupported `source_type`.
- Unit tests cover init, load, save, and corrupted registry errors.

### Suggested Commit

```sh
git add lib test cmd/brew-ghcask
git commit -m "Add local tap registry"
```

## Task 03: GitHub Client and Authentication Fallbacks

### Goal

Implement GitHub release discovery with `gh` first and `curl` fallback.

### Scope

- Detect `gh` with `command -v gh`.
- Detect authenticated `gh` with `gh auth status --active --hostname github.com --json hosts`.
- Use `gh release view -R owner/repo --json tagName,name,isDraft,isPrerelease,publishedAt,assets` when possible.
- Use paginated release listing when `--prerelease` or `--version` requires releases beyond GitHub's latest stable release.
- Fall back to `curl` with `GH_TOKEN` or `GITHUB_TOKEN`.
- Fall back to anonymous `curl` for public repositories.
- Normalize release and asset JSON into internal Ruby objects.
- Implement release selection for `latest-stable` and `latest-prerelease`, with `requested_version` as an independent exact tag or normalized version selector.

### Error Handling

Implement user-facing messages for:

- `401 Unauthorized`;
- `403` rate limit exhaustion;
- `404` repository or release not found;
- no releases;
- no stable release;
- requested version not found;
- malformed JSON;
- network timeout.

If rate-limit reset headers are available, display the local reset time.

### Acceptance Criteria

- Public release metadata can be loaded anonymously.
- Authenticated `gh` is preferred when available.
- `gh` installed but unauthenticated falls back without failing.
- Tests cover backend selection and representative error mappings.
- Tests cover `--prerelease`, exact tag matching, normalized version matching, and missing requested version.

### Suggested Commit

```sh
git add lib test
git commit -m "Add GitHub release client"
```

## Task 04: Asset Selection and Architecture Inference

### Goal

Select the best macOS release asset for the current machine.

### Scope

- Detect local architecture with `uname -m`.
- Map `arm64` to `arm64`, `aarch64`, `apple-silicon`, and `universal`.
- Map `x86_64` to `x64`, `x86_64`, `amd64`, `intel`, and `universal`.
- Score assets by name and extension.
- Exclude source archives, debug files, symbol files, and checksum-only files.
- Support `--asset PATTERN` override.

### Selection Priority

Asset type priority:

```text
.dmg > .zip > .tar.gz/.tgz
```

Architecture scoring:

```text
+100 exact local architecture match
+70  universal match
+40  no architecture marker but only one plausible macOS asset
-100 explicit other architecture match
-100 source, src, symbols, debug, checksum-only, or source archive
```

### Acceptance Criteria

- Tests cover arm64, x86_64, universal, ambiguous, and no-match cases.
- `--asset` overrides scoring.
- Ambiguous candidates produce a clear prompt or non-interactive error.
- `.pkg` assets are rejected with a clear unsupported-package message in the MVP.

### Suggested Commit

```sh
git add lib test
git commit -m "Add release asset selection"
```

## Task 05: Download, Checksum, and App Inference

### Goal

Download selected assets, compute checksums, and infer `.app` artifacts from `.dmg`, `.zip`, `.tar.gz`, and `.tgz` packages.

### Scope

- Download selected asset URL into a temporary directory.
- Compute `sha256` with Ruby digest or `shasum -a 256`.
- Inspect `.dmg` assets with `hdiutil attach -nobrowse -readonly`.
- Inspect `.zip` assets with `ditto -x -k`.
- Inspect `.tar.gz` and `.tgz` assets with `tar -xzf`.
- Find `.app` bundles.
- Read `Contents/Info.plist` when available.
- Support `--app NAME` override.
- Always detach mounted disk images in cleanup paths.

### Acceptance Criteria

- Unit tests cover checksum calculation and app-name normalization.
- Integration tests use small fixture archives when practical.
- Failed app inference prints the `--app` remediation command.
- Interrupted or failed DMG inspection does not leave mounted volumes behind.

### Suggested Commit

```sh
git add lib test
git commit -m "Add asset download and app inference"
```

## Task 06: Cask Generation and Install Command

### Goal

Generate Homebrew cask files and implement `brew ghcask install owner/repo`.

### Scope

- Generate GitHub source cask names from `--cask`, app name, bundle name, or repo name.
- Render cask Ruby files under `ghcask/local/Casks/`.
- Include `version`, `sha256`, `url`, `name`, `desc`, `homepage`, and `app`.
- Do not write Homebrew `verified` metadata for generated casks.
- Do not write Homebrew `livecheck` blocks for generated casks.
- Write registry metadata after successful generation.
- Record `source_type: github` in generated registry entries.
- Move the downloaded asset into Homebrew's expected cask cache path before installation.
- When `--trust` is passed, run `brew trust --cask ghcask/local/<cask-name>` immediately after writing the generated cask file.
- Delegate installation to `brew install --cask ghcask/local/<cask-name>`.
- Support `--asset`, `--app`, `--cask`, `--name`, `--arch`, `--dry-run`, `--no-install`, `--trust`, `--prerelease`, and `--version`.
- If a generated cask already exists for the requested cask name, skip source lookup and package download, then delegate to Homebrew install unless `--no-install` was passed.
- Treat GitHub release tag URLs as installs with `requested_version` set to that tag.

### Acceptance Criteria

- Generated cask syntax is valid Ruby.
- `brew cat --cask ghcask/local/<cask-name>` works after generation.
- `--dry-run` shows source type, release policy, release, version, asset name and URL, architecture, generated cask name, cask path, display name, app inference status, sha256 plan, and the write/trust/cache/install actions that would or would not run without writing files.
- `--no-install` writes the generated cask and registry entry but does not run `brew install --cask`.
- `--trust` runs `brew trust --cask` immediately after writing a generated cask file.
- Without `--no-install`, `install` caches the downloaded package in Homebrew's cask cache and runs `brew install --cask ghcask/local/<cask-name>`.
- `--prerelease` records `release_policy: latest-prerelease`.
- `--version VERSION` records `requested_version: VERSION` and preserves `release_policy` as the saved stable or prerelease track.
- Repeated install of an existing generated cask skips GitHub lookup and prints a concise existing-cask message.
- Failed Homebrew install preserves generated files and prints inspection commands.

### Suggested Commit

```sh
git add lib test cmd/brew-ghcask
git commit -m "Add cask generation and install"
```

## Task 07: Direct URL Install Source

### Goal

Add direct package URL installs for applications that are not published through GitHub Releases.

### Scope

- Add `brew ghcask install cask-name --url URL [options]`.
- Treat the positional argument as the generated cask name in URL mode.
- Reject URL mode when the positional cask name is missing or looks like a GitHub repository reference.
- Reject `--cask` in URL mode because the cask name is already required.
- Reuse package download, checksum, app inference, Homebrew cache, cask generation, registry, and install flows.
- Infer homepage automatically from the original URL:
  - GitHub URLs keep `https://github.com/owner/repo`.
  - Non-GitHub URLs use the URL origin.
- Omit Homebrew `livecheck` blocks for generated casks.
- Infer version in priority order:
  1. `--version VERSION`;
  2. `.app/Contents/Info.plist` `CFBundleShortVersionString`;
  3. `.app/Contents/Info.plist` `CFBundleVersion`;
  4. URL filename;
  5. `latest`.
- Extend app inference metadata so package inspection can return app version and display name from Info.plist.
- Record `source_type: url`, `repo: null`, `release_policy: url`, `release_tag: null`, `asset_name`, `asset_url`, and existing shared cask metadata.
- Allow `--arch` in URL mode for metadata only; it must not affect download selection.
- Allow `--dry-run` to download into a temporary location for checksum and metadata inference, but do not write casks, update registry state, cache the package, or install.
- Do not add a `--homepage` option.

### Acceptance Criteria

- `brew ghcask install cask-name --url URL --no-install` writes a local cask and registry entry with `source_type: url`.
- `brew ghcask install cask-name --url URL --trust` trusts the generated direct URL cask immediately after writing it.
- URL mode requires the explicit cask-name positional argument.
- URL mode rejects `--cask`.
- Direct URL casks include an inferred `homepage`.
- Generated casks omit Homebrew `verified` metadata and `livecheck` blocks.
- GitHub direct URLs infer homepage as `https://github.com/owner/repo`.
- Non-GitHub direct URLs infer homepage as the URL origin.
- App bundle version is preferred over URL filename version when available.
- URL filename version is used when app metadata does not provide a version.
- Missing version falls back to `latest`.
- `--url` plus a repository-looking positional argument is rejected with a clear error.
- Direct URL download failures do not write cask files, registry entries, or Homebrew cache files.
- URL `--dry-run` reports checksum and inferred metadata without local state changes.
- Tests cover URL mode cask generation, homepage inference, version inference, and install/no-install behavior.

### Suggested Commit

```sh
git add lib test README.md README.zh-CN.md
git commit -m "Add direct URL install source"
```

## Task 08: Update, Outdated, and Upgrade

### Goal

Implement update-ready local cask management.

### Scope

- Add `brew ghcask update`, which refreshes definitions without upgrading installed managed apps.
- Add `brew ghcask outdated`.
- Add `brew ghcask upgrade [cask-name]`, which refreshes definitions and then upgrades installed managed apps through Homebrew.
- Use registry metadata and saved `asset_pattern` instead of re-guessing assets on every update.
- Branch update behavior by required `source_type`.
- Respect saved `requested_version`; pinned casks must not advance to newer releases during update.
- Refresh local cask files when selected release or asset changes.
- Move newly downloaded assets into Homebrew's expected cask cache path.
- Delegate upgrades to `brew upgrade --cask ghcask/local/<cask-name>` only for the `upgrade` command.
- Support `--force` only for single GitHub cask upgrades, allowing a pinned cask to clear `requested_version` and move on its saved release track before Homebrew upgrade.

### Semantics

- `update` refreshes local cask definitions only.
- `upgrade` refreshes local cask definitions, batch-reads installed Homebrew cask versions, skips casks whose installed version already matches the generated cask version, and delegates the remaining targeted managed casks to Homebrew upgrade.
- `source_type: url` casks are not re-downloaded during normal update; upgrade only delegates them to Homebrew upgrade when the installed version does not match the generated cask version.
- For `source_type: github`, `upgrade cask-name --force` clears `requested_version`, preserves `release_policy`, updates that one cask on its saved release track, and then uses the installed-version check before delegating to Homebrew upgrade.
- `upgrade cask-name --force` must not be accepted for `source_type: url` casks; URL source changes are handled by `reinstall --url`.
- `outdated` reports available GitHub updates without downloading assets.
- `outdated --all` compares pinned GitHub casks against their saved release track and reports direct URL casks as not checkable.
- `outdated` does not download direct URL packages or attempt webpage discovery; URL casks are skipped by default.
- `upgrade` runs the same definition refresh flow as `update`, then performs installed-version checks and Homebrew upgrades for changed casks.

### Acceptance Criteria

- Tests cover no-op update, changed release, missing asset, and selected-cask upgrade.
- `outdated` does not download asset files.
- `outdated` has tests for skipping `source_type: url` casks by default and reporting them with `--all`.
- `outdated --all` has tests for pinned casks.
- `upgrade` prints the exact Homebrew upgrade command it runs and silently skips Homebrew upgrade when an installed version is already current.
- `update` caches newly downloaded packages in Homebrew's cask cache.
- `upgrade` batch-reads installed cask versions and skips Homebrew upgrade when a version already matches the generated cask.
- `upgrade` still runs Homebrew upgrade when installed version data is unavailable.
- `update` skips GitHub lookup for `source_type: url` casks.
- `update` does not run Homebrew upgrade commands.
- `update` rejects cask name arguments.
- `upgrade cask-name --force` is rejected if no cask name is provided or if more than one cask is targeted.
- `upgrade cask-name --force` is rejected for direct URL casks with guidance to use `reinstall cask-name --url NEW_URL`.
- `upgrade` behaves like `update` plus installed-version checks and Homebrew upgrade for changed casks.

### Suggested Commit

```sh
git add lib test cmd/brew-ghcask
git commit -m "Add update and upgrade flows"
```

## Task 09: List, Info, Uninstall, and Doctor Commands

### Goal

Add management and diagnostic commands for local generated casks.

### Scope

- Add `brew ghcask list`.
- Add `brew ghcask info cask-name|owner/repo`.
- Add `brew ghcask uninstall cask-name|owner/repo`.
- Add `brew ghcask reinstall cask-name|owner/repo [options]`.
- Add `brew ghcask reinstall cask-name --url URL`.
- Add `brew ghcask reinstall https://github.com/owner/repo/releases/tag/v1.2.3`.
- Add `brew ghcask pin cask-name|owner/repo`.
- Add `brew ghcask unpin cask-name|owner/repo`.
- Add `brew ghcask doctor`.
- Report Homebrew path, generated tap path, registry path, `gh` availability, `gh` auth status, and required system tools.
- Ensure `uninstall` can uninstall and clean registry entries.

### Acceptance Criteria

- `list` prints managed cask names and current versions.
- `info` prints full cask token, source type, repository URL or package URL, release policy, asset name and URL, version, sha256, app, cask path, and installed status when available.
- `uninstall` runs `brew uninstall --cask ghcask/local/<cask-name>` before deleting generated metadata unless `--keep-installed` is passed.
- `uninstall --dry-run` previews the Homebrew uninstall, metadata removal, and generated cask file removal without modifying local state.
- If Homebrew reports that the cask is not installed, `uninstall` prints a warning and still removes ghcask metadata and generated cask files.
- `reinstall` accepts cask names, GitHub repository references, and managed direct URL cask names.
- Without `--version`, `--prerelease`, `--stable`, a GitHub tag URL, or `--url`, `reinstall` uses the existing generated cask for all source types and must not query GitHub, re-download packages for metadata refresh, or rewrite registry state.
- Without metadata refresh options, `reinstall` runs `brew reinstall --cask ghcask/local/<cask-name>`.
- Without metadata refresh options, `reinstall --dry-run` previews the Homebrew reinstall command without running it.
- For GitHub-source casks, `reinstall --version VERSION` refreshes the generated cask to the matching release, preserves `release_policy`, records `requested_version: VERSION`, caches the package, and runs Homebrew reinstall.
- For GitHub-source casks, `reinstall --prerelease` refreshes the generated cask with `release_policy: latest-prerelease`, clears `requested_version`, caches the package, and runs Homebrew reinstall.
- For GitHub-source casks, `reinstall --stable` refreshes the generated cask with `release_policy: latest-stable`, clears `requested_version`, caches the package, and runs Homebrew reinstall.
- `--version`, `--prerelease`, and `--stable` are mutually exclusive.
- A GitHub release tag URL is treated like `owner/repo --version TAG`.
- `reinstall cask-name --url NEW_URL` is only valid for managed direct URL casks.
- `reinstall --url` downloads `NEW_URL`, recalculates `sha256`, refreshes inferred metadata and version, updates registry metadata, rewrites the generated cask, caches the package, and runs `brew reinstall --cask ghcask/local/<cask-name>`.
- `reinstall --version`, `reinstall --prerelease`, `reinstall --stable`, GitHub tag URL, and `reinstall --url --dry-run` preview refreshed metadata without writing local state, caching the package, or running Homebrew reinstall.
- `reinstall --url` rejects GitHub source casks with a clear error.
- GitHub release-selection reinstall options reject direct URL casks with a clear error.
- `reinstall --url` accepts useful metadata overrides including `--app`, `--name`, `--version`, and `--arch`.
- `pin` accepts a GitHub cask name or repository reference and sets `requested_version` to the current generated `release_tag` without changing `release_policy`.
- `unpin` accepts a GitHub cask name or repository reference and clears `requested_version` without changing `release_policy`.
- `pin` and `unpin` reject direct URL casks with guidance to use `reinstall cask-name --url NEW_URL`.
- `doctor` reports actionable warnings, not raw stack traces.

### Suggested Commit

```sh
git add lib test cmd/brew-ghcask
git commit -m "Add management commands"
```

## Task 10: Dump, Restore, and Cleanup

### Goal

Add local generated-state maintenance commands for stale metadata cleanup and portable JSON backup/restore.

### Scope

- Add `brew ghcask cleanup [--dry-run]`.
- Add `brew ghcask dump [--file PATH] [--global] [--force] [--dry-run]`.
- Add `brew ghcask restore [--file PATH] [--global] [--force] [--dry-run]`.
- Export generated local tap state as `Brewghcask.json` by default.
- Include registry metadata and cask file contents in one JSON file.
- Apply cleanup-equivalent filtering before dump so stale records are not exported.
- Restore JSON dump files into the generated local tap after validating dump contents.

### Semantics

- `cleanup` removes registry entries whose local `Casks/<name>.rb` file has been deleted.
- `cleanup` also removes entries that were installed through Homebrew but no longer appear in `brew list --cask`.
- Entries marked as generated-only must not be removed only because Homebrew does not list them as installed.
- `dump` defaults to `./Brewghcask.json`.
- `restore` defaults to `./Brewghcask.json`.
- `--global` uses `~/.homebrew/Brewghcask.json`, matching Homebrew Bundle's `~/.homebrew` convention.
- `--file PATH` and `--global` are mutually exclusive.
- `--force` is required before overwriting an existing dump file during dump.
- `dump --dry-run` reports the target path and filtered export counts without writing a dump file, and does not require `--force` when the output path already exists.
- `--force` is required before overwriting existing local cask files with the same names during restore.
- `restore --dry-run` validates the dump file and previews merge/overwrite effects without writing local state.
- Restore merges dump registry entries into the current registry and preserves local entries that are not present in the dump.

### Dump Validation

Restore must reject dump files that contain:

- malformed JSON;
- unsupported dump file version;
- malformed registry JSON;
- registry entries with missing or unsupported `source_type`;
- registry entries without matching cask content;
- cask content without matching registry entries;
- unsafe cask names containing path separators or whitespace.

Validation must complete before modifying the generated local tap.

### Acceptance Criteria

- `brew ghcask dump` writes `Brewghcask.json` in the current directory.
- `brew ghcask dump --file PATH` writes to `PATH`.
- `brew ghcask dump --global` writes to `~/.homebrew/Brewghcask.json`.
- `brew ghcask dump` refuses to overwrite an existing dump file unless `--force` is passed.
- `brew ghcask dump --dry-run` previews the filtered export without writing a file.
- `brew ghcask restore` imports `Brewghcask.json` into the generated local tap.
- `brew ghcask restore --dry-run` reports what would be restored without modifying local files or registry data.
- `brew ghcask restore --force` can overwrite same-name generated casks while preserving other local generated casks and registry entries.
- Restore rejects invalid JSON dump files before writing files.
- Restore rejects registry entries with missing or unsupported `source_type`.
- Tests cover stale-entry filtering during dump.
- Tests cover generated-only entries being preserved during dump.

### Suggested Commit

```sh
git add lib test README.md README.zh-CN.md
git commit -m "Add ghcask dump and restore"
```

## Task 11: Documentation, QA, and First Release

### Goal

Prepare the first usable release of the tap command.

### Scope

- Expand English README with install, usage, update, troubleshooting, and examples.
- Expand Chinese README with matching content.
- Add shell completion notes if completions exist.
- Add concise troubleshooting sections for GitHub authentication, rate limits, direct URL syntax/download failures, and restore conflicts.
- Add a release checklist.
- Test tapping the repository locally.
- Keep detailed product requirements and implementation tasks in the website/planning repository, not in the tap repository.

### QA Checklist

- `ruby cmd/brew-ghcask --help`
- `ruby cmd/brew-ghcask doctor`
- `brew tap oxsean/ghcask`
- `brew ghcask --help`
- `brew ghcask doctor`
- Install from a known public GitHub release fixture or safe real-world test repo.
- Repeated install of the same generated cask skips source lookup.
- Install from a safe direct `.dmg`, `.zip`, `.tar.gz`, or `.tgz` URL with `--no-install`.
- Reinstall a direct URL cask with `--url NEW_URL --dry-run`.
- Run `brew ghcask info` and verify `source_type` and `sha256` are printed.
- Run `brew ghcask dump --force` and `brew ghcask restore --dry-run`.
- Run `brew ghcask cleanup --dry-run`.

### Acceptance Criteria

- English and Chinese README files are current.
- Manual QA commands are documented.
- The first release tag can be created after QA passes.

### Suggested Commit

```sh
git add README.md README.zh-CN.md
git commit -m "Document ghcask development plan"
```
