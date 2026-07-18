# KnitStitch

I've always been interested in knitting machines, even though I can't knit by hand. I like how the finished products look, but the machines are expensive. 

I came across the open-source 3D-printable knitting machine by [ScarlettSparks/KnittingMachine](https://github.com/ScarlettSparks/KnittingMachine) and decided to build one. This gave me a way to actually produce knitted items without needing manual knitting skills.

As I used the machine, I found that the available software tools were either too basic, a paid product or for colourwork generation. I wanted a free tool for designing and generating knitting patterns based on measurements of the finished item and the tension the machine/yarn happens to create.

KnitStitch is a web-based application for digital knitting design. It's meant to be straightforward to use while still providing the functionality needed to create patterns over different sizes and machines/yarns.

This is very much a work in progress with lots of ideas and features to add. If you have any suggestions or want to contribute, please let me know!

## Deployment

The app is hosted on a VPS and deploys automatically when commits land on the `master` branch via a GitHub webhook. A small Node.js webhook server (`scripts/webhook-server.mjs`, kept alive with PM2) verifies the GitHub signature, pulls the latest code, and runs `npm ci` + `npm run build` to produce the static `dist/` directory.

The current application is local-only and does not yet have accounts or
server-backed pattern storage. The planned account system will add a
self-hosted Node/TypeScript API using Better Auth, preferably behind the same
origin under `/api`. See the [roadmap](docs/roadmap.md#accounts-and-saved-patterns)
for the planned authentication, authorization, and saved-pattern work.

## Acknowledgements

- [Devin](https://devin.ai) by Cognition — AI coding agent used throughout development
- [Codex](https://openai.com/index/codex/) — AI coding assistance
- [SolveSpace](https://solvespace.com/) — constraint solver, compiled to WebAssembly for the in-browser sketch constraint system (see `public/wasm/`)
- [Better Auth](https://www.better-auth.com/) — planned authentication backend for the future account and saved-pattern system (to be implemented)