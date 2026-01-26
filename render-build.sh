#!/usr/bin/env bash
# exit on error
set -o errexit

npm install

# Install Chromium for Puppeteer
npx puppeteer browsers install chrome

# This is often needed on Render to ensure Puppeteer can find Chromium
# and has all necessary system libraries.
# Also, we might need to clear the cache if previous builds failed.
# npm run build # if there was a build step
