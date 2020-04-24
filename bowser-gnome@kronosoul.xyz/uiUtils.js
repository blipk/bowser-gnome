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

// External imports
const { GObject, St, Clutter, Gio, GLib } = imports.gi;
const Gettext = imports.gettext;
const Main = imports.ui.main;
const CheckBox  = imports.ui.checkBox.CheckBox;
const { modalDialog, shellEntry, tweener } = imports.ui;
const _ = Gettext.domain('bowser-gnome').gettext;

// Internal imports
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { utils, fileUtils } = Me.imports;
const dev = Me.imports.devUtils;

//For adding IconButtons on to PanelMenu.MenuItem buttons or elsewhere
function createIconButton (parentItem, iconNameURI, onClickFn, options) { //St.Side.RIGHT
    let defaults = {x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.END};
    options = {...defaults, ...options };

    let icon = new St.Icon({icon_name: iconNameURI, style_class: 'system-status-icon' });
    let iconButton = new St.Button({
        style_class: 'ci-action-btn', x_fill: true, can_focus: true,
        child: icon,

    });
    parentItem.actor.add_child(iconButton);
    parentItem.iconButtons = parentItem.iconButtons || new Array();
    parentItem.iconsButtonsPressIds = parentItem.iconButtons || new Array();
    parentItem.iconButtons.push(iconButton);
    parentItem.iconsButtonsPressIds.push( iconButton.connect('button-press-event', onClickFn) );
}

//Display a short overlay message on the screen for user feedback etc..
let messages = [];
function showUserFeedbackMessage(input, overviewMessage=false) {
    dev.log('User Feedback', input);
    if (overviewMessage) {
        Main.overview.setMessage(_(input), { forFeedback: true });
    } else {
        messages.push(new St.Label({ style_class: 'feedback-label', text: _(input) }));
        let lastItem = messages.length-1;
        Main.uiGroup.add_actor(messages[lastItem]);
        messages[lastItem].opacity = 255;
        let monitor = Main.layoutManager.primaryMonitor;
        messages[lastItem].set_position(monitor.x + Math.floor(monitor.width / 2 - messages[lastItem].width / 2), monitor.y + Math.floor(monitor.height / 2 - messages[lastItem].height / 2));
        tweener.addTween(messages[lastItem], { opacity: 0, time: 2.9, transition: 'easeOutQuad', onComplete: () => { Main.uiGroup.remove_actor(messages[lastItem]); messages[lastItem] = null;} });
    }
}

//Object Editor Dialog
var ObjectEditorDialog = GObject.registerClass({
    GTypeName: 'ObjectEditorDialog'
}, class ObjectEditorDialog extends modalDialog.ModalDialog {
    _init(dialogInfoTextStyle='', callback=null, 
        editableObject=null, /*object to edit in the editor */
        editableProperties=[], /* {propertyName: 'Property Display Name', disabled: false, hidden: false, subObjectEditableProperties: editableProperties,  icon: icon-name, hintText: 'Hint text to display for St.Entry', minwidth: 20, subObjectEditableProperties=[]}*/
        buttons = null,
        dialogStyle = null,
        contentLayoutBoxStyleClass = ''
        ) {
        
        if (typeof callback !== 'function') throw TypeError('ObjectEditorDialog._init error: callback must be a function');
        this._callback = callback;

        if (editableObject[1]) {throw TypeError('Array passed to object editor, only supports objects with simple types or sub objects as simple bool/int enums.');}
        this.returnObject = editableObject;
        this.editableObject = editableObject;
        this._unreferencedObjectCopy = JSON.parse(JSON.stringify(editableObject));

        
        try{
        // Initialize dialog with style
        let defaults = { styleClass: 'object-dialog', destroyOnClose: true };
        dialogStyle = {...defaults, ...dialogStyle };
        super._init(dialogStyle);
        this.contentLayout.style_class = contentLayoutBoxStyleClass ? contentLayoutBoxStyleClass : this.contentLayout.style_class;
        
        //Label for our dialog/text field with text about the dialog or a prompt for user text input
        defaults = { style_class: 'object-dialog-label', text: _((dialogInfoTextStyle.text || dialogInfoTextStyle).toString()), x_align: St.Align.START, y_align: St.Align.START } ;
        dialogInfoTextStyle = (typeof dialogInfoTextStyle == 'string') ? defaults : {...defaults, ...dialogInfoTextStyle };
        let stLabelUText = new St.Label(dialogInfoTextStyle);
        dialogInfoTextStyle.x_fill = true;
        if (dialogInfoTextStyle.text != '') this.contentLayout.add(stLabelUText, dialogInfoTextStyle);

        //*Error box that will appear to prompt for user validation of input //TO DO
        this._errorBox = new St.BoxLayout();
        this.contentLayout.add(this._errorBox, { expand: true });
        let errorIcon = new St.Icon({ icon_name: 'dialog-error-symbolic', icon_size: 24, style_class: 'object-dialog-error-icon' });
        this._errorBox.add(errorIcon, { y_align: St.Align.MIDDLE });
        this._inputError = false;
        this._errorMessage = new St.Label({ style_class: 'object-dialog-error-label' });
        this._errorMessage.clutter_text.line_wrap = true;
        this._errorBox.add(this._errorMessage, { expand: true, x_align: St.Align.START, x_fill: false, y_align: St.Align.MIDDLE, y_fill: false });
        this._errorBox.hide();

        //Action buttons
        this.buttons = Array();
        buttons = (buttons == null) ? 'Done' : buttons;
        defaults = [{ label: (buttons), default: true}];       //key: Clutter.KEY_Escape 
        buttons = (typeof buttons == 'string') ? defaults : buttons;
        buttons.forEach(function (button, i) {
            if (button.action) button.action = button.action.bind(this);
            else button.action = this.close.bind(this);
            
            this.buttons[i] = this.addButton(button);
            this.buttons[i].set_reactive(true);
            if (button.style_class) this.buttons[i].add_style_class_name(button.style_class);
        }, this)
        //dev.log(this.dialogLayout)
        //Create an area for each property of our object
        this._propertyBoxes = [];
        this.propertyKeys = Array();
        this.propertyValues = Array();

        this.propertyDisplayName = Array();
        this.propertyDisabled = Array();
        this.propertyHidden = Array();
        this.propertyLabelOnly = Array();
        this.propertyLabelStyle = Array();
        this.propertyBoxStyle = Array();
        this.propertyIconStyle = Array();
        this.subObjectMasks = Array();
        this.propertyBoxClickCallbacks = Array();
        if (editableObject) {
            editableObject.forEachEntry(function(key, value, i) {
                // Options for how to display each property section
                this.propertyKeys[i] = key;
                this.propertyValues[i] = value;
                this.propertyDisplayName[i] = '';
                this.propertyDisabled[i] = false;
                this.propertyHidden[i] = false;
                this.propertyLabelOnly[i] = false;
                this.propertyLabelStyle[i] = { style_class: 'spacing7', x_expand: true, y_expand: true, x_align: St.Align.END, y_align: Clutter.ActorAlign.CENTER};
                this.propertyBoxStyle[i] = {};
                this.propertyIconStyle[i] = {};
                this.subObjectMasks[i] = [];
                this.propertyBoxClickCallbacks[i] = (()=>{ dev.log("Clicked on " + this.propertyDisplayName[i]); });
                editableProperties.forEach(function(propertyDisplayOption, index) {
                    if (editableProperties[index][key]) {
                        this.propertyDisplayName[i] = editableProperties[index][key] || this.propertyDisplayName[i]

                        let {disabled, hidden, labelOnly, labelStyle, boxStyle, iconStyle, subObjectEditableProperties, boxClickCallback} = editableProperties[index];
                        this.propertyDisabled[i] = disabled || this.propertyDisabled[i];
                        this.propertyHidden[i] = hidden || this.propertyHidden[i];
                        this.propertyLabelOnly[i] = labelOnly || this.propertyLabelOnly[i];
                        this.propertyLabelStyle[i] = labelStyle || this.propertyLabelStyle[i];
                        this.propertyBoxStyle[i] = boxStyle || this.propertyBoxStyle[i];
                        this.propertyIconStyle[i] = iconStyle || this.propertyIconStyle[i];
                        this.subObjectMasks[i] = subObjectEditableProperties || this.subObjectMasks[i];
                        this.propertyBoxClickCallbacks[i] = boxClickCallback || (()=>{ dev.log("Clicked on " + this.propertyDisplayName[i]); });
                    }
                }, this);
                if (this.propertyHidden[i]) return;

                //A box area for each property
                this._propertyBoxes[i] = new St.BoxLayout(this.propertyBoxStyle[i]);
                if (this.propertyIconStyle[i] != undefined && this.propertyIconStyle[i] != {}) {
                    this._propertyBoxes[i].propertyBoxStNameIcon = new St.Icon(this.propertyIconStyle[i]);
                    //this._propertyBoxes[i].propertyBoxStNameIcon.set_translation(50, 50, 0)
                    this._propertyBoxes[i].add(this._propertyBoxes[i].propertyBoxStNameIcon, this.propertyIconStyle[i]);
                }
                // :hover event doesn't work on style_class elements for BoxLayout, this allows using :focus for hover events
                this._propertyBoxes[i].connect('enter-event', ()=>{ this._propertyBoxes[i].grab_key_focus();});
                this._propertyBoxes[i].connect('leave-event', ()=>{ global.stage.set_key_focus(this); });
                this._propertyBoxes[i].connect('button-press-event', () => {
                    this.propertyBoxClickCallbacks[i].call(this, i);
                });
                this.contentLayout.add(this._propertyBoxes[i], this.propertyBoxStyle[i]);
                
                // Left side labelled button
                this._propertyBoxes[i]._propertyBoxMessageButton = new St.Button(this.propertyLabelStyle[i]);
                this._propertyBoxes[i]._propertyBoxMessage = new St.Label(this.propertyLabelStyle[i]);
                this._propertyBoxes[i]._propertyBoxMessage.set_text(this.propertyDisplayName[i]);
                this._propertyBoxes[i]._propertyBoxMessage.clutter_text.line_wrap = false;
                this._propertyBoxes[i]._propertyBoxMessageButton.add_actor(this._propertyBoxes[i]._propertyBoxMessage);
                //this._propertyBoxes[i]._propertyBoxMessageButton.set_label(this.propertyDisplayName[i])
                //this._propertyBoxes[i]._propertyBoxMessageButton.set_label_actor(this._propertyBoxes[i]._propertyBoxMessage.actor)
                this._propertyBoxes[i]._propertyBoxMessageButton.connect('button-press-event', () => {
                    this.propertyBoxClickCallbacks[i].call(this, i);
                });
                this._propertyBoxes[i].add(this._propertyBoxes[i]._propertyBoxMessageButton, this.propertyLabelStyle[i]);

                //Property value editor element
                //if (value === undefined) {value = 'empty'};
                //if (value === null) {value = 'empty'};
                if (this.propertyLabelOnly[i]) return;
                if (typeof value === 'boolean') {
                    this._propertyBoxes[i]._propertyBoxEditorElement = new CheckBox('');
                    this._propertyBoxes[i]._propertyBoxEditorElement.actor.checked = editableObject[key];
                    this._propertyBoxes[i]._propertyBoxEditorElement.actor.connect('clicked', () => {editableObject[key] = this._propertyBoxes[i]._propertyBoxEditorElement.actor.checked});
                    this._propertyBoxes[i].add(this._propertyBoxes[i]._propertyBoxEditorElement.actor);
                } else if (typeof value === 'string' || typeof value === 'number') {
                    this._propertyBoxes[i]._propertyBoxEditorElement = new St.Entry({ style_class: 'object-dialog-label', can_focus: true, text: '', x_align: Clutter.ActorAlign.FILL, x_expand: true});
                    this._propertyBoxes[i]._propertyBoxEditorElement.clutter_text.min_width = 200;
                    this._focusElement = this._propertyBoxes[i]._propertyBoxEditorElement;  // To set initial focus
                    if (this.propertyDisabled[i] === true) {    
                        this._propertyBoxes[i]._propertyBoxEditorElement.clutter_text.set_editable(false);
                        this._propertyBoxes[i]._propertyBoxEditorElement.clutter_text.set_selectable(false);
                        this._propertyBoxes[i]._propertyBoxEditorElement.clutter_text.set_max_length(value.length);   
                    }
                    this._propertyBoxes[i]._propertyBoxEditorElement.set_text(value.toString());
                    this._propertyBoxes[i].add(this._propertyBoxes[i]._propertyBoxEditorElement, { y_align: St.Align.END });
                    
                    this._propertyBoxes[i]._propertyBoxEditorElement.clutter_text.get_buffer().connect('inserted-text', (o, position, new_text, new_text_length, e) => {
                        if (typeof value !== 'number') return Clutter.EVENT_PROPAGATE; 
                        if (new_text.search(/^[0-9]+$/i) === -1) {
                            o.delete_text(position, new_text_length);
                            return Clutter.EVENT_STOP;
                        }
                        return Clutter.EVENT_PROPAGATE;
                    });
                    this._propertyBoxes[i]._propertyBoxEditorElement.clutter_text.connect('text-changed', (o, e) => {
                        if (typeof value === 'number') editableObject[key] = parseInt(o.get_text());
                        else editableObject[key] = o.get_text();
                        return Clutter.EVENT_PROPAGATE;
                    });
                } else if (typeof value === 'object' && !Array.isArray(value)) {
                    // Any grouped sub objects must all be boolean (or TO DO int types)
                    // They will be displaye horizontally with labels above them

                    // Check for valid types in the sub object
                    let containsBooleans = true;
                    value.forEachEntry(function(subobjectKey, subobjectValue, i){
                        if (typeof subobjectValue != 'boolean') containsBooleans = false;
                    }, this);
                    if (!containsBooleans) return;

                    // Build UI
                    this._propertyBoxes[i]._boolBox = Array()
                    value.forEachEntry(function(subobjectKey, subobjectValue, n){
                        // Set up display masks for the subobject properties
                        let subObjectPropertyDisplayName = key;
                        let subObjectPropertyDisabled = false;   // TODO
                        let subObjectPropertyHidden = false;
                        let subObjectLabelOnly = false;
                        let subObjectToggleValidationCallback = (()=>{return [true];});
                        this.subObjectMasks[i].forEach(function(propertyMask, index) {
                            if (this.subObjectMasks[i][index][subobjectKey]) {
                                subObjectPropertyDisplayName = this.subObjectMasks[i][index][subobjectKey] || subObjectPropertyDisplayName;
                                subObjectPropertyDisabled = this.subObjectMasks[i][index].disabled || subObjectPropertyDisabled;
                                subObjectPropertyHidden = this.subObjectMasks[i][index].hidden || false;
                                subObjectLabelOnly = this.subObjectMasks[i][index].labelOnly || subObjectLabelOnly;
                                subObjectToggleValidationCallback = this.subObjectMasks[i][index].toggleValidationCallback || subObjectToggleValidationCallback;
                            }
                        }, this);
                        if (subObjectPropertyHidden) return;

                        //Vertical box area for each subobject property
                        this._propertyBoxes[i]._boolBox[n] = new St.BoxLayout({ vertical: true, reactive: true,
                            track_hover: true, x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.FILL, y_align: Clutter.ActorAlign.FILL});
                        this._propertyBoxes[i].add(this._propertyBoxes[i]._boolBox[n], { expand: true, reactive: true,
                            track_hover: true, x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.FILL, y_align: Clutter.ActorAlign.FILL });
                        
                        // Label
                        this._propertyBoxes[i]._boolBox[n]._boolBoxMessage = new St.Label();
                        value[subobjectKey] ? this._propertyBoxes[i]._boolBox[n]._boolBoxMessage.set_style_class_name('label-enabled') :
                                                 this._propertyBoxes[i]._boolBox[n]._boolBoxMessage.add_style_class_name('label-disabled');
                        
                        this._propertyBoxes[i]._boolBox[n]._boolBoxMessage.add_style_class_name('uri-element-label')                        
                        //this._propertyBoxes[i]._boolBox[n]._boolBoxMessage.clutter_text.set_line_wrap(false);
                        this._propertyBoxes[i]._boolBox[n].add(this._propertyBoxes[i]._boolBox[n]._boolBoxMessage, { expand: true });
                        this._propertyBoxes[i]._boolBox[n]._boolBoxMessage.set_text(subObjectPropertyDisplayName);
                        
                        // Toggling Function
                        let togglingFunction = function() {
                            // subObjectToggleValidationCallback will return values to set for any other bool in the subobject and whether to toggle the current one
                            let [allowed, boolValues] = subObjectToggleValidationCallback.call(this, value, n);
                            if (!boolValues) boolValues = Object.values(value);
                            if (allowed) boolValues[n] = value[subobjectKey] = value[subobjectKey] ? false : true;
                            this._propertyBoxes[i]._boolBox.forEach(function(box, x) {
                                if(boolValues[x]) { 
                                    value[Object.keys(value)[x]] = boolValues[x];
                                    this._propertyBoxes[i]._boolBox[x]._boolBoxMessage.remove_style_class_name('label-disabled');
                                    this._propertyBoxes[i]._boolBox[x]._boolBoxMessage.add_style_class_name('label-enabled');
                                    this._propertyBoxes[i]._boolBox[x]._boolBoxEditorElement.actor.set_checked(boolValues[x]);
                                } else {
                                    value[Object.keys(value)[x]] = boolValues[x];
                                    this._propertyBoxes[i]._boolBox[x]._boolBoxMessage.remove_style_class_name('label-enabled');
                                    this._propertyBoxes[i]._boolBox[x]._boolBoxMessage.add_style_class_name('label-disabled');
                                    this._propertyBoxes[i]._boolBox[x]._boolBoxEditorElement.actor.set_checked(boolValues[x]);
                                }                
                            }, this);
                        };

                        // Check box
                        this._propertyBoxes[i]._boolBox[n]._boolBoxEditorElement = new CheckBox('');
                        this._propertyBoxes[i]._boolBox[n]._boolBoxEditorElement.set_x_align(St.Align.MIDDLE);
                        this._propertyBoxes[i]._boolBox[n]._boolBoxEditorElement.actor.checked = value[subobjectKey];
                        this._propertyBoxes[i]._boolBox[n]._boolBoxEditorElement.actor.connect('clicked', () => { togglingFunction.call(this); });
                        if (!subObjectLabelOnly) this._propertyBoxes[i]._boolBox[n].add(this._propertyBoxes[i]._boolBox[n]._boolBoxEditorElement.actor);
                        // Toggle when pressing anywhere in the label/checkbox parent BoxLayout
                        this._propertyBoxes[i]._boolBox[n].connect('button-press-event', () => { togglingFunction.call(this); });

                    }, this);
                } else if (Array.isArray(value)) {
                    //TO DO Array editor
                }
                
                if (!this._propertyBoxes[i]._propertyBoxEditorElement) return;
                if (this._propertyBoxes[i]._propertyBoxEditorElement.showIcon) {
                    this._propertyBoxes[i]._propertyBoxEditorElement.propertyBoxStElementIcon = new St.Icon({ icon_name: 'insert-object-symbolic', icon_size: 14, style_class: 'object-dialog-error-icon' });
                    if (this._propertyBoxes[i]._propertyBoxEditorElement.add) this._propertyBoxes[i]._propertyBoxEditorElement.add(this._propertyBoxes[i].propertyBoxStElementIcon, { y_align: St.Align.MIDDLE });
                }
            }, this);

        }

        this.open();    // Consider having this called from dialog instance origin to ease object reference workflow
        } catch(e) { dev.log(e); }
    }

    open() {
        this._errorBox.hide();
        this._inputError = false;
        super.open(global.get_current_time(), true);
        if (this._focusElement) this._focusElement.grab_key_focus();
    }
    close(cancel = false, parent = null) {
        try {
        this._callback(this.returnObject);
        super.close();
        } catch(e) { dev.log(e); }
    }
    _checkInput(text) {
        this._inputError = false;
        if (text === '') this._showError("Input required");
    }
    _showError(message) {
        try {
        this._inputError = true;
        this._errorMessage.set_text(message);

        if (!this._errorBox.visible) {
            let [errorBoxMinHeight, errorBoxNaturalHeight] = this._errorBox.get_preferred_height(-1);
            let parentActor = this._errorBox.get_parent();
            tweener.addTween(parentActor,
                             { height: parentActor.height + errorBoxNaturalHeight, time: DIALOG_GROW_TIME, transition: 'easeOutQuad',
                               onComplete: () => {
                                   parentActor.set_height(-1);
                                   this._errorBox.show();
                               }
                             });
        }
        } catch (e) {logError(e); dev.log(e);}
    }
});