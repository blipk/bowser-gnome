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
import * as Main from "resource:///org/gnome/shell/ui/main.js"
import * as extensionSystem from "resource:///org/gnome/shell/ui/extensionSystem.js"
import GLib from "gi://GLib"
import Gio from "gi://Gio"
import Clutter from "gi://Clutter"
import Shell from "gi://Shell"
import Soup from "gi://Soup"
import * as util from "resource:///org/gnome/shell/misc/util.js"

// Internal imports
import * as dev from "./dev.js"
import * as utils from "./utils.js"
import * as fileUtils from "./fileUtils.js"
import * as uiUtils from "./uiUtils.js"
import * as dialogs from "./dialogs.js"
import * as panelIndicator from "./panelIndicator.js"


import { Extension, gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js"

export let BowserGnomeInstance = null

export default class BowserGnome extends Extension {

    enable() {
        BowserGnomeInstance = this

        try {
            fileUtils.enable()
            if ( this.bowserIndicator ) return // Already initialized

            this.URIs = Array()
            this.PYBOWSER = false
            this.settings = this.getSettings( this.metadata["settings-schema"] )

            // Check/install status then start watching
            this._checkBowser()
            this._enableURIWatcher()

            // Spawn indicator
            this.bowserIndicator = new panelIndicator.BowserIndicator()
            Main.panel.addToStatusArea( "BowserIndicator", this.bowserIndicator, 1 )
        } catch ( e ) { dev.log( e ) }
    }

    disable() {
        try {
            if ( uiUtils.messages ) uiUtils.messages = null
            if ( this.bowserIndicator ) this.bowserIndicator.destroy(); delete this.bowserIndicator
            if ( this.URIs ) delete this.URIs
            if ( this.PYBOWSER ) delete this.PYBOWSER
        } catch ( e ) { dev.log( e ) }
    }

    _checkBowser() {
        try {
            this._installbowser()
            if ( fileUtils.checkExists( [fileUtils.PYBOWSER_EXEC_FILE] ) ) this.PYBOWSER = true
            if ( !fileUtils.checkExists( [fileUtils.BOWSER_CONF_FILE()] ) ) this.makeConfiguration()
            this.loadConfiguration()
        } catch ( e ) { dev.log( e ) }
    }
    _installbowser() {
        try {
            // Load compiled resources
            let resources_loaded = false

            const checkLoadResources = () => {
                if ( !resources_loaded ) Gio.Resource.load( fileUtils.RES_FILE )._register()
                resources_loaded = true
            }

            // Create and install XDG Dekstop file
            if ( !fileUtils.checkExists( [fileUtils.DESKTOP_FILE] ) ) {
                checkLoadResources()
                fileUtils.installResource( "res/bowser-gnome.desktop", fileUtils.DESKTOP_FILE )
                GLib.spawn_command_line_sync( "xdg-desktop-menu install " + fileUtils.CONF_DIR + "/bowser-gnome.desktop --novendor" )
            }

            // Set as default and set our URI passing script to executable
            // if ( this.getxdgDefaultBrowser() != "bowser-gnome.desktop" ) {
            //     this.setxdgDefaultBrowser( "bowser-gnome.desktop" )
            // }
            // util.spawn( ["chmod", "+x", fileUtils.BOWSER_EXEC_FILE] )

            // Install icon resources
            if ( !fileUtils.checkExists( [fileUtils.PNG_ICON_FILE] ) ) {
                checkLoadResources()
                fileUtils.installResource( "res/bowser.png", fileUtils.PNG_ICON_FILE )
                util.spawnCommandLine( "xdg-icon-resource install --novendor --context apps --size 256 " + fileUtils.PNG_ICON_FILE + " bowser" )

                if ( !fileUtils.checkExists( [fileUtils.SVG_ICON_FILE] ) ) {
                    // xdg-icon-resource does not accept svg
                    fileUtils.installResource( "res/bowser.svg", fileUtils.SVG_ICON_FILE )
                }

                util.spawnCommandLine( "gtk-update-icon-cache -f ~/.local/share/icons/hicolor --ignore-theme-index" )
            }
        } catch ( e ) { dev.log( e ) }
    }
    _enableURIWatcher() {
        try {
            this.settings.processing = false
            this.uriListSettingsHandler = this.settings.connect( "changed::uri-list", () => {
                if ( this.settings.processing ) return
                this.settings.processing = true
                this.URIs = this.URIs.concat( JSON.parse( this.settings.get_string( "uri-list" ) ) )
                this.settings.set_string( "uri-list", "[]" )
                this.processURIs()
                this.settings.processing = false
            } )
        } catch ( e ) { dev.log( e ) }
    }
    processURIs() {
        try {
            //Parse our URI/s
            if ( !Array.isArray( this.URIs ) ) this.URIs = [this.URIs]

            // Search for open settings call anywhere in the stack
            let cancel = false
            this.URIs.forEach( function ( URI, i ) {
                if ( URI == "--s" ) {
                    this.URIs = this.URIs.slice( this.URIs.indexOf( URI ), this.URIs.indexOf( URI ) + 1 )
                    this.bowserIndicator.menu.toggle()
                    cancel = true
                } else if ( URI == "--default" ) {
                    this.URIs = this.URIs.slice( this.URIs.indexOf( URI ), this.URIs.indexOf( URI ) + 1 )
                    this.openBrowser( "", false )
                    cancel = true
                }
            }, this )

            if ( !cancel ) this.openBrowser()
        } catch ( e ) { dev.log( e ) }
    }

    openBrowser( overrideURI, askOnUnmatchedURI = this.config.askOnUnmatchedURI ) {
        try {
            let URI = this.URIs[0]
            if ( overrideURI ) URI = overrideURI
            let matchFound = false
            let matchedBrowsers = Array()
            let splitURI = utils.splitURI( URI )
            splitURI.pageTitle = ""
            splitURI.pageContents = ""

            utils.forEachEntry( this.config.uriPrefs, function ( prefKey, prefValues, i ) {
                let compareURI = ""

                utils.forEachEntry( this.config.uriPrefs[prefKey].uriOptions, function ( optionKey, optionValue, n ) {
                    if ( !optionValue || !splitURI[optionKey] ) return
                    if ( optionValue && optionKey != "scheme" ) compareURI += splitURI[optionKey].toLowerCase()

                    // Search page titles and contents
                    if ( ( splitURI["pageContents"] == "" ) && ( optionKey == "pageTitle" || optionKey == "pageContents" ) ) {
                        let msg = Soup.Message.new_from_uri( "GET", new Soup.URI( URI ) )
                        let httpSession = new Soup.Session()
                        httpSession.timeout = 3
                        httpSession.send_message( msg )
                        if ( msg.status_code === 200 ) {
                            try {
                                splitURI["pageContents"] = msg.response_body.data.toLowerCase()
                                if ( splitURI["pageContents"] ) splitURI["pageTitle"] = splitURI["pageContents"].match( /<title>[^<]*/ )[0]
                            } catch ( e ) { dev.log( e ) } finally { splitURI["pageContents"] = " " }
                        } else {
                            splitURI["pageContents"] = " " // If we don't get an OK response, set this so we don't keep trying
                        }
                    }

                    if ( splitURI[optionKey].indexOf( prefKey.toLowerCase() ) > -1 || ( compareURI.indexOf( prefKey.toLowerCase() ) > -1 && compareURI ) ) {
                        let browserAlreadyOpened = false
                        matchedBrowsers.forEach( function ( entry, i ) {
                            if ( entry == this.config.uriPrefs[prefKey].defaultBrowser ) browserAlreadyOpened = true
                        }, this )
                        if ( matchFound && browserAlreadyOpened ) return
                        matchFound = true
                        matchedBrowsers.push( this.config.uriPrefs[prefKey].defaultBrowser )

                        let exec = this.config.browserApps[this.config.uriPrefs[prefKey].defaultBrowser][1].replace( "%u", URI ).replace( "%U", URI )
                        let [success, argv] = GLib.shell_parse_argv( exec )
                        util.spawn( argv )
                        this.URIs.shift()
                        if ( this.URIs.length > 0 ) this.openBrowser()
                    }
                }, this )
            }, this )

            if ( askOnUnmatchedURI && matchFound == false ) {
                this.spawnUnmatchedURIDialog()
            } else if ( !matchFound ) {
                let exec = this.config.browserApps[this.config.defaultBrowser][1].replace( "%u", URI ).replace( "%U", URI )
                let [success, argv] = GLib.shell_parse_argv( exec )
                util.spawn( argv )
                this.URIs.shift()
            }
        } catch ( e ) { dev.log( e ) }
    }

    spawnUnmatchedURIDialog() {
        // Parse the URI list in sequential dialogs
        let splitURI = utils.splitURI( this.URIs[0] )
        let editable = Object()
        let editables = Array()

        // Build dialog
        editable.uriOptions = { "authority": true, "path": false, "query": false, "fragment": false }
        let uriOptionsValidation = function ( value, n ) {
            // URL logic
            let allowed = true
            let boolValues = Object.values( value )
            if ( boolValues[n] ) { // If ENABLED
                if ( boolValues.filter( Boolean ).length <= 1 ) allowed = false // No disabling if only one is on
                if ( !boolValues.includes( false ) ) { // If they are all on
                    if ( n == 2 ) boolValues[3] = false // Drop the rest of the chain if we toggle a middle element
                    if ( n == 1 ) boolValues[2] = boolValues[3] = false
                    //if (boolValues.length > 1) allowed = true;    //
                }
                if ( boolValues[n + 1] == boolValues[n] && boolValues[n - 1] == boolValues[n] ) boolValues[n + 1] = !boolValues[n] // Drop adjacent to maintian chain
            } else { // If DISABLED
                if ( boolValues[n + 1] == boolValues[n] && boolValues[n - 1] == boolValues[n] ) allowed = false // No enabling that will break the URL chain
                if ( n + 1 == boolValues.length && boolValues[n - 1] == false ) allowed = false // No enabling of the end if its neighbour is not enabled
                if ( n == 0 && ( boolValues[n + 1] == false ) ) allowed = false // No enabling the first element if its neighbour is not enabled
                if ( boolValues.indexOf( true ) == -1 ) allowed = true // Always allow enable if none are enabled
            }
            return [allowed, boolValues]
        }
        let uriOptionsEditables = [{ hideElement: true, toggleValidationCallback: uriOptionsValidation, }]
        uriOptionsEditables.push( Object.assign( { authority: splitURI["authorityTrim"] || " ", hidden: ( splitURI["authorityTrim"] == "" ) }, uriOptionsEditables[0] ) )
        uriOptionsEditables.push( Object.assign( { path: splitURI["path"] || " ", hidden: ( splitURI["path"] == "" ) }, uriOptionsEditables[0] ) )
        uriOptionsEditables.push( Object.assign( { query: splitURI["query"] || " ", hidden: ( splitURI["query"] == "" ) }, uriOptionsEditables[0] ) )
        uriOptionsEditables.push( Object.assign( { fragment: splitURI["fragment"] || " ", hidden: ( splitURI["fragment"] == "" ) }, uriOptionsEditables[0] ) )
        editables.push( { uriOptions: " ", subObjectEditableProperties: uriOptionsEditables, boxStyle: { style_class: "browser-uri-box", reactive: true, can_focus: true, x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.FILL } } )

        utils.forEachEntry( this.config.browserApps, function ( browserAppKey, browserAppValue, i ) {
            editable[browserAppKey] = browserAppValue[0]

            editables[i + 1] = {
                [browserAppKey] : browserAppValue[0],
                iconStyle       : { style_class: "browser-label-icon", icon_size: 42, icon_name: browserAppValue[3] ? browserAppValue[3] : "web-browser-sybmolic" },
                hideElement     : true,
                labelStyle      : { style_class: "browser-label", x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.CENTER },
                boxStyle        : { style_class: "browser-box", reactive: true, can_focus: true, x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.FILL, y_align: Clutter.ActorAlign.FILL },
            }

            editables[i + 1].boxClickCallback = function ( i ) {
                try {
                // Create rule
                let outURI = ""

                utils.forEachEntry( this.editableObject.uriOptions, function ( key, value, z ) {
                    if ( key == "authority" ) key = "authorityTrim"
                    if ( value == true ) outURI += splitURI[key]
                    //Drop the www. in the domain for the pref
                    if ( key == "authorityTrim" && outURI.substr( 0, 4 ) == "www." ) outURI = outURI.substring( 4, outURI.length )
                }, this )

                let uriOptions = { "scheme": false, "authority": this.editableObject.uriOptions.authority || false, "path": this.editableObject.uriOptions.path || false, "query": this.editableObject.uriOptions.query || false, "fragment": this.editableObject.uriOptions.fragment || false, pageTitle: false, pageContents: false }
                BowserGnomeInstance.config.uriPrefs[outURI] = { "defaultBrowser": this.propertyKeys[i], "uriOptions": uriOptions }
                BowserGnomeInstance.saveConfiguration()

                uiUtils.showUserNotification( "New rule created." )

                // Let the rule match
                BowserGnomeInstance.openBrowser()

                // Process next URI in the close() callback in case the request was cancelled
                this.editableObject.ruleCreated = true

                this.close()
                } catch( e ) {dev.log( e )}
            }
        }, this )

        let dialogStyle = { styleClass: "browser-dialog", destroyOnClose: true }
        let buttonStyles = [{ label: "Cancel", key: Clutter.KEY_Escape, style_class: "browser-dialog-buttons" }]
        let createRuleDialog = new dialogs.ObjectEditorDialog( "", ( returnObject ) => {
            if ( !returnObject.ruleCreated ) this.URIs.shift()
            if ( this.URIs.length > 0 ) this.spawnUnmatchedURIDialog( this.URIs )
            return
        }, editable, editables, buttonStyles, dialogStyle, "browser-dialog-content-box" )
    }

    loadConfiguration( configObject = null, filename = "bowser.conf", filedirectory = fileUtils.BOWSER_CONF_DIR() ) {
        try {
            if ( !configObject ) {
                configObject = fileUtils.loadJSObjectFromFile( filename, filedirectory )
                if ( !utils.isEmpty( configObject ) /*&& utils.isEmpty(this.config)*/ ) {
                    this.config = JSON.parse( JSON.stringify( configObject ) )
                }
            } else {
                if ( utils.isEmpty( configObject ) ) return
                this.config = JSON.parse( JSON.stringify( configObject ) )
            }
        } catch ( e ) { dev.log( e ) }
    }
    saveConfiguration( filename = "bowser.conf", filedirectory = fileUtils.BOWSER_CONF_DIR() ) {
        try {
            if ( utils.isEmpty( this.config ) ) return
            let configCopy = JSON.parse( JSON.stringify( this.config ) )
            let timestamp = new Date().toLocaleString().replace( /[^a-zA-Z0-9-. ]/g, "" ).replace( / /g, "" )
            fileUtils.saveJSObjectToFile( configCopy, filename, filedirectory )
        } catch ( e ) { dev.log( e ) }
    }
    makeConfiguration() {
        try {
            if ( this.config == undefined ) this.config = {}
            if ( this.config.browserApps == undefined ) this.config.browserApps = {}
            if ( this.config.defaultBrowser == undefined ) this.config.defaultBrowser = ""
            if ( this.config.uriPrefs == undefined ) this.config.uriPrefs = {}
            if ( this.config.askOnUnmatchedURI == undefined ) this.config.askOnUnmatchedURI = true
            this.detectWebBrowsers()
            let currentWebBrowser = this.getxdgDefaultBrowser()
            if ( currentWebBrowser.indexOf( "bowser.desktop" ) == -1 || currentWebBrowser.indexOf( "bowser-gnome.desktop" ) == -1 ) this.setxdgDefaultBrowser()
            let tmp = { "scheme": false, "authority": true, "path": false, "query": false, "fragment": false, "pageTitle": false, "pageContents": false }
            if ( Object.keys( this.config.uriPrefs ).length <= 0 ) {
                let obj = { "youtube.com": { "defaultBrowser": this.config.defaultBrowser, "uriOptions": tmp }, "youtu.be": { "defaultBrowser": this.config.defaultBrowser, "uriOptions": tmp } }
                this.config.uriPrefs = JSON.parse( JSON.stringify( obj ) )
            }
            this.saveConfiguration()
        } catch ( e ) { dev.log( e ) }
    }
    detectWebBrowsers() {
        try {
            let installedApps = Shell.AppSystem.get_default().get_installed()
            let tmpbrowserApps = {}
            let currentBrowser = this.getxdgDefaultBrowser()

            installedApps.forEach( function ( app ) {
                let id = app.get_id()
                if ( id == "bowser.desktop" || id == "bowser-gnome.desktop" ) return
                let categories = app.get_categories() || ""
                if ( categories.indexOf( "WebBrowser" ) == -1 ) return

                let appPath = app.get_filename()
                let mimeTypes = app.get_string( "MimeType" ) ? app.get_string( "MimeType" ).split( ";" ).filter( v => v != "" ) : []
                let name = app.get_name() || app.get_display_name() || " "
                let exec = app.get_commandline() || ""
                let icon = ""
                if ( app.get_icon() ) icon = app.get_icon().to_string()

                tmpbrowserApps[appPath] = [name, exec, mimeTypes, icon]
            }, this )

            // Update and save web browser configuration
            let msg
            if ( JSON.stringify( this.config.browserApps ) === JSON.stringify( tmpbrowserApps ) ) msg = "No web browser changes detected."
            else msg = "Bowser has detected changes in your installed web browsers."

            this.config.browserApps = tmpbrowserApps
            if ( this.config.defaultBrowser == "" && ( currentBrowser == "bowser.desktop" || currentBrowser == "bowser-gnome.desktop" ) )
                this.config.defaultBrowser = Object.keys( this.config.browserApps )[0]
            else if ( this.config.defaultBrowser == "" ) {
                utils.forEachEntry( this.config.browserApps, function ( browserApp ) {
                    if ( browserApp.includes( currentBrowser ) )
                        this.config.defaultBrowser = browserApp
                }, this )
            }

            dev.log( this.config.defaultBrowser )
            this.saveConfiguration(); this.loadConfiguration()
            uiUtils.showUserNotification( msg, true )
        } catch ( e ) { dev.log( e ) }
    }
    exportConfiguration() {
        try {
            utils.spawnWithCallback( null, ["/usr/bin/zenity", "--file-selection", "--save", "--title=Export Configuration", "--filename=settings-backup.conf"], GLib.get_environ(), 0, null,
                ( resource ) => {
                    try {
                    if ( !resource ) return
                    resource = resource.trim()
                    const fileName = GLib.path_get_basename( resource )
                    const filePath = GLib.path_get_dirname( resource )
                    this.saveConfiguration( fileName, filePath )

                    uiUtils.showUserNotification( "Configuration exported to " + resource, true )
                    } catch ( e ) { dev.log( e ) }
                } )
        } catch ( e ) { dev.log( e ) }
    }
    importConfiguration() {
        try {
            utils.spawnWithCallback( null, ["/usr/bin/zenity", "--file-selection", "--title=Import Configuration", "--filename=settings.conf"], GLib.get_environ(), 0, null,
                ( resource ) => {
                    if ( !resource ) return
                    resource = resource.trim()
                    const fileName = GLib.path_get_basename( resource )
                    const filePath = GLib.path_get_dirname( resource )
                    this.loadConfiguration( null, fileName, filePath )
                    this.saveConfiguration()
                    uiUtils.showUserNotification( "Configuration loaded from " + resource, true )
                } )
        } catch ( e ) { dev.log( e ) }
    }
    enableBowser() {
        try {
            util.spawn( ["chmod", "+x", fileUtils.BOWSER_EXEC_FILE] )

            let result = this.setxdgDefaultBrowser()
            let msg = "Bowser has been Enabled"
            if ( result != "" ) msg = "Error Enabling Bowser: " + result
            uiUtils.showUserNotification( msg )
        } catch ( e ) { dev.log( e ) }
    }
    disableBowser() {
        try {
            let browser = this.config.defaultBrowser
            browser = browser.substring( browser.lastIndexOf( "/" ) + 1, browser.length )
            let result = this.setxdgDefaultBrowser( browser )

            let msg = this.config.browserApps[this.config.defaultBrowser][0] + " is now your default browser."
            if ( result != "" ) msg = "Error Disabling Bowser: " + result
            uiUtils.showUserNotification( msg )
        } catch ( e ) { dev.log( e ) }
    }
    openBowser() {
        try {
            util.spawn( ["python3", fileUtils.PYBOWSER_EXEC_FILE] )
        } catch ( e ) { dev.log( e ) }
    }
    getxdgDefaultBrowser() {
        try {
            let output = new TextDecoder().decode( GLib.spawn_command_line_sync( "xdg-settings get default-web-browser" )[1] ).trim()
            if ( output.search( ".desktop" ) != -1 ) this.currentBrowser = output
            return output
        } catch ( e ) { dev.log( e ) }
    }
    setxdgDefaultBrowser( browser = "bowser-gnome.desktop" ) {
        try {
            let success = false
            let output = new TextDecoder().decode( GLib.spawn_command_line_sync( "xdg-settings set default-web-browser " + browser )[1] ).trim()
            if ( output == "" ) success = true
            return output
        } catch ( e ) { dev.log( e ) }
    }

}

