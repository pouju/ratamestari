# Security policy

## Supported versions

Only the latest release, the one live at [pouju.github.io/ratamestari](https://pouju.github.io/ratamestari/), gets security fixes.

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub's private vulnerability reporting](https://github.com/pouju/ratamestari/security/advisories/new), not in a public issue. Include the app version (shown in the footer), the browser, and steps to reproduce.

This is a small volunteer project. You can expect a first reply within a week, and we will tell you when a fix is released.

## What counts as a security issue

Ratamestari promises that **the map never leaves the user's computer**, and users may enter their own Claude API key. We treat these as security issues:

- Anything that sends the map file, map geometry or coordinates off the user's computer, to the AI provider or anywhere else
- Anything that exposes the user's API key to another site or script, such as cross-site scripting
- Vulnerabilities in our dependencies that affect the app as it is deployed

Bugs in course setting, rule checks or exports are ordinary bugs. Please open a [normal issue](https://github.com/pouju/ratamestari/issues/new/choose) for them.
