# Material display data

The private common catalog is the source of truth. Regenerate the public projection after reviewing catalog changes:

```text
python scripts/export-material-display.py --catalog <MATERIAL_CATALOG.csv> --output src/planning/material-catalog.generated.json
```

The export allowlists public material names, curriculum topics, difficulty/class labels, content-hash material identifiers, round and subject. It excludes private paths, file IDs, student information, PDF text and every task binding. New names/topics require an explicit allowlist review. It never parses PDFs.

`catalog-display.ts` resolves a formal name only when the task's existing hash-based material identity and compatible category/scope match. Otherwise legacy A/B/S tasks retain their unconfirmed label. Their separate candidate note contains catalog facts and explicitly states that correspondence is unconfirmed. It does not narrow candidates using A/B/S.

`verified-print-materials.ts` remains the previous display grouping/sort baseline. Catalog-derived names and notes affect visible text only; existing row keys, grouping and ordering remain stable. Registered names, task IDs and plan import identity checks are not rewritten.

Book categories and assignment names remain separate registration facts. For example, the category `練成問題` plus assignment `トレーニング` does not establish a different PDF title.
