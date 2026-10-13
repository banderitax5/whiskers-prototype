$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4141'
$envLines = Get-Content (Join-Path $PSScriptRoot '..\.env')
function Get-EnvVal($name) {
  $line = $envLines | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
  return ($line -replace '^[^=]+=', '')
}
$SU = Get-EnvVal 'SUPABASE_URL'
$SK = Get-EnvVal 'SUPABASE_SERVICE_KEY'
$AK = Get-EnvVal 'SUPABASE_ANON_KEY'
$results = New-Object System.Collections.Generic.List[string]

function Step($name, $ok, $detail = '', $tag = '') {
  if (-not $tag) { $tag = if ($ok) { 'PASS' } else { 'FAIL' } }
  $results.Add("[$tag] $name$(if ($detail) { " - $detail" })")
}
function Get-ErrBody($er) {
  # PS 5.1 buffers the response body into ErrorDetails by the time a catch
  # block runs, so the response stream is already at EOF - try it first.
  if ($er.ErrorDetails -and $er.ErrorDetails.Message) { return $er.ErrorDetails.Message }
  try { $s = $er.Exception.Response.GetResponseStream(); $r = New-Object IO.StreamReader($s); return $r.ReadToEnd() } catch { return '' }
}

# â”€â”€ 1. create throwaway user â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$email = "e2e-support-$([guid]::NewGuid().ToString('N').Substring(0,8))@example.com"
$pw = 'E2eProbe!2345'
try {
  $u = Invoke-RestMethod -Uri "$SU/auth/v1/admin/users" -Method Post `
    -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } `
    -ContentType 'application/json' `
    -Body (@{ email = $email; password = $pw; email_confirm = $true } | ConvertTo-Json -Compress)
  Step 'create user' $true $u.id
} catch { Step 'create user' ($false) (Get-ErrBody $_); $results; exit 1 }
$uid = $u.id

# â”€â”€ 2. sign in â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
try {
  $tok = Invoke-RestMethod -Uri "$SU/auth/v1/token?grant_type=password" -Method Post `
    -Headers @{ apikey = $AK } -ContentType 'application/json' `
    -Body (@{ email = $email; password = $pw } | ConvertTo-Json -Compress)
  Step 'password grant' $true
} catch { Step 'password grant' ($false) (Get-ErrBody $_); $results; exit 1 }
$AT = $tok.access_token
$authH = @{ Authorization = "Bearer $AT" }

# â”€â”€ 3. pick a priced in-stock product â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$prod = Invoke-RestMethod -Uri "$SU/rest/v1/product?select=prod_id,prod_name,price,stock_quantity&is_active=eq.true&price=gt.0&stock_quantity=gt.0&order=price.asc&limit=1" `
  -Headers @{ apikey = $SK; Authorization = "Bearer $SK" }
if (-not $prod -or $prod.Count -eq 0) { Step 'pick product' $false 'none priced+in-stock'; $results; exit 1 }
$prodId = $prod[0].prod_id; $stock0 = [int]$prod[0].stock_quantity
Step 'pick product' $true "$($prod[0].prod_name) stock=$stock0"

# â”€â”€ 4. place order â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
try {
  $order = Invoke-RestMethod -Uri "$base/api/orders" -Method Post -Headers $authH -ContentType 'application/json' `
    -Body (@{ items = @(@{ productId = $prodId; quantity = 1 }); paymentMethod = 'GCash'; shippingFee = 75; customerName = 'E2E Probe'; phone = '09171234567'; address = '1 Test Street' } | ConvertTo-Json -Depth 5 -Compress)
  Step 'place order' $true $order.order_id
} catch { Step 'place order' ($false) (Get-ErrBody $_); $results; exit 1 }
$orderId = $order.order_id

# stock decremented?
$p1 = Invoke-RestMethod -Uri "$SU/rest/v1/product?select=stock_quantity&prod_id=eq.$prodId" -Headers @{ apikey = $SK; Authorization = "Bearer $SK" }
Step 'stock decrement' ([int]$p1[0].stock_quantity -eq ($stock0 - 1)) "$($p1[0].stock_quantity) (want $($stock0-1))"

# â”€â”€ 5. GET orders includes prod_id + feedback field â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$myOrders = Invoke-RestMethod -Uri "$base/api/orders" -Headers $authH
$o = $myOrders.items | Where-Object { $_.order_id -eq $orderId } | Select-Object -First 1
Step 'orders has prod_id' ([bool]$o.items[0].prod_id) $o.items[0].prod_id
Step 'orders has feedback field' ($null -ne $o.feedback) "count=$(@($o.feedback).Count)"

# â”€â”€ 6. feedback: fresh insert, upsert update, validation, ownership â”€â”€â”€â”€â”€â”€
try {
  $fb = Invoke-RestMethod -Uri "$base/api/feedback" -Method Post -Headers $authH -ContentType 'application/json' `
    -Body (@{ orderId = $orderId; items = @(@{ prodId = $prodId; rating = 5; comments = 'Probe five stars' }) } | ConvertTo-Json -Depth 5 -Compress)
  Step 'feedback insert' ($fb.inserted -eq 1 -and $fb.updated -eq 0) "inserted=$($fb.inserted) updated=$($fb.updated)"
} catch { Step 'feedback insert' ($false) (Get-ErrBody $_) }
try {
  $fb2 = Invoke-RestMethod -Uri "$base/api/feedback" -Method Post -Headers $authH -ContentType 'application/json' `
    -Body (@{ orderId = $orderId; items = @(@{ prodId = $prodId; rating = 4; comments = 'Changed my mind' }) } | ConvertTo-Json -Depth 5 -Compress)
  Step 'feedback upsert update' ($fb2.inserted -eq 0 -and $fb2.updated -eq 1) "inserted=$($fb2.inserted) updated=$($fb2.updated)"
} catch { Step 'feedback upsert update' ($false) (Get-ErrBody $_) }

$fbList = Invoke-RestMethod -Uri "$base/api/feedback?orderId=$orderId" -Headers $authH
Step 'feedback GET rating=4' (@($fbList.items).Count -eq 1 -and [int]$fbList.items[0].rating -eq 4) "count=$(@($fbList.items).Count)"

# negative: rating 0
try {
  Invoke-RestMethod -Uri "$base/api/feedback" -Method Post -Headers $authH -ContentType 'application/json' `
    -Body (@{ orderId = $orderId; items = @(@{ prodId = $prodId; rating = 0 }) } | ConvertTo-Json -Depth 5 -Compress)
  Step 'feedback rejects rating 0' $false 'got 2xx'
} catch { Step 'feedback rejects rating 0' ($_.Exception.Response.StatusCode.value__ -eq 400) $_.Exception.Response.StatusCode.value__ }

# negative: not my order (random uuid)
$foreign = [guid]::NewGuid().ToString()
try {
  Invoke-RestMethod -Uri "$base/api/feedback" -Method Post -Headers $authH -ContentType 'application/json' `
    -Body (@{ orderId = $foreign; items = @(@{ prodId = $prodId; rating = 5 }) } | ConvertTo-Json -Depth 5 -Compress)
  Step 'feedback rejects foreign order' $false 'got 2xx'
} catch { Step 'feedback rejects foreign order' ($_.Exception.Response.StatusCode.value__ -eq 404) $_.Exception.Response.StatusCode.value__ }

# orders now shows the saved review
$myOrders2 = Invoke-RestMethod -Uri "$base/api/orders" -Headers $authH
$o2 = $myOrders2.items | Where-Object { $_.order_id -eq $orderId } | Select-Object -First 1
Step 'orders embeds feedback' (@($o2.feedback).Count -eq 1 -and [int]$o2.feedback[0].rating -eq 4) "count=$(@($o2.feedback).Count)"

# â”€â”€ 7. support flow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
try {
  $sup = Invoke-RestMethod -Uri "$base/api/support" -Method Post -Headers $authH -ContentType 'application/json' `
    -Body (@{ message = 'My order is taking long, can you check?' } | ConvertTo-Json -Compress)
  Step 'support POST' ([bool]$sup.item.support_id) $sup.item.support_id
  $supId = $sup.item.support_id
} catch { Step 'support POST' ($false) (Get-ErrBody $_); $supId = $null }
try {
  Invoke-RestMethod -Uri "$base/api/support" -Method Post -Headers $authH -ContentType 'application/json' -Body (@{ message = '' } | ConvertTo-Json -Compress)
  Step 'support rejects empty' $false 'got 2xx'
} catch { Step 'support rejects empty' ($_.Exception.Response.StatusCode.value__ -eq 400) $_.Exception.Response.StatusCode.value__ }
$supList = Invoke-RestMethod -Uri "$base/api/support" -Headers $authH
Step 'support GET own' (@($supList.items).Count -eq 1) "count=$(@($supList.items).Count)"

# second message replaces the single-row thread (support_id = user uid, PK)
try {
  $sup2 = Invoke-RestMethod -Uri "$base/api/support" -Method Post -Headers $authH -ContentType 'application/json' `
    -Body (@{ message = 'Follow-up: the box arrived damaged' } | ConvertTo-Json -Compress)
  Step 'support replace thread' ($sup2.item.support_id -eq $uid -and $sup2.item.message -like 'Follow-up*') "replaced=$($sup2.replaced)"
} catch { Step 'support replace thread' ($false) (Get-ErrBody $_) }
$supList2 = Invoke-RestMethod -Uri "$base/api/support" -Headers $authH
Step 'support GET single thread' (@($supList2.items).Count -eq 1 -and $supList2.items[0].message -like 'Follow-up*') "count=$(@($supList2.items).Count)"

# ── Phase 5: storefront content endpoint (public, seeded from today's content) ──
try {
  $sc = Invoke-RestMethod -Uri "$base/api/site-content"
  if ($sc.seeded) {
    Step 'content: endpoint serves seeded rows' (([int]@($sc.banners).Count -eq 5) -and ([int]@($sc.nav.navbar).Count -eq 7) -and ([int]@($sc.nav.footer_social).Count -eq 2)) "hero=$(@($sc.banners).Count) navbar=$(@($sc.nav.navbar).Count) social=$(@($sc.nav.footer_social).Count)"
    Step 'content: drafts stay hidden' (@($sc.sections).Count -eq 0) "published=$(@($sc.sections).Count)"
  } else {
    Step 'content: endpoint serves seeded rows' $false 'tables not seeded yet' 'SKIP'
    Step 'content: drafts stay hidden' $false 'tables not seeded yet' 'SKIP'
  }
} catch { Step 'content: endpoint serves seeded rows' $false (Get-ErrBody $_) ; Step 'content: drafts stay hidden' $false 'previous step failed' 'SKIP' }

# banner events are anonymous and best-effort: a bad id must be rejected,
# a good id must be accepted quietly
try {
  Invoke-RestMethod -Uri "$base/api/site-content/events" -Method Post -ContentType 'application/json' -Body (@{ bannerId = 'not-a-uuid'; event = 'impression' } | ConvertTo-Json -Compress) | Out-Null
  Step 'content: rejects malformed banner event' $false 'got 2xx'
} catch { Step 'content: rejects malformed banner event' ($_.Exception.Response.StatusCode.value__ -eq 400) $_.Exception.Response.StatusCode.value__ }
if ($sc -and $sc.seeded -and @($sc.banners).Count -gt 0) {
  try {
    $evBanner = $sc.banners[0].id
    $impBefore = (Invoke-RestMethod -Uri "$SU/rest/v1/site_banners?id=eq.$evBanner&select=impressions" -Headers @{ apikey = $SK; Authorization = "Bearer $SK" }).impressions
    Invoke-RestMethod -Uri "$base/api/site-content/events" -Method Post -ContentType 'application/json' `
      -Body (@{ bannerId = $evBanner; event = 'impression' } | ConvertTo-Json -Compress) | Out-Null
    Start-Sleep -Milliseconds 800
    $impAfter = (Invoke-RestMethod -Uri "$SU/rest/v1/site_banners?id=eq.$evBanner&select=impressions" -Headers @{ apikey = $SK; Authorization = "Bearer $SK" }).impressions
    Step 'content: banner counter increments' ([int]$impAfter -eq [int]$impBefore + 1) "$impBefore -> $impAfter"
  } catch { Step 'content: banner counter increments' $false (Get-ErrBody $_) }
} else {
  Step 'content: banner counter increments' $false 'no seeded banners' 'SKIP'
}

# â”€â”€ 8. admin supports list (escalate temp user) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$prof = Invoke-RestMethod -Uri "$SU/rest/v1/profiles?id=eq.$uid&select=id,role" -Headers @{ apikey = $SK; Authorization = "Bearer $SK" }
if (@($prof).Count -eq 0) {
  try {
    Invoke-RestMethod -Uri "$SU/rest/v1/profiles" -Method Post -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } -ContentType 'application/json' `
      -Body (@{ id = $uid; role = 'user' } | ConvertTo-Json -Compress) | Out-Null
    Step 'profiles row created' $true
  } catch { Step 'profiles row created' ($false) (Get-ErrBody $_) }
} else { Step 'profiles row exists' $true $prof[0].role }
Invoke-RestMethod -Uri "$SU/rest/v1/profiles?id=eq.$uid" -Method Patch -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } -ContentType 'application/json' `
  -Body (@{ role = 'admin' } | ConvertTo-Json -Compress) | Out-Null

try {
  $adminSup = Invoke-RestMethod -Uri "$base/api/admin/supports?pageSize=100" -Headers $authH
  $mine = $adminSup.items | Where-Object { $_.support_id -eq $supId }
  Step 'admin supports GET' (($adminSup.total -ge 1) -and [bool]$mine) "total=$($adminSup.total)"
} catch { Step 'admin supports GET' ($false) (Get-ErrBody $_) }

# PATCH reply must hit step-up gate (403 without re-auth) â€” expected block
try {
  Invoke-RestMethod -Uri "$base/api/admin/supports/$supId" -Method Patch -Headers $authH -ContentType 'application/json' `
    -Body (@{ response = 'We are checking your order now.' } | ConvertTo-Json -Compress)
  Step 'admin reply hits step-up gate' $false 'got 2xx without password re-auth'
} catch { Step 'admin reply hits step-up gate (403 expected)' ($_.Exception.Response.StatusCode.value__ -eq 403) $_.Exception.Response.StatusCode.value__ }

# full step-up round-trip with the temp user's own password (closes the write-path gap)
try {
  $stepUpRes = Invoke-RestMethod -Uri "$base/api/auth/step-up" -Method Post -Headers $authH -ContentType 'application/json' `
    -Body (@{ password = $pw } | ConvertTo-Json -Compress)
  Step 'step-up issues token' ([bool]$stepUpRes.stepUpToken) "expiresAt=$($stepUpRes.expiresAt)"
  $stepUpH = @{ Authorization = "Bearer $AT"; 'X-Step-Up-Token' = $stepUpRes.stepUpToken }
} catch {
  # the step-up endpoint is rate limited (5 / 15 min / IP) - a re-run inside that
  # window is an environment limit, not a product failure, so report it as skipped
  $st = $_.Exception.Response.StatusCode.value__
  if ($st -eq 429) { Step 'step-up issues token' $false 'rate limited by an earlier run in the 15-minute window' 'SKIP' }
  else { Step 'step-up issues token' $false (Get-ErrBody $_) }
  $stepUpH = $null
}
try {
  Invoke-RestMethod -Uri "$base/api/auth/step-up" -Method Post -Headers $authH -ContentType 'application/json' `
    -Body (@{ password = 'WrongPassword!123' } | ConvertTo-Json -Compress) | Out-Null
  Step 'step-up rejects wrong password' $false 'got 2xx'
} catch {
  # 401 = wrong password refused; 429 = refused by the brute-force limiter. Both
  # mean no token was issued, which is the security property under test.
  $st = $_.Exception.Response.StatusCode.value__
  Step 'step-up rejects wrong password' ($st -eq 401 -or $st -eq 429) $st
}
if ($stepUpH) {
  try {
    $reply = Invoke-RestMethod -Uri "$base/api/admin/supports/$supId" -Method Patch -Headers $stepUpH -ContentType 'application/json' `
      -Body (@{ response = 'We are checking your order now.' } | ConvertTo-Json -Compress)
    Step 'admin reply succeeds with step-up' ([bool]$reply.item.support_id) $reply.item.support_id
  } catch { Step 'admin reply succeeds with step-up' $false (Get-ErrBody $_) }
  try {
    $supCheck = Invoke-RestMethod -Uri "$base/api/support" -Headers $authH
    Step 'step-up reply persisted' ($supCheck.items[0].response -eq 'We are checking your order now.') "response=$($supCheck.items[0].response)"
  } catch { Step 'step-up reply persisted' $false (Get-ErrBody $_) }
} else {
  Step 'admin reply succeeds with step-up' $false 'skipped: step-up was rate limited' 'SKIP'
  Step 'step-up reply persisted' $false 'skipped: step-up was rate limited' 'SKIP'
}

# stats/customers sanity with escalated admin (no step-up on GET)
try {
  $stats = Invoke-RestMethod -Uri "$base/api/admin/stats" -Headers $authH
  Step 'admin stats GET' ([int]$stats.totalUsers -gt 0) "users=$($stats.totalUsers) sales=$($stats.totalSales)"
} catch { Step 'admin stats GET' ($false) (Get-ErrBody $_) }

# product information sections: create with sections, read back, validate, clean up
# (all non-GET admin routes sit behind the step-up gate, so writes use $stepUpH)
$probeId = $null
if (-not $stepUpH) {
  Step 'details: admin create with sections' $false 'skipped: step-up was rate limited' 'SKIP'
} else {
  try {
    $probeName = "E2E Info Probe $([guid]::NewGuid().ToString('N').Substring(0,6))"
    $probeBody = @{
      prod_name      = $probeName
      category       = 'Dogs - DRY'
      price          = 1
      stock_quantity = 1
      is_active      = $true
      description    = 'Short summary.'
      details        = @(
        @{ label = 'Product Info';  content = 'Complete and balanced.' }
        @{ label = 'Feeding Guide'; content = "Body Weight | Amount`n2-5 | 50-95" }
      )
    } | ConvertTo-Json -Depth 5 -Compress
    $probe = Invoke-RestMethod -Uri "$base/api/admin/products" -Method Post -Headers $stepUpH -ContentType 'application/json' -Body $probeBody
    $probeId = $probe.item.prod_id
    Step 'details: admin create with sections' ([bool]$probeId) $probeId
  } catch { Step 'details: admin create with sections' $false "$($_.Exception.Response.StatusCode.value__)" }
}

if ($probeId) {
  # the public detail endpoint needs no auth at all
  try {
    $pd = Invoke-RestMethod -Uri "$base/api/products/$probeId"
    Step 'details: public detail returns sections' (@($pd.item.details).Count -eq 2) "count=$(@($pd.item.details).Count)"
    Step 'details: table row content survives' ($pd.item.details[1].content -like '*Body Weight*') (($pd.item.details[1].content) -replace "`n", ' / ')
    Step 'details: related array present' ($null -ne $pd.related) "count=$(@($pd.related).Count)"
    Step 'details: description still returned' ($pd.item.description -eq 'Short summary.') $pd.item.description
  } catch { Step 'details: public detail returns sections' $false "$($_.Exception.Response.StatusCode.value__)" }

  # invalid payloads must be rejected before anything is written
  try {
    Invoke-RestMethod -Uri "$base/api/admin/products/$probeId" -Method Patch -Headers $stepUpH -ContentType 'application/json' `
      -Body (@{ details = 'not a list' } | ConvertTo-Json -Compress)
    Step 'details: rejects non-array' $false 'got 2xx'
  } catch { Step 'details: rejects non-array' ($_.Exception.Response.StatusCode.value__ -eq 400) $_.Exception.Response.StatusCode.value__ }

  try {
    Invoke-RestMethod -Uri "$base/api/admin/products/$probeId" -Method Patch -Headers $stepUpH -ContentType 'application/json' `
      -Body (@{ details = @(@{ label = '   '; content = 'orphan' }) } | ConvertTo-Json -Depth 5 -Compress)
    Step 'details: rejects label-less section' $false 'got 2xx'
  } catch { Step 'details: rejects label-less section' ($_.Exception.Response.StatusCode.value__ -eq 400) $_.Exception.Response.StatusCode.value__ }

  try {
    Invoke-RestMethod -Uri "$base/api/admin/products/$probeId" -Method Patch -Headers $stepUpH -ContentType 'application/json' `
      -Body (@{ details = @() } | ConvertTo-Json -Compress) | Out-Null
    $cleared = Invoke-RestMethod -Uri "$base/api/products/$probeId"
    Step 'details: empty list clears sections' ($null -eq $cleared.item.details) "details=$($cleared.item.details)"
  } catch { Step 'details: empty list clears sections' $false "$($_.Exception.Response.StatusCode.value__)" }
}


# ── Phase 2: costings, archive, price history ──────────────────────────────
# M2 (owner-run migration) adds cost_price/supplier/archived_at + the history
# table. Pre-migration runs must stay green: probe the schema once, then SKIP
# the dependent steps with an explicit reason.
$m2Ready = $false
$m2Reason = 'M2 migration not applied yet (owner pending)'
try {
  Invoke-RestMethod -Uri "$base/api/admin/products?archived=true&pageSize=1" -Headers $authH | Out-Null
  $m2Ready = $true
  Step 'costing: M2 schema present' $true 'archived=true query accepted'
} catch {
  $st = $_.Exception.Response.StatusCode.value__
  $m2Body = Get-ErrBody $_
  if ($st -eq 503 -and $m2Body -like '*MIGRATION_REQUIRED*') { Step 'costing: M2 schema present' $false $m2Reason 'SKIP' }
  else { Step 'costing: M2 schema present' $false "$st $m2Body" }
}

# M3 (owner-run migration) adds unit_price/unit_cost/discount_amount snapshots
# on order_details. Probe once via the service key; skip dependent steps pre-M3.
$m3Ready = $false
$m3Reason = 'M3 migration not applied yet (owner pending)'
try {
  Invoke-RestMethod -Uri "$SU/rest/v1/order_details?select=unit_price&limit=1" -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
  $m3Ready = $true
  Step 'ordercost: M3 schema present' $true 'order_details.unit_price selectable'
} catch {
  $m3Body = Get-ErrBody $_
  if ($m3Body -like '*unit_price*' -or $m3Body -like '*PGRST204*' -or $m3Body -like '*does not exist*') {
    Step 'ordercost: M3 schema present' $false $m3Reason 'SKIP'
  } else { Step 'ordercost: M3 schema present' $false $m3Body }
}

if ($probeId) {
  # admin writes cost + supplier, then reads them back from the admin list
  if (-not $stepUpH) { Step 'costing: admin writes cost and supplier' $false 'skipped: step-up was rate limited' 'SKIP' }
  elseif (-not $m2Ready) { Step 'costing: admin writes cost and supplier' $false $m2Reason 'SKIP' }
  else {
    try {
      Invoke-RestMethod -Uri "$base/api/admin/products/$probeId" -Method Patch -Headers $stepUpH -ContentType 'application/json' `
        -Body (@{ cost_price = 5.5; supplier = 'E2E Supplier' } | ConvertTo-Json -Compress) | Out-Null
      $adm = Invoke-RestMethod -Uri "$base/api/admin/products?q=$([uri]::EscapeDataString($probeName))&pageSize=5" -Headers $authH
      $row = $adm.items | Where-Object { $_.prod_id -eq $probeId } | Select-Object -First 1
      $costOk = ([math]::Abs([double]$row.cost_price - 5.5) -lt 0.001) -and ($row.supplier -eq 'E2E Supplier')
      Step 'costing: admin writes cost and supplier' $costOk "cost=$($row.cost_price) supplier=$($row.supplier)"
    } catch { Step 'costing: admin writes cost and supplier' $false (Get-ErrBody $_) }
  }

  # costing fields must never reach an unauthenticated caller (also true pre-M2)
  try {
    $pub = Invoke-RestMethod -Uri "$base/api/products/$probeId"
    $leaks = ($null -ne $pub.item.cost_price) -or ($null -ne $pub.item.supplier)
    Step 'costing: public detail hides cost' (-not $leaks) "cost leaked=$($null -ne $pub.item.cost_price)"
  } catch { Step 'costing: public detail hides cost' $false (Get-ErrBody $_) }

  # validation runs before any DB access, so this holds with or without M2
  if (-not $stepUpH) { Step 'costing: rejects negative cost' $false 'skipped: step-up was rate limited' 'SKIP' }
  else {
    try {
      Invoke-RestMethod -Uri "$base/api/admin/products/$probeId" -Method Patch -Headers $stepUpH -ContentType 'application/json' `
        -Body (@{ cost_price = -1 } | ConvertTo-Json -Compress) | Out-Null
      Step 'costing: rejects negative cost' $false 'got 2xx'
    } catch { Step 'costing: rejects negative cost' ($_.Exception.Response.StatusCode.value__ -eq 400) $_.Exception.Response.StatusCode.value__ }
  }

  # price changes land in product_price_history (create records null -> price)
  if (-not $stepUpH) { Step 'costing: price history records changes' $false 'skipped: step-up was rate limited' 'SKIP' }
  elseif (-not $m2Ready) { Step 'costing: price history records changes' $false $m2Reason 'SKIP' }
  else {
    try {
      Invoke-RestMethod -Uri "$base/api/admin/products/$probeId" -Method Patch -Headers $stepUpH -ContentType 'application/json' `
        -Body (@{ price = 2 } | ConvertTo-Json -Compress) | Out-Null
      $hist = Invoke-RestMethod -Uri "$base/api/admin/products/$probeId/price-history" -Headers $authH
      $histItems = @($hist.items)
      $changed = @($histItems | Where-Object { $null -ne $_.old_price -and [double]$_.old_price -eq 1 -and [double]$_.new_price -eq 2 }).Count
      Step 'costing: price history records changes' (($histItems.Count -ge 2) -and ($changed -ge 1)) "count=$($histItems.Count) changed=$changed"
    } catch { Step 'costing: price history records changes' $false (Get-ErrBody $_) }
  }

  # Phase 3: order the probe (price=2, cost=5.5 from the steps above) and check
  # the sale-time snapshot + admin margin + SQL/JS parity. Runs before the
  # archive steps so the probe is still active and purchasable.
  $order3Id = $null
  if (-not $stepUpH) {
    Step 'ordercost: checkout snapshots price and cost' $false 'skipped: step-up was rate limited' 'SKIP'
    Step 'ordercost: admin order shows margin' $false 'skipped: step-up was rate limited' 'SKIP'
    Step 'ordercost: SQL effective_price matches API' $false 'skipped: step-up was rate limited' 'SKIP'
    Step 'ordercost: user history hides cost' $false 'skipped: step-up was rate limited' 'SKIP'
  } elseif (-not $m3Ready) {
    Step 'ordercost: checkout snapshots price and cost' $false $m3Reason 'SKIP'
    Step 'ordercost: admin order shows margin' $false $m3Reason 'SKIP'
    Step 'ordercost: SQL effective_price matches API' $false $m3Reason 'SKIP'
    Step 'ordercost: user history hides cost' $false $m3Reason 'SKIP'
  } else {
    try {
      $o3 = Invoke-RestMethod -Uri "$base/api/orders" -Method Post -Headers $authH -ContentType 'application/json' `
        -Body (@{ items = @(@{ productId = $probeId; quantity = 1 }); paymentMethod = 'GCash'; shippingFee = 75; customerName = 'E2E Phase3'; phone = '09171234567'; address = '1 Test Street' } | ConvertTo-Json -Depth 5 -Compress)
      $order3Id = $o3.order_id
      $o3det = Invoke-RestMethod -Uri "$SU/rest/v1/order_details?order_id=eq.$order3Id&select=unit_price,unit_cost,discount_amount,subtotal,quantity" -Headers @{ apikey = $SK; Authorization = "Bearer $SK" }
      $d3 = $o3det[0]
      $snapOk = ([double]$d3.unit_price -eq 2) -and ([double]$d3.unit_cost -eq 5.5) -and ([double]$d3.discount_amount -eq 0) -and ([double]$d3.subtotal -eq 2)
      Step 'ordercost: checkout snapshots price and cost' $snapOk "price=$($d3.unit_price) cost=$($d3.unit_cost) disc=$($d3.discount_amount) sub=$($d3.subtotal)"
    } catch { Step 'ordercost: checkout snapshots price and cost' $false (Get-ErrBody $_) }

    if ($order3Id) {
      try {
        $aOrders = Invoke-RestMethod -Uri "$base/api/admin/orders?pageSize=20" -Headers $authH
        $o3line = $null
        foreach ($ao in $aOrders.items) { if ($ao.order_id -eq $order3Id) { $o3line = $ao.items[0]; break } }
        $marginOk = $o3line -and ([double]$o3line.unit_cost -eq 5.5) -and ([double]$o3line.effective_unit_price -eq 2) -and ([double]$o3line.line_margin -eq -3.5)
        Step 'ordercost: admin order shows margin' $marginOk "cost=$($o3line.unit_cost) eff=$($o3line.effective_unit_price) margin=$($o3line.line_margin)"
      } catch { Step 'ordercost: admin order shows margin' $false (Get-ErrBody $_) }

      try {
        $o3row = Invoke-RestMethod -Uri "$SU/rest/v1/order_details?order_id=eq.$order3Id&select=order_id,prod_id,quantity,subtotal,unit_price,unit_cost,discount_amount" -Headers @{ apikey = $SK; Authorization = "Bearer $SK" }
        $rpcEff = Invoke-RestMethod -Uri "$SU/rest/v1/rpc/effective_price" -Method Post -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } -ContentType 'application/json' `
          -Body (@{ od = $o3row[0] } | ConvertTo-Json -Depth 5 -Compress)
        $apiEff = $o3line.effective_unit_price
        Step 'ordercost: SQL effective_price matches API' ([double]$rpcEff -eq [double]$apiEff) "sql=$rpcEff api=$apiEff"
      } catch { Step 'ordercost: SQL effective_price matches API' $false (Get-ErrBody $_) }

      # customer order history must never carry costing fields
      try {
        $uHist = Invoke-RestMethod -Uri "$base/api/orders" -Headers $authH
        $u3 = $null
        foreach ($uo in $uHist.items) { if ($uo.order_id -eq $order3Id) { $u3 = $uo.items[0]; break } }
        $userLeak = $u3 -and ($null -ne $u3.unit_cost -or $null -ne $u3.line_margin)
        Step 'ordercost: user history hides cost' (-not $userLeak) "found=$($null -ne $u3)"
      } catch { Step 'ordercost: user history hides cost' $false (Get-ErrBody $_) }
    } else {
      Step 'ordercost: admin order shows margin' $false 'order was not created'
      Step 'ordercost: SQL effective_price matches API' $false 'order was not created'
      Step 'ordercost: user history hides cost' $false 'order was not created'
    }
  }

  # Phase 4: promos - create a percent code, apply it at checkout, verify the
  # per-line discount snapshot, the admin view, and the per-user limit. Runs
  # before the archive steps: the probe must still be active and purchasable.
  $promoReady = $false
  $promoReason = ''
  try {
    Invoke-RestMethod -Uri "$SU/rest/v1/promos?limit=1" -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
    $promoReady = $true
    Step 'promo: M4 schema present' $true 'promos table queryable'
  } catch {
    $promoReason = "$($_.Exception.Response.StatusCode.value__) $(Get-ErrBody $_)"
    Step 'promo: M4 schema present' $false $promoReason 'SKIP'
  }

  $order4Id = $null
  $promoCode = "E2E$([guid]::NewGuid().ToString('N').Substring(0,6).ToUpper())"
  if (-not $stepUpH) {
    Step 'promo: admin creates percent code' $false 'skipped: step-up was rate limited' 'SKIP'
    Step 'promo: validate-promo returns discount' $false 'skipped: step-up was rate limited' 'SKIP'
    Step 'promo: validate rejects unknown code' $false 'skipped: step-up was rate limited' 'SKIP'
    Step 'promo: checkout applies discount' $false 'skipped: step-up was rate limited' 'SKIP'
    Step 'promo: discount snapshot on line' $false 'skipped: step-up was rate limited' 'SKIP'
    Step 'promo: admin order shows discount' $false 'skipped: step-up was rate limited' 'SKIP'
    Step 'promo: per-user limit blocks reuse' $false 'skipped: step-up was rate limited' 'SKIP'
  } elseif (-not $promoReady) {
    Step 'promo: admin creates percent code' $false $promoReason 'SKIP'
    Step 'promo: validate-promo returns discount' $false $promoReason 'SKIP'
    Step 'promo: validate rejects unknown code' $false $promoReason 'SKIP'
    Step 'promo: checkout applies discount' $false $promoReason 'SKIP'
    Step 'promo: discount snapshot on line' $false $promoReason 'SKIP'
    Step 'promo: admin order shows discount' $false $promoReason 'SKIP'
    Step 'promo: per-user limit blocks reuse' $false $promoReason 'SKIP'
  } else {
    try {
      $promoBody = @{
        code = $promoCode; type = 'percent'; value = 50; scope = 'sitewide'
        min_subtotal = 0; per_user_limit = 1; usage_limit = 100; is_active = $true
      }
      Invoke-RestMethod -Uri "$base/api/admin/promos" -Method Post -Headers $stepUpH -ContentType 'application/json' `
        -Body ($promoBody | ConvertTo-Json -Depth 5 -Compress) | Out-Null
      Step 'promo: admin creates percent code' $true $promoCode
    } catch { Step 'promo: admin creates percent code' $false (Get-ErrBody $_) }

    # price the probe at 200 so a 50% code is a clean 100 off; Phase 3 left it
    # with 1 unit of stock, so restock to 10 for this order
    try {
      Invoke-RestMethod -Uri "$base/api/admin/products/$probeId" -Method Patch -Headers $stepUpH -ContentType 'application/json' `
        -Body (@{ price = 200; stock_quantity = 10 } | ConvertTo-Json -Compress) | Out-Null
      Step 'promo: probe repriced and restocked' $true 'price=200 stock=10'
    } catch { Step 'promo: probe repriced and restocked' $false (Get-ErrBody $_) }

    if ($stepUpH) {
      try {
        $vp = Invoke-RestMethod -Uri "$base/api/orders/validate-promo" -Method Post -Headers $authH -ContentType 'application/json' `
          -Body (@{ items = @(@{ productId = $probeId; quantity = 1 }); promo_code = $promoCode } | ConvertTo-Json -Depth 5 -Compress)
        Step 'promo: validate-promo returns discount' ([double]$vp.discount -gt 0) "discount=$($vp.discount)"
      } catch { Step 'promo: validate-promo returns discount' $false (Get-ErrBody $_) }

      try {
        Invoke-RestMethod -Uri "$base/api/orders/validate-promo" -Method Post -Headers $authH -ContentType 'application/json' `
          -Body (@{ items = @(@{ productId = $probeId; quantity = 1 }); promo_code = 'NOSUCHCODE' } | ConvertTo-Json -Depth 5 -Compress) | Out-Null
        Step 'promo: validate rejects unknown code' $false 'got 2xx'
      } catch { Step 'promo: validate rejects unknown code' ($_.Exception.Response.StatusCode.value__ -eq 400) $_.Exception.Response.StatusCode.value__ }
    }

    try {
      $o4 = Invoke-RestMethod -Uri "$base/api/orders" -Method Post -Headers $authH -ContentType 'application/json' `
        -Body (@{ items = @(@{ productId = $probeId; quantity = 1 }); paymentMethod = 'GCash'; shippingFee = 75; customerName = 'E2E Phase4'; phone = '09171234567'; address = '1 Test Street'; promo_code = $promoCode } | ConvertTo-Json -Depth 5 -Compress)
      $order4Id = $o4.order_id
      $totalOk = ([double]$o4.total_amount -eq 175)   # 75 shipping + 200 subtotal - 100 promo
      Step 'promo: checkout applies discount' $totalOk "total=$($o4.total_amount) (want 175)"
    } catch { Step 'promo: checkout applies discount' $false (Get-ErrBody $_) }

    if ($order4Id) {
      try {
        $o4det = Invoke-RestMethod -Uri "$SU/rest/v1/order_details?order_id=eq.$order4Id&select=unit_price,discount_amount,subtotal" -Headers @{ apikey = $SK; Authorization = "Bearer $SK" }
        $d4 = $o4det[0]
        Step 'promo: discount snapshot on line' ([double]$d4.discount_amount -eq 100) "disc=$($d4.discount_amount)"
      } catch { Step 'promo: discount snapshot on line' $false (Get-ErrBody $_) }

      try {
        $aOrders4 = Invoke-RestMethod -Uri "$base/api/admin/orders?pageSize=20" -Headers $authH
        $o4line = $null
        foreach ($ao in $aOrders4.items) { if ($ao.order_id -eq $order4Id) { $o4line = $ao.items[0]; break } }
        $o4Ok = $o4line -and ([double]$o4line.discount_amount -eq 100) -and ([double]$o4line.effective_unit_price -eq 100)
        Step 'promo: admin order shows discount' $o4Ok "disc=$($o4line.discount_amount) eff=$($o4line.effective_unit_price)"
      } catch { Step 'promo: admin order shows discount' $false (Get-ErrBody $_) }

      # per_user_limit = 1: the same account cannot redeem the code twice
      try {
        Invoke-RestMethod -Uri "$base/api/orders" -Method Post -Headers $authH -ContentType 'application/json' `
          -Body (@{ items = @(@{ productId = $probeId; quantity = 1 }); paymentMethod = 'GCash'; shippingFee = 75; customerName = 'E2E Phase4 Again'; phone = '09171234567'; address = '1 Test Street'; promo_code = $promoCode } | ConvertTo-Json -Depth 5 -Compress) | Out-Null
        Step 'promo: per-user limit blocks reuse' $false 'got 2xx'
      } catch { Step 'promo: per-user limit blocks reuse' ($_.Exception.Response.StatusCode.value__ -eq 400) (Get-ErrBody $_) }
    } else {
      Step 'promo: discount snapshot on line' $false 'order was not created'
      Step 'promo: admin order shows discount' $false 'order was not created'
      Step 'promo: per-user limit blocks reuse' $false 'order was not created'
    }

    # the probe promo is always removed, with its usage rows
    try {
      Invoke-RestMethod -Uri "$base/api/admin/promos/$promoCode" -Method Delete -Headers $stepUpH | Out-Null
      $promoGone = Invoke-RestMethod -Uri "$SU/rest/v1/promos?code=eq.$promoCode&select=code" -Headers @{ apikey = $SK; Authorization = "Bearer $SK" }
      Step 'promo: probe promo deleted' (@($promoGone).Count -eq 0) $promoCode
    } catch { Step 'promo: probe promo deleted' $false (Get-ErrBody $_) }
  }

  # archive roundtrip: leaves the public store, shows under archived=true,
  # comes back under archived=false after restore (restore keeps it hidden
  # from shoppers - is_active stays false - which is the intended behavior)
  if (-not $stepUpH) {
    Step 'archive: product hidden from public store' $false 'skipped: step-up was rate limited' 'SKIP'
    Step 'archive: admin archived filter roundtrip' $false 'skipped: step-up was rate limited' 'SKIP'
  } elseif (-not $m2Ready) {
    Step 'archive: product hidden from public store' $false $m2Reason 'SKIP'
    Step 'archive: admin archived filter roundtrip' $false $m2Reason 'SKIP'
  } else {
    $archPublicOk = $false
    $archFilterOk = $false
    $archErr = ''
    $probeArchived = $false
    try {
      Invoke-RestMethod -Uri "$base/api/admin/products/$probeId" -Method Patch -Headers $stepUpH -ContentType 'application/json' `
        -Body (@{ archived = $true } | ConvertTo-Json -Compress) | Out-Null
      $probeArchived = $true
      try {
        Invoke-RestMethod -Uri "$base/api/products/$probeId" | Out-Null
        $archErr = 'public detail still returned the archived product'
      } catch { $archPublicOk = ($_.Exception.Response.StatusCode.value__ -eq 404) }
      $archQ = [uri]::EscapeDataString($probeName)
      $inArch = Invoke-RestMethod -Uri "$base/api/admin/products?archived=true&q=$archQ&pageSize=5" -Headers $authH
      $archRow = $inArch.items | Where-Object { $_.prod_id -eq $probeId } | Select-Object -First 1
      Invoke-RestMethod -Uri "$base/api/admin/products/$probeId" -Method Patch -Headers $stepUpH -ContentType 'application/json' `
        -Body (@{ archived = $false } | ConvertTo-Json -Compress) | Out-Null
      $probeArchived = $false
      $stillArch = Invoke-RestMethod -Uri "$base/api/admin/products?archived=true&q=$archQ&pageSize=5" -Headers $authH
      $backList = Invoke-RestMethod -Uri "$base/api/admin/products?archived=false&q=$archQ&pageSize=5" -Headers $authH
      $back = $backList.items | Where-Object { $_.prod_id -eq $probeId } | Select-Object -First 1
      $stillGone = @($stillArch.items | Where-Object { $_.prod_id -eq $probeId }).Count -eq 0
      $archFilterOk = ($null -ne $archRow) -and $stillGone -and ($null -ne $back) -and ($null -eq $back.archived_at)
      if (-not $archFilterOk -and -not $archErr) { $archErr = 'archived=true/false filter mismatch after roundtrip' }
    } catch { $archErr = Get-ErrBody $_ }
    finally {
      # never leave the probe archived for later steps if a check blew up
      if ($probeArchived) {
        try {
          Invoke-RestMethod -Uri "$base/api/admin/products/$probeId" -Method Patch -Headers $stepUpH -ContentType 'application/json' `
            -Body (@{ archived = $false } | ConvertTo-Json -Compress) | Out-Null
        } catch { }
      }
    }
    Step 'archive: product hidden from public store' $archPublicOk $archErr
    Step 'archive: admin archived filter roundtrip' $archFilterOk $archErr
  }

  # an ordered product must refuse deletion with a friendly 409 (FK NO ACTION)
  if (-not $stepUpH) { Step 'delete: ordered product returns 409' $false 'skipped: step-up was rate limited' 'SKIP' }
  else {
    $delOk = $false
    $delErr = ''
    try {
      Invoke-RestMethod -Uri "$base/api/admin/products/$prodId" -Method Delete -Headers $stepUpH | Out-Null
      $delErr = 'got 2xx - the ordered product was deleted!'
    } catch {
      $delSt = $_.Exception.Response.StatusCode.value__
      $delBody = Get-ErrBody $_
      $delOk = ($delSt -eq 409) -and ($delBody -like '*HAS_ORDER_HISTORY*')
      if (-not $delOk) { $delErr = "$delSt $delBody" }
    }
    # zero-mutation check: the row must survive the refused delete
    if ($delOk) {
      try { Invoke-RestMethod -Uri "$base/api/products/$prodId" | Out-Null } catch { $delOk = $false; $delErr = 'product missing after refused delete' }
    }
    Step 'delete: ordered product returns 409' $delOk $delErr
  }
}


# ── 9. staff role: allowed reads vs admin-only reads ──
Invoke-RestMethod -Uri "$SU/rest/v1/profiles?id=eq.$uid" -Method Patch -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } -ContentType 'application/json' `
  -Body (@{ role = 'staff' } | ConvertTo-Json -Compress) | Out-Null

try {
  $me = Invoke-RestMethod -Uri "$base/api/me/role" -Headers $authH
  Step 'me/role reports staff' ($me.role -eq 'staff') "role=$($me.role)"
} catch { Step 'me/role reports staff' $false (Get-ErrBody $_) }

$staffAllowed = @('admin/orders?pageSize=1', 'admin/products?pageSize=1', 'admin/payments?pageSize=1', 'admin/supports?pageSize=1')
foreach ($ep in $staffAllowed) {
  try {
    Invoke-RestMethod -Uri "$base/api/$ep" -Headers $authH | Out-Null
    Step "staff GET $ep" $true
  } catch { Step "staff GET $ep" $false (Get-ErrBody $_) }
}

foreach ($ep in @('admin/stats', 'admin/customers?pageSize=1', 'admin/audit-logs')) {
  try {
    Invoke-RestMethod -Uri "$base/api/$ep" -Headers $authH | Out-Null
    Step "staff denied $ep" $false 'got 2xx'
  } catch { Step "staff denied $ep" ($_.Exception.Response.StatusCode.value__ -eq 403) $_.Exception.Response.StatusCode.value__ }
}

# Phase 2 staff boundaries: costing/lifecycle writes are admin-only; reads stay
# staff-legal (cost fields are stripped from every staff-facing product list)
if ($probeId) {
  try {
    $staffQ = [uri]::EscapeDataString($probeName)
    $slist = Invoke-RestMethod -Uri "$base/api/admin/products?q=$staffQ&pageSize=5" -Headers $authH
    $srow = $slist.items | Where-Object { $_.prod_id -eq $probeId } | Select-Object -First 1
    $staffLeak = ($null -ne $srow.cost_price) -or ($null -ne $srow.supplier)
    Step 'staff GET strips cost fields' (-not $staffLeak) "cost leaked=$($null -ne $srow.cost_price)"
  } catch { Step 'staff GET strips cost fields' $false (Get-ErrBody $_) }

  # Phase 3 staff boundary: order lines carry unit_cost/line_margin for admin
  # callers only - staff GET must not receive them
  if (-not $order3Id) { Step 'staff orders GET strips line cost' $false 'skipped: probe order was not created' 'SKIP' }
  elseif (-not $m3Ready) { Step 'staff orders GET strips line cost' $false $m3Reason 'SKIP' }
  else {
    try {
      $sOrders = Invoke-RestMethod -Uri "$base/api/admin/orders?pageSize=20" -Headers $authH
      $o3staff = $null
      foreach ($so in $sOrders.items) { if ($so.order_id -eq $order3Id) { $o3staff = $so.items[0]; break } }
      $orderLeak = $o3staff -and ($null -ne $o3staff.unit_cost -or $null -ne $o3staff.line_margin)
      Step 'staff orders GET strips line cost' (-not $orderLeak) "found=$($null -ne $o3staff)"
    } catch { Step 'staff orders GET strips line cost' $false (Get-ErrBody $_) }
  }

  # step-up header is still required to get past the router gate; the expected
  # failure is the route-level admin check, not STEP_UP_REQUIRED
  if (-not $stepUpH) { Step 'staff PATCH cost denied 403' $false 'skipped: step-up was rate limited' 'SKIP' }
  else {
    try {
      Invoke-RestMethod -Uri "$base/api/admin/products/$probeId" -Method Patch -Headers $stepUpH -ContentType 'application/json' `
        -Body (@{ cost_price = 9 } | ConvertTo-Json -Compress) | Out-Null
      Step 'staff PATCH cost denied 403' $false 'got 2xx'
    } catch {
      $spBody = Get-ErrBody $_
      Step 'staff PATCH cost denied 403' (($_.Exception.Response.StatusCode.value__ -eq 403) -and ($spBody -like '*Admin access required*')) $spBody
    }
  }

  if (-not $stepUpH) { Step 'staff POST product denied 403' $false 'skipped: step-up was rate limited' 'SKIP' }
  else {
    try {
      Invoke-RestMethod -Uri "$base/api/admin/products" -Method Post -Headers $stepUpH -ContentType 'application/json' `
        -Body (@{ prod_name = 'E2E Staff Must Not Create'; category = 'Dogs - DRY'; price = 1; stock_quantity = 1 } | ConvertTo-Json -Compress) | Out-Null
      Step 'staff POST product denied 403' $false 'got 2xx'
    } catch { Step 'staff POST product denied 403' ($_.Exception.Response.StatusCode.value__ -eq 403) $_.Exception.Response.StatusCode.value__ }
  }

  if (-not $stepUpH) { Step 'staff DELETE product denied 403' $false 'skipped: step-up was rate limited' 'SKIP' }
  else {
    try {
      Invoke-RestMethod -Uri "$base/api/admin/products/$probeId" -Method Delete -Headers $stepUpH | Out-Null
      Step 'staff DELETE product denied 403' $false 'got 2xx'
    } catch { Step 'staff DELETE product denied 403' ($_.Exception.Response.StatusCode.value__ -eq 403) $_.Exception.Response.StatusCode.value__ }
  }

  if (-not $m2Ready) { Step 'staff price-history readable' $false $m2Reason 'SKIP' }
  else {
    try {
      $sh = Invoke-RestMethod -Uri "$base/api/admin/products/$probeId/price-history" -Headers $authH
      Step 'staff price-history readable' ($null -ne $sh.items) "count=$(@($sh.items).Count)"
    } catch { Step 'staff price-history readable' $false (Get-ErrBody $_) }
  }
}

# media library helpers (shared by the staff denial checks and the admin flows)
$pngBytes = [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
$mediaId = $null
$mediaUploaded = $false
$crlf = "`r`n"

function Invoke-MediaUpload($altText) {
  $b = [guid]::NewGuid().ToString('N')
  $ms = New-Object System.IO.MemoryStream
  $w = { param($bytes) $ms.Write($bytes, 0, $bytes.Length) }
  $w.Invoke([Text.Encoding]::UTF8.GetBytes("--$b${crlf}Content-Disposition: form-data; name=`"altText`"$crlf$crlf$altText$crlf"))
  $w.Invoke([Text.Encoding]::UTF8.GetBytes("--$b${crlf}Content-Disposition: form-data; name=`"image`"; filename=`"e2e-probe.png`"${crlf}Content-Type: image/png$crlf$crlf"))
  $w.Invoke($pngBytes)
  $w.Invoke([Text.Encoding]::UTF8.GetBytes("$crlf--$b--$crlf"))
  Invoke-RestMethod -Uri "$base/api/admin/media" -Method Post -Headers $stepUpH `
    -ContentType "multipart/form-data; boundary=$b" -Body $ms.ToArray()
}

# media library is admin-only content: while the temp user is still staff,
# both the read and the write must be refused
try {
  Invoke-RestMethod -Uri "$base/api/admin/media?pageSize=1" -Headers $authH | Out-Null
  Step 'staff GET admin/media denied 403' $false 'got 2xx'
} catch { Step 'staff GET admin/media denied 403' ($_.Exception.Response.StatusCode.value__ -eq 403) $_.Exception.Response.StatusCode.value__ }
try {
  Invoke-MediaUpload 'Staff probe' | Out-Null
  Step 'staff POST admin/media denied 403' $false 'got 2xx'
} catch { Step 'staff POST admin/media denied 403' ($_.Exception.Response.StatusCode.value__ -eq 403) $_.Exception.Response.StatusCode.value__ }
try {
  Invoke-RestMethod -Uri "$base/api/admin/banners?pageSize=1" -Headers $authH | Out-Null
  Step 'staff GET admin/banners denied 403' $false 'got 2xx'
} catch { Step 'staff GET admin/banners denied 403' ($_.Exception.Response.StatusCode.value__ -eq 403) $_.Exception.Response.StatusCode.value__ }
try {
  Invoke-RestMethod -Uri "$base/api/admin/banners" -Method Post -Headers $stepUpH -ContentType 'application/json' `
    -Body (@{ placement = 'home_hero'; desktop_image_url = '/e2e-staff.png'; alt = 'Staff probe' } | ConvertTo-Json -Compress) | Out-Null
  Step 'staff POST admin/banners denied 403' $false 'got 2xx'
} catch { Step 'staff POST admin/banners denied 403' ($_.Exception.Response.StatusCode.value__ -eq 403) $_.Exception.Response.StatusCode.value__ }

# promote back to admin for the admin-only media flows below
Invoke-RestMethod -Uri "$SU/rest/v1/profiles?id=eq.$uid" -Method Patch -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } -ContentType 'application/json' -Body (@{ role = 'admin' } | ConvertTo-Json -Compress) | Out-Null
Step 'role promoted back to admin' $true

# -- 9b. Phase 5b: media library ------------------------------------------------
try {
  # alt text is required BEFORE the file is stored, so an upload without it
  # must be rejected without leaving an orphan in the bucket
  try {
    (Invoke-MediaUpload '') | Out-Null
    Step 'media: upload without alt rejected' $false 'got 2xx'
  } catch { Step 'media: upload without alt rejected' ($_.Exception.Response.StatusCode.value__ -eq 400) $_.Exception.Response.StatusCode.value__ }

  $media = Invoke-MediaUpload 'E2E probe banner'
  $mediaId = $media.item.id
  $mediaUploaded = $true
  Step 'media: upload with alt succeeds' ($media.item.alt_text -eq 'E2E probe banner' -and $media.item.width -eq 1) "url=$($media.item.url.Split('/')[-1])"
} catch { Step 'media: upload with alt succeeds' $false (Get-ErrBody $_) }

if ($mediaUploaded) {
  try {
    $list = Invoke-RestMethod -Uri "$base/api/admin/media?pageSize=48" -Headers $authH
    $found = $list.items | Where-Object { $_.id -eq $mediaId }
    Step 'media: list includes new item' (([int]$list.total -ge 1) -and [bool]$found) "total=$($list.total)"
  } catch { Step 'media: list includes new item' $false (Get-ErrBody $_) }

  try {
    $patched = Invoke-RestMethod -Uri "$base/api/admin/media/$mediaId" -Method Patch -Headers $stepUpH -ContentType 'application/json' -Body (@{ altText = 'E2E probe banner updated' } | ConvertTo-Json -Compress)
    Step 'media: patch updates alt' ($patched.item.alt_text -eq 'E2E probe banner updated')
  } catch { Step 'media: patch updates alt' $false (Get-ErrBody $_) }

  try {
    $checked = Invoke-RestMethod -Uri "$base/api/admin/media/$mediaId/check" -Method Post -Headers $stepUpH -ContentType 'application/json' -Body '{}'
    Step 'media: check reports loadable' ($checked.item.is_broken -eq $false) "is_broken=$($checked.item.is_broken)"
  } catch { Step 'media: check reports loadable' $false (Get-ErrBody $_) }

  try {
    Invoke-RestMethod -Uri "$base/api/admin/media/$mediaId" -Method Delete -Headers $stepUpH | Out-Null
    $hidden = (Invoke-RestMethod -Uri "$base/api/admin/media?pageSize=48" -Headers $authH).items | Where-Object { $_.id -eq $mediaId }
    $archived = (Invoke-RestMethod -Uri "$base/api/admin/media?pageSize=48&archived=true" -Headers $authH).items | Where-Object { $_.id -eq $mediaId }
    Step 'media: archive hides from library, undo restores' ((-not $hidden) -and [bool]$archived) "archived=$([bool]$archived)"
  } catch { Step 'media: archive hides from library, undo restores' $false (Get-ErrBody $_) }

  try {
    $restored = Invoke-RestMethod -Uri "$base/api/admin/media/$mediaId/restore" -Method Post -Headers $stepUpH -ContentType 'application/json' -Body '{}'
    Step 'media: restore clears archive' ($restored.item.archived_at -eq $null)
  } catch { Step 'media: restore clears archive' $false (Get-ErrBody $_) }
}

# -- 9c. Phase 5c: banners admin ------------------------------------------------
$bannerId = $null
$bannerId2 = $null
try {
  # alt text is rejected BEFORE insert; a scheduled banner without a start date is too
  try {
    Invoke-RestMethod -Uri "$base/api/admin/banners" -Method Post -Headers $stepUpH -ContentType 'application/json' `
      -Body (@{ placement = 'home_hero'; desktop_image_url = '/e2e.png'; alt = '' } | ConvertTo-Json -Compress) | Out-Null
    Step 'banner: create without alt rejected' $false 'got 2xx'
  } catch { Step 'banner: create without alt rejected' ($_.Exception.Response.StatusCode.value__ -eq 400) (Get-ErrBody $_) }
  try {
    Invoke-RestMethod -Uri "$base/api/admin/banners" -Method Post -Headers $stepUpH -ContentType 'application/json' `
      -Body (@{ placement = 'home_hero'; desktop_image_url = '/e2e.png'; alt = 'Bad schedule'; status = 'scheduled' } | ConvertTo-Json -Compress) | Out-Null
    Step 'banner: scheduled without start rejected' $false 'got 2xx'
  } catch { Step 'banner: scheduled without start rejected' ($_.Exception.Response.StatusCode.value__ -eq 400) (Get-ErrBody $_) }

  $b1 = Invoke-RestMethod -Uri "$base/api/admin/banners" -Method Post -Headers $stepUpH -ContentType 'application/json' `
    -Body (@{ placement = 'home_hero'; desktop_image_url = '/e2e-banner.png'; alt = 'E2E probe banner' } | ConvertTo-Json -Compress)
  $bannerId = $b1.item.id
  Step 'banner: create defaults to draft' ($b1.item.status -eq 'draft' -and $b1.item.link_type -eq 'none') "id=$bannerId"
} catch { Step 'banner: create defaults to draft' $false (Get-ErrBody $_) }

if ($bannerId) {
  try {
    $list = Invoke-RestMethod -Uri "$base/api/admin/banners?placement=home_hero" -Headers $authH
    $found = $list.items | Where-Object { $_.id -eq $bannerId }
    Step 'banner: list includes probe with zero counters' ([bool]$found -and [int]$found.impressions -eq 0) "total=$($list.total)"
  } catch { Step 'banner: list includes probe with zero counters' $false (Get-ErrBody $_) }

  try {
    $pub = Invoke-RestMethod -Uri "$base/api/admin/banners/$bannerId" -Method Patch -Headers $stepUpH -ContentType 'application/json' `
      -Body (@{ status = 'published'; title = 'Probe slide' } | ConvertTo-Json -Compress)
    Step 'banner: patch publishes with title' ($pub.item.status -eq 'published' -and $pub.item.title -eq 'Probe slide')
  } catch { Step 'banner: patch publishes with title' $false (Get-ErrBody $_) }

  try {
    $b2 = Invoke-RestMethod -Uri "$base/api/admin/banners" -Method Post -Headers $stepUpH -ContentType 'application/json' `
      -Body (@{ placement = 'home_hero'; desktop_image_url = '/e2e-banner2.png'; alt = 'E2E probe banner 2' } | ConvertTo-Json -Compress)
    $bannerId2 = $b2.item.id
    $ids = @($bannerId2, $bannerId) # reverse: probe 2 first
    Invoke-RestMethod -Uri "$base/api/admin/banners/reorder" -Method Post -Headers $stepUpH -ContentType 'application/json' `
      -Body (@{ placement = 'home_hero'; ids = $ids } | ConvertTo-Json -Compress) | Out-Null
    $after = (Invoke-RestMethod -Uri "$base/api/admin/banners?placement=home_hero" -Headers $authH).items | Where-Object { $_.id -in $ids } | Sort-Object sort_order
    Step 'banner: reorder applies array order' ($after[0].id -eq $bannerId2 -and [int]$after[1].sort_order -eq 1) "first=$($after[0].id)"
  } catch { Step 'banner: reorder applies array order' $false (Get-ErrBody $_) }

  try {
    Invoke-RestMethod -Uri "$base/api/admin/banners/$bannerId" -Method Delete -Headers $stepUpH | Out-Null
    $hidden = (Invoke-RestMethod -Uri "$base/api/admin/banners?placement=home_hero" -Headers $authH).items | Where-Object { $_.id -eq $bannerId }
    $archived = (Invoke-RestMethod -Uri "$base/api/admin/banners?placement=home_hero&archived=true" -Headers $authH).items | Where-Object { $_.id -eq $bannerId }
    Step 'banner: archive hides from live list, shows in archived' ((-not $hidden) -and [bool]$archived)
  } catch { Step 'banner: archive hides from live list, shows in archived' $false (Get-ErrBody $_) }

  try {
    $restored = Invoke-RestMethod -Uri "$base/api/admin/banners/$bannerId/restore" -Method Post -Headers $stepUpH -ContentType 'application/json' -Body '{}'
    Step 'banner: restore clears archive' ($restored.item.archived_at -eq $null)
  } catch { Step 'banner: restore clears archive' $false (Get-ErrBody $_) }
}

# â”€â”€ 10. cleanup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Invoke-RestMethod -Uri "$SU/rest/v1/profiles?id=eq.$uid" -Method Patch -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } -ContentType 'application/json' -Body (@{ role = 'user' } | ConvertTo-Json -Compress) | Out-Null
Step 'role reverted to user' $true

Invoke-RestMethod -Uri "$SU/rest/v1/feedback?order_id=eq.$orderId" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
Invoke-RestMethod -Uri "$SU/rest/v1/supports?id=eq.$uid" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
Invoke-RestMethod -Uri "$SU/rest/v1/payment?order_id=eq.$orderId" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
Invoke-RestMethod -Uri "$SU/rest/v1/order_details?order_id=eq.$orderId" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
Invoke-RestMethod -Uri "$SU/rest/v1/orders?order_id=eq.$orderId" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
$p2 = Invoke-RestMethod -Uri "$SU/rest/v1/product?select=stock_quantity&prod_id=eq.$prodId" -Headers @{ apikey = $SK; Authorization = "Bearer $SK" }
Invoke-RestMethod -Uri "$SU/rest/v1/product?prod_id=eq.$prodId" -Method Patch -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } -ContentType 'application/json' `
  -Body (@{ stock_quantity = ([int]$p2[0].stock_quantity + 1) } | ConvertTo-Json -Compress) | Out-Null
Step 'stock restored' ($true) "$(([int]$p2[0].stock_quantity + 1)) (was $stock0)"
if ($order3Id) {
  Invoke-RestMethod -Uri "$SU/rest/v1/payment?order_id=eq.$order3Id" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
  Invoke-RestMethod -Uri "$SU/rest/v1/order_details?order_id=eq.$order3Id" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
  Invoke-RestMethod -Uri "$SU/rest/v1/orders?order_id=eq.$order3Id" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
  Step 'ordercost: probe order cleaned up' $true $order3Id
}
if ($order4Id) {
  Invoke-RestMethod -Uri "$SU/rest/v1/payment?order_id=eq.$order4Id" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
  Invoke-RestMethod -Uri "$SU/rest/v1/order_details?order_id=eq.$order4Id" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
  Invoke-RestMethod -Uri "$SU/rest/v1/orders?order_id=eq.$order4Id" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
  Step 'promo: probe order cleaned up' $true $order4Id
}
if ($probeId) {
  try {
    Invoke-RestMethod -Uri "$SU/rest/v1/product?prod_id=eq.$probeId" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
    Step 'details: probe product deleted' $true $probeId
  } catch { Step 'details: probe product deleted' $false (Get-ErrBody $_) }
}
if ($mediaId) {
  $mediaRow = Invoke-RestMethod -Uri "$SU/rest/v1/site_media?id=eq.$mediaId&select=storage_path" -Headers @{ apikey = $SK; Authorization = "Bearer $SK" }
  Invoke-RestMethod -Uri "$SU/rest/v1/site_media?id=eq.$mediaId" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
  if ($mediaRow -and $mediaRow[0].storage_path) {
    Invoke-RestMethod -Uri "$SU/storage/v1/object/product-images/$($mediaRow[0].storage_path)" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
  }
  Step 'media: probe row removed' $true $mediaId
}
if ($bannerId) {
  Invoke-RestMethod -Uri "$SU/rest/v1/site_banners?id=eq.$bannerId" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
  Step 'banner: probe row removed' $true $bannerId
}
if ($bannerId2) {
  Invoke-RestMethod -Uri "$SU/rest/v1/site_banners?id=eq.$bannerId2" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
  Step 'banner: probe row 2 removed' $true $bannerId2
}
Invoke-RestMethod -Uri "$SU/rest/v1/profiles?id=eq.$uid" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
try {
  Invoke-RestMethod -Uri "$SU/auth/v1/admin/users/$uid" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
  Step 'auth user deleted' $true
} catch { Step 'auth user deleted' ($false) (Get-ErrBody $_) }
Write-Output '---- E2E RESULTS ----'
$results | ForEach-Object { Write-Output $_ }
$pass = @($results | Where-Object { $_.StartsWith('[PASS]') }).Count
$fail = @($results | Where-Object { $_.StartsWith('[FAIL]') }).Count
$skip = @($results | Where-Object { $_.StartsWith('[SKIP]') }).Count
Write-Output "---- $pass/$($results.Count) passed$(if ($skip -gt 0) { ", $skip skipped" }) ----"
if ($fail -gt 0) { exit 1 }

