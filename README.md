# scottbronder.com

A playable single-page site for Cloudflare Pages — six synthesized guitar
strings you can actually strum, plus a setlist of recent work.
There is no build step — the site is just `index.html` plus a `_headers` file,
with zero external requests (fonts, icons, and audio are all inline/generated).

## Deploying to Cloudflare Pages

### Option A: Dashboard (no tools required)

1. Go to https://dash.cloudflare.com → Workers & Pages → Create → Pages.
2. Choose **Direct Upload** and drag-and-drop this folder.
3. After the first deploy, add your custom domain (`scottbronder.com`)
   under the project's **Custom domains** tab and follow the DNS instructions.

### Option B: Wrangler CLI

```sh
npx wrangler login
npx wrangler pages deploy . --project-name=scottbronder-com
```

Then add the custom domain in the dashboard under the project's
**Custom domains** tab.

### Option C: Git integration

Push this folder to a GitHub/GitLab repo, then in the Cloudflare dashboard
create a Pages project connected to that repo. Leave **build command** empty
and set the **output directory** to `/`. Pushes to the main branch deploy
automatically.

## Editing

Everything lives in `index.html` — text, styles, and the favicon are all
inline, so it's a single small file with no external requests.
