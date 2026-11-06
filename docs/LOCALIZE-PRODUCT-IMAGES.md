# Localize Product Images into Supabase Storage

The bulk product import stores `product.image_url` exactly as supplied. It does
not download the image or copy it into the `product-images` bucket. This
one-off script does that copy, then rewrites `image_url` to the public bucket
URL.

This is **separate from** `05_post_import.sql`. That script only handles
categories, nav links, promos, the Bark banner, and verification; it never
touches `product.image_url`.

## Prerequisites

- `backend/.env` has `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (service role).
- Dependencies are installed (`backend/node_modules`).
- Node 18+ (the backend runs Node 24).
- The catalog import is finished and you are satisfied with the 1,023 rows.

## Commands

Run from `backend/`:

```bash
# 1. List what would be processed. No network, no writes.
npm run localize-images -- --limit=5

# 2. Fetch and validate a small sample. No uploads, no DB writes.
npm run localize-images -- --check --limit=20

# 3. Pilot: upload and update 10 products.
npm run localize-images -- --apply --limit=10

# 4. Full run.
npm run localize-images -- --apply
```

The script is **dry-run by default**. Only `--apply` uploads and updates rows.

## Modes

| Command | Fetches | Uploads | Updates DB |
|---|---:|---:|---:|
| *(no flag)* | No | No | No |
| `--check` | Yes | No | No |
| `--apply` | Yes | Yes | Yes |

`--check` and `--apply` cannot be combined.

## What it does per image

1. Skips blank `image_url` rows.
2. Skips rows already pointing at this bucket unless `--force`.
3. Validates the URL and every redirect hop against private/internal address
   ranges (max 3 redirects).
4. Fetches with a 15-second timeout (configurable).
5. Rejects non-images, SVG, and sources over 5MB.
6. Resizes to max 1200px wide, converts to JPEG quality 80.
7. Uploads to `product-images` with a 1-year cache header.
8. Updates `product.image_url` to the public bucket URL.
9. Writes a CSV report for every row.

Duplicate source URLs are uploaded once and reused across products. The
current catalog has 978 images, 833 unique URLs, so 145 rows share an image.

## Expected numbers

| Item | Count |
|---|---:|
| Products scanned | 1,023 |
| With an image | 978 |
| Blank image | 45 |
| Already in bucket (before run) | 0 |
| Unique source URLs | 833 |

## Report

Default location:

```text
backend/scripts/reports/image-localization-<timestamp>.csv
```

Columns: `prod_id`, `prod_name`, `source_url`, `final_url`, `status`,
`http_status`, `content_type`, `source_bytes`, `jpeg_bytes`, `bucket_url`,
`error`, `duration_ms`.

Statuses:

| Status | Meaning |
|---|---|
| `planned` | Dry-run list only |
| `would_update` | `--check` passed; nothing written |
| `updated` | Uploaded and `image_url` updated |
| `skipped_bucket` | Already a bucket URL; skipped |
| `failed` | Left unchanged; see `error` |

Filter `status=failed` after a run. Common failures: 403 hotlink block, 404,
redirect loop, timeout, HTML instead of an image, unsupported content type,
source over 5MB.

## Verify

```sql
select count(*) as bucket_images
from public.product
where image_url like '%/storage/v1/object/public/product-images/%';
```

Expected after a full run: **978**.

Spot-check the storefront menu and a few product pages. The 45 blank-image
products still show the placeholder until you add images manually.

## Rollback

The report preserves the original `source_url` for every row. To revert one
product:

```sql
update public.product
set image_url = '<source_url from the report>'
where prod_id = '<prod_id>';
```

The uploaded bucket objects are not deleted by this script. If you revert,
remove the corresponding objects from Storage separately.

## Notes

- This bypasses the admin audit log. It uses the service key directly, like a
  one-off migration.
- Copying retailer images does not change the rights or permission to use
  them. Confirm the catalog images are licensed for your store.
- The admin product form's "use image URL" button still localizes one image at
  a time through `POST /api/admin/images/upload`; the bulk import does not.
