# Releasing

Releases are automated. You push a tag; GitHub Actions builds the extension,
generates the changelog from the commits, and publishes the release.

## Steps

1. **Bump the version** in both files (they must match the tag):
   - `frontend/manifest.json` → `"version"`
   - `frontend/package.json` → `"version"`

2. **Commit, tag and push:**

   ```bash
   git commit -am "Release v0.1.2"
   git tag v0.1.2
   git push origin main --tags
   ```

That's it. The [release workflow](../.github/workflows/release.yml) then:

- verifies the tag matches `manifest.json` (fails loudly if not),
- runs lint + build,
- packages `frontend/dist` into `devhome-v0.1.2.zip`,
- writes release notes from the commits since the previous tag, and
- publishes the GitHub Release with the zip attached.

The in-app **Release notes** dialog fetches from GitHub, so it updates itself —
no code change needed.

## Notes

- **Tag format** is `vMAJOR.MINOR.PATCH` (e.g. `v0.1.2`).
- The changelog is built from commit subjects, so write clear ones.
- To publish to the **Chrome Web Store**, upload the `devhome-vX.Y.Z.zip` asset
  from the GitHub Release to the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
