#!/bin/sh

set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
version=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$project_dir/manifest.json")

if [ -z "$version" ]; then
  echo "Could not read the extension version from manifest.json." >&2
  exit 1
fi

archive="$project_dir/dist/tabs-now-$version.zip"

rm -rf "$project_dir/dist"
mkdir -p "$project_dir/dist"

cd "$project_dir"
zip -q "$archive" \
  manifest.json \
  src/popup/popup.html \
  src/popup/styles.css \
  src/popup/popup.js \
  src/options/options.html \
  src/options/options.css \
  src/options/options.js \
  src/content/open-top-result.js \
  spotify-config.js \
  src/background/spotify.js \
  src/background/background.js

echo "Created $archive"
