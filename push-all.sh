#!/bin/sh
set -e

# Configure git identity
git config user.email "deploy@kewa-wms.local"
git config user.name "Kewa WMS Deploy"

# Set remote to new target repo (HTTPS with token)
git remote remove target 2>/dev/null || true
git remote add target "https://${GH_TOKEN}@github.com/davaardana/kewa-wms-local.git"

# Disable gitignore so ALL files are tracked (vendor, node_modules, dist, .env, etc.)
git config core.excludesfile ""

# Remove existing .gitignore from working effect temporarily by moving it
mv .gitignore .gitignore.bak 2>/dev/null || true

# Stage everything including previously ignored files
git add -A --force

# Restore gitignore file itself back (we want it in the commit too)
mv .gitignore.bak .gitignore 2>/dev/null || true
git add .gitignore 2>/dev/null || true

# Commit with timestamp
git commit -m "chore: full local snapshot including vendor/node_modules/dist $(date -u '+%Y-%m-%d %H:%M:%S UTC')" || echo "Nothing new to commit, proceeding..."

# Push to target
git push target main --force

echo "DONE - pushed to https://github.com/davaardana/kewa-wms-local"
