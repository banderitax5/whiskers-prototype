# Deploying Whiskers Pet Shop to Azure

Target: one Ubuntu 24.04 VM running **Caddy** (static frontend + TLS + reverse
proxy) and **systemd** (Node API). No Docker — it saves ~400 MB of RAM on a
small VM, and the frontend is a static build, not a server.

```
        browser  ──►  Caddy :443  ──►  /opt/whiskers/frontend/dist   (static SPA)
                              └────►  /api/* , /health  ──►  node :4141  ──►  Supabase
```

Same-origin by design: the browser only ever talks to one host, so the API's
localhost-only CORS stays correct and no `Access-Control-Allow-Origin` is
needed in production.

---

## 0. Read this first: what the VM actually costs

Azure for Students gives **$100 for 12 months**. A VM runs continuously, so the
credit is a countdown, not a subscription.

| Size | vCPU / RAM | Southeast Asia | Months on $100 |
| --- | --- | --- | --- |
| **Standard_B2s** | 2 / 4 GB | **$38.54/mo** | **~2.6** |
| Standard_B2pls_v2 (ARM) | 2 / 4 GB | $30.95/mo | ~3.2 |
| Standard_B1ms | 1 / 2 GB | $19.27/mo | ~5.2 |

Plus ~$1.40/mo for a 64 GB OS disk.

**If you need the site up for a full school year, B2s will not get you there.**
Three honest options, cheapest first:

1. **Oracle Cloud Always Free** (4 ARM OCPUs / 24 GB RAM, no time limit) — the
   target the capstone paper already commits to. Free forever, but ARM capacity
   in Singapore is occasionally unavailable.
2. **B1ms on Azure** (~5 months) — half the RAM, so drop the Node heap cap to
   512 MB in `whiskers-api.service`.
3. **B2s + renew annually** — Azure for Students can be renewed once per year
   while you stay enrolled, so a 2.6-month runway works if you renew and
   re-deploy. Data on the VM is lost when the subscription is disabled, so the
   database (Supabase) is safe either way — you just rebuild the VM.

The rest of this guide is the same for all three.

**Supabase region decides your Azure region.** Every API call goes
browser → VM → Supabase. Put the VM in the same region as Supabase or every
request pays a cross-region hop twice. In the Supabase dashboard check
**Project Settings → General → Region**, then pick the matching Azure region
(`southeastasia` for Singapore, `eastasia` for Hong Kong, `eastus` for
Virginia).

---

## 1. Create the VM (Azure portal, ~5 min)

1. **Create a resource → Virtual machines → Create**.
2. Subscription: **Azure for Students**. Resource group: `whiskers-rg`.
3. Name `whiskers-vm`, region = the one matching Supabase.
4. Image: **Ubuntu Server 24.04 LTS - x64 Gen 2**.
5. Size: **B2s** (or B1ms / B2pls_v2 per the table above).
6. Authentication: **SSH public key**. Use a key you already have, or let Azure
   generate one and download the `.pem`. **Do not use password auth.**
7. Disks: default 64 GB Premium SSD (about $1.40/mo).
8. Networking:
   - Create a new virtual network with default subnets.
   - **Delete the default RDP rule** (port 3389) if present — Linux doesn't
     need it.
   - Keep **HTTP (80)** and **HTTPS (443)** inbound rules. Add them if Azure
     only created SSH.
   - Leave **SSH (22)** but click it and set **Source = My IP** if you know
     your address. Any-source SSH plus a leaked key is how student VMs get
     mined for crypto.
9. **Review + create.** Note the **public IP address**.

---

## 2. Point DNS at the VM (Cloudflare, ~5 min)

In the Cloudflare dashboard for `whiskerspet.me`:

- **A** record: name `@` → the VM public IP, **proxy off** (grey cloud).
- **A** record: name `www` → the same IP, proxy off.

Proxy off for now. Caddy needs to reach Let's Encrypt directly on port 80 for
its HTTP-01 certificate challenge. You can turn the proxy on later if you want
Cloudflare's CDN and WAF, but then set `TRUST_PROXY=2` in `backend/.env` and
read the note in `backend/.env.example` about spoofable headers.

Wait ~60 s for the records to propagate before continuing.

---

## 3. Provision the VM (~4 min, mostly unattended)

Copy the repo to the VM and run the provisioner:

```bash
ssh azureuser@<VM_IP>

sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/<you>/whiskers-petshop.git /tmp/app
sudo bash /tmp/app/deploy/provision.sh
```

`provision.sh` installs Node 22 + Caddy, creates the unprivileged `whiskers`
user, turns on 2 GB of swap, opens only 22/80/443 in `ufw`, and installs the
systemd unit and Caddyfile. It is idempotent — re-running it is safe.

---

## 4. Write the secrets on the VM (the one step I cannot do for you)

`backend/.env` holds real keys and **must never be committed**. Create it on
the server by hand:

```bash
sudo -u whiskers nano /opt/whiskers/backend/.env
```

Copy every line from `backend/.env.example`, then fill in:

| Key | Where to get it |
| --- | --- |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | same page → **service_role** key. Secret. Bypasses RLS. |
| `SUPABASE_ANON_KEY` | same page → anon/public key (safe for the browser) |
| `ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `BREVO_API_KEY` | brevo.com → SMTP & API → API keys (v3), "Transactional email: All" |
| `MAIL_FROM_EMAIL` | `shop@whiskerspet.me` (already authenticated in Brevo) |

For production set:

```ini
TRUST_PROXY=1
GATEWAY_TTL_MINUTES=30
```

`TRUST_PROXY=1` lets Express take the client IP from Caddy's
`X-Forwarded-For`, so rate limits key on the real visitor instead of 127.0.0.1.
`GATEWAY_TTL_MINUTES=1` is a demo value; 30 is a sane production expiry.

Then lock the file down — it contains the service-role key:

```bash
sudo chmod 600 /opt/whiskers/backend/.env
sudo chown whiskers:whiskers /opt/whiskers/backend/.env
```

---

## 5. Ship the code

From **your machine**, not the VM (the frontend build needs more RAM than a
free-tier VM comfortably has):

```bash
HOST=azureuser@<VM_IP> ./deploy/deploy.sh
```

This builds the frontend locally, rsyncs backend sources + `frontend/dist` to
the VM, runs `npm ci --omit=dev` on the VM (so `sharp` downloads the binary
matching the VM's CPU), restarts the API, and curls `/health`.

`.env` is excluded from the upload, so this never overwrites your secrets.

---

## 6. Start and verify

```bash
ssh azureuser@<VM_IP>
sudo systemctl start whiskers-api
sudo systemctl status whiskers-api --no-pager
sudo journalctl -u whiskers-api -n 30 --no-pager
```

Then, on your machine:

```bash
curl -s https://<your-domain>/health          # {"status":"ok",...}
curl -s https://<your-domain>/api/products?pageSize=1
open https://<your-domain>                     # the storefront should load
```

Smoke-test the panel paths a panelist will open:

- `/` home, `/menu` catalog, one `/products/:id` detail page
- sign in as `demo-admin@example.com`, open **Dashboard**, **Products**,
  **Orders**
- place one order end to end (this also proves `/pay/simulate` works)

---

## 7. Update Supabase Auth URLs (required for login + password reset)

Until this is done, sign-in redirects and password-reset emails point at
`localhost`.

Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://<your-domain>`
- **Redirect URLs**: add `https://<your-domain>/*`

Supabase → **Authentication → Sign In / Providers → Email**:

- **Confirm email**: ON (otherwise anyone can sign up with a fake address).

---

## 8. Nightly database backup (do this before taking real orders)

**The Supabase free plan has no automatic backups.** A bad migration or an
accidental delete in the table editor is unrecoverable. Add a nightly dump:

```bash
sudo -u whiskers crontab -e
```

Paste (one line, wrapped here for readability):

```
0 3 * * * PGPASSWORD='<db-password>' /usr/bin/pg_dump \
  -h aws-0-ap-southeast-1.pooler.supabase.com -p 5432 -U postgres.postgres \
  -Fc -f /opt/whiskers/secrets/backup-$(date +\%F).sql.gz && \
  /usr/bin/find /opt/whiskers/secrets -name 'backup-*.sql.gz' -mtime +14 -delete
```

The connection string is in Supabase → **Database → Connection string → URI**
(mode Session, not Transaction pooler). Keep 14 days of dumps. **Restore
drill**: on a quiet day, load one dump into a scratch Supabase project and
confirm the tables come back. An untested backup is not a backup.

---

## 9. Operations

| Task | Command |
| --- | --- |
| Logs | `ssh azureuser@<VM_IP> 'sudo journalctl -u whiskers-api -f'` |
| Restart API | `sudo systemctl restart whiskers-api` |
| Reload Caddy after editing the Caddyfile | `sudo systemctl reload caddy` |
| Roll back a bad deploy | `ssh` in, `cd /opt/whiskers && git checkout <good-sha> && cd backend && sudo systemctl restart whiskers-api` |
| Watch spend | Azure portal → **Cost Management** → set a budget alert at $60 |
| Keep Supabase awake | UptimeRobot (free) → monitor `https://<your-domain>/health` every 5 min. A Supabase **free** project pauses after ~1 week with no DB activity, and `/health` never touches the database, so also add a second monitor on `https://<your-domain>/api/products?pageSize=1`, which does. |

`unattended-upgrades` is on by default in Ubuntu 24.04, so security patches
apply themselves. Schedule the occasional `sudo reboot` yourself — a kernel
update does not take effect until you do.

---

## 10. Known limits at this tier

Be honest with the panel about these; they are documented, not surprises:

1. **Supabase free egress is 5 GB/month.** The catalog is ~178 KB per fetch and
   product images are served straight from Supabase Storage with
   `Cache-Control: private, no-cache`, so nothing is CDN-cached. At 500–1000
   visits/day you will exceed 5 GB. Fixes, cheapest first: serve images through
   Cloudflare R2 (zero egress), add a server-side catalog cache, or upgrade to
   Supabase Pro ($25/mo, 250 GB).
2. **No backups on the Supabase free plan** — hence step 8.
3. **Supabase pauses free projects after ~1 week of inactivity.** Real traffic
   prevents this; an idle staging site will get paused and need a manual
   resume from the dashboard (data is retained for 1 year).
4. **The credit runs out.** Set the Azure budget alert. When it fires, either
   renew Azure for Students, upgrade to pay-as-you-go, or migrate to Oracle
   Always Free.
5. **PayMongo webhooks need this public HTTPS URL** before they can be
   registered — the gateway feature is built but the webhook endpoint is not
   wired until you have a domain on the VM.
