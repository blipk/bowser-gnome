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
import GLib from "gi://GLib"
import Gio from "gi://Gio"

// Internal imports
import { BowserGnomeInstance as Me } from "./extension.js"
import * as dev from "./dev.js"
import { Extension, gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js"

//General
export function truncateString( instring, length ) {
    let shortened = instring.replace( /\s+/g, " " )
    if ( shortened.length > length )
        shortened = shortened.substring( 0, length - 1 ) + "..."
    return shortened
}

export function isEmpty ( v ) {
    return typeof v === "undefined" ? true
        : v === null ? true
            : Array.isArray( v ) && v.length === 0 ? true
                : typeof v === "object" ? ( Object.getOwnPropertyNames( v ).length > 0 ? false : true )
                    : typeof v === "string" ? ( v.length > 0 ? false : true )
                        : Boolean( v )
}


export function forEachEntry ( object, callback, thisArg, recursive = false, recursiveIndex = 0 ) {
    if ( object === null ) throw new TypeError( "Not an object" )
    thisArg = thisArg || object

    Object.entries( object ).forEach( function ( entryArray, entryIndex ) {
        let [key, value] = entryArray
        let entryObj = { [key]: object[key] }
        let retIndex = entryIndex + recursiveIndex
        callback.call( thisArg, key, object[key], retIndex, entryObj, entryArray, object )
        if ( typeof object[key] === "object" && object[key] !== null && recursive === true ) {
            if ( Array.isArray( object[key] ) === true ) {
                object[key].forEach( function ( prop, index ) {
                    if ( Array.isArray( object[key][index] ) === false && typeof object[key][index] === "object" && object[key][index] !== null ) {
                        recursiveIndex += Object.keys( object ).length - 1
                        forEachEntry( object[key][index], callback, thisArg, recursive, recursiveIndex )
                    }
                }, thisArg )
            } else {
                recursiveIndex += Object.keys( object ).length - 1
                forEachEntry( object[key], callback, thisArg, recursive, recursiveIndex )
            }
        }
    }, thisArg )
}

export function filterObj ( object, predicate ) {
    return Object.fromEntries( Object.entries( object ).filter( predicate ) )
}

export function splitURI( inURI ) {
    try {
    let regexPattern = /^(([^:/\?#]+):)?(\/\/([^/\?#]*))?([^\?#]*)(\?([^#]*))?(#(.*))?/

    let re = RegExp( regexPattern )
    let output = re.exec( inURI )

    if ( output[3] == undefined )
        inURI = "foo://" + inURI
        output = re.exec( inURI )

    // Named capture groups not working on gjs :(
    let splitURI = {"scheme"        : output[1], "schemeTrim"    : output[2],
                "authority"     : output[3], "authorityTrim" : output[4],
                "path"          : output[5],
                "query"         : output[6], "queryTrim"     : output[7],
                "fragment"      : output[8], "fragmentTrim"  : output[9]}

    if ( splitURI["scheme"] == "foo:" )
        splitURI["scheme"] = ""
        inURI = inURI.substring( 6 )

    return splitURI
    } catch( e ) { dev.log( e ) }
}

// Combines the benefits of spawn_sync (easy retrieval of output)
// with those of spawn_async (non-blocking execution).
// Based on https://github.com/optimisme/gjs-examples/blob/master/assets/spawn.js.
// https://github.com/p-e-w/argos/blob/master/argos%40pew.worldwidemann.com/utilities.js
export function spawnWithCallback( workingDirectory, argv, envp, flags, childSetup, callback ) {
    let [success, pid, stdinFile, stdoutFile, stderrFile] = GLib.spawn_async_with_pipes(
        workingDirectory, argv, envp, flags, childSetup
)

    if ( !success )
        return

    GLib.close( stdinFile )
    GLib.close( stderrFile )

    let standardOutput = ""

    let stdoutStream = new Gio.DataInputStream( {
        base_stream: new Gio.UnixInputStream( {
            fd: stdoutFile
        } )
    } )

    readStream( stdoutStream, function ( output ) {
        if ( output === null ) {
            stdoutStream.close( null )
            callback( standardOutput )
        } else {
            standardOutput += output
        }
    } )
}

export function readStream( stream, callback ) {
    stream.read_line_async( GLib.PRIORITY_LOW, null, function ( source, result ) {
        let [line] = source.read_line_finish( result )

        if ( line === null ) {
            callback( null )
        } else {
            callback( new TextDecoder().decode( line ) + "\n" )
            readStream( source, callback )
        }
    } )
}

/**
 * Check if an error comes from a cancelled Gio operation.
 * @param {Error} error - The error to check
 * @returns {boolean} True if the operation was cancelled
 */
export function isCancelledError( error ) {
    return error instanceof GLib.Error && error.matches( Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED )
}

/**
 * Run a command without blocking the shell, and get its output when it stops.
 * The callback is not called if the cancellable is cancelled.
 * @param {string[]} argv - The command and its arguments
 * @param {function(boolean, string, string): void} [callback] - Gets the success status, stdout and stderr
 * @param {Gio.Cancellable|null} [cancellable] - Stops the wait for the output
 */
export function spawnAsync( argv, callback = null, cancellable = null ) {
    let proc
    try {
        proc = Gio.Subprocess.new( argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE )
    } catch ( e ) {
        dev.log( e )
        callback?.( false, "", e.message )
        return
    }

    proc.communicate_utf8_async( null, cancellable, ( source, result ) => {
        let success = false
        let stdout = ""
        let stderr = ""
        try {
            [, stdout, stderr] = source.communicate_utf8_finish( result )
            success = source.get_successful()
        } catch ( e ) {
            if ( isCancelledError( e ) ) return
            dev.log( e )
            stderr = e.message
        }
        callback?.( success, ( stdout ?? "" ).trim(), ( stderr ?? "" ).trim() )
    } )
}

// these imports are required for the eval() usage in InjectionHandler.add()
import * as workspace from "resource:///org/gnome/shell/ui/workspace.js"
import * as workspaceAnimation from "resource:///org/gnome/shell/ui/workspaceAnimation.js"
import * as workspacesView from "resource:///org/gnome/shell/ui/workspacesView.js"
import * as workspaceThumbnail from "resource:///org/gnome/shell/ui/workspaceThumbnail.js"
import * as popupMenu from "resource:///org/gnome/shell/ui/popupMenu.js"
import * as background from "resource:///org/gnome/shell/ui/background.js"
import * as layout from "resource:///org/gnome/shell/ui/layout.js"
import * as overview from "resource:///org/gnome/shell/ui/overview.js"
import * as overviewControls from "resource:///org/gnome/shell/ui/overviewControls.js"
import { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js"



export class InjectionHandler {

    constructor() {
        this.injections = new Map()
        this.manager = new InjectionManager()
    }

    add( prototype, methodName, createOverrideFunc ) {
        try {
            let savedProtoMethods = this.injections.get( prototype )
            if ( !savedProtoMethods ) {
                savedProtoMethods = new Map()
                this.injections.set( prototype, savedProtoMethods )
            }

            savedProtoMethods.set( methodName, [createOverrideFunc, prototype[methodName].bind( {} )] )

            this.manager.overrideMethod( prototype, methodName, createOverrideFunc )
        } catch ( e ) { dev.log( e ) }
    }

    removeAll() {
        try {
            for ( let [prototype, savedProtoMethods] of this.injections.entries() )
                for ( let methodName of savedProtoMethods.keys() )
                    this.manager.restoreMethod( prototype, methodName )
        } catch ( e ) { dev.log( e ) }
    }

    destroy() {
        try {
            this.removeAll()
        } catch ( e ) { dev.log( e ) }
    }
}

export class SignalHandler {
    constructor() {
        this.signalIds = new Map()
    }

    add( target, signal = null, fn = null ) {
        try {
            let signalId = target.connect ? target.connect( signal, fn ) : target
            this.signalIds.set( signalId, target )
        } catch ( e ) { dev.log( e ) }
    }

    disconnectAll() {
        try {
            this.signalIds.forEach( ( target, id ) => target.disconnect ? target.disconnect( id ) : GLib.Source.remove( id ) )
            this.signalIds.clear()
        } catch ( e ) { dev.log( e ) }
    }

    destroy() {
        try {
            this.disconnectAll()
        } catch ( e ) { dev.log( e ) }
    }
}