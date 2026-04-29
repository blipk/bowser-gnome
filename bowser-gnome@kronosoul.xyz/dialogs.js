// External imports
import St from "gi://St"
import Gio from "gi://Gio"
import GObject from "gi://GObject"
import Clutter from "gi://Clutter"

import * as util from "resource:///org/gnome/shell/misc/util.js"
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js"

import * as CheckBox from "resource:///org/gnome/shell/ui/checkBox.js"
import * as modalDialog from "resource:///org/gnome/shell/ui/modalDialog.js"
import * as shellEntry from "resource:///org/gnome/shell/ui/shellEntry.js"

// Internal imports
import * as dev from "./dev.js"
import * as utils from "./utils.js"
import * as fileUtils from "./fileUtils.js"


// Object Editor Dialog
export const ObjectEditorDialog = GObject.registerClass( {
    GTypeName: "ObjectEditorDialog"
}, class ObjectEditorDialog extends modalDialog.ModalDialog {
    _init( dialogInfoTextStyle = "",
        callback = null,
        editableObject = null,
        editableProperties=[],
        buttons = null,
        dialogStyle = null,
        contentLayoutBoxStyleClass = "" ) {

        if ( typeof callback !== "function" ) throw TypeError( "ObjectEditorDialog._init error: callback must be a function" )
        this._callback = callback
        this.returnObject = editableObject
        this.editableObject = editableObject
        this._unreferencedObjectCopy = JSON.parse( JSON.stringify( editableObject ) )

        try{
        // Initialize dialog with style
        let defaults = { styleClass: "object-dialog", destroyOnClose: true }
        dialogStyle = {...defaults, ...dialogStyle }
        super._init( dialogStyle )
        this.contentLayout.style_class = contentLayoutBoxStyleClass ? contentLayoutBoxStyleClass : this.contentLayout.style_class

        //Label for our dialog/text field with text about the dialog or a prompt for user text input
        defaults = { style_class: "object-dialog-label", text: _( ( dialogInfoTextStyle.text || dialogInfoTextStyle ).toString() ), x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.START, x_expand: true }
        dialogInfoTextStyle = ( typeof dialogInfoTextStyle == "string" ) ? defaults : {...defaults, ...dialogInfoTextStyle }
        let stLabelUText = new St.Label( dialogInfoTextStyle )
        stLabelUText.get_clutter_text().line_wrap = false
        stLabelUText.get_clutter_text().ellipsize = 0
        dialogInfoTextStyle.x_align = Clutter.ActorAlign.FILL
        dialogInfoTextStyle.x_expand = true
        dialogInfoTextStyle.expand = true
        if ( dialogInfoTextStyle.text != "" ) this.contentLayout.add_child( stLabelUText )

        //Action buttons
        this.buttons = Array()
        buttons = ( buttons == null ) ? "Done" : buttons
        defaults = [{ label: ( buttons ), default: true}] //key: Clutter.KEY_Escape
        buttons = ( typeof buttons == "string" ) ? defaults : buttons
        buttons.forEach( function ( button, i ) {
            if ( button.action ) button.action = button.action.bind( this )
            else button.action = this.close.bind( this )

            this.buttons[i] = this.addButton( button )
            this.buttons[i].set_reactive( true )
            if ( button.style_class ) this.buttons[i].add_style_class_name( button.style_class )
            this.buttons[i].add_style_class_name( "object-dialog-button-box" )
        }, this )

        //Create an area for each property of our object
        this._propertyBoxes = []
        this.propertyKeys = Array()
        this.propertyValues = Array()
        this.propertyDisplayName = Array()
        this.propertyDisabled = Array()
        this.propertyHidden = Array()
        this.propertyHideElement = Array()
        this.propertyLabelStyle = Array()
        this.propertyBoxStyle = Array()
        this.propertyIconStyle = Array()
        this.subObjectMasks = Array()
        this.propertyBoxClickCallbacks = Array()
        if ( editableObject ) {
            utils.forEachEntry( editableObject, function( key, value, i ) {
                //Options for how to display each property section
                this.propertyKeys[i] = key
                this.propertyValues[i] = value
                editableProperties.forEach( function( propertyDisplayOption, index ) {
                    if ( editableProperties[index][key] ) {
                        let {disabled, hidden, hideElement, labelStyle, boxStyle, iconStyle, subObjectEditableProperties, boxClickCallback} = editableProperties[index]
                        this.propertyDisplayName[i] = key ? editableProperties[index][key] || "" : ""
                        this.propertyDisabled[i] = disabled || false
                        this.propertyHidden[i] = hidden || false
                        this.propertyHideElement[i] = hideElement || false
                        this.propertyLabelStyle[i] = {...{ style_class: "spacing7", x_expand: true, y_expand: true, x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.CENTER}, ...labelStyle}
                        this.propertyBoxStyle[i] = boxStyle || {}
                        this.propertyIconStyle[i] = iconStyle || {}
                        this.subObjectMasks[i] = subObjectEditableProperties || []
                        this.propertyBoxClickCallbacks[i] = boxClickCallback || ( ()=>{ dev.log( "Clicked on " + this.propertyDisplayName[i] ) } )
                    }
                }, this )
                if ( this.propertyHidden[i] ) return

                //A box area for each property
                this._propertyBoxes[i] = new St.BoxLayout( this.propertyBoxStyle[i] )
                if ( this.propertyIconStyle[i] != undefined && this.propertyIconStyle[i] != {} ) {
                    this._propertyBoxes[i].propertyBoxStNameIcon = new St.Icon( this.propertyIconStyle[i] )
                    //this._propertyBoxes[i].propertyBoxStNameIcon.set_translation(50, 50, 0)
                    this._propertyBoxes[i].add_child( this._propertyBoxes[i].propertyBoxStNameIcon )
                }
                // :hover event doesn't work on style_class elements for BoxLayout, this allows using :focus for hover events
                this._propertyBoxes[i].connect( "enter-event", ()=>{ this._propertyBoxes[i].grab_key_focus()} )
                this._propertyBoxes[i].connect( "leave-event", ()=>{ global.stage.set_key_focus( this ) } )
                this._propertyBoxes[i].connect( "button-press-event", () => {
                    this.propertyBoxClickCallbacks[i].call( this, i )
                } )
                this.contentLayout.add_child( this._propertyBoxes[i] )

                // Left side labelled button
                this._propertyBoxes[i]._propertyBoxMessageButton = new St.Button( this.propertyLabelStyle[i] )
                this._propertyBoxes[i]._propertyBoxMessage = new St.Label( this.propertyLabelStyle[i] )
                this._propertyBoxes[i]._propertyBoxMessage.set_text( this.propertyDisplayName[i] )
                this._propertyBoxes[i]._propertyBoxMessage.get_clutter_text().line_wrap = false
                this._propertyBoxes[i]._propertyBoxMessage.get_clutter_text().ellipsize = 0
                this._propertyBoxes[i]._propertyBoxMessageButton.add_child( this._propertyBoxes[i]._propertyBoxMessage )
                //this._propertyBoxes[i]._propertyBoxMessageButton.set_label(this.propertyDisplayName[i])
                //this._propertyBoxes[i]._propertyBoxMessageButton.set_label_actor(this._propertyBoxes[i]._propertyBoxMessage.actor)
                this._propertyBoxes[i]._propertyBoxMessageButton.connect( "button-press-event", () => {
                    this.propertyBoxClickCallbacks[i].call( this, i )
                } )
                this._propertyBoxes[i].add_child( this._propertyBoxes[i]._propertyBoxMessageButton )

                //Property value editor element
                //if (value === undefined) {value = 'empty'};
                //if (value === null) {value = 'empty'};
                if ( this.propertyHideElement[i] ) return
                if ( typeof value === "boolean" ) {
                    this._propertyBoxes[i]._propertyBoxEditorElement = new CheckBox.CheckBox( "" )
                    this._propertyBoxes[i]._propertyBoxEditorElement.set_checked( editableObject[key] )
                    this._propertyBoxes[i]._propertyBoxEditorElement.connect( "clicked", () => {
                        editableObject[key] = this._propertyBoxes[i]._propertyBoxEditorElement.get_checked()
                    } )
                    this._propertyBoxes[i].add_child( this._propertyBoxes[i]._propertyBoxEditorElement )
                } else if ( typeof value === "string" || typeof value === "number" ) {
                    this._propertyBoxes[i]._propertyBoxEditorElement = new St.Entry( { style_class: "object-dialog-entry", can_focus: true, text: "", x_align: Clutter.ActorAlign.FILL, x_expand: true} )
                    this._propertyBoxes[i]._propertyBoxEditorElement.get_clutter_text().min_width = 200
                    this._focusElement = this._propertyBoxes[i]._propertyBoxEditorElement // To set initial focus
                    if ( this.propertyDisabled[i] === true ) {
                        this._propertyBoxes[i]._propertyBoxEditorElement.get_clutter_text().set_editable( false )
                        this._propertyBoxes[i]._propertyBoxEditorElement.get_clutter_text().set_selectable( false )
                        this._propertyBoxes[i]._propertyBoxEditorElement.get_clutter_text().set_max_length( value.length )
                    }
                    this._propertyBoxes[i]._propertyBoxEditorElement.set_text( value.toString() )
                    this._propertyBoxes[i].add_child( this._propertyBoxes[i]._propertyBoxEditorElement )

                    this._propertyBoxes[i]._propertyBoxEditorElement.get_clutter_text().get_buffer().connect( "inserted-text", ( o, position, new_text, new_text_length, e ) => {
                        if ( typeof value !== "number" ) return Clutter.EVENT_PROPAGATE
                        if ( new_text.search( /^[0-9]+$/i ) === -1 ) {
                            o.delete_text( position, new_text_length )
                            return Clutter.EVENT_STOP
                        }
                        return Clutter.EVENT_PROPAGATE
                    } )
                    this._propertyBoxes[i]._propertyBoxEditorElement.get_clutter_text().connect( "text-changed", ( o, e ) => {
                        if ( typeof value === "number" ) editableObject[key] = parseInt( o.get_text() )
                        else editableObject[key] = o.get_text()
                        return Clutter.EVENT_PROPAGATE
                    } )
                } else if ( typeof value === "object" && !Array.isArray( value ) ) {
                    // Any grouped sub objects must all be boolean (or TO DO int types)
                    // They will be displaye horizontally with labels above them

                    // Check for valid types in the sub object
                    let containsBooleans = true
                    utils.forEachEntry( value, function( subobjectKey, subobjectValue, i ){
                        if ( typeof subobjectValue != "boolean" ) containsBooleans = false
                    }, this )
                    if ( !containsBooleans ) return

                    // Build UI
                    this._propertyBoxes[i]._boolBox = Array()
                    utils.forEachEntry( value, function( subobjectKey, subobjectValue, n ){
                        // Set up display masks for the subobject properties
                        let subObjectPropertyDisplayName = key
                        let subObjectPropertyDisabled = false
                        let subObjectPropertyHidden = false
                        let subObjectHideElement = false
                        let subObjectHideLabel = false
                        let subObjectToggleValidationCallback = ( ()=>{return [true]} )
                        this.subObjectMasks[i].forEach( function( propertyMask, index ) {
                            if ( this.subObjectMasks[i][index][subobjectKey] ) {
                                subObjectPropertyDisplayName = this.subObjectMasks[i][index][subobjectKey] || subObjectPropertyDisplayName
                                subObjectPropertyDisabled = this.subObjectMasks[i][index].disabled || subObjectPropertyDisabled
                                subObjectPropertyHidden = this.subObjectMasks[i][index].hidden || false
                                subObjectHideElement = this.subObjectMasks[i][index].hideElement || subObjectHideElement
                                subObjectHideLabel = this.subObjectMasks[i][index].hideLabel || subObjectHideLabel
                                subObjectToggleValidationCallback = this.subObjectMasks[i][index].toggleValidationCallback || subObjectToggleValidationCallback
                            }
                        }, this )
                        if ( subObjectPropertyHidden ) return

                        // Vertical box area for each subobject property
                        this._propertyBoxes[i]._boolBox[n] = new St.BoxLayout( { vertical    : true, reactive    : true,
                            track_hover : true, x_expand    : true, y_expand    : true, x_align     : Clutter.ActorAlign.FILL, y_align     : Clutter.ActorAlign.FILL} )
                        this._propertyBoxes[i].add_child( this._propertyBoxes[i]._boolBox[n] )

                        // Label
                        this._propertyBoxes[i]._boolBox[n]._boolBoxMessage = new St.Label()
                        value[subobjectKey] ? this._propertyBoxes[i]._boolBox[n]._boolBoxMessage.set_style_class_name( "label-enabled" ) :
                                                 this._propertyBoxes[i]._boolBox[n]._boolBoxMessage.add_style_class_name( "label-disabled" )

                        this._propertyBoxes[i]._boolBox[n]._boolBoxMessage.add_style_class_name( "uri-element-label" )
                        if ( !subObjectHideLabel ) this._propertyBoxes[i]._boolBox[n].add_child( this._propertyBoxes[i]._boolBox[n]._boolBoxMessage )
                        this._propertyBoxes[i]._boolBox[n]._boolBoxMessage.set_text( subObjectPropertyDisplayName )

                        // Toggling Function
                        // The CheckBox auto-toggles its own state on "clicked"; we read get_checked()
                        // for the post-click value rather than flipping it in JS (which double-toggles
                        // when both the checkbox and a parent press handler fire).
                        // Some validation callbacks (e.g. bowser's uriOptionsValidation) return the OLD
                        // value array with adjacent positions modified for chain logic but DO NOT flip
                        // position [n] themselves — the caller must force [n] to the user's intent.
                        let togglingFunction = function() {
                            const newCheckedState = this._propertyBoxes[i]._boolBox[n]._boolBoxEditorElement.get_checked()

                            let proposedBoolValues = Object.values( value )
                            proposedBoolValues[n] = newCheckedState

                            let [allowed, validatedBoolValues] = subObjectToggleValidationCallback.call( this, value, n )
                            let finalBoolValues = validatedBoolValues || proposedBoolValues
                            // Force [n] regardless of whether the validation cb wrote it; revert if disallowed.
                            finalBoolValues[n] = allowed ? newCheckedState : value[subobjectKey]

                            this._propertyBoxes[i]._boolBox.forEach( function( box, x ) {
                                value[Object.keys( value )[x]] = finalBoolValues[x]
                                if ( finalBoolValues[x] ) {
                                    this._propertyBoxes[i]._boolBox[x]._boolBoxMessage.remove_style_class_name( "label-disabled" )
                                    this._propertyBoxes[i]._boolBox[x]._boolBoxMessage.add_style_class_name( "label-enabled" )
                                } else {
                                    this._propertyBoxes[i]._boolBox[x]._boolBoxMessage.remove_style_class_name( "label-enabled" )
                                    this._propertyBoxes[i]._boolBox[x]._boolBoxMessage.add_style_class_name( "label-disabled" )
                                }
                                this._propertyBoxes[i]._boolBox[x]._boolBoxEditorElement.set_checked( finalBoolValues[x] )
                            }, this )
                        }

                        // Check box
                        this._propertyBoxes[i]._boolBox[n]._boolBoxEditorElement = new CheckBox.CheckBox( "" )
                        this._propertyBoxes[i]._boolBox[n]._boolBoxEditorElement.set_x_align( Clutter.ActorAlign.CENTER )
                        this._propertyBoxes[i]._boolBox[n]._boolBoxEditorElement.set_checked( value[subobjectKey] )
                        this._propertyBoxes[i]._boolBox[n]._boolBoxEditorElement.connect( "clicked", () => { togglingFunction.call( this ) } )
                        if ( !subObjectHideElement ) this._propertyBoxes[i]._boolBox[n].add_child( this._propertyBoxes[i]._boolBox[n]._boolBoxEditorElement )
                        // Make the label clickable to toggle the checkbox (without a parent box handler that double-fires).
                        // emit("clicked") alone only fires the signal; St.Button's toggle state is flipped by the
                        // press/release path, not by emit(), so we set_checked() explicitly before invoking the handler.
                        this._propertyBoxes[i]._boolBox[n]._boolBoxMessage.reactive = true
                        this._propertyBoxes[i]._boolBox[n]._boolBoxMessage.connect( "button-press-event", () => {
                            const cb = this._propertyBoxes[i]._boolBox[n]._boolBoxEditorElement
                            cb.set_checked( !cb.get_checked() )
                            togglingFunction.call( this )
                            return Clutter.EVENT_STOP
                        } )

                    }, this )
                } else if ( Array.isArray( value ) ) {
                    // TO DO Array editor
                    // Place sub objects into arrays to create buttons to have them open in another editor dialog instance
                }
            }, this )
        }

        this.open() // Consider having this called from dialog instance origin to ease object reference workflow
        } catch( e ) { dev.log( e ) }
    }
    open() {
        super.open( global.get_current_time(), true )
        if ( this._focusElement ) this._focusElement.grab_key_focus()
    }
    close() {
        this._callback( this.returnObject )
        super.close()
    }
} )