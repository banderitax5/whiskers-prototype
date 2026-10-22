# Spreadsheet Prep — Instructions for Import

**Status:** prep only. Nothing imports until the sheet is fixed AND a dry-run report is approved.
**Source:** https://docs.google.com/spreadsheets/d/1FXo43DPCHvodpsiW9LXuPtTD1R5wJDsqWInMRzCUSL0
**Baseline (as of last read):** 9 tabs + 1 empty, 1,031 product rows, 1,024 distinct names.

---

## 1. Target structure

Consolidate **all 9 tabs into one sheet**. Row 1 is the only header row, exactly 8 columns:

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| `prod_name` | `category` | `brand` | `price` | `stock_quantity` | `image_url` | `description` | — |

> **One column for `category` only.** Subcategory goes in the same cell as
> `Category - Subcategory` (space-hyphen-space). The import script splits on the
> **first** ` - ` and writes two database columns. You never type two columns.

**Rules:** no blank rows, no merged cells, no section-header rows, one product per row.

---

## 2. The `category` value list

Only these strings are accepted. Anything else is flagged in the dry-run report — never silently guessed.

### Food
```
Cat Food & Treats - Dry
Cat Food & Treats - Wet Can
Cat Food & Treats - Wet Pouch
Cat Food & Treats - Treats

Dog Food & Treats - Dry
Dog Food & Treats - Wet Can
Dog Food & Treats - Wet Cup
Dog Food & Treats - Wet Pouch
Dog Food & Treats - Treats
```

### Veterinary diet — species is mandatory
```
Dog Veterinary Diet - Dry
Dog Veterinary Diet - Can
Dog Veterinary Diet - Pouch
Dog Veterinary Diet - Treats

Cat Veterinary Diet - Dry
Cat Veterinary Diet - Can
Cat Veterinary Diet - Pouch
Cat Veterinary Diet - Treats
```

### Health
```
Pet Health & Wellness - Vitamins
Pet Health & Wellness - Deworming
Pet Health & Wellness - Anti-Tick & Flea
Pet Health & Wellness - Anti-Mange
Pet Health & Wellness - Medicine
Pet Health & Wellness - Dextrose
```

### Grooming
```
Pet Grooming - Shampoo
Pet Grooming - Soap
Pet Grooming - Cologne
Pet Grooming - Powder
Pet Grooming - Diapers
Pet Grooming - Wipes
```

### Single-level — no ` - ` suffix
```
Cat Litter
Pets Milk
Fish Food
Birds
Hamster/Guinea/Rabbit
Reptiles
```

### Not used (available if you add rows)
```
Cat Food & Treats - Milk
Dog Food & Treats - Milk
Dog Food & Treats - Topper
```

---

## 3. Section-header → category map

Your tabs currently carry uppercase section-header **rows**. Each becomes data in
column B of the rows beneath it — the header row itself is deleted.

### `Pet Food` tab → `Cat Food & Treats`
| Section row | Write as |
|---|---|
| `CATS DRY FOOD` | `Cat Food & Treats - Dry` |
| `WET FOOD CAN` | `Cat Food & Treats - Wet Can` |
| `WET FOOD POUCH` | `Cat Food & Treats - Wet Pouch` |
| `TREATS` | `Cat Food & Treats - Treats` |

### `Pet Food 1` tab → `Dog Food & Treats`
| Section row | Write as |
|---|---|
| `DOGS DRY FOOD` | `Dog Food & Treats - Dry` |
| `WET FOOD CAN` | `Dog Food & Treats - Wet Can` |
| `WET FOOD CUP` | `Dog Food & Treats - Wet Cup` |
| `WET FOOD POUCH` | `Dog Food & Treats - Wet Pouch` |
| `TREATS` | `Dog Food & Treats - Treats` |

### `Pet Food 3` tab
| Section row | Write as |
|---|---|
| `HAMSTER,GUINEA,RABBIT` | `Hamster/Guinea/Rabbit` |
| `BIRDS` | `Birds` |

### `Pet Food 4` tab → `Fish Food`
| Section row | Write as |
|---|---|
| `FISH FOOD` | `Fish Food` |

### `Pet Health & Wellness` tab
| Section row | Write as |
|---|---|
| `SYRUP VITAMINS`, `TABLET VITAMINS`, `PASTE/ GEL VITAMINS` | `Pet Health & Wellness - Vitamins` |
| `DEWORMING` | `Pet Health & Wellness - Deworming` |
| `ANTI TICK AND FLEA DROPS`, `... TABLET` | `Pet Health & Wellness - Anti-Tick & Flea` |
| `ANTI MANGE/FUNGAL CREAM`, `... TABLET`, `... SPRAY` | `Pet Health & Wellness - Anti-Mange` |
| `MEDICINE ORAL` | `Pet Health & Wellness - Medicine` |
| `DEXTROSE POWDER` | `Pet Health & Wellness - Dextrose` |
| `MILK` (3 rows: Prolific Tails Goat's Milk 100G/200G, Cosi Milk 1L) | `Pets Milk` |

### `Cat Liiter` tab → `Cat Litter`
All 13 sections are **brands, not subcategories** — `MEOWTECH`, `TOP CAT`,
`FELINE FRESH`, `BEST CLEAN`, `NEO CLEAN`, `CINDY'S`, `AROMATIC`,
`AROMATIC GOLD`, `CATTITUDE`, `PRETTY CASSEY PREMIUM`, `CHARLESTON`, `TABBY`,
`ZEN CLEAN`.

Every row → `Cat Litter`. Brand name goes in the `brand` column.

### Grooming tabs → `Pet Grooming`
**Do not use the section header** — it is usually a brand. Derive subcategory
from the **product name** instead:

| Name contains (lowercase) | → subcategory |
|---|---|
| `shampoo`, `conditioner` | `Shampoo` |
| `soap` | `Soap` |
| `cologne`, `perfume` | `Cologne` |
| `powder` | `Powder` |
| `diaper`, `pad`, `wrap` | `Diapers` |
| `wipe` | `Wipes` |

Verified: this classifies **135/135** grooming rows.

### `Vet Food` tab
See §5 — this tab needs the most repair.

---

## 4. Column-drift fixes

Three tabs do not share the same column layout:

| Tab | Cols | Problem | Fix |
|---|---|---|---|
| `Pet Food 4` (Fish) | **6** | No `BRAND` column — 103 image URLs sit in the BRAND slot | Move those URLs to `image_url` |
| `Vet Food` | **6** | No `BRAND` column — 38 image URLs sit in the BRAND slot | Move those URLs to `image_url` |
| `Pet Health & Wellness` | **15** | 8 stray empty columns right of H | Delete everything right of column H |

Result: every row must be exactly 8 populated-or-empty columns.

---

## 5. `Vet Food` tab — full rebuild

### 5a. Row 1 is a wall of text containing 26 real products

Cell A1 holds ~28 product names pasted together, B1 holds `Pet Food Pet Food…`,
E1 holds ~28 image URLs. These are **real Royal Canin vet products that have no
rows of their own** — and they are the source of the junk rows already in the
database (`Cardiac 1.5kg`, `Renal 2kg`).

Split that cell into **26 separate rows**. All are `Dog Veterinary Diet`:

**19 × `Dog Veterinary Diet - Dry`**
```
Urinary S/O Small Dog 1.5kg        Gastrointestinal Lowfat Dog 6kg
Urinary S/O Big Dog 2kg            Satiety Small Dog 1.5kg
Urinary S/O Dog 7.5kg              Satiety Big Dog 1.5kg
Gastrointestinal 2kg               Satiety Dog 6kg
Gastrointestinal Lowfat Small Dog 1.5kg    Hypoallergenic Small Dog 1.5kg
Gastrointestinal Lowfat Big Dog 1.5kg      Hypoallergenic Big Dog 1.5kg
Hypoallergenic Dog 7kg             Hepatic 1.5kg
Cardiac 1.5kg                      Hepatic 7kg
Cardiac 7kg                        Renal 2kg
Renal 7kg
```

**7 × `Dog Veterinary Diet - Can`**
```
Urinary s/o can        Hepatic can        Renal Can
Gastrointestinal can   Hypoallergenic can
Gastrointestinal lowfat can   Cardiac Can
```

Images for these are in cell E1 — match them across to the right row.

### 5b. Existing 38 rows — species from the name, not the header

| Name contains | Species |
|---|---|
| `Brit Care Dog`, `BC Dog`, `Brit GF VD Dog`, `Moochie ... Dog` | Dog |
| `Brit GF VD Cat`, `Brit VD ... Cat`, `Mr Vet ... Cat` | Cat |

Current split: **25 Dog · 12 Cat · 1 mixed**.

⚠️ **`Brit GF VT Dog & Cat Can Recovery 400G`** — needs a human decision: assign
one species or duplicate into both. Never auto-guessed.

### 5c. Subcategory from the name, not the section header

The section headers lie here:
- `BRIT CAN` contains **4 pouches** (`Brit VD ... Cat Pouch 85G`)
- `POUCH` contains **4 cat treats** (`Mr Vet Cat Treats ...`)

Rule: `Can` in name → `Can` · `Pouch` → `Pouch` · `Treats` → `Treats` · kg weight → `Dry`

### 5d. Possible miscategorisation — needs your decision
- `Moochie Casserole Dog Food With ... 85G` (4 rows) — wellness pouch, maybe `Dog Food & Treats - Wet Pouch`
- `Mr Vet Cat Treats ... / Pouch ...` (4 rows) — supplements, maybe `Pet Health & Wellness`

---

## 6. Data quality fixes

### 6a. Price must be numeric
- **85 values** are text with thousands commas (`2,510`, `1,300`). Format column as plain number.
- **43 rows have no price:**

| Tab | Rows | Products |
|---|---|---|
| Pet Food · CATS DRY | 6 | Aozi All Stages Salmon/Tuna 20KG, Aozi Kitten Salmon/Tuna 10KG, Goodest Cat Tuna 22KG, Infinity Cat Adult Salmon 20KG |
| Pet Food · TREATS | 5 | Friskies Party Mix ×3, Champion Treats ×2 |
| Pet Food 1 · DOGS DRY | 1 | Royal Canin Medium Puppy 4kg |
| Pet Food 4 · FISH | 28 | Hikari / Saki-Hikari (all) |
| Pet Health · ANTI MANGE SPRAY | 1 | Vetcore Spray |
| Cat Liiter · ZEN CLEAN | 1 | Zen CLean 25L |

> Unpriced items are **blocked from checkout** by the backend. Fill them or
> accept them as unsellable.

### 6b. `brand` is empty on all 1,031 rows
Your live DB is 463/465 branded and brand feeds the home-page tiles. This is the
single most visible gap. ~50% are guessable from the product name
(`Royal Canin`, `Aozi`, `Whiskas`, `Kitcat`, `Hikari`, `Friskies`…).

### 6c. Duplicate rows — delete these 7
| Product | Count | Tab |
|---|---|---|
| `Entree Gourmet Treats Angus Steak` | ×3 → delete 2 | Pet Food 1 |
| `Mr Vet Cat Pouch Vitamin Nutrition 70G` | ×2 → delete 1 | Pet Food **and** Vet Food |
| `Knotte Bones Treats 2.5IN - Beef Milk` | ×2 → delete 1 | Pet Food 1 |
| `Hikari Tropical Sinking Carnivore Pellets Sinking 1Kg` | ×2 → delete 1 | Pet Food 4 |
| `Papi MVP 120ml` | ×2 → delete 1 | Pet Health |
| `Papi Doxy 60ml` | ×2 → delete 1 | Pet Health |

### 6d. Merge the two grooming tabs
`Pet Grooming & Hygiene` (47 rows, no space) and `Pet Grooming &Hygiene`
(112 rows, space) differ only by a space in the name. No product overlap —
straight append, then keep one tab.

### 6e. Delete `Sheet12` (empty)

### 6f. `stock_quantity`
Empty on every row currently. Leave empty only if new items should default to
out-of-stock.

---

## 7. Pre-handback checklist

- [ ] One sheet, one header row, exactly 8 columns
- [ ] All 9 source tabs consolidated
- [ ] Zero uppercase section-header rows remaining
- [ ] No cell contains multiple values (especially Vet Food A1)
- [ ] Every `category` value appears verbatim in §2
- [ ] Every Vet Food row has `Dog` or `Cat` species
- [ ] `price` is numeric — no commas, no currency symbols
- [ ] `prod_name` unique across the whole sheet (0 duplicates)
- [ ] `brand` filled
- [ ] `Sheet12` deleted; two grooming tabs merged

---

## 8. What happens on import

1. Validate every `category` against §2 — report anything unmatched
2. Split on first ` - ` → write `category` + `subcategory`
3. Cross-check vet species against product name — flag mismatches
4. Strip thousands commas from `price`, coerce to numeric
5. Flag (not guess) missing prices, duplicate names, empty brands
6. **Dry-run first** — prints the full proposed table plus a
   matched / new / rejected report. **Nothing is written until you approve.**

### Requires a schema migration
`subcategory` does not exist on `product` today. Import also needs:
- `adminInput.js` L92 — add `subcategory` to the allowed-fields whitelist
- `AdminProductManagement.jsx` — dependent category → subcategory dropdown
- `products.js` `/categories` — expose subcategory to the filter UI
- `Menu.jsx` L172 — `includes()` is substring matching; must become exact for
  the new field or `Cats` will also match `Cats - Wet Can`
