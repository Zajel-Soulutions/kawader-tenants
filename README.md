# Kawader tenant directory

Maps a **company code** to that customer's Odoo deployment. The Kawader mobile app fetches
[`v1.json`](./v1.json) on first launch, when the employee types their company code, and stores the
resolved host on the device.

**One app build serves every customer.** There is no per-customer build, no per-customer app repo
and no per-customer store listing. Onboarding a new customer is an entry in this file.

This is operational data, not application source, which is why it lives in its own repository:
moving a customer to a new host is one commit here, with its own history and access control, and it
never touches the app repo or requires an app release.

## The file

```json
{
  "version": 1,
  "tenants": {
    "OTAISHAN": {
      "name": "Al Otaishan",
      "base_url": "https://erp-otaishan-staging3-36136457.dev.odoo.com",
      "api_prefix": "/api"
    }
  }
}
```

- **Key** — the company code the employee types. Uppercase, `[A-Z0-9_-]`, 2–32 characters. The app
  normalises input (trims, strips punctuation, uppercases) before looking it up, so `acme` and
  `ACME` both find `ACME`. The code also becomes a device storage key suffix, which is where the
  character restriction comes from.
- **`name`** — shown on the confirmation step before the employee signs in. Use the name they would
  recognise, not the legal entity.
- **`base_url`** — origin only, no trailing slash. **Must be `https://`.** The app rejects anything
  else outright: Android and iOS both block cleartext by default, so an `http://` entry would reach
  the employee as "the server isn't responding" for a misconfiguration on our side.
- **`api_prefix`** — `''` or a leading-slash path with no trailing slash. Per customer, so one
  deployment can sit on `/api/v1` while another is still on `/api`, with the same app build talking
  correctly to both. This is how a customer is migrated to a new API version without an app release.

## Adding a customer

1. Add the entry here and commit.
2. Confirm their Odoo answers on a public HTTPS hostname.
3. HR gives their staff the code.

That is the whole process. No build, no store submission, no app update.

## Editing hazards

The code is a **key into this file**, never a URL — the app will not accept a host from a deep link,
a QR code or an API response. So the only way a customer's app reaches a server is if that server is
written here. Treat a change with the care that implies.

- Adding a customer is additive and safe: existing installs are unaffected.
- Changing a `base_url` **migrates every installed device** on that code at its next launch. The app
  re-reads this file in the background and silently follows the move, so nobody re-enters a code —
  which also means a mistake here reaches everyone, with no way to recall it.
- Removing an entry does **not** unbind devices already bound to it. That is deliberate: a
  temporarily withdrawn entry must not lock a customer's staff out mid-shift.

Every entry is world-readable. Do not put anything here that is not safe to publish.

## Serving

Published with GitHub Pages from `main` at the repository root, behind the custom domain in
[`CNAME`](./CNAME):

```
https://tenants.kawader.app/v1.json
```

The custom domain is the point. That URL is compiled into every app build, so it has to outlive this
repository — with a domain in front, the file can move between repositories or off GitHub entirely
and no installed app notices. **Never ship a build pointing at a `*.github.io` address.**

The app also caches the file on the device, so a launch works while this is unreachable; a code that
has never been cached needs the file to be reachable at least once.
