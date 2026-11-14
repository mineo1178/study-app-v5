# Material display data

The private common catalog is the source of truth. Regenerate the public projection after reviewing catalog changes:

```text
python scripts/export-material-display.py --catalog <MATERIAL_CATALOG.csv> --output src/planning/material-catalog.generated.json
```

The export allowlists public material names, curriculum topics, difficulty/class labels, content-hash material identifiers, round and subject. It excludes private paths, file IDs, student information, PDF text and every task binding. New names/topics require an explicit allowlist review. It never parses PDFs.

`catalog-display.ts` resolves a formal name when the task's existing hash-based material identity and compatible category/scope match, or when the current account has explicitly confirmed a compatible catalog candidate. Otherwise legacy A/B/S tasks retain their unconfirmed label. A short unconfirmed note appears in the grid; candidate facts are in the tooltip/detail panel. Candidates are never narrowed using A/B/S.

`verified-print-materials.ts` remains the previous display grouping/sort baseline. Catalog-derived names and notes affect visible text only; existing row keys, grouping and ordering remain stable. Registered names, task IDs and plan import identity checks are not rewritten.

Book categories and assignment names remain separate registration facts. For example, the category `練成問題` plus assignment `トレーニング` does not establish a different PDF title.

## User confirmation (v1.89.27)

Open a legacy print's existing task detail, compare the PDF header (round, subject, material, difficulty and topic), choose a candidate and confirm. No candidate is preselected for unconfirmed tasks, including when only one candidate exists. Change by selecting another candidate; revoke with the clear button. The original registration remains visible. The public app contains no PDF body, local file path or private task binding list.

Production stores only `materialDisplayBindings.<uid>` on the existing task document, using a transaction with revision and task-identity checks. Existing task Rules already permit this partial update for family members; no Rules or material registry migration is made. The original `planning.material.materialId`, names, plan revision, history and progress are untouched. The existing task subscription restores the account's selection across devices. Bindings are displayed only for the current UID. As with existing task data, the enclosing document is readable by authorized family members; this is not a new private security boundary within a family. Offline/conflicting writes report failure rather than claiming successful synchronization.

Sample mode uses a versioned project/family/UID local-storage key, separately from cloud data, and labels it as this-device-only. It is not cross-device synchronization.

The application is authoritative for user-confirmed task bindings; the common catalog remains authoritative for PDF metadata. Confirmation does not automatically update a Windows catalog. The per-task **台帳反映用の差分JSONを保存** download includes account scope, unchanged registration, material hash, confirmation timestamp and revision (including revocations). Its `catalogSync: pending` remains visible after download: download is not proof of local synchronization.

To reconcile locally, verify the export's project/family/UID and latest revision against the account, resolve its material hash to the current catalog row, and check original task identity and the user's PDF confirmation. Apply only confirmed `relatedTaskIds` and corresponding evidence/date/status using the common catalog's backup/update rules; review revocations and conflicts before removing any relationship. Never overwrite the catalog with the export or treat its candidates as confirmed. No actual user selections or catalog task bindings were seeded by this release.

Targeted checks:

```text
node scripts/test-material-binding-emulator.mjs
node scripts/test-material-binding-browser.mjs
```
