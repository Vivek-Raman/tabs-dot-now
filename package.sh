#!/bin/sh

set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
version=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$project_dir/manifest.json")

if [ -z "$version" ]; then
  echo "Could not read the extension version from manifest.json." >&2
  exit 1
fi

archive="$project_dir/dist/tabs-now-$version.zip"

mkdir -p "$project_dir/dist"
rm -f "$archive"

cd "$project_dir"
zip -q "$archive" \
  manifest.json \
  popup.html \
  styles.css \
  popup.js \
  options.html \
  options.css \
  options.js \
  spotify-config.js \
  spotify.js \
  background.js

echo "Created $archive"
