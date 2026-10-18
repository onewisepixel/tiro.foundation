# Flight Deck: activation checklist

For: the founder. Each line is either a decision only you can make, or an action needing an account, money, or authorization. In order. Nothing below has been done.

## A. Decisions

1. **Database provider and region.** Recommendation: Amazon RDS for PostgreSQL, single-AZ, in a TIRO-controlled AWS account; region per counsel (an EU/UK region, or Africa (Cape Town) if local residency matters for the pilot). Alternative: Neon if minimal operating effort outweighs residency choice. (`integrations.md` §4)
2. **Who the operators are** at launch (you, plus any operator), and whether to appoint an independent reviewer now or later.
3. **Data controller** while TIRO is unincorporated, and **counsel** for the privacy review.
4. **Backup retention window** (this becomes the "backups expire within N days" sentence in deletion confirmations).
5. **Restore-ledger store**: approve an S3 bucket with versioning and Object Lock in the same account.

## B. Provision (needs AWS access and spending)

6. Deploy `deploy/flight-deck/flight-deck.template.json` (schedule stays DISABLED). Create your Cognito user, enrol MFA, add yourself to `flight-deck`.
7. Provision the database (TLS, encryption, backups); create an owner role (migrations) and an app role.
8. Configure the host with the secrets and settings in `.env.example`; run `npm run flight-deck:admin -- check-config` until it reports complete.
9. `flight-deck:admin -- migrate`, then `init --real`, then `add-operator` for yourself.
10. Provision the ledger bucket and connect it (a small sink implementation is still needed; the interface exists).

## C. Verify on staging

11. Sign in with MFA; sign out; deactivate a test operator mid-session.
12. Restore drill with the provider's point-in-time restore plus `replay-ledger` (`operations.md` §6).
13. Manual accessibility test and a human-paced founder review (`manual-tests.md`); record both.

## D. Open the console

14. `flight-deck:admin -- record-gate console --by "Your name"`; enable the worker schedule; subscribe to the alarm; point an uptime monitor at the status endpoint.

## E. Separately, and only in writing

15. Counsel-reviewed privacy notice merged with a version without "draft".
16. Your written authorization to open the public form; then `record-gate public-form --notice-version …` and set `FLIGHT_DECK_PUBLIC_FORM_ENABLED=true`.

Email stays off until a provider, DNS (SPF/DKIM/DMARC), privacy and legal approval exist; social stays manual. Archival intake is a different programme with its own gates.
