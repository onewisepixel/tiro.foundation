# Flight Deck: activation checklist (0.2.1)

For: the founder. Each line is either a decision only you can make, or an action that needs an account, money, or authorization. Work through them in order. **Nothing below has been done.**
Revision date: 2026-10-18.

## A. Decisions

Already made, provisionally (`integrations.md` §2):

- RDS;
- 14-day point-in-time recovery;
- founder-only operation at launch;
- a separate protective log bucket;
- the public form stays closed.

Still open:

1. **Where the app runs.** This decides the network design: about $22 or $55 a month for the database side (`integrations.md` §4.4).
2. **Database provider confirmed and region chosen**, after counsel's residency review. Neon remains the alternative if operating effort matters more than one vendor, but only its Scale plan meets 14 days.
3. **Spending authorization** for staging and then production.
4. **Data controller** while TIRO is unincorporated, and **counsel** for the privacy review.
5. **Backup operator** (named, before any unattended collection) and **independent reviewer** (before relying on dual control).
6. **Retention**: confirm the 14-day window, which becomes the "backups expire within 14 days" sentence in deletion confirmations. Keep `ProtectiveRetentionDays` at 35 or more.
7. **Alarm recipient.**

## B. Staging (needs AWS access and spending)

8. Run every stage of `staging-acceptance.md`, A to F, on a staging stack with test records only:
   - real Cognito MFA, including re-authentication for gates;
   - hosted PostgreSQL with separate owner and app roles;
   - the protective log bucket with Object Lock, checked with the app's credentials;
   - point-in-time restore drills with `mark-restored` and Verify and replay, using the read-only log policy;
   - 24 hours of the scheduled worker with the alarm tested;
   - a log outage and an incident run-through.
9. Run the manual accessibility test and the human-paced review (`manual-tests.md` §2 and §3). Record both.

## C. Production (needs AWS access and spending)

10. Deploy the template, with the schedule DISABLED. Create your Cognito user and enrol MFA.
11. Provision the database: TLS, encryption, the 14-day window, deletion protection, and owner and app roles.
12. Configure the host with every setting in `.env.example`, including `FLIGHT_DECK_PROTECTIVE_BUCKET` and `_REGION`, and attach `AppPolicyArn` to the app's identity. Run `npm run flight-deck:admin -- check-config` until it reports complete.
13. Run `flight-deck:admin -- migrate`, then `init --real`, then `add-operator` for yourself.

## D. Open the console

14. Sign in, go to `/flight-deck/gates`, sign in again when asked, and **approve the console gate**. The admin script's `record-gate` now refuses and points here. `list-gates` must then say "signature and approver verified".
15. Enable the worker schedule, subscribe to the alarm, and point an uptime monitor at the status endpoint.

## E. Separately, and only in writing

16. A counsel-reviewed privacy notice merged with a version string that does not contain "draft".
17. Your written authorization to open the public form. Then approve the public-form gate at `/flight-deck/gates`, citing that authorization, and set `FLIGHT_DECK_PUBLIC_FORM_ENABLED=true`.

Email stays off until a provider, DNS (SPF/DKIM/DMARC), and privacy and legal approval exist. Social stays manual. Archival intake is a different programme with its own gates.
