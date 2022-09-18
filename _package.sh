#!/bin/bash
glib-compile-schemas ./bowser-gnome@kronosoul.xyz/schemas
glib-compile-resources ./res/org.kronosoul.Bowser.xml
mv ./res/org.kronosoul.Bowser.gresource ./bowser-gnome@kronosoul.xyz
rm -rf bowser-gnome@kronosoul.xyz.zip
cd bowser-gnome@kronosoul.xyz
zip -r ../bowser-gnome@kronosoul.xyz.zip * &&
cd ..