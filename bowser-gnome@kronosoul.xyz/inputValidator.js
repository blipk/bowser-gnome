/*
 * Bowser extension for Gnome
 * Input validation and integrity verification helpers.
 * All file access is async, so that it does not block the shell.
 */

import GLib from "gi://GLib"
import Gio from "gi://Gio"

import { BowserGnomeInstance as Me } from "./extension.js"
import * as dev from "./dev.js"
import * as utils from "./utils.js"
import * as fileUtils from "./fileUtils.js"

export class InputValidator {
    /**
     * Compute the SHA256 hash of a file.
     * The callback is not called if the cancellable is cancelled.
     * @param {string} filePath - Path of the file
     * @param {function(string|null): void} callback - Gets the hash, or null if the file cannot be read
     * @param {Gio.Cancellable|null} [cancellable] - Stops the read
     */
    static computeFileSHA256( filePath, callback, cancellable = null ) {
        const file = Gio.file_new_for_path( filePath )
        file.load_contents_async( cancellable, ( source, result ) => {
            let hash = null
            try {
                const [, contents] = source.load_contents_finish( result )
                hash = GLib.compute_checksum_for_bytes( GLib.ChecksumType.SHA256, contents )
            } catch ( e ) {
                if ( utils.isCancelledError( e ) ) return
                dev.alwaysLog( `InputValidator: SHA256 computation failed for '${filePath}': ${e.message}` )
            }
            callback( hash )
        } )
    }

    /**
     * Compare the SHA256 hash of bowser.js with the hash in GSettings.
     * The callback is not called if the cancellable is cancelled.
     * @param {function(string|false): void} callback - Gets the hash if the check passes, or false if it fails
     * @param {Gio.Cancellable|null} [cancellable] - Stops the check
     */
    static verifyBowserIntegrity( callback, cancellable = null ) {
        const bowserPath = fileUtils.BOWSER_EXEC_FILE
        InputValidator.computeFileSHA256( bowserPath, ( actualHash ) => {
            if ( !actualHash ) {
                callback( false )
                return
            }

            let expectedHash = ""
            try {
                expectedHash = Me.settings.get_string( "bowser-sha256" )
            } catch ( e ) {
                dev.alwaysLog( `InputValidator: Could not read bowser-sha256 from GSettings: ${e.message}` )
            }

            if ( !expectedHash ) {
                dev.alwaysLog( "InputValidator: No bowser-sha256 in GSettings, integrity check disabled" )
                callback( actualHash )
                return
            }

            if ( actualHash !== expectedHash ) {
                dev.alwaysLog(
                    `InputValidator: bowser.js integrity check failed. Expected: ${expectedHash}, Got: ${actualHash}`
                )
                callback( false )
                return
            }
            callback( actualHash )
        }, cancellable )
    }

    /**
     * Find if bowser.js must be made executable. Do the integrity check first.
     * The callback is not called if the cancellable is cancelled.
     * @param {function({needsChmod: boolean, error: string|null}): void} callback - Gets the result of the check
     * @param {Gio.Cancellable|null} [cancellable] - Stops the check
     */
    static ensureBowserExecutable( callback, cancellable = null ) {
        const bowserPath = fileUtils.BOWSER_EXEC_FILE
        const file = Gio.file_new_for_path( bowserPath )

        file.query_info_async( "access::can-execute", Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, cancellable,
            ( source, result ) => {
                let isExecutable
                try {
                    const info = source.query_info_finish( result )
                    isExecutable = info.get_attribute_boolean( "access::can-execute" )
                } catch ( e ) {
                    if ( utils.isCancelledError( e ) ) return
                    if ( e.matches?.( Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND ) ) {
                        dev.alwaysLog( `InputValidator: bowser.js not found at ${bowserPath}` )
                        callback( { needsChmod: false, error: "File not found" } )
                    } else {
                        dev.alwaysLog( `InputValidator: ensureBowserExecutable failed: ${e.message}` )
                        callback( { needsChmod: false, error: e.message } )
                    }
                    return
                }

                // Always integrity-check; if mismatched, don't trust the existing +x either.
                InputValidator.verifyBowserIntegrity( ( hashResult ) => {
                    if ( hashResult === false ) {
                        dev.alwaysLog( "InputValidator: bowser.js integrity check failed, not making executable" )
                        callback( { needsChmod: false, error: "Integrity check failed" } )
                        return
                    }
                    callback( { needsChmod: !isExecutable, error: null } )
                }, cancellable )
            } )
    }
}
