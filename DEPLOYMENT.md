# Vercel Deployment Guide - Indian Dropship

## Quick Start

### Step 1: Prerequisites
You need these accounts set up (get the keys/URLs from each):
- **Neon** (PostgreSQL) - for database
- **Vercel** - for hosting
- **Stripe** (optional) - for payments
- **Resend** (optional) - for emails

### Step 2: Deploy to Vercel

#### Option A: Using Vercel Dashboard (Easiest)

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New" → "Project"
3. Select "Import Git Repository"
4. Paste your GitHub fork URL: `https://github.com/shrineedhiexperiments-ai/Indian_dropship`
5. Click "Import"
6. On the "Configure Project" page:
   - Framework: Next.js (should auto-detect)
   - Root Directory: ./ (default)
7. Click "Environment Variables" and add:
   ```
   DATABASE_URL=postgresql://user:password@host/dbname
   SESSION_SECRET=<your-32-char-secret>
   ADMIN_EMAIL=your@admin.email
   APP_URL=https://your-vercel-deployment.vercel.app
   SHIPPING_FLAT_CHF=9.90
   FREE_SHIPPING_OVER_CHF=120
   STRIPE_SECRET_KEY=(optional)
   STRIPE_WEBHOOK_SECRET=(optional)
   RESEND_API_KEY=(optional)
   EMAIL_FROM=(optional)
   ```
8. Click "Deploy"
9. Wait for build to complete (5-10 minutes)

#### Option B: Using Vercel CLI

```bash
# Install CLI
npm i -g vercel

# Deploy
cd /path/to/Indian_dropship
vercel --prod

# Follow prompts to configure
# Choose "Y" to link to existing project if you have one
# Set environment variables when prompted
```

### Step 3: Post-Deployment Setup

#### Database Migration

After deployment, run database migrations:

```bash
# Option 1: Using Vercel CLI (in your local project)
vercel env pull --environment production
npm run db:push

# Option 2: Using Neon dashboard
# Copy your DATABASE_URL from Neon and manually run Prisma migrations
```

#### Seed Sample Data (Optional)

```bash
# Pull production env vars
vercel env pull --environment production

# Run seed
npm run db:seed
```

#### Configure Stripe Webhook (If using Stripe)

1. Get your Vercel deployment URL (e.g., `https://indian-dropship-xyz.vercel.app`)
2. Go to Stripe Dashboard → Webhooks
3. Add endpoint: `https://your-vercel-url/api/stripe/webhook`
4. Listen to events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
5. Copy the signing secret and update `STRIPE_WEBHOOK_SECRET` in Vercel env vars

## Environment Variables Reference

### Required
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - 32+ character random string for JWT signing
- `ADMIN_EMAIL` - Email of the admin user
- `APP_URL` - Your Vercel deployment URL

### Optional (but recommended)
- `STRIPE_SECRET_KEY` - For payment processing
- `STRIPE_WEBHOOK_SECRET` - For Stripe webhooks
- `RESEND_API_KEY` - For transactional emails
- `EMAIL_FROM` - Email sender address (e.g., "Desi Bridge <hello@yourdomain.com>")

### Configuration
- `SHIPPING_FLAT_CHF` - Flat shipping cost (default: 9.90)
- `FREE_SHIPPING_OVER_CHF` - Free shipping threshold (default: 120)
- `NODE_ENV` - Set to "production" (Vercel does this automatically)

## Generate SESSION_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Troubleshooting

### Build Fails
```
Error: DATABASE_URL is not set
```
**Fix:** Add `DATABASE_URL` to Environment Variables in Vercel dashboard

### Database Connection Error
```
Error: connect ECONNREFUSED
```
**Fix:** Verify your DATABASE_URL is correct in Neon and Vercel env vars

### Stripe Webhook Not Working
**Fix:** 
1. Ensure `APP_URL` is set to your Vercel domain
2. Update webhook URL in Stripe to match your deployment
3. Check `STRIPE_WEBHOOK_SECRET` is correct (don't confuse with API key)

### Email Not Sending
**Fix:**
1. If no Resend key: emails print to server logs (check Vercel logs)
2. If using Resend: verify domain is verified and SPF/DKIM records are added
3. Check `EMAIL_FROM` format is valid

## Monitoring

### Check Deployment Status
```bash
vercel --list  # List all deployments
vercel logs    # View logs
```

### View Live Logs
1. Go to Vercel Dashboard
2. Select your project
3. Click "Deployments" → latest → "Logs"

### Monitor Database
1. Go to Neon dashboard
2. Check "Monitor" for queries and performance

## First Steps After Deploy

1. ✅ Visit your site: https://your-vercel-url.vercel.app
2. ✅ Test sign up → should create user with your ADMIN_EMAIL
3. ✅ Access admin panel: https://your-vercel-url.vercel.app/admin
4. ✅ Create a test product
5. ✅ Test add to cart
6. ✅ Test checkout (if Stripe configured)

## Rollback Deployment

If something breaks:

```bash
# View deployment history
vercel deployments

# Rollback to previous
vercel promote <deployment-id>
```

Or use Vercel Dashboard: Deployments → Right-click previous → Promote

## Scale & Optimize

### Database Indexing
Your schema already has indexes for common queries. Monitor performance in Neon.

### Caching
- ISR (Incremental Static Regeneration) is enabled
- Pages revalidate on changes
- Configure in individual pages if needed

### Analytics
Enable Vercel Analytics:
1. Vercel Dashboard → Settings → Analytics
2. Click "Enable"
3. View insights in Dashboard → Analytics

## Need Help?

- **Neon Docs:** https://neon.tech/docs
- **Vercel Docs:** https://vercel.com/docs
- **Next.js Docs:** https://nextjs.org/docs
- **Stripe Docs:** https://stripe.com/docs/api
- **Resend Docs:** https://resend.com/docs
