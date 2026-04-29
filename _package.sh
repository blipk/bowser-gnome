#!/bin/bash
# Update bowser.js SHA256 hash in schema before compiling
bash "$(dirname "$0")/_update-bowser-hash.sh"
rm -f ./bowser-gnome@kronosoul.xyz/schemas/gschemas.compiled
glib-compile-schemas ./bowser-gnome@kronosoul.xyz/schemas
glib-compile-resources ./res/org.kronosoul.Bowser.xml
mv ./res/org.kronosoul.Bowser.gresource ./bowser-gnome@kronosoul.xyz
rm -rf bowser-gnome@kronosoul.xyz.zip
cd bowser-gnome@kronosoul.xyz
bsdtar -a -cf ../bowser-gnome@kronosoul.xyz.zip --exclude 'schemas/gschemas.compiled' *
cd ..