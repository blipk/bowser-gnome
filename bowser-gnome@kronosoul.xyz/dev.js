/*
 * Bowser extension for Gnome 3
 * This file is part of the Bowser Gnome Extension for Gnome 3
 * Copyright (C) 2020 A.D. - http://kronosoul.xyz
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope this it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

// Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { utils, fileUtils } = Me.imports;
const _debug_ = true;

function log(context, message) {
    if (!_debug_) return;
    if (message === undefined) {message = context; context = "() =>";}
    if (message === undefined) {message = "UNDEFINED value"}
    if (message === null) {message = "NULL value"}

    let timestamp = new Date().toLocaleString();
    let prefix =  '(' + Me.uuid.toString() + ') [' + timestamp + ']:';
    let out = prefix;

    if (message instanceof Error) {
        out += "!Error   | " + context.toString() + " | " + '\r\n' + "|-" + message.name +" "+ message.message + '\r\n' + "|-Stack Trace:" + '\r\n' + message.stack + '\r\n';
    } else if (typeof message === 'object') {
        out += "@Object  | " + context.toString() + " | " + message.toString() + '\r\n';
        out += JSON.stringify(message, null, 2) + '\r\n\r\n';
    } else {
        out += ":Info    | " + context.toString() + " | " + message.toString() + '\r\n';
    }

    global.log(out);
    fileUtils.saveRawToFile(out, 'debug.log', fileUtils.CONF_DIR, true);
}