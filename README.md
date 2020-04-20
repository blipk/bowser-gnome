# Bowser Gnome Extension

Create rules to open specific websites in specific web browsers.

[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://paypal.me/deltadevelopments)
[![Website](https://img.shields.io/badge/Bowser-Homepage-blue)](https://github.com/blipk/Bowser)

### Installation

###### Gnome extensions website
<https://extensions.gnome.org/extension/2989/bowser-gnome-extension/>

###### Git
``` bash
cd ~/.local/share/gnome-shell
git clone https://github.com/blipk/bowser-gnome.git extensions
```

###### Clickable installer in the release or run
``` bash
chmod +x _install.sh && ./_install.sh
```

### Usage
![Menu Guide](doc/BowserMenuGuide.png?raw=true "Bowser Menu Guide")

If the ```Create rules on new links``` option is on, you will be able to choose from a list of your web browsers when you open an unrecognized website. The web browser you choose will be the default for that website from now on.<br>

![Dialog Guide](doc/BowserDialogGuide.png?raw=true "Bowser Dialog Guide")

When creating or editing rules, you can choose which part/s of a web address to check them against. You can also make this selection on the new link dialog. The default is just the website name.<br>

![Create and Edit Rules Guide](doc/BowserRulesGuide.png?raw=true "Bowser Create and Edit Rules Guide")


### Support

This has only been thoroughly tested on Gnome Shell version 3.36, although it should work on any version from 3.00 to 3.36.

### Licence

```
This file is part of the Bowser Gnome Extension for Gnome 3
Copyright (C) 2020 A.D. - http://kronosoul.xyz
```

```
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 2 of the License, or
(at your option) any later version.

This program is distributed in the hope this it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.
```
