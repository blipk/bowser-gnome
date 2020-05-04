#!/bin/sh

./_install.sh
dbus-run-session -- gnome-shell --nested --wayland
