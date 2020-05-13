#!/usr/bin/env gjs

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

'use strict';

imports.gi.versions.Gdk = '3.0';
imports.gi.versions.Gtk = '3.0';

// External imports
const { GObject, GLib, Gtk, Gio, Gdk } = imports.gi;

// Find the root datadir of the extension
function get_datadir() {
    let m = /@(.+):\d+/.exec((new Error()).stack.split('\n')[1]);
    return Gio.File.new_for_path(m[1]).get_parent().get_parent().get_path();
}

window.bowser = {extdatadir: GLib.build_filenamev([get_datadir(), 'bowser-gnome@kronosoul.xyz'])};
imports.searchPath.unshift(bowser.extdatadir);

bowser.metadata = (() => {
    let data = GLib.file_get_contents(bowser.extdatadir + '/metadata.json')[1];

    return JSON.parse(imports.byteArray.toString(data));
})();
bowser.app_id = bowser.metadata['application-id'];
bowser.app_path = bowser.metadata['resource-path'];
bowser.is_local = bowser.extdatadir.startsWith(GLib.get_user_data_dir());
window._ = imports.gettext.domain(bowser.metadata['gettext-domain']).gettext;

const BowserService = GObject.registerClass({
    GTypeName: 'BowserService'
}, class BowserService extends Gtk.Application {
    _init() {
        super._init({
            application_id: bowser.app_id,
            flags: (Gio.ApplicationFlags.HANDLES_OPEN |
                    Gio.ApplicationFlags.NON_UNIQUE)
        });

        const GioSSS = Gio.SettingsSchemaSource;
        let schemaDir = GLib.build_pathv('/', [bowser.extdatadir, 'schemas']);
        let schemaSource = GioSSS.new_from_directory(schemaDir, GioSSS.get_default(), false);
        let schemaObj = schemaSource.lookup(bowser.metadata['settings-schema'], true);
        this.settings = new Gio.Settings({ settings_schema: schemaObj });

        GLib.set_prgname('Bowser');
        GLib.set_application_name('Bowser');
        
        // Command-line
        this._initOptions();
    }
   
    _preferences() {
        let proc = new Gio.Subprocess({
            argv: [bowser.extdatadir + '/bowser-preferences']
        });
        proc.init(null);
        proc.wait_async(null, null);
    }

    /*
     * CLI
     */
    _initOptions() {
        this.add_main_option(
            'version',
            'v'.charCodeAt(0),
            GLib.OptionFlags.NONE,
            GLib.OptionArg.NONE,
            _('Show release version'),
            null
        );

        this.add_main_option(
            'openuri',
            'o'.charCodeAt(0),
            GLib.OptionFlags.NONE,
            GLib.OptionArg.STRING,
            _('Action the URI based on Bowser rules'),
            null
        );
    }

    vfunc_handle_local_options(options) {
        try {
            if (options.contains('version')) {
                print(`Bowser ${bowser.metadata.version}`);
                return 0;
            }

            if (options.contains('openuri')) {
                let uri = options.lookup_value('openuri', null).unpack();
                if (uri == '') uri = '--s';
                print(`Opening ${uri}`);
                let currentURIList = JSON.parse(this.settings.get_string('uri-list'));
                currentURIList.push(uri);
                this.settings.set_string('uri-list', JSON.stringify(currentURIList));
                return 0;
            }

            //this.register(null);
            return 0;
        } catch (e) {
            logError(e);
            return 1;
        }
    }
});

(new BowserService()).run([imports.system.programInvocationName].concat(ARGV));

