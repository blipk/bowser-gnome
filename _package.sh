#!/bin/bash
glib-compile-resources ./res/org.kronosoul.bowser-gnome-extension.xml
mv ./res/org.kronosoul.bowser-gnome-extension.gresource ./bowser-gnome@kronosoul.xyz
zip -jr bowser-gnome@kronosoul.xyz.zip bowser-gnome@kronosoul.xyz
zip bowser-gnome@kronosoul.xyz.zip install.sh 'Install Bowser Gnome.desktop'