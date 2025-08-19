This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

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

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Authentication (NextAuth)

This project includes a NextAuth App Router route at `app/api/auth/[...nextauth]/route.ts` with an Apple provider example.

Install NextAuth:

```bash
npm install next-auth
```

Required environment variables for Apple sign-in:

- APPLE_CLIENT_ID — Apple Service ID / Client ID
- APPLE_TEAM_ID — Apple Developer Team ID
- APPLE_KEY_ID — Key ID for the private key
- APPLE_PRIVATE_KEY — The .p8 private key contents (escape newlines as `\n`)
- NEXTAUTH_SECRET — a strong random secret
- NEXTAUTH_URL — your site URL (used in OAuth redirects)

After setting env vars, restart the dev server.

## Vercel production setup

Do not commit real secrets to the repository. Use the Vercel dashboard or the Vercel CLI to set production environment variables.

1. Create a `.env.production` locally from `.env.production.example` for reference (do NOT commit it).
2. In the Vercel Dashboard, open your project -> Settings -> Environment Variables and add the variables from `.env.production.example` (REPLACE the placeholder values).

Optional: use the Vercel CLI to set variables from your terminal:

```bash
# install vercel CLI if needed
npm i -g vercel

# set an environment variable for the production environment
vercel env add NEXTAUTH_SECRET production
# follow prompts to paste the secret value

# deploy
vercel --prod
```

Ensure `REDIS_URL` and `NEXTAUTH_SECRET` are set in production. If you use MongoDB for any features, also set `MONGODB_URI`.

