#!/bin/bash
./_package.sh
./bowser-gnome@kronosoul.xyz/install.sh
dbus-run-session -- gnome-shell --nested --wayland