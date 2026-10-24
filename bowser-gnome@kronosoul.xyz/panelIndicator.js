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
import * as popupMenu from "resource:///org/gnome/shell/ui/popupMenu.js"
import * as panelMenu from "resource:///org/gnome/shell/ui/panelMenu.js"
import GObject from "gi://GObject"
import St from "gi://St"
import Clutter from "gi://Clutter"

// Internal imports
import { BowserGnomeInstance as Me } from "./extension.js"
import * as dev from "./dev.js"
import * as utils from "./utils.js"
import * as dialogs from "./dialogs.js"
import * as uiUtils from "./uiUtils.js"
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js"

// Constants
export let BOWSER_ENABLED = false
export let ASK_ENABLED = false
export let MAX_ENTRY_LENGTH = 50

export const BowserIndicator = GObject.registerClass( {
    GTypeName: "BowserIndicator"
}, class BowserIndicator extends panelMenu.Button {
    destroy() {
        try {
            if ( this._bowserToggleId && this.bowserMenuItem ) this.bowserMenuItem.disconnect( this._bowserToggleId )
            if ( this._askToggleId && this.toggleAskMenuItem ) this.toggleAskMenuItem.disconnect( this._askToggleId )
            if ( this._defaultBrowsersOpenStateId && this.defaultBrowsersSubMenu )
                this.defaultBrowsersSubMenu.menu.disconnect( this._defaultBrowsersOpenStateId )
            this._prefMenuItemsRemoveAll()
            super.destroy()
            delete Main.panel.statusArea["BowserIndicator"]
        } catch ( e ) { dev.log( e ) }
    }
    _init() {
        try {
            super._init( 0.0, "BowserIndicator" )

            // Set up menu box to build into
            let hbox = new St.BoxLayout( { style_class: "panel-status-menu-box bowser-gnome-indicator-hbox" } )
            this.icon = new St.Icon(
                {
                    icon_name   : "web-browser-symbolic",
                    style_class : "system-status-icon bowser-gnome-indicator-icon",
                    opacity     : 140
                }
            )
            hbox.add_child( this.icon )
            this.add_child( hbox )

            //Build our menu
            this._buildMenu()
            this._refreshMenu()
        } catch ( e ) { dev.log( e ) }
    }
    _onOpenStateChanged( menu, open ) {/*Override from parent class to handle menuitem refresh*/
        this._refreshMenu()
        if ( open ) this._reloadConfiguration()
        super._onOpenStateChanged( menu, open )
    }
    /**
     * Read the configuration file again without blocking the shell.
     * Refresh the menu if the file was changed outside of the extension, for example by the Bowser app.
     */
    _reloadConfiguration() {
        const previousConfig = JSON.stringify( Me.config )
        Me.loadConfiguration( () => {
            if ( JSON.stringify( Me.config ) !== previousConfig ) this._refreshMenu()
        } )
    }
    //main UI builder
    _buildMenu() {
        try {
            // Enable/Disable Bowser switch
            this.bowserMenuItem = new popupMenu.PopupSwitchMenuItem( _( "Bowser" ), BOWSER_ENABLED, { reactive: true } )
            this._bowserToggleId = this.bowserMenuItem.connect( "toggled", ( item, state ) => { this._onBowserSwitch( item, state ) } )
            this.menu.addMenuItem( this.bowserMenuItem )

            // Always ask switch
            this.toggleAskMenuItem = new popupMenu.PopupSwitchMenuItem( _( "Create rules on new links" ), ASK_ENABLED, { reactive: true } )
            this._askToggleId = this.toggleAskMenuItem.connect( "toggled", ( item, state ) => { this._onAskSwitch( item, state ) } )
            this.menu.addMenuItem( this.toggleAskMenuItem )

            // Add Default Browser switcher
            this.defaultBrowsersSubMenu = new popupMenu.PopupSubMenuMenuItem( "Browsers", true )
            this._defaultBrowsersOpenStateId = this.defaultBrowsersSubMenu.menu.connect( "open-state-changed", ( m, open ) => {
                if ( open ) this._defaultBrowsersSubMenuRefresh()
            } )
            this.defaultBrowsersSubMenu.icon.icon_name = Me.config.browserApps[Me.config.defaultBrowser][3] ?
                Me.config.browserApps[Me.config.defaultBrowser][3] : "web-browser-symbolic"
            this.menu.addMenuItem( this.defaultBrowsersSubMenu )
            this.webbrowsersMenuItems = []
            this._defaultBrowsersSubMenuRefresh()

            // Add separator
            this.menu.addMenuItem( new popupMenu.PopupSeparatorMenuItem() )

            // Menu section for Bowser Preferences/Rules
            // Added directly to this.menu so that PopupSubMenuMenuItem children can walk
            // up to a real PopupMenu via _getTopMenu(); wrapping in a St.ScrollView breaks
            // that chain (the scroll view is not a menu actor, so _setOpenedSubMenu is
            // missing and the submenu open-state-changed handler crashes).
            this.preferencesSection = new popupMenu.PopupMenuSection()
            this.menu.addMenuItem( this.preferencesSection )

            // Add separator
            this.menu.addMenuItem( new popupMenu.PopupSeparatorMenuItem() )

            // Prefs menu button menu
            let settingsMenuItem = new popupMenu.PopupImageMenuItem( "New Rule", "bookmark-new-symbolic" )
            settingsMenuItem.label.set_x_expand( true )
            this.menu.settingsMenuItem = settingsMenuItem
            this.menu.addMenuItem( settingsMenuItem )
            settingsMenuItem.connect( "activate", () => { this._newRule() } )

            if ( Me.PYBOWSER ) uiUtils.createIconButton( settingsMenuItem, "document-properties-symbolic", () => { Me.openBowser() } )
            uiUtils.createIconButton( settingsMenuItem, "document-open-symbolic", () => { Me.importConfiguration() } )
            uiUtils.createIconButton( settingsMenuItem, "document-save-symbolic", () => { Me.exportConfiguration() } )

            // Add separator
            this.menu.addMenuItem( new popupMenu.PopupSeparatorMenuItem() )
        } catch ( e ) { dev.log( e ) }
    }
    _refreshMenu() {
        try {
            //Remove all and re-add with any changes
            // The configuration in memory is current. _reloadConfiguration() gets changes made outside the extension.
            if ( utils.isEmpty( Me.config ) ) return
            this._prefMenuItemsRemoveAll()
            utils.forEachEntry( Me.config.uriPrefs, function ( prefBufferKey, prefBufferValue, i, prefBufferEntryObj ) {
                this._addprefMenuItemEntry( prefBufferEntryObj )
            }, this )

            //Refresh state switches
            // Suppress toggle handlers while syncing UI state to config; setToggleState
            // synthesizes the "toggled" signal and would otherwise re-invoke
            // enableBowser/disableBowser on every menu open.
            this._suppressToggleHandler = true
            try {
                let browser = Me.getxdgDefaultBrowser()
                BOWSER_ENABLED = ( browser == "bowser.desktop" || browser == "bowser-gnome.desktop" ) ? true : false
                this.bowserMenuItem.nameText = BOWSER_ENABLED ? "Bowser Enabled" : "Bowser Disabled"
                this._prefMenuItemSetEntryLabel( this.bowserMenuItem )
                this.bowserMenuItem.setToggleState( BOWSER_ENABLED )

                ASK_ENABLED = Me.config.askOnUnmatchedURI ? true : false
                this.toggleAskMenuItem.setToggleState( ASK_ENABLED )
            } finally {
                this._suppressToggleHandler = false
            }

            this._defaultBrowsersSubMenuRefresh( true )
        } catch ( e ) { dev.log( e ) }
    }
    _addprefMenuItemEntry( prefBuffer ) {
        try {
            let menuItem = new popupMenu.PopupSubMenuMenuItem( "", true )

            // Connect menu items to bowser array
            menuItem.pref = prefBuffer
            menuItem.prefkey = menuItem.nameText = Object.keys( menuItem.pref )[0]
            menuItem.prefvalue = Object.values( menuItem.pref )[0]
            this._prefMenuItemSetEntryLabel( menuItem )

            // Connect menuitem and its iconbuttons
            menuItem.openStateId = menuItem.menu.connect( "open-state-changed", ( m, open ) => {
                if ( open ) this._preferenceBrowserMenuRefresh( menuItem )
            } )

            // Create iconbuttons on MenuItem
            uiUtils.createIconButton( menuItem, "document-edit-symbolic", () => { this._editRule( menuItem ) } )
            uiUtils.createIconButton( menuItem, "edit-delete-symbolic", () => { this._prefMenuItemRemoveEntry( menuItem ); this._refreshMenu() } )

            // Update bad browser paths in configs
            //dev.log(menuItem.prefvalue.defaultBrowser)
            if ( !Me.config.browserApps[menuItem.prefvalue.defaultBrowser] ) {
                let x = menuItem.prefvalue.defaultBrowser.lastIndexOf( "/" )
                let browser = menuItem.prefvalue.defaultBrowser.substring( x, menuItem.prefvalue.defaultBrowser.length - 8 )
                let newBrowserPath = Object.keys( Me.config.browserApps ).filter( k => k.includes( browser ) )

                if ( newBrowserPath[0] ) menuItem.prefvalue.defaultBrowser = newBrowserPath[0]
                else menuItem.prefvalue.defaultBrowser = Object.keys( Me.config.browserApps )[0]
                Me.saveConfiguration()
            }

            let icon = Me.config.browserApps[menuItem.prefvalue.defaultBrowser][3] ? Me.config.browserApps[menuItem.prefvalue.defaultBrowser][3] : "web-browser-symbolic"
            menuItem.icon.icon_name = icon

            //Add to list
            menuItem.prefBrowsersMenuItems = []
            this._preferenceBrowserMenuRefresh( menuItem )
            this.preferencesSection.addMenuItem( menuItem, 0 )
        } catch ( e ) { dev.log( e ) }
    }
    _preferenceBrowserMenuRefresh( menuItem ) {
        // Change name and icon to current default
        menuItem.icon.icon_name = Me.config.browserApps[menuItem.prefvalue.defaultBrowser][3] ?
            Me.config.browserApps[menuItem.prefvalue.defaultBrowser][3] : "web-browser-symbolic"

        // Remove all and read
        menuItem.prefBrowsersMenuItems.forEach( function ( mItem ) { mItem.destroy() } )
        menuItem.prefBrowsersMenuItems = []

        utils.forEachEntry( Me.config.browserApps, function ( browserAppKey, browserAppValue, i ) {
            let [name, exec, mimetypes, icon] = browserAppValue
            icon = icon || "web-browser-sybmolic"
            menuItem.prefBrowsersMenuItems[i] = new popupMenu.PopupImageMenuItem( _( name ), icon )
            menuItem.prefBrowsersMenuItems[i].connect( "activate", () => {
                menuItem.prefvalue.defaultBrowser = browserAppKey
                Me.saveConfiguration()
                uiUtils.showUserNotification( menuItem.nameText + " will now open with " + name, true )
                // Don't rebuild the submenu here — destroying these items mid-activate
                // produces "already disposed" warnings. The open-state-changed handler
                // will rebuild with the updated dot ornament next time it opens.
            } );
            ( menuItem.prefvalue.defaultBrowser == browserAppKey ) ?
                menuItem.prefBrowsersMenuItems[i].setOrnament( popupMenu.Ornament.DOT ) : menuItem.prefBrowsersMenuItems[i].setOrnament( popupMenu.Ornament.NONE )
            menuItem.menu.addMenuItem( menuItem.prefBrowsersMenuItems[i] )
        }, this )
    }
    _defaultBrowsersSubMenuRefresh( nameOnly = false ) {
        // Change name and icon to current default
        this.defaultBrowsersSubMenu.icon.icon_name = Me.config.browserApps[Me.config.defaultBrowser][3] ?
            Me.config.browserApps[Me.config.defaultBrowser][3] : "web-browser-symbolic"
        this.defaultBrowsersSubMenu.nameText = Me.config.browserApps[Me.config.defaultBrowser][0]
        this._prefMenuItemSetEntryLabel( this.defaultBrowsersSubMenu )
        if ( nameOnly ) return

        // Remove all and readd
        this.webbrowsersMenuItems.forEach( function ( mItem ) { mItem.destroy() } )
        if ( this.detectWebBrowserMenuButton ) this.detectWebBrowserMenuButton.destroy()
        this.webbrowsersMenuItems = []

        utils.forEachEntry( Me.config.browserApps, function ( browserAppKey, browserApp, i ) {
            let name = browserApp[0]
            let exec = browserApp[1]
            let icon = browserApp[3] ? browserApp[3] : "web-browser-sybmolic"
            this.webbrowsersMenuItems[i] = new popupMenu.PopupImageMenuItem( _( name ), icon )
            this.webbrowsersMenuItems[i].connect( "activate", () => {
                Me.config.defaultBrowser = browserAppKey
                Me.saveConfiguration()
                uiUtils.showUserNotification( name + " is now your default browser.", true )
                // Update the submenu's icon/name only (no destructive rebuild).
                // Full rebuild happens via the submenu's open-state-changed handler.
                this._defaultBrowsersSubMenuRefresh( true )
            } );
            ( Me.config.defaultBrowser == browserAppKey ) ? this.webbrowsersMenuItems[i].setOrnament( popupMenu.Ornament.CHECK ) : this.webbrowsersMenuItems[i].setOrnament( popupMenu.Ornament.NONE )
            //uiUtils.createIconButton(this.webbrowsersMenuItems[i], icon, () => {});
            this.defaultBrowsersSubMenu.menu.addMenuItem( this.webbrowsersMenuItems[i] )
        }, this )

        this.detectWebBrowserMenuButton = new popupMenu.PopupImageMenuItem( _( "Scan Installed Browsers" ), "bowser" )
        this.detectWebBrowserMenuButton.connect( "activate", () => {
            Me.detectWebBrowsers()
            this.menu.itemActivated( uiUtils.getPopupNoAnimationParams() )
        } )
        this.detectWebBrowserMenuButton.setOrnament( popupMenu.Ornament.DOT )
        //uiUtils.createIconButton(this.detectWebBrowserMenuButton , 'web-browser-sybmolic', () => {});
        this.defaultBrowsersSubMenu.menu.addMenuItem( this.detectWebBrowserMenuButton )

    }
    _prefMenuItemSetEntryLabel( menuItem ) {
        menuItem.label.set_text( utils.truncateString( menuItem.nameText, MAX_ENTRY_LENGTH ) )
    }
    _prefMenuItemsGetAll() {
        return this.preferencesSection._getMenuItems()
    }
    _prefMenuItemsRemoveAll() {
        this._prefMenuItemsGetAll().forEach( function ( mItem ) {
            if ( mItem.openStateId && mItem.menu ) mItem.menu.disconnect( mItem.openStateId )
            mItem.destroyIconButtons?.()
            mItem.destroy()
        } )
    }
    _prefMenuItemRemoveEntry( menuItem, showMsg = true ) {
        try {
            Me.config.uriPrefs = utils.filterObj( Me.config.uriPrefs, ( [name, value] ) => ( name !== menuItem.prefkey && value !== menuItem.prefvalue ) )
            if ( showMsg ) uiUtils.showUserNotification( "Deleted rule: " + menuItem.nameText, true )
            if ( menuItem.openStateId && menuItem.menu ) menuItem.menu.disconnect( menuItem.openStateId )
            menuItem.destroyIconButtons?.()
            menuItem.destroy()
            Me.saveConfiguration()
            this._refreshMenu()
        } catch ( e ) { dev.log( e ) }
    }
    _editRule( menuItem ) {
        try {
            let editable = { searchText: menuItem.prefkey }
            Object.assign( editable, JSON.parse( JSON.stringify( menuItem.prefvalue ) ) )
            let uriOptionsEditables = [{ scheme: "http://", authority: "example.com", path: "/path/in.html", query: "?name=value", fragment: "#bookmark" }, { pageContents: " ", pageTitle: " ", hidden: true }]
            editable.extras = { pageTitle: menuItem.prefvalue.uriOptions.pageTitle }
            let extrasEdiables = [{ pageTitle: " ", hideLabel: true }]
            editable.extras2 = { pageContents: menuItem.prefvalue.uriOptions.pageContents }
            let extrasEdiables2 = [{ pageContents: " ", hideLabel: true }]

            let editables = [{ searchText: "Text to search for: " },
{ defaultBrowser: " ", hidden: true },
            { uriOptions: " ", subObjectEditableProperties: uriOptionsEditables },
            { extras: "Search Page Title:", subObjectEditableProperties: extrasEdiables },
            { extras2: "Search Page Contents:", subObjectEditableProperties: extrasEdiables2 }]
            let buttonStyles = [{ label: "Cancel", key: Clutter.KEY_Escape, action: function () { this.returnObject = false, this.close( true ) } }, { label: "Done", default: true }]

            let editRuleDialog = new dialogs.ObjectEditorDialog( "Editing Rule " + menuItem.nameText, ( returnObject ) => {
                if ( !returnObject ) return
                returnObject.searchText = returnObject.searchText.trim()
                if ( returnObject.searchText == "" ) return
                if ( menuItem.prefkey == returnObject.searchText ) { //No name change, which is the key
                    Me.config.uriPrefs[menuItem.prefkey].uriOptions = returnObject.uriOptions
                    Me.config.uriPrefs[menuItem.prefkey].uriOptions.pageTitle = returnObject.extras.pageTitle
                    Me.config.uriPrefs[menuItem.prefkey].uriOptions.pageContents = returnObject.extras2.pageContents
                } else { // Can probably do this if the name didn't change but will mess up menu ordering
                    Me.config.uriPrefs[returnObject.searchText] = Object()
                    Me.config.uriPrefs[returnObject.searchText].uriOptions = returnObject.uriOptions
                    Me.config.uriPrefs[returnObject.searchText].uriOptions.pageTitle = returnObject.extras.pageTitle
                    Me.config.uriPrefs[returnObject.searchText].uriOptions.pageContents = returnObject.extras2.pageContents
                    Me.config.uriPrefs[returnObject.searchText].defaultBrowser = menuItem.prefvalue.defaultBrowser
                    this._prefMenuItemRemoveEntry( menuItem, false )
                }
                Me.saveConfiguration()
                uiUtils.showUserNotification( "Changes saved." )
            }, editable, editables, buttonStyles )
        } catch ( e ) { dev.log( e ) }
    }
    _newRule() {
        try {
            let editable = { "searchText": "", uriOptions: { "scheme": false, "authority": true, "path": false, "query": false, "fragment": false }, extras: { pageTitle: false }, extras2: { pageContents: false } }
            let uriOptionsEditables = [{ scheme: "http://", authority: "example.com", path: "/path/in.html", query: "?name=value", fragment: "#bookmark" }]
            let editables = [{ searchText: "Text to search for: " },
{ uriOptions: " ", subObjectEditableProperties: uriOptionsEditables },
            { extras: "Search Page Title:", subObjectEditableProperties: [{ pageTitle: " ", hideLabel: true }] },
            { extras2: "Search Page Contents:", subObjectEditableProperties: [{ pageContents: " ", hideLabel: true }] }]
            let buttonStyles = [{ label: "Cancel", key: Clutter.KEY_Escape, action: function () { this.returnObject = false, this.close( true ) } }, { label: "Done", default: true }]
            let createRuleDialog = new dialogs.ObjectEditorDialog( "Create New Rule ", ( returnObject ) => {
                if ( !returnObject ) return
                returnObject.searchText = returnObject.searchText.trim()
                if ( returnObject.searchText == "" ) return
                Me.config.uriPrefs[returnObject.searchText] = {
                    defaultBrowser : Me.config.defaultBrowser,
                    uriOptions     : returnObject.uriOptions
                }
                Me.config.uriPrefs[returnObject.searchText].uriOptions.pageTitle = returnObject.extras.pageTitle
                Me.config.uriPrefs[returnObject.searchText].uriOptions.pageContents = returnObject.extras2.pageContents
                Me.saveConfiguration()
                uiUtils.showUserNotification( "New rule created." )
            }, editable, editables, buttonStyles )
        } catch ( e ) { dev.log( e ) }
    }
    _onBowserSwitch( menuItem, state ) {
        if ( this._suppressToggleHandler ) return
        if ( state ) Me.enableBowser(); else Me.disableBowser()
    }
    _onAskSwitch( menuItem, state ) {
        if ( this._suppressToggleHandler ) return
        Me.config.askOnUnmatchedURI = state
        Me.saveConfiguration()
    }
    _toggleMenu() {
        this.menu.toggle()
    }
    _openSettings() {
        Me.openPreferences()
    }
} )