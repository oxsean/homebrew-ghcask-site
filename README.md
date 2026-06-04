# ghcask Website

This repository will host the standalone marketing website for `ghcask`.

The website is planned as a modern, minimal, blue-accented bilingual site for
English and Chinese audiences.

## Status

Static website implementation is available in this repository.

## Design Draft

- [English light/dark mockup v2](design/ghcask-site-en-light-dark-v2.png)
- [Chinese light/dark mockup v2](design/ghcask-site-zh-light-dark-v2.png)
- [Archived bilingual mockup v1](design/ghcask-site-mockup-v1.png)

## Specs

- [Product requirements](specs/product-requirements.md)
- [Implementation tasks](specs/implementation-tasks.md)

## Product Repository

- [oxsean/homebrew-ghcask](https://github.com/oxsean/homebrew-ghcask)

## Planned Language Support

- English
- Simplified Chinese

## Preview

Open the site directly:

- `index.html` for English
- `zh-CN.html` for Simplified Chinese

Or run a simple static server from the repository root:

```sh
python3 -m http.server 8000
```

Then visit:

- `http://localhost:8000/`
- `http://localhost:8000/zh-CN.html`

## License

Licensed under the [Apache License 2.0](LICENSE).
