#!/bin/bash
# Compute SHA256 of bowser.js and update the default value in the GSettings schema XML.
# Called automatically by _package.sh before glib-compile-schemas.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOWSER="$SCRIPT_DIR/bowser-gnome@kronosoul.xyz/bowser.js"
SCHEMA="$SCRIPT_DIR/bowser-gnome@kronosoul.xyz/schemas/org.gnome.shell.extensions.Bowser.gschema.xml"

if [ ! -f "$BOWSER" ]; then
    echo "ERROR: bowser.js not found at $BOWSER"
    exit 1
fi

if [ ! -f "$SCHEMA" ]; then
    echo "ERROR: Schema file not found at $SCHEMA"
    exit 1
fi

HASH=$(sha256sum "$BOWSER" | cut -d' ' -f1)

# Update the default value for bowser-sha256 key in the schema XML.
sed -i "/<key name=\"bowser-sha256\"/,/<\/key>/ s|<default>\"[^\"]*\"</default>|<default>\"$HASH\"</default>|" "$SCHEMA"

if grep -q "$HASH" "$SCHEMA"; then
    echo "Updated bowser-sha256 to: $HASH"
else
    echo "ERROR: Failed to update hash in schema file"
    exit 1
fi
