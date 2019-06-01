# Greenlock&trade; in your Browser

Taking greenlock&trade; (Let's Encrypt v2 / ACME client) where it's never been before: Your browser!

# Official Site

This app is available at <https://greenlock.domains>.

We expect that our hosted version will meet all of yours needs.
If it doesn't, please open an issue to let us know why.

We'd much rather improve the app than have a hundred different versions running in the wild.
However, in keeping to our values we've released the source for others to inspect, improve, and modify.

# Trademark Notice

Greenlock&trade; is our trademark. If you do host your own copy of this app,
please do provide attribution, but please also use your branding.

# Install

```bash
git clone ssh://gitea@git.coolaj86.com:22042/coolaj86/greenlock.html.git
pushd greenlock.html/
  bash install.sh
popd
```

# Usage

Simply host from your webserver.

For example

```bash
pushd greenlock.html/
  bash serve.sh
```
