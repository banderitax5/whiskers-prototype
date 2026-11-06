# Real-time storefront content

Admin edits (banners, nav links, home sections, promos, settings, FAQs,
policies, category labels) now appear on open storefront tabs without a
refresh. Shoppers no longer need to reload after the owner clicks Save.

## How it works

```
admin save ──> content table row changes
                 │
                 └─ trigger bumps public.site_content_version (one row, one number)
                        │
                        ├─ Supabase Realtime UPDATE ──> every open tab (instant)
                        └─ 60 s poll / tab focus     ──> fallback if Realtime is off
                                 │
                                 └─ GET /api/site-content?v=<version>
                                        │  server rebuilds if its cache is older
                                        └─ all mounted components re-render
```

The version row contains **no storefront data** - only a counter - so it is
safe to expose to browsers. Content tables stay private (service role only);
browsers never subscribe to them.

Counter-only writes are excluded from the trigger: banner impressions/clicks
and promo `usage_count` do not wake shoppers.

## One-time setup (owner)

Run this in the Supabase SQL editor:

```
backend/migrations/2026-11-06_site_content_live.sql
```

It is additive and safe to re-run. It creates the version table, the bump
triggers, the public read policy, and adds the table to the
`supabase_realtime` publication.

Verify:

```sql
select * from public.site_content_version;          -- one row, id = 1
select * from pg_publication_tables
 where pubname = 'supabase_realtime'
   and tablename = 'site_content_version';          -- one row
```

If the migration is skipped the site keeps working exactly as before (edits
appear on the next navigation). The poll gives up quietly after three failed
reads.

## Trying it

1. Open the storefront in one tab and the admin panel in another.
2. Edit an announcement, banner, nav label, FAQ, or shipping fee and save.
3. The storefront tab updates within about a second. If Realtime is disabled
   it updates within 60 seconds or when the tab is focused again.

## Files

| File | Role |
| --- | --- |
| `backend/migrations/2026-11-06_site_content_live.sql` | version table, triggers, publication |
| `backend/src/routes/siteContent.js` | returns `content_version`; `?v=` bypasses a stale cache |
| `frontend/src/lib/siteContentLive.js` | shared channel, poll fallback, `useSiteContent()` |
| `frontend/src/lib/siteContent.js` | forwards `?v=`; ignores a late older response |
| `frontend/src/components/*`, `frontend/src/pages/*` | consumers switched to the hook |

## Tests

```
cd frontend && npx vitest run src/lib/siteContent.test.js src/lib/siteContentLive.test.jsx
cd frontend && npm test
cd backend && npm test
```

## Known limits / next pass

- **Products and prices are not live yet.** Save a product and the catalog
  still needs a navigation/reload. Wiring `products` into the trigger plus
  the catalog hooks is the next slice.
- **PWA image cache.** Replacing a banner image at the same URL can show the
  old file until the cache rotates; upload under a new filename or add a
  version suffix.
- **Backend cache.** The version check rebuilds per-instance caches, so this
  is correct with more than one server. The admin routes also still call
  `invalidateContentCache()`.
- **One reload after deploy.** Tabs already open from the previous build must
  be reloaded once to pick up the live client.
- **Preview mode** (`?scPreview=1`) deliberately ignores the shared signal;
  previews always fetch the draft payload directly.

## Rollback

The migration file ends with a commented rollback block (drop triggers,
function, publication entry, table). Removing those leaves the storefront on
the old behaviour with no code change required.
