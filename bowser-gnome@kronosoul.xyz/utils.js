/*
 * Customised Workspaces extension for Gnome 3
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
const { GLib, Gio } = imports.gi;
const _ = imports.gettext.domain('bowser-gnome').gettext;

// Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const dev = Me.imports.dev;

//General
function truncateString(instring, length) {
    let shortened = instring.replace(/\s+/g, ' ');
    if (shortened.length > length)
        shortened = shortened.substring(0, length - 1) + '...';
    return shortened;
}

var isEmpty = function (v) {
    return typeof v === 'undefined' ? true
        : v === null ? true
            : v === [] ? true
                : typeof v === 'object' ? (Object.getOwnPropertyNames(v).length > 0 ? false : true)
                    : typeof v === 'string' ? (v.length > 0 ? false : true)
                        : Boolean(v);
}

if (!Object.prototype.hasOwnProperty('forEachEntry')) {
Object.defineProperty(Object.prototype, 'forEachEntry', {
    value: function (callback, thisArg, recursive = false, recursiveIndex = 0) {
        if (this === null) throw new TypeError('Not an object');
        thisArg = thisArg || this;

        Object.entries(this).forEach(function (entryArray, entryIndex) {
            let [key, value] = entryArray;
            let entryObj = { [key]: this[key] };
            let retIndex = entryIndex + recursiveIndex;
            callback.call(thisArg, key, this[key], retIndex, entryObj, entryArray, this);
            if (typeof this[key] === 'object' && this[key] !== null && recursive === true) {
                if (Array.isArray(this[key]) === true) {
                    this[key].forEach(function (prop, index) {
                        if (Array.isArray(this[key][index]) === false && typeof this[key][index] === 'object' && this[key][index] !== null) {
                            recursiveIndex += Object.keys(this).length - 1;
                            this[key][index].forEachEntry(callback, thisArg, recursive, recursiveIndex);
                        }
                    }, this);
                } else {
                    recursiveIndex += Object.keys(this).length - 1;
                    this[key].forEachEntry(callback, thisArg, recursive, recursiveIndex);
                }
            }
        }, this);
    }
});
}

if (!Object.prototype.hasOwnProperty('filterObj')) {
Object.defineProperty(Object.prototype, 'filterObj', {
    value: function (predicate) {
        return Object.fromEntries(Object.entries(this).filter(predicate));
    }
});
}

function splitURI(inURI) {
    try {
    let regexPattern = /^(([^:/\?#]+):)?(\/\/([^/\?#]*))?([^\?#]*)(\?([^#]*))?(#(.*))?/;

    let re = RegExp(regexPattern)
    let output = re.exec(inURI);

    if (output[3] == undefined)
        inURI = 'foo://' + inURI;
        output = re.exec(inURI);

    // Named capture groups not working on gjs :(
    let splitURI = {'scheme': output[1], 'schemeTrim': output[2],
                'authority': output[3], 'authorityTrim': output[4],
                'path': output[5],
                'query': output[6], 'queryTrim': output[7],
                'fragment': output[8], 'fragmentTrim': output[9]}

    if (splitURI['scheme'] == 'foo:')
        splitURI['scheme'] = '';
        inURI = inURI.substring(6);

    return splitURI;
    } catch(e) { dev.log(e); }
}

// Combines the benefits of spawn_sync (easy retrieval of output)
// with those of spawn_async (non-blocking execution).
// Based on https://github.com/optimisme/gjs-examples/blob/master/assets/spawn.js.
// https://github.com/p-e-w/argos/blob/master/argos%40pew.worldwidemann.com/utilities.js
function spawnWithCallback(workingDirectory, argv, envp, flags, childSetup, callback) {
    let [success, pid, stdinFile, stdoutFile, stderrFile] = GLib.spawn_async_with_pipes(
        workingDirectory, argv, envp, flags, childSetup);

    if (!success)
        return;

    GLib.close(stdinFile);
    GLib.close(stderrFile);

    let standardOutput = "";

    let stdoutStream = new Gio.DataInputStream({
        base_stream: new Gio.UnixInputStream({
            fd: stdoutFile
        })
    });

    readStream(stdoutStream, function (output) {
        if (output === null) {
            stdoutStream.close(null);
            callback(standardOutput);
        } else {
            standardOutput += output;
        }
    });
}

function readStream(stream, callback) {
    stream.read_line_async(GLib.PRIORITY_LOW, null, function (source, result) {
        let [line] = source.read_line_finish(result);

        if (line === null) {
            callback(null);
        } else {
            callback(imports.byteArray.toString(line) + "\n");
            readStream(source, callback);
        }
    });
}
