# Summary

tRPC API and authentication router that can be deployed either as part of the Cloudflare Workers edge layer or as a standalone API server.

## Tech Stack

TypeScript, tRPC, Drizzle ORM, Better Auth.

## Commands

- `bun dev` - Start development server
- `bun build` - Build production server
- `bun test` - Run tests
- `bun typecheck` - Type check the codebase
- `bun run test:container` - Run tests in a container
- `bun run logs` - View logs from Cloudflare
- `bun run migrate:local` - Run migrations locally
- `bun run migrate:remote` - Run migrations remotely
- `bun run test:health` - Test health check

## Deployment Commands

> you run deploy:local only

- `bun run deploy:local` - YOU RUN THIS

> YOU DO NOT RUN THESE, THEY ARE FOR CI/CD ONLY:

- `bun run deploy` - Deploy to Cloudflare
- `bun run deploy:preview` - Deploy to Cloudflare Preview

## References

- https://trpc.io/llms.txt
- https://www.better-auth.com/llms.txt
