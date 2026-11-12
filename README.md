This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Deploying passenger phone encryption

The server encrypts phone numbers before storing them in `passengers` and `reservations`. The passenger page displays the decrypted number to signed-in `ADMIN` and `STAFF` accounts. Existing usernames and roles carry over. The passwords used by the old browser login must be replaced because that login could read the password column directly.

1. Add the following variables to your ignored `.env.local` and to the Next.js hosting environment for the same Supabase project. Keep the existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - `SUPABASE_SECRET_KEY` is the project's server secret API key from Supabase. The legacy `service_role` key also works.
   - `PHONE_ENCRYPTION_KEY` and `TSRMS_SESSION_SECRET` are two different random 64-character hexadecimal values. Run `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` twice to generate them. Store the encryption key securely and use the same value for the data migration and the deployment. Existing encrypted numbers require that key.
2. Schedule a short maintenance window. In Supabase SQL Editor, run `supabase/sql/protect_passenger_phones.sql`. This switches the old browser login and booking creation off, so complete the remaining steps before reopening the site. Run the schema setup scripts first only if this is a new Supabase database.
3. From the project folder, run `npm run migrate:phones`. It encrypts the old numbers in both tables. The command can be rerun with the same key if interrupted.
4. Run `npm run reset:staff-password -- USERNAME` once for each account, replacing `USERNAME` with the exact username. The command prints the new password locally. Give each account holder their own password privately. Use the same command for later resets.
5. Deploy the new Next.js build. Sign in with one of the new passwords, open **Passengers** to verify a migrated number, create a test booking, and cancel it. In Supabase the corresponding `phone` fields should begin with `enc:v1:`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
