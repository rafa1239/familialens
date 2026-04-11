#!/bin/bash
# Deploy FamiliaLens to raphaelaltieri.com/public/familialens/
# Builds the Vite app then rsyncs dist/ into the portfolio.
# The portfolio's own deploy.sh must be run afterwards to push to Cloudflare.
set -e

PORTFOLIO="../raphaelaltieri.com/public/familialens"

if [ ! -d "../raphaelaltieri.com/public" ]; then
  echo "Error: raphaelaltieri.com/public not found as sibling directory."
  exit 1
fi

echo "Building (vite build)..."
npm run build

if [ ! -d "dist" ]; then
  echo "Error: build did not produce dist/"
  exit 1
fi

echo "Syncing dist/ → $PORTFOLIO"
mkdir -p "$PORTFOLIO"
rsync -av --delete dist/ "$PORTFOLIO/"

echo ""
echo "Done. Now deploy the portfolio:"
echo "  cd ../raphaelaltieri.com && ./deploy.sh prod"
