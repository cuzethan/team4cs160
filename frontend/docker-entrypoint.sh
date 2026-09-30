#!/bin/sh
# The container keeps node_modules in its own volume, so a rebuilt image
# does not update installed packages. Reinstall when the lockfile changes.
set -e

if [ ! -f node_modules/.package-lock.sha ] || ! cmp -s package-lock.json node_modules/.package-lock.sha; then
  echo "Dependencies changed. Installing..."
  npm ci
  cp package-lock.json node_modules/.package-lock.sha
fi

exec "$@"
