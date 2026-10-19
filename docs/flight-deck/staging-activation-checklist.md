# Flight Deck: staging activation checklist

For: the founder. Work through it in order. Each ☐ that creates an account, a resource, or a charge needs your explicit go-ahead at that step. **Nothing below has been done.**
Revision date: 2026-10-19. Details: `staging-setup.md`. Tests: `staging-acceptance.md`.

## 1. Before any provisioning (no cost)

- ☐ **Vercel plan.** Check Settings → Billing for the public site.
  - Hobby → a new Pro team for staging ($20/month).
  - Pro → a new project in the existing team ($0, but no hard-limit pause).
- ☐ **Neon terms.** Confirm on neon.com/pricing, on the day:
  - Scale compute $0.222/CU-hour, with no monthly minimum;
  - storage $0.35/GB-month;
  - history $0.20/GB-month, up to 30 days;
  - the London (`aws-eu-west-2`) region.
- ☐ **AWS structure.** Decide:
  - the management account (existing or new);
  - the new member account `tiro-flight-deck-staging`;
  - IAM Identity Center access with MFA;
  - the region SCP (`staging-setup.md` §2).

  Confirm the synthetic backend in `infra/` is not in that account.
- ☐ **Mailboxes.** A dedicated, monitored TIRO operations mailbox, and your escalation address.
- ☐ **Estimate approved.** About $44/month, or about $64 with a new Vercel Pro team, against the $75 planning ceiling (`staging-setup.md` §8). Taxes extra; alerts, not hard caps.

## 2. Accounts (needs your approval; the first charges start here)

- ☐ Create the AWS staging member account; set root MFA; set up Identity Center access.
- ☐ Create the Neon organization and the `tiro-flight-deck-staging` project (Scale, London). Set compute fixed at 0.25 CU, history 14 days, and a spending notification at $45.
- ☐ Create the Vercel staging project (and a Pro team, if needed). Set Functions region London, OIDC issuer mode Global, automatic Git deployments off, and Spend Management notifications.

## 3. Resources and configuration

- ☐ Deploy the template in the staging account, eu-west-2, with the staging parameters and the schedule DISABLED. Confirm both email subscriptions.
- ☐ Create the Neon owner and app roles; get their **direct** URLs.
- ☐ Set the Vercel staging variables (`staging-setup.md` §4). Set none on the public site's project.
- ☐ Create the GitHub environment `flight-deck-staging` (you as required reviewer), with its variables and secrets.

## 4. First deploy

- ☐ `migrate`, `init --synthetic`, `add-operator` (yourself), from your machine.
- ☐ Run **Deploy Flight Deck staging**, approve it, and check that the smoke checks pass.
- ☐ Sign in with MFA; approve the console gate at `/flight-deck/gates`; set `WorkerScheduleState=ENABLED`.

## 5. Prove it

- ☐ `staging-acceptance.md` stages A to F, recorded in `acceptance.md` §7.
- ☐ Weekly cost check across AWS, Neon, and Vercel during the first month.

## Afterwards

- To stop: `staging-setup.md` §9. The log bucket cannot be deleted until its retention has passed.
- Not authorized by any of this: real contact data, the public form, outbound messages, or a production deployment.
