#!/usr/bin/env bash
# exit on error
set -o errexit

# Install dependencies
npm install

# NOTE: We are using @sparticuz/chromium which provides its own chromium binary.
# This avoids the need for 'npx puppeteer browsers install chrome' which
# can be unreliable in some restricted environments like Render's free tier.
