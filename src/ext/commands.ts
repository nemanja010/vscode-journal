// Copyright (C) 2017  Patrick Maué
// 
// This file is part of vscode-journal.
// 
// vscode-journal is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// 
// vscode-journal is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
// 
// You should have received a copy of the GNU General Public License
// along with vscode-journal.  If not, see <http://www.gnu.org/licenses/>.
// 

'use strict';

import moment from 'moment';
import * as vscode from 'vscode';
import * as J from '../.';
import { SelectedInput, NoteInput } from '../model/input';

export interface Commands {
    processInput(): Promise<vscode.TextEditor | void>;
    showNote(): Promise<vscode.TextEditor | void>;
    showEntry(offset: number): Promise<vscode.TextEditor | void>;
    loadJournalWorkspace(): Promise<void>;
    printSum(): Promise<string>;
    printDuration(): Promise<string>;
    printTime(): Promise<string>;
    runTestFeature(): Promise<string>;

    //editJournalConfiguration(): Thenable<vscode.TextEditor>
}


export class JournalCommands implements Commands {

    /**
     *
     */
    constructor(public ctrl: J.Util.Ctrl) {
    }
    /**
     * Opens the editor for a specific day. Supported values are explicit dates (in ISO format),
     * offsets (+ or - as prefix and 0) and weekdays (next wednesday) 
     * 
     * Update: supports much more now
     */
    public async processInput(): Promise<vscode.TextEditor | void> {


        this.ctrl.logger.trace("Entering processInput() in ext/commands.ts");

        return this.ctrl.ui.getUserInputWithValidation()
            .then((input: J.Model.Input) => this.loadPageForInput(input))
            .then((document: vscode.TextDocument) => this.ctrl.ui.showDocument(document))
            .catch((error: any) => {
                if (error !== 'cancel') {
                    this.ctrl.logger.error("Failed to process input.", error);
                    throw error;
                } else {
                    return Promise.resolve(null);
                }
            })
            .then(undefined, console.error);
    }

    /**
     * Called by command 'Journal:open'. Opens a new windows with the Journal base directory as root. 
     *
     * @returns {Q.Promise<void>}
     * @memberof JournalCommands
     */
    public async loadJournalWorkspace(): Promise<void> {


        return new Promise<void>((resolve, reject) => {
            this.ctrl.logger.trace("Entering loadJournalWorkspace() in ext/commands.ts");

            let path = vscode.Uri.file(this.ctrl.config.getBasePath());

            vscode.commands.executeCommand('vscode.openFolder', path, true)
                .then(_success => resolve(),
                    error => {
                        this.ctrl.logger.error("Failed to open journal workspace.", error);
                        reject("Failed to open journal workspace.");
                    });
        });


    }



    /**
     * Prints the sum of the selected numbers in the current editor at the selection location
     */
    public printSum(): Promise<string> {

        return new Promise<string>((resolve, reject) => {
            this.ctrl.logger.trace("Entering printSum() in ext/commands.ts");

            let editor: vscode.TextEditor = <vscode.TextEditor>vscode.window.activeTextEditor;
            let regExp: RegExp = /(\d+[,\.]?\d*\s?)|(\s)/;

            let target: vscode.Position;
            let numbers: number[] = [];

            editor.selections.forEach((selection: vscode.Selection) => {
                let range: vscode.Range | undefined = editor.document.getWordRangeAtPosition(selection.active, regExp);

                if (J.Util.isNullOrUndefined(range)) {
                    target = selection.active;
                    return;
                }

                let text = editor.document.getText(range);

                // check if empty string
                if (text.trim().length === 0) {
                    target = selection.active;

                    return;
                }
                // check if number
                let number: number = Number(text);
                if (number > 0) {
                    numbers.push(number);
                    return;
                }

            });

            if (numbers.length < 2) { reject("You have to select at least two numbers"); }  // tslint:disable-line
            else if (J.Util.isNullOrUndefined(target!)) { reject("No valid target selected for printing the sum."); }  // tslint:disable-line  
            else {
                let result: string = numbers.reduce((previous, current) => previous + current).toString();


                this.ctrl.inject.injectString(editor.document, result + "", target!);
                resolve(result);
            }
        });
    }

    /**
     * Prints the current time at the cursor postion
     *
     * @returns {Q.Promise<void>}
     * @memberof JournalCommands
     */
    public printTime(): Promise<string> {
        return new Promise<string>((resolve, reject) => {

            this.ctrl.logger.trace("Entering printTime() in ext/commands.ts");

            let editor: vscode.TextEditor = <vscode.TextEditor>vscode.window.activeTextEditor;

            // Todo: identify scope of the active editor
            this.ctrl.config.getTimeStringTemplate()
                .then(tpl => {
                    let currentPosition: vscode.Position = editor.selection.active;
                    this.ctrl.inject.injectString(editor.document, tpl.value!, currentPosition);
                    resolve(tpl.value!);
                })
                .catch(error => reject(error));

        });

    }

    /**
     * Called by command 'Journal:printDuration'. Requires three selections (three active cursors) 
     * in current document. It identifies which of the selections are times (in the format hh:mm 
     *  or glued like "1223") and where to print the duration (in decimal form). 
     * For now the duration is always printing hours. 
     *
     * @returns {Q.Promise<void>}
     * @memberof JournalCommands
     */
    public printDuration(): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            this.ctrl.logger.trace("Entering printDuration() in ext/commands.ts");

            try {
                let editor: vscode.TextEditor = <vscode.TextEditor>vscode.window.activeTextEditor;
                let regExp: RegExp = /\d{1,2}:?\d{0,2}(?:\s?(?:am|AM|pm|PM))?|\s/;
                // let regExp: RegExp = /(\d{1,2}:?\d{2}\s)|(\d{1,4}\s?(?:am|pm)\s)|(\d{1,2}[,\.]\d{1,2}\s)|(\s)/;

                if (editor.selections.length !== 3) {
                    throw new Error("To compute the duration, you have to select two times in your text as well as the location where to print it. ");
                }

                // 
                let start: moment.Moment | undefined;
                let end: moment.Moment | undefined;
                let target: vscode.Position | undefined;


                editor.selections.forEach((selection: vscode.Selection) => {
                    let range: vscode.Range | undefined = editor.document.getWordRangeAtPosition(selection.active, regExp);


                    if (J.Util.isNullOrUndefined(range)) {
                        target = selection.active;
                        return;
                    }

                    let text = editor.document.getText(range);

                    // check if empty string
                    if (text.trim().length === 0) {
                        target = selection.active;
                        return;
                    }

                    // try to format into local date
                    let time: moment.Moment = moment(text, "LT");

                    if (!time.isValid()) {
                        // 123pm
                        let mod: number = text.search(/am|pm/);
                        if (mod > 0) {
                            if (text.charAt(mod - 1) !== " ") {
                                text = text.substr(0, mod - 1) + " " + text.substr(mod);
                            }
                            time = moment(text, "hmm a");
                        }
                    }

                    if (!time.isValid()) {
                        // 123AM
                        let mod: number = text.search(/AM|PM/);
                        if (mod > 0) {
                            if (text.charAt(mod - 1) !== " ") {
                                text = text.substr(0, mod - 1) + " " + text.substr(mod);
                            }
                            time = moment(text, "hmm A");
                        }
                    }

                    if (!time.isValid()) {
                        // 2330
                        time = moment(text, "Hmm");
                    }

                    // parsing glued hours



                    if (J.Util.isNullOrUndefined(start)) {
                        start = time;
                    } else if (start!.isAfter(time)) {
                        end = start;
                        start = time;
                    } else {
                        end = time;
                    }
                });

                if (J.Util.isNullOrUndefined(start)) { reject("No valid start time selected"); }  // tslint:disable-line
                else if (J.Util.isNullOrUndefined(end)) { reject("No valid end time selected"); }  // tslint:disable-line
                else if (J.Util.isNullOrUndefined(target)) { reject("No valid target selected for printing the duration."); }  // tslint:disable-line  
                else {
                    let duration = moment.duration(start!.diff(end!));
                    let formattedDuration = Math.abs(duration.asHours()).toFixed(2);


                    this.ctrl.inject.injectString(editor.document, formattedDuration, target!);
                    resolve(formattedDuration);
                }





            } catch (error) {
                reject(error);
            }


        });
    }




    /**
     * Implements commands "yesterday", "today", "yesterday", where the input is predefined (no input box appears)
     * @param offset 
     */
    public async showEntry(offset: number): Promise<vscode.TextEditor | void> {
        return new Promise((resolve, reject) => {
            this.ctrl.logger.trace("Entering showEntry() in ext/commands.ts");

            let input = new J.Model.Input();
            input.offset = offset;
    
            this.loadPageForInput(input)
                .then((doc: vscode.TextDocument) => this.ctrl.ui.showDocument(doc))
                .then(resolve)
                .catch((error: any) => {
                    if (error !== 'cancel') {
                        this.ctrl.logger.error("Failed to get file, reason: ", error);
                        reject(error); 
                    } else {resolve();} 
                    
                });
        });

    }



    /**
     * Creates a new file in a subdirectory with the current day of the month as name.
     * Shows the file to let the user start adding notes right away.
     *
     * @returns {Q.Promise<vscode.TextEditor>}
     * @memberof JournalCommands
     */
    public async showNote(): Promise<vscode.TextEditor | void> {
        return new Promise((resolve, reject) => {
            this.ctrl.logger.trace("Entering showNote() in ext/commands.ts");


            this.ctrl.ui.getUserInput("Enter title for new note")
                .then((inputString: string) => this.ctrl.parser.parseInput(inputString))
                .then((input: J.Model.Input) =>
                    Promise.all([
                        this.ctrl.parser.resolveNotePathForInput(input),
                        this.ctrl.inject.formatNote(input)
                    ])
                )
                .then(([path, content]) =>
                    this.ctrl.reader.loadNote(path, content))
                .then((doc: vscode.TextDocument) =>
                    this.ctrl.ui.showDocument(doc))
                .then(resolve)
                .catch(reason => {
                    if (reason !== 'cancel') {
                        this.ctrl.logger.error("Failed to load note", reason);
                        reject(reason);
                    } else { resolve(); }
                });
    
            // inject reference to new note in today's journal page
            this.ctrl.reader.loadEntryForInput(new J.Model.Input(0))  // triggered automatically by loading today's page (we don't show it though)
                .catch(reason => {
                    this.ctrl.logger.error("Failed to load today's page for injecting link to note.", reason);
                });

        }); 
        
    }



    public runTestFeature(): Promise<string> {
        this.ctrl.logger.trace("Running the test feature");

        return new Promise((resolve, reject) => {
            resolve("sucess");
        });
    }
    /*
    public editJournalConfiguration(): Q.Promise<vscode.TextEditor> {
        let deferred: Q.Deferred<vscode.TextEditor> = Q.defer<vscode.TextEditor>();
        this.ctrl.ui.pickConfigToEdit()
            .then(filepath => this.ctrl.VSCode.loadTextDocument(filepath))
            .then(document => this.ctrl.ui.showDocument(document))
            .then(editor => deferred.resolve(editor))
            .catch(error => {
                if (error != 'cancel') {
                    console.error("[Journal]", "Failed to get file, Reason: ", error);
                    this.showError("Failed to create and load notes");

                }
                deferred.reject(error);
            })

        return deferred.promise;
    } */


    public showError(error: string | Promise<string> | Error): void {
        Promise.resolve(error)
            .then(value => { 
                if (J.Util.isString(value)) {
                    this.showErrorInternal(value as string);
                } else if (J.Util.isError(value)) {
                    this.showErrorInternal((value as Error).message);
                }
            }); 
    }

    private showErrorInternal(errorMessage: string): void {
        let hint = "Check logs.";
        vscode.window.showErrorMessage(errorMessage, hint)
            .then(clickedHint => {
                this.ctrl.logger.showChannel();
            });
    }

    /**
     * Expects any user input from the magic input and either opens the file or creates it. 
     * @param input 
     */
    private async loadPageForInput(input: J.Model.Input): Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering loadPageForInput() in ext/commands.ts");

        if (input instanceof SelectedInput) {
            // we just load the path
            return this.ctrl.ui.openDocument((<SelectedInput>input).path);
        } else if (input instanceof NoteInput) {
            // we create or load the notes
            return this.ctrl.inject.formatNote(input)
                .then(content => this.ctrl.reader.loadNote(input.path, content));
        } else {
            return this.ctrl.reader.loadEntryForInput(input)
                .then((doc: vscode.TextDocument) => this.ctrl.inject.injectInput(doc, input));
        }
    }
}
