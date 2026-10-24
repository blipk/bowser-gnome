# Bowser Gnome Extension

Create rules to open specific websites in specific web browsers for links clicked in any application on your computer.

[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.com/donate?hosted_button_id=T35UZZSUMK66L)
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
chmod +x install.sh && ./install.sh
```

### Usage
![Menu Guide](doc/BowserMenuGuide.png?raw=true "Bowser Menu Guide")

If the ```Create rules on new links``` option is on, you will be able to choose from a list of your web browsers when you open an unrecognized website. The web browser you choose will be the default for that website from now on.<br>

![Dialog Guide](doc/BowserDialogGuide.png?raw=true "Bowser Dialog Guide")

When creating or editing rules, you can choose which part/s of a web address to check them against. You can also make this selection on the new link dialog. The default is just the website name.<br>

![Create and Edit Rules Guide](doc/BowserRulesGuide.png?raw=true "Bowser Create and Edit Rules Guide")


### Support

This extension supports GNOME Shell versions 48, 49, 50 and 51. The supported versions are set in [metadata.json](bowser-gnome@kronosoul.xyz/metadata.json).

### Licence

```
This file is part of the Bowser Gnome Extension for Gnome 3
Copyright (C) 2024 A.D. - http://kronosoul.xyz
```

```
This program is free software: you can redistribute it and/or modify
it under the terms of the BSD 2-clause licence.

This program is distributed in the hope this it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the BSD 2-clause License for more details.
```