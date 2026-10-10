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
function Get-ErrBody($resp) {
  try { $s = $resp.GetResponseStream(); $r = New-Object IO.StreamReader($s); return $r.ReadToEnd() } catch { return '' }
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
} catch { Step 'create user' ($false) (Get-ErrBody $_.Exception.Response); $results; exit 1 }
$uid = $u.id

# â”€â”€ 2. sign in â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
try {
  $tok = Invoke-RestMethod -Uri "$SU/auth/v1/token?grant_type=password" -Method Post `
    -Headers @{ apikey = $AK } -ContentType 'application/json' `
    -Body (@{ email = $email; password = $pw } | ConvertTo-Json -Compress)
  Step 'password grant' $true
} catch { Step 'password grant' ($false) (Get-ErrBody $_.Exception.Response); $results; exit 1 }
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
} catch { Step 'place order' ($false) (Get-ErrBody $_.Exception.Response); $results; exit 1 }
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
} catch { Step 'feedback insert' ($false) (Get-ErrBody $_.Exception.Response) }
try {
  $fb2 = Invoke-RestMethod -Uri "$base/api/feedback" -Method Post -Headers $authH -ContentType 'application/json' `
    -Body (@{ orderId = $orderId; items = @(@{ prodId = $prodId; rating = 4; comments = 'Changed my mind' }) } | ConvertTo-Json -Depth 5 -Compress)
  Step 'feedback upsert update' ($fb2.inserted -eq 0 -and $fb2.updated -eq 1) "inserted=$($fb2.inserted) updated=$($fb2.updated)"
} catch { Step 'feedback upsert update' ($false) (Get-ErrBody $_.Exception.Response) }

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
} catch { Step 'support POST' ($false) (Get-ErrBody $_.Exception.Response); $supId = $null }
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
} catch { Step 'support replace thread' ($false) (Get-ErrBody $_.Exception.Response) }
$supList2 = Invoke-RestMethod -Uri "$base/api/support" -Headers $authH
Step 'support GET single thread' (@($supList2.items).Count -eq 1 -and $supList2.items[0].message -like 'Follow-up*') "count=$(@($supList2.items).Count)"

# â”€â”€ 8. admin supports list (escalate temp user) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$prof = Invoke-RestMethod -Uri "$SU/rest/v1/profiles?id=eq.$uid&select=id,role" -Headers @{ apikey = $SK; Authorization = "Bearer $SK" }
if (@($prof).Count -eq 0) {
  try {
    Invoke-RestMethod -Uri "$SU/rest/v1/profiles" -Method Post -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } -ContentType 'application/json' `
      -Body (@{ id = $uid; role = 'user' } | ConvertTo-Json -Compress) | Out-Null
    Step 'profiles row created' $true
  } catch { Step 'profiles row created' ($false) (Get-ErrBody $_.Exception.Response) }
} else { Step 'profiles row exists' $true $prof[0].role }
Invoke-RestMethod -Uri "$SU/rest/v1/profiles?id=eq.$uid" -Method Patch -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } -ContentType 'application/json' `
  -Body (@{ role = 'admin' } | ConvertTo-Json -Compress) | Out-Null

try {
  $adminSup = Invoke-RestMethod -Uri "$base/api/admin/supports?pageSize=100" -Headers $authH
  $mine = $adminSup.items | Where-Object { $_.support_id -eq $supId }
  Step 'admin supports GET' (($adminSup.total -ge 1) -and [bool]$mine) "total=$($adminSup.total)"
} catch { Step 'admin supports GET' ($false) (Get-ErrBody $_.Exception.Response) }

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
} catch { Step 'step-up issues token' $false (Get-ErrBody $_.Exception.Response); $stepUpH = $null }
try {
  Invoke-RestMethod -Uri "$base/api/auth/step-up" -Method Post -Headers $authH -ContentType 'application/json' `
    -Body (@{ password = 'WrongPassword!123' } | ConvertTo-Json -Compress) | Out-Null
  Step 'step-up rejects wrong password' $false 'got 2xx'
} catch { Step 'step-up rejects wrong password' ($_.Exception.Response.StatusCode.value__ -eq 401) $_.Exception.Response.StatusCode.value__ }
if ($stepUpH) {
  try {
    $reply = Invoke-RestMethod -Uri "$base/api/admin/supports/$supId" -Method Patch -Headers $stepUpH -ContentType 'application/json' `
      -Body (@{ response = 'We are checking your order now.' } | ConvertTo-Json -Compress)
    Step 'admin reply succeeds with step-up' ([bool]$reply.item.support_id) $reply.item.support_id
  } catch { Step 'admin reply succeeds with step-up' $false (Get-ErrBody $_.Exception.Response) }
  try {
    $supCheck = Invoke-RestMethod -Uri "$base/api/support" -Headers $authH
    Step 'step-up reply persisted' ($supCheck.items[0].response -eq 'We are checking your order now.') "response=$($supCheck.items[0].response)"
  } catch { Step 'step-up reply persisted' $false (Get-ErrBody $_.Exception.Response) }
} else {
  Step 'admin reply succeeds with step-up' $false 'no step-up token'
  Step 'step-up reply persisted' $false 'no step-up token'
}

# stats/customers sanity with escalated admin (no step-up on GET)
try {
  $stats = Invoke-RestMethod -Uri "$base/api/admin/stats" -Headers $authH
  Step 'admin stats GET' ([int]$stats.totalUsers -gt 0) "users=$($stats.totalUsers) sales=$($stats.totalSales)"
} catch { Step 'admin stats GET' ($false) (Get-ErrBody $_.Exception.Response) }


# ── 9. staff role: allowed reads vs admin-only reads ──
Invoke-RestMethod -Uri "$SU/rest/v1/profiles?id=eq.$uid" -Method Patch -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } -ContentType 'application/json' `
  -Body (@{ role = 'staff' } | ConvertTo-Json -Compress) | Out-Null

try {
  $me = Invoke-RestMethod -Uri "$base/api/me/role" -Headers $authH
  Step 'me/role reports staff' ($me.role -eq 'staff') "role=$($me.role)"
} catch { Step 'me/role reports staff' $false (Get-ErrBody $_.Exception.Response) }

$staffAllowed = @('admin/orders?pageSize=1', 'admin/products?pageSize=1', 'admin/payments?pageSize=1', 'admin/supports?pageSize=1')
foreach ($ep in $staffAllowed) {
  try {
    Invoke-RestMethod -Uri "$base/api/$ep" -Headers $authH | Out-Null
    Step "staff GET $ep" $true
  } catch { Step "staff GET $ep" $false (Get-ErrBody $_.Exception.Response) }
}

foreach ($ep in @('admin/stats', 'admin/customers?pageSize=1', 'admin/audit-logs')) {
  try {
    Invoke-RestMethod -Uri "$base/api/$ep" -Headers $authH | Out-Null
    Step "staff denied $ep" $false 'got 2xx'
  } catch { Step "staff denied $ep" ($_.Exception.Response.StatusCode.value__ -eq 403) $_.Exception.Response.StatusCode.value__ }
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
Invoke-RestMethod -Uri "$SU/rest/v1/profiles?id=eq.$uid" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
try {
  Invoke-RestMethod -Uri "$SU/auth/v1/admin/users/$uid" -Method Delete -Headers @{ apikey = $SK; Authorization = "Bearer $SK" } | Out-Null
  Step 'auth user deleted' $true
} catch { Step 'auth user deleted' ($false) (Get-ErrBody $_.Exception.Response) }
Write-Output '---- E2E RESULTS ----'
$results | ForEach-Object { Write-Output $_ }
$pass = @($results | Where-Object { $_.StartsWith('[PASS]') }).Count
$fail = @($results | Where-Object { $_.StartsWith('[FAIL]') }).Count
$skip = @($results | Where-Object { $_.StartsWith('[SKIP]') }).Count
Write-Output "---- $pass/$($results.Count) passed$(if ($skip -gt 0) { ", $skip skipped" }) ----"
if ($fail -gt 0) { exit 1 }

