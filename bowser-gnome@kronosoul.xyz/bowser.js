#!/usr/bin/env gjs

'use strict';

imports.gi.versions.Gdk = '3.0';
imports.gi.versions.Gtk = '3.0';

const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;

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
window._ = imports.gettext.domain('bowser-gnome').gettext;

const BowserService = GObject.registerClass({
    GTypeName: 'BowserService'
}, class BowserService extends Gtk.Application {
    _init() {
        super._init({
            application_id: bowser.app_id,
            flags: Gio.ApplicationFlags.HANDLES_OPEN
        });

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
                imports.extension.openBrowser(uri);
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

