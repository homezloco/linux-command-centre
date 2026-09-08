# Self-hosted APT repo (Launchpad PPA substitute)

A real Launchpad PPA won't work well for this app: Launchpad only accepts
**source** uploads (`.dsc`/`.orig.tar.gz`/`.diff.tar.gz` via `dput`) and
builds them on infrastructure with network access disabled. Electron's
`npm install` needs to fetch ~100MB of prebuilt Electron binary plus the
full `node_modules` tree, so a real PPA build would mean vendoring all of
that into the source tarball for every release — expensive to maintain for
little benefit.

Instead this publishes a small, self-hosted flat APT repository to GitHub
Pages, rebuilt from the already-built `.deb` every time a release is
published. End users get the same `apt install`/`apt upgrade` experience;
it's just not routed through Launchpad's infrastructure.

## One-time setup

1. Create an orphan `gh-pages` branch and enable GitHub Pages for it
   (Settings → Pages → Deploy from branch → `gh-pages` / `/`):
   ```
   git checkout --orphan gh-pages
   git rm -rf .
   git commit --allow-empty -m "Initialize gh-pages"
   git push origin gh-pages
   git checkout main
   ```
2. (Recommended, optional) Generate a signing key so users aren't stuck with
   `[trusted=yes]`:
   ```
   gpg --full-generate-key   # RSA 4096, no expiry or a long one
   gpg --export-secret-keys --armor <KEYID> > private.asc
   ```
   Add `private.asc`'s contents as the repo secret `APT_GPG_PRIVATE_KEY`,
   and the key's passphrase (if any) as `APT_GPG_PASSPHRASE`, then delete
   `private.asc` locally. Without this secret set, the workflow still
   publishes — just unsigned.

The workflow at `.github/workflows/apt-repo.yml` runs automatically on
release publish (and via manual dispatch) and does the rest.

## End-user install

With signing configured:
```
curl -fsSL https://homezloco.github.io/linux-command-centre/apt/pubkey.gpg \
  | sudo gpg --dearmor -o /usr/share/keyrings/linux-command-centre.gpg
echo "deb [signed-by=/usr/share/keyrings/linux-command-centre.gpg] https://homezloco.github.io/linux-command-centre/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/linux-command-centre.list
sudo apt update && sudo apt install linux-command-centre
```

Without signing (drop the `signed-by` clause, mark the repo trusted):
```
echo "deb [trusted=yes] https://homezloco.github.io/linux-command-centre/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/linux-command-centre.list
sudo apt update && sudo apt install linux-command-centre
```

`[trusted=yes]` skips signature verification — fine to start with, but worth
moving to a signed repo (step 2 above) before pointing people at this in
anger.
