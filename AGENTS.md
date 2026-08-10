# Project commit rule

Every commit in this repository must be created with `npm run release:commit`.
The command requires a semantic version, a commit message, and at least one user-facing release note.
It updates `src/releaseNotes.js` and the Android version before staging and committing all changes.

Example:

`npm run release:commit -- --version 2.1.1 --message "feat: improve map" --note "빠른 지도|사진 마커를 묶어 더 빠르게 표시합니다.|🗺️"`
