# Releasing an update

Installed copies of the app update themselves from this repository's **GitHub Releases**.
A release is built by GitHub Actions whenever a `v*` tag is pushed.

## Steps

1. **Bump the version** in `package.json` (semver; the app compares versions numerically):

   ```bash
   npm version minor --no-git-tag-version   # 0.1.0 -> 0.2.0
   ```

2. **Add a changelog entry** at the top of `changelog.json`. Write the Polish text for the user —
   short, plain sentences about what changed for *her*, not about the code:

   ```json
   {
     "version": "0.2.0",
     "date": "2026-11-15",
     "pl": ["Dodawanie zdjęć faktur prosto z telefonu."],
     "en": ["Add invoice photos straight from the phone."]
   }
   ```

3. **Check locally**

   ```bash
   npm run typecheck && npm test && npm run test:e2e
   ```

4. **Commit, tag and push**

   ```bash
   git commit -am "Release 0.2.0"
   git tag v0.2.0
   git push && git push --tags
   ```

5. Watch the **Release** workflow in the Actions tab. It fails early if the tag does not match
   `package.json`. When it finishes, the release contains `Ewidencja-Faktur-Setup-X.Y.Z.exe`,
   its `.blockmap` and `latest.yml` (the file the app reads to discover updates).

## What the user sees

Within ~4 hours (or on the next start) the app downloads the update in the background and shows:

> 🎁 **Jest nowa wersja programu (0.2.0).** Aktualizacja jest już pobrana…  
> [ Zaktualizuj teraz ] [ Później ]

*Zaktualizuj teraz* restarts the app into the new version within seconds. *Później* hides the
banner (a small button stays in the sidebar) and the update installs the next time the app is
closed. After the restart a "Program został zaktualizowany" dialog lists the changes.

## First installation

Download the installer from the latest release and run it on the target computer. It installs
for the current user without admin rights, creates a desktop shortcut and starts the app.
Because the app is not code-signed, Windows SmartScreen asks once: *More info → Run anyway*.
After installing, open **Ustawienia** and enter the shop's NIP.

## If something goes wrong

- **A broken release:** publish a fixed version with a higher number — the app always moves to the
  latest release. Deleting a release stops new downloads but does not roll back installed copies.
- **Database migrations** are append-only; never edit a released migration in `src/main/db.ts`.
  A backup snapshot is taken daily, and restoring one is available in Settings.
