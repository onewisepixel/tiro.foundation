# Flight Deck: staging activation checklist

For: the founder. Work through it in order. Each ☐ that creates a resource or a charge needs your explicit go-ahead at that step. **Nothing below has been done.**
Revision date: 2026-10-19. Details: `staging-setup.md`. Tests: `staging-acceptance.md`.
**Region: us-east-1 (N. Virginia), in the existing `tiro-stage` AWS account.** Neon `aws-us-east-1`; Vercel functions `iad1`. Not London: that was the earlier cost comparison only.

## 1. Before any provisioning (no cost)

- ☐ **Vercel plan.** Check Settings → Billing for the public site.
  - Hobby → a new Pro team for staging ($20/month).
  - Pro → a new project in the existing team ($0, but no hard-limit pause).
- ☐ **Neon terms.** Confirm on neon.com/pricing, on the day:
  - Scale compute $0.222/CU-hour, with no monthly minimum;
  - storage $0.35/GB-month;
  - history $0.20/GB-month, up to 30 days;
  - the **`aws-us-east-1`** region is available on Scale.
- ☐ **`tiro-stage` account checks** (`staging-setup.md` §2):
  - root MFA is on, and you can sign in through single sign-on with MFA;
  - an inventory of what else runs there and in which regions. Use a region-restricting policy only if nothing there needs another region;
  - no existing SNS topic `tiro-flight-deck-alarms`, budget `tiro-flight-deck-staging-aws`, or Cognito domain prefix of the same name;
  - whether an IAM OIDC provider for `https://oidc.vercel.com` already exists. If so, the stack skips its provider and role, and you create the role by hand (§3);
  - the budget amount covers Flight Deck's $15 **plus** the usual cost of everything else in the account, or a stack-name filter is added.
- ☐ **Mailboxes.** A dedicated, monitored TIRO operations mailbox, and your escalation address.
- ☐ **Estimate approved.** About $44/month, or about $64 with a new Vercel Pro team, for Flight Deck alone, against the $75 planning ceiling (`staging-setup.md` §8). Taxes extra; alerts, not hard caps.

## 2. Services (needs your approval; the first charges start here)

- ☐ Create the Neon organization and the `tiro-flight-deck-staging` project (Scale, **`aws-us-east-1`**). Set compute fixed at 0.25 CU, history 14 days, and a spending notification at $45.
- ☐ Create the Vercel staging project (and a Pro team, if needed). Keep the Functions region at **`iad1`** (the default). Set OIDC issuer mode Global, automatic Git deployments off, and Spend Management notifications.

## 3. Resources and configuration

- ☐ Deploy the template into **`tiro-stage`, us-east-1**, as stack `tiro-flight-deck-staging`, with the staging parameters and the schedule DISABLED. Confirm both email subscriptions.
- ☐ If a Vercel OIDC provider already existed: add the staging audience to it, and create the staging role by hand, exactly as in the template.
- ☐ Create the Neon owner and app roles; get their **direct** URLs.
- ☐ Set the Vercel staging variables (`staging-setup.md` §4): every region value `us-east-1`, including `AWS_REGION`. Set none on the public site's project.
- ☐ Create the GitHub environment `flight-deck-staging` (you as required reviewer), with its variables and secrets.

## 4. First deploy

- ☐ `migrate`, `init --synthetic`, `add-operator` (yourself), from your machine, signed in to `tiro-stage` with the protective-log variables set.
- ☐ Run **Deploy Flight Deck staging**, approve it, and check that the smoke checks pass.
- ☐ Sign in with MFA; approve the console gate at `/flight-deck/gates`; set `WorkerScheduleState=ENABLED`.

## 5. Prove it

- ☐ `staging-acceptance.md` stages A to F, recorded in `acceptance.md` §7.
- ☐ Weekly cost check across AWS (Flight Deck's stack in `tiro-stage`), Neon, and Vercel during the first month.

## Afterwards

- To stop: `staging-setup.md` §9. Remove Flight Deck's resources only; **do not close `tiro-stage`**. The log bucket cannot be deleted until its retention has passed.
- Not authorized by any of this: real contact data, the public form, outbound messages, or a production deployment.
