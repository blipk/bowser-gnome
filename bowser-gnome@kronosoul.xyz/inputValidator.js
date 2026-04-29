/*
 * Bowser extension for Gnome
 * Input validation and integrity verification helpers.
 */

import GLib from "gi://GLib"
import Gio from "gi://Gio"

import { BowserGnomeInstance as Me } from "./extension.js"
import * as dev from "./dev.js"
import * as fileUtils from "./fileUtils.js"

export class InputValidator {
    static computeFileSHA256( filePath ) {
        try {
            const file = Gio.file_new_for_path( filePath )
            if ( !file.query_exists( null ) ) {
                dev.alwaysLog( `InputValidator: File does not exist for hash: ${filePath}` )
                return null
            }
            const [success, contents] = file.load_contents( null )
            if ( !success ) {
                dev.alwaysLog( `InputValidator: Could not read file for hash: ${filePath}` )
                return null
            }
            return GLib.compute_checksum_for_bytes( GLib.ChecksumType.SHA256, contents )
        } catch ( e ) {
            dev.alwaysLog( `InputValidator: SHA256 computation failed for '${filePath}': ${e.message}` )
            return null
        }
    }

    static verifyBowserIntegrity() {
        const bowserPath = fileUtils.BOWSER_EXEC_FILE
        const actualHash = InputValidator.computeFileSHA256( bowserPath )
        if ( !actualHash ) return false

        let expectedHash = ""
        try {
            expectedHash = Me.settings.get_string( "bowser-sha256" )
        } catch ( e ) {
            dev.alwaysLog( `InputValidator: Could not read bowser-sha256 from GSettings: ${e.message}` )
        }

        if ( !expectedHash ) {
            dev.alwaysLog( "InputValidator: No bowser-sha256 in GSettings, integrity check disabled" )
            return actualHash
        }

        if ( actualHash !== expectedHash ) {
            dev.alwaysLog(
                `InputValidator: bowser.js integrity check failed. Expected: ${expectedHash}, Got: ${actualHash}`
            )
            return false
        }
        return actualHash
    }

    static ensureBowserExecutable() {
        try {
            const bowserPath = fileUtils.BOWSER_EXEC_FILE
            const file = Gio.file_new_for_path( bowserPath )

            if ( !file.query_exists( null ) ) {
                dev.alwaysLog( `InputValidator: bowser.js not found at ${bowserPath}` )
                return { needsChmod: false, error: "File not found" }
            }

            const info = file.query_info( "access::can-execute", Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null )
            const isExecutable = info.get_attribute_boolean( "access::can-execute" )

            // Always integrity-check; if mismatched, don't trust the existing +x either.
            const hashResult = InputValidator.verifyBowserIntegrity()
            if ( hashResult === false ) {
                dev.alwaysLog( "InputValidator: bowser.js integrity check failed, not making executable" )
                return { needsChmod: false, error: "Integrity check failed" }
            }

            if ( isExecutable ) return { needsChmod: false, error: null }
            return { needsChmod: true, error: null }
        } catch ( e ) {
            dev.alwaysLog( `InputValidator: ensureBowserExecutable failed: ${e.message}` )
            return { needsChmod: false, error: e.message }
        }
    }
}
