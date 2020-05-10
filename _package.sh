#!/bin/bash
glib-compile-resources ./res/org.kronosoul.Bowser.xml
mv ./res/org.kronosoul.Bowser.gresource ./bowser-gnome@kronosoul.xyz
cd bowser-gnome@kronosoul.xyz
zip -r ../bowser-gnome@kronosoul.xyz.zip *
cd ..
zip bowser-gnome@kronosoul.xyz.zip install.sh 'Install Bowser Gnome.desktop'