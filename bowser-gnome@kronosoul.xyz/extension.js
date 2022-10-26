/*
 * Bowser extension for Gnome 3
 * This file is part of the Bowser Gnome Extension for Gnome 3
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

// External imports
const Main = imports.ui.main;
const extensionSystem = imports.ui.extensionSystem;
const ByteArray = imports.byteArray;
const { GLib, Gio, Clutter, St, Shell, Soup } = imports.gi;
const { extensionUtils, util } = imports.misc;

// Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { dev, utils, fileUtils, uiUtils, panelIndicator } = Me.imports;
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;

function init() {
    extensionUtils.initTranslations();
}

function enable() {
    try {
    fileUtils.enable()
    dev.log(arguments.callee.name+'()');
    if (Me.bowserIndicator) return; // Already initialized

    Me.URIs = Array();
    Me.PYBOWSER = false;
    Me.settings = extensionUtils.getSettings(Me.metadata['settings-schema']);

    // For older versions of Gnome-Shell
    if (extensionSystem.connect) Me.extensionChangedHandler = extensionSystem.connect('extension-state-changed', enable);

    // Check/install status then start watching
    _checkBowser();
    _enableURIWatcher();

    // Spawn indicator
    Me.bowserIndicator = new panelIndicator.BowserIndicator();
    Main.panel.addToStatusArea('BowserIndicator', Me.bowserIndicator, 1);
    dev.log(arguments.callee.name+'()', ";");
    } catch(e) { dev.log(e); }
}
function disable() {
    try {
    dev.log(arguments.callee.name+'()');
    if (Me.settings) Me.settings.run_dispose(); delete Me.settings;
    if (Me.extensionChangedHandler) extensionSystem.disconnect(extensionChangedHandler);
    if (Me.bowserIndicator) Me.bowserIndicator.destroy(); delete Me.bowserIndicator;
    if (Me.URIs) delete Me.URIs
    if (Me.PYBOWSER) delete Me.PYBOWSER
    dev.log(arguments.callee.name+'()', ";");
    } catch(e) { dev.log(e); }
}
// 3.0 API backward compatibility
function main() {
    init(); enable();
}

function _checkBowser() {
    try {
    _installbowser();
    if (fileUtils.checkExists([fileUtils.PYBOWSER_EXEC_FILE])) Me.PYBOWSER = true;
    if (!fileUtils.checkExists([fileUtils.BOWSER_CONF_FILE()])) makeConfiguration();
    loadConfiguration();
    } catch(e) { dev.log(e); }
}
function _installbowser() {
    try {
    // Load compiled resources
    Gio.Resource.load(fileUtils.RES_FILE)._register();

    // Create and install XDG Dekstop file
    //if (!fileUtils.checkExists([fileUtils.DESKTOP_FILE]))
        fileUtils.installResource("res/bowser-gnome.desktop", fileUtils.DESKTOP_FILE);
        GLib.spawn_command_line_sync("xdg-desktop-menu install "+fileUtils.CONF_DIR+"/bowser-gnome.desktop --novendor");

    // Set as default and set our URI passing script to executable
    if (getxdgDefaultBrowser() != 'bowser-gnome.desktop') setxdgDefaultBrowser('bowser-gnome.desktop');
    util.spawn(['chmod', '+x', fileUtils.BOWSER_EXEC_FILE]);

    // Install icon resources
    if (!fileUtils.checkExists([fileUtils.PNG_ICON_FILE]))
        fileUtils.installResource("res/bowser.png", fileUtils.PNG_ICON_FILE);
        util.spawnCommandLine("xdg-icon-resource install --novendor --context apps --size 256 "+fileUtils.PNG_ICON_FILE+" bowser");

    if (!fileUtils.checkExists([fileUtils.SVG_ICON_FILE])) // xdg-icon-resource does not accept svg
        fileUtils.installResource("res/bowser.svg", fileUtils.SVG_ICON_FILE);

    util.spawnCommandLine("gtk-update-icon-cache -f ~/.local/share/icons/hicolor --ignore-theme-index");
    } catch(e) { dev.log(e); }
}
function _enableURIWatcher() {
    try {
        Me.settings.processing = false;
        this.uriListSettingsHandler = Me.settings.connect('changed::uri-list', () => {
            if (Me.settings.processing) return;
            Me.settings.processing = true;
            Me.URIs = Me.URIs.concat(JSON.parse(Me.settings.get_string('uri-list')));
            Me.settings.set_string('uri-list', "[]");
            processURIs();
            Me.settings.processing = false;
        });
    } catch(e) { dev.log(e); }
}
function processURIs() {
    try {
        //Parse our URI/s
        if (!Array.isArray(Me.URIs)) Me.URIs = [Me.URIs];

        // Search for open settings call anywhere in the stack
        let cancel = false;
        Me.URIs.forEach(function(URI, i) {
            if (URI == '--s') {
                Me.URIs = Me.URIs.slice(Me.URIs.indexOf(URI), Me.URIs.indexOf(URI)+1);
                Me.bowserIndicator.menu.toggle();
                cancel = true;
            } else if (URI == '--default') {
                Me.URIs = Me.URIs.slice(Me.URIs.indexOf(URI), Me.URIs.indexOf(URI)+1);
                openBrowser("", false)
                cancel = true;
            }
        }, this);

        if (!cancel) openBrowser();
    } catch(e) { dev.log(e); }
}
function openBrowser(overrideURI, askOnUnmatchedURI = Me.config.askOnUnmatchedURI) {
    try {
    let URI = Me.URIs[0];
    if (overrideURI) URI = overrideURI;
    let matchFound = false;
    let matchedBrowsers = Array();
    let splitURI = utils.splitURI(URI);
    splitURI.pageTitle = '';
    splitURI.pageContents = '';

    Me.config.uriPrefs.forEachEntry(function(prefKey, prefValues, i) {
        let compareURI = '';

        Me.config.uriPrefs[prefKey].uriOptions.forEachEntry(function(optionKey, optionValue, n) {
            if (!optionValue || !splitURI[optionKey]) return;
            if (optionValue && optionKey != 'scheme') compareURI += splitURI[optionKey].toLowerCase();

            // Search page titles and contents
            if ((splitURI['pageContents'] == '') && (optionKey == 'pageTitle' || optionKey == 'pageContents')) {
                let msg = Soup.Message.new_from_uri('GET', new Soup.URI(URI));
                let httpSession = new Soup.Session();
                httpSession.timeout = 3;
                httpSession.send_message(msg);
                if (msg.status_code === 200) {
                    try {
                    splitURI['pageContents'] = msg.response_body.data.toLowerCase();
                    if (splitURI['pageContents']) splitURI['pageTitle'] = splitURI['pageContents'].match(/<title>[^<]*/)[0];
                    } catch (e) { dev.log(e); } finally { splitURI['pageContents'] = ' ' };
                } else {
                    splitURI['pageContents'] = ' ';  // If we don't get an OK response, set this so we don't keep trying
                }
            }

            if (splitURI[optionKey].indexOf(prefKey.toLowerCase()) > -1 || (compareURI.indexOf(prefKey.toLowerCase()) > -1 && compareURI)) {
                let browserAlreadyOpened = false;
                matchedBrowsers.forEach(function(entry, i){
                    if (entry == Me.config.uriPrefs[prefKey].defaultBrowser) browserAlreadyOpened = true
                }, this);
                if (matchFound && browserAlreadyOpened) return;
                matchFound = true;
                matchedBrowsers.push(Me.config.uriPrefs[prefKey].defaultBrowser)

                let exec = Me.config.browserApps[Me.config.uriPrefs[prefKey].defaultBrowser][1].replace("%u", URI).replace("%U", URI);
                let [success, argv] = GLib.shell_parse_argv(exec);
                util.spawn(argv);
                Me.URIs.shift();
                if (Me.URIs.length > 0) Me.openBrowser();
            }
        }, this);
    }, this);

    if (askOnUnmatchedURI && matchFound == false) {
        spawnUnmatchedURIDialog()
    } else if (!matchFound) {
        let exec = Me.config.browserApps[Me.config.defaultBrowser][1].replace("%u", URI).replace("%U", URI);
        let [success, argv] = GLib.shell_parse_argv(exec);
        util.spawn(argv);
        Me.URIs.shift();
    }
    } catch(e) { dev.log(e); }
}
function spawnUnmatchedURIDialog() {
    // Parse the URI list in sequential dialogs
    let splitURI = utils.splitURI(Me.URIs[0]);
    let editable = Object();
    let editables = Array()

    // Build dialog
    editable.uriOptions = {'authority': true, 'path': false, 'query': false, 'fragment': false};
    let uriOptionsValidation = function(value, n) {
            // URL logic
            let allowed = true;
            let boolValues = Object.values(value)
            if (boolValues[n]) { // If ENABLED
                if (boolValues.filter(Boolean).length <= 1) allowed = false;   // No disabling if only one is on
                if (!boolValues.includes(false)) {      // If they are all on
                    if (n == 2) boolValues[3] = false; // Drop the rest of the chain if we toggle a middle element
                    if (n == 1) boolValues[2] = boolValues[3] = false;
                    //if (boolValues.length > 1) allowed = true;    //
                }
                if (boolValues[n+1] == boolValues[n] && boolValues[n-1] == boolValues[n]) boolValues[n+1] = !boolValues[n];    // Drop adjacent to maintian chain
            } else {        // If DISABLED
            if (boolValues[n+1] == boolValues[n] && boolValues[n-1] == boolValues[n]) allowed = false; // No enabling that will break the URL chain
                if (n+1 == boolValues.length && boolValues[n-1] == false) allowed = false; // No enabling of the end if its neighbour is not enabled
                if (n == 0 && (boolValues[n+1] == false)) allowed = false;   // No enabling the first element if its neighbour is not enabled
                if (boolValues.indexOf(true) == -1) allowed = true; // Always allow enable if none are enabled
            }
            return [allowed, boolValues];
    }
    let uriOptionsEditables = [{hideElement: true, toggleValidationCallback: uriOptionsValidation, }];
    uriOptionsEditables.push(Object.assign({authority: splitURI['authorityTrim'] || ' ', hidden: (splitURI['authorityTrim']=='')}, uriOptionsEditables[0]));
    uriOptionsEditables.push(Object.assign({path: splitURI['path'] || ' ', hidden: (splitURI['path']=='')}, uriOptionsEditables[0]));
    uriOptionsEditables.push(Object.assign({query: splitURI['query'] || ' ', hidden: (splitURI['query']=='')}, uriOptionsEditables[0]));
    uriOptionsEditables.push(Object.assign({fragment: splitURI['fragment'] || ' ', hidden: (splitURI['fragment']=='')}, uriOptionsEditables[0]));
    editables.push({uriOptions: ' ', subObjectEditableProperties: uriOptionsEditables, boxStyle: {style_class: 'browser-uri-box', reactive: true, can_focus: true, x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.FILL}})

    Me.config.browserApps.forEachEntry(function(browserAppKey, browserAppValue, i){
        editable[browserAppKey] = browserAppValue[0]

        editables[i+1] = {[browserAppKey]: browserAppValue[0],
                        iconStyle: {style_class: 'browser-label-icon', icon_size: 42, icon_name: browserAppValue[3] ? browserAppValue[3] : 'web-browser-sybmolic'},
                        hideElement: true,
                        labelStyle: {style_class: 'browser-label', x_align: St.Align.START, y_align: St.Align.MIDDLE},
                        boxStyle: {style_class: 'browser-box', reactive: true, can_focus: true, x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.FILL, y_align: Clutter.ActorAlign.FILL},
                        };

        editables[i+1].boxClickCallback = function(i) {
            // Create rule
            let outURI = ''

            this.editableObject.uriOptions.forEachEntry(function(key, value, z) {
                if (key == 'authority') key = 'authorityTrim'
                if (value == true) outURI += splitURI[key];
                //Drop the www. in the domain for the pref
                if (key == 'authorityTrim' && outURI.substr(0, 4) == 'www.') outURI = outURI.substring(4, outURI.length);
            }, this);

            let uriOptions = {'scheme': false, 'authority': this.editableObject.uriOptions.authority || false, 'path': this.editableObject.uriOptions.path || false, 'query': this.editableObject.uriOptions.query || false, 'fragment': this.editableObject.uriOptions.fragment || false, pageTitle: false, pageContents: false}
            Me.config.uriPrefs[outURI] = {'defaultBrowser': this.propertyKeys[i], 'uriOptions': uriOptions};
            saveConfiguration();

            uiUtils.showUserFeedbackMessage("New rule created.");

            // Let the rule match
            openBrowser();

            // Process next URI in the close() callback in case the request was cancelled
            this.editableObject.ruleCreated = true;
            this.close();
        };
    }, this);

    let dialogStyle = { styleClass: 'browser-dialog', destroyOnClose: true };
    let buttonStyles = [{ label: "Cancel", key: Clutter.KEY_Escape, style_class: 'browser-dialog-buttons' }];
    let createRuleDialog = new uiUtils.ObjectEditorDialog('', (returnObject) => {
            if (!returnObject.ruleCreated) Me.URIs.shift();
            if (Me.URIs.length > 0) spawnUnmatchedURIDialog(Me.URIs);
            return;
    }, editable, editables, buttonStyles, dialogStyle, 'browser-dialog-content-box');
}
function loadConfiguration(configObject = null, filename = 'bowser.conf', filedirectory = fileUtils.BOWSER_CONF_DIR()) {
    try {
    if (!configObject) {
        configObject = fileUtils.loadJSObjectFromFile(filename, filedirectory);
        if (!utils.isEmpty(configObject) /*&& utils.isEmpty(Me.config)*/) {
            Me.config = JSON.parse(JSON.stringify(configObject));
        }
    } else {
        if (utils.isEmpty(configObject)) return;
        Me.config = JSON.parse(JSON.stringify(configObject));
    }
    } catch(e) { dev.log(e); }
}

function saveConfiguration(filename = 'bowser.conf', filedirectory = fileUtils.BOWSER_CONF_DIR()) {
    try {
    if (utils.isEmpty(Me.config)) return;
    let configCopy = JSON.parse(JSON.stringify(Me.config));
    let timestamp = new Date().toLocaleString().replace(/[^a-zA-Z0-9-. ]/g, '').replace(/ /g, '');
    fileUtils.saveJSObjectToFile(configCopy, filename, filedirectory);
    } catch(e) { dev.log(e); }
}

function makeConfiguration() {
    try{
    if (Me.config == undefined) Me.config = {};
    if (Me.config.browserApps == undefined) Me.config.browserApps = {};
    if (Me.config.defaultBrowser == undefined) Me.config.defaultBrowser = '';
    if (Me.config.uriPrefs == undefined) Me.config.uriPrefs = {};
    if (Me.config.askOnUnmatchedURI == undefined) Me.config.askOnUnmatchedURI = true;
    detectWebBrowsers();
    let currentWebBrowser = getxdgDefaultBrowser();
    if (currentWebBrowser.indexOf('bowser.desktop') == -1 || currentWebBrowser.indexOf('bowser-gnome.desktop') == -1) setxdgDefaultBrowser();
    let tmp = {'scheme': false, 'authority': true, 'path': false, 'query': false, 'fragment': false, 'pageTitle': false, 'pageContents': false}
    if (Object.keys(Me.config.uriPrefs).length <= 0) {
        let obj = {'youtube.com': {'defaultBrowser': Me.config.defaultBrowser, 'uriOptions': tmp}, 'youtu.be': {'defaultBrowser': Me.config.defaultBrowser, 'uriOptions': tmp}}
        Me.config.uriPrefs = JSON.parse(JSON.stringify(obj))
    }
    saveConfiguration();
    } catch(e) { dev.log(e); }
}

function detectWebBrowsers() {
    try{
    let installedApps = Shell.AppSystem.get_default().get_installed();
    let tmpbrowserApps = {};
    let currentBrowser = getxdgDefaultBrowser();

    installedApps.forEach(function(app){
        let id = app.get_id();
        if (id == "bowser.desktop" || id == "bowser-gnome.desktop") return;
        let categories = app.get_categories() || '';
        if (categories.indexOf("WebBrowser") == -1) return;

        let appPath = app.get_filename();
        let mimeTypes = app.get_string('MimeType') ? app.get_string('MimeType').split(';').filter(v => v != "") : [];
        let name = app.get_name() || app.get_display_name() || ' ';
        let exec = app.get_commandline() || '';
        let icon = '';
        if (app.get_icon()) icon = app.get_icon().to_string();

        tmpbrowserApps[appPath] = [ name, exec, mimeTypes, icon ];
    }, this);

    // Update and save web browser configuration
    let msg;
    if (JSON.stringify(Me.config.browserApps) === JSON.stringify(tmpbrowserApps)) msg = "No web browser changes detected."
    else msg = "Bowser has detected changes in your installed web browsers."

    Me.config.browserApps = tmpbrowserApps;
    if (Me.config.defaultBrowser == '' && (currentBrowser == 'bowser.desktop' || currentBrowser == 'bowser-gnome.desktop'))
        Me.config.defaultBrowser = Object.keys(Me.config.browserApps)[0]
    else if (Me.config.defaultBrowser == '') {
        Me.config.browserApps.forEachEntry(function(browserApp) {
            if (browserApp.includes(currentBrowser))
                Me.config.defaultBrowser = browserApp;
        }, this);
    }

    dev.log(Me.config.defaultBrowser);
    saveConfiguration(); loadConfiguration();
    uiUtils.showUserFeedbackMessage(msg, true)
    } catch(e) { dev.log(e); }
}

function exportConfiguration() {
    try{
    utils.spawnWithCallback(null, ['/usr/bin/zenity', '--file-selection', '--save', '--title=Export Configuration', '--filename=settings-backup.conf'],  GLib.get_environ(), 0, null,
        (resource) => {
            if (!resource) return;
            resource = resource.trim();
            fileName = GLib.path_get_basename(resource);
            filePath = GLib.path_get_dirname(resource);
            saveConfiguration(fileName, filePath)

            uiUtils.showUserFeedbackMessage("Configuration exported to " + resource, true)
        });
    } catch(e) { dev.log(e); }
}

function importConfiguration() {
    try{
    utils.spawnWithCallback(null, ['/usr/bin/zenity', '--file-selection', '--title=Import Configuration', '--filename=settings.conf'],  GLib.get_environ(), 0, null,
        (resource) => {
            if (!resource) return;
            resource = resource.trim();
            fileName = GLib.path_get_basename(resource);
            filePath = GLib.path_get_dirname(resource);
            loadConfiguration(null, fileName, filePath);
            saveConfiguration();
            uiUtils.showUserFeedbackMessage("Configuration loaded from " + resource, true);
        })
    } catch(e) { dev.log(e); }
}

function enableBowser() {
    try {
    let result = setxdgDefaultBrowser()
    let msg = "Bowser has been Enabled"
    if (result != '') msg = "Error Enabling Bowser: " + result
    uiUtils.showUserFeedbackMessage(msg)
    } catch(e) { dev.log(e); }
}

function disableBowser() {
    try {
    let browser = Me.config.defaultBrowser;
    browser = browser.substring(browser.lastIndexOf("/")+1, browser.length);
    let result = setxdgDefaultBrowser(browser)

    let msg = Me.config.browserApps[Me.config.defaultBrowser][0] + " is now your default browser."
    if (result != '') msg = "Error Disabling Bowser: " + result
    uiUtils.showUserFeedbackMessage(msg)
    } catch(e) { dev.log(e); }
}

function openBowser() {
    try {
    util.spawn(['python3', fileUtils.PYBOWSER_EXEC_FILE])
    } catch(e) { dev.log(e); }
}

function getxdgDefaultBrowser() {
    try{
    let output = ByteArray.toString(GLib.spawn_command_line_sync('xdg-settings get default-web-browser')[1]).trim();
    if (output.search(".desktop") != -1) Me.currentBrowser = output;
    return output;
    } catch(e) { dev.log(e); }
}

function setxdgDefaultBrowser(browser='bowser-gnome.desktop') {
    try{
    let success = false;
    let output = ByteArray.toString(GLib.spawn_command_line_sync('xdg-settings set default-web-browser ' + browser)[1]).trim();
    if (output == '') success = true;
    return output;
    } catch(e) { dev.log(e); }
}