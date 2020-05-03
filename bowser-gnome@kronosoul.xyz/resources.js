const BOWSERG_DESKTOP_FILE = `[Desktop Entry]
Version=1.0
Name=Bowser Gnome Extension
Name[en_AU]=Bowser Gnome Extension
GenericName=Bowser Web Browser Chooser
Comment=Set up rules to open specific URLs in specific web browsers
Exec=bash -c 'U="%u"; if [ "$U" = "" ]; then U="--s"; fi; echo $U >> ${imports.misc.extensionUtils.getCurrentExtension().imports.fileUtils.URI_FILE}'
Icon=bowser
Terminal=false
Type=Application
MimeType=text/html;text/xml;application/xhtml+xml;application/vnd.mozilla.xul+xml;text/mml;x-scheme-handler/http;x-scheme-handler/https;application/xml;application/rss+xml;application/rdf+xml;image/gif;image/jpeg;image/png;x-scheme-handler/http;x-scheme-handler/https;x-scheme-handler/ftp;x-scheme-handler/chrome;video/webm;application/x-xpinstall;
Categories=Network;WebBrowser;
Keywords=web;browser;internet;Internet;WWW;Browser;Web;Explorer;
X-Desktop-File-Install-Version=0.24
`;