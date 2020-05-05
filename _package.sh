#!/bin/bash
glib-compile-resources ./res/org.gnome.shell.extensions.bowser-gnome.xml
mv ./res/org.gnome.shell.extensions.bowser-gnome.gresource ./bowser-gnome@kronosoul.xyz
zip -jr bowser-gnome@kronosoul.xyz.zip bowser-gnome@kronosoul.xyz